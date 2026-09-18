#!/usr/bin/env node
/* eslint-disable */
// 真实端到端测试：启动编译后的后端服务，通过 HTTP 实测
// 1) 并发预约同一包厢同一时段（只有一单成功）
// 2) 余额不足整次拒绝（无预约、无扣款）
// 3) 并发重复结算（只生效一次）+ 刷新回读持久化
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const PORT = 29520;
const BASE = `http://127.0.0.1:${PORT}/api`;
const DATA_FILE = path.join(__dirname, "..", "data", "e2e-store.json");

try {
  fs.unlinkSync(DATA_FILE);
} catch {}

const server = spawn("node", [path.join(__dirname, "..", "dist", "index.js")], {
  env: { ...process.env, PORT: String(PORT), BOOKING_DATA_FILE: DATA_FILE },
  stdio: ["ignore", "pipe", "pipe"],
});

server.stdout.on("data", (chunk) => process.stdout.write(`[server] ${chunk}`));
server.stderr.on("data", (chunk) => process.stderr.write(`[server] ${chunk}`));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitHealthy() {
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (response.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error("server did not become healthy");
}

async function api(method, route, body) {
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, json };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(`断言失败：${message}`);
  }
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  await waitHealthy();
  console.log("\n========== 包厢预约 / 会员结算 端到端实测 ==========\n");

  // 重置为干净种子
  const reset = await api("POST", "/booking/reset");
  assert(reset.status === 200, "reset seed");

  const date = "2030-06-01"; // 用固定未来日期，避免与种子记录互相干扰

  /* ---------------- 场景 1：并发预约同一包厢同一时段 ---------------- */
  console.log("\n--- 场景 1：10 个并发请求抢 策略大师厅 2030-06-01 14:00-16:00 ---");
  const attempts = Array.from({ length: 10 }, (_, i) =>
    api("POST", "/booking/reservations", {
      roomId: "room-a",
      memberId: i % 2 === 0 ? "member-1" : "member-2",
      date,
      startHour: 14,
      endHour: 16,
    }),
  );
  const outcomes = await Promise.all(attempts);
  const okOnes = outcomes.filter((item) => item.status === 201);
  const conflictOnes = outcomes.filter((item) => item.status === 409);
  console.log(
    "响应明细：",
    outcomes.map((item) =>
      item.status === 201 ? `OK(${item.json.booking.id})` : `409(${item.json.error})`,
    ),
  );
  record(
    "并发预约恰好 1 单成功、其余 9 单被冲突拒绝",
    okOnes.length === 1 && conflictOnes.length === 9,
    `成功 ${okOnes.length} 单 / 冲突 ${conflictOnes.length} 单`,
  );

  const snapshot1 = await api("GET", "/booking/state");
  const slotBookings = snapshot1.json.bookings.filter(
    (b) => b.roomId === "room-a" && b.date === date && b.startHour === 14,
  );
  record("落库后该时段只有 1 条预约", slotBookings.length === 1, `实际 ${slotBookings.length} 条`);
  record("成功单状态为待到店（booked）", slotBookings[0]?.status === "booked");

  // 相邻不重叠时段仍可预约（证明拒绝范围准确，没有误伤）
  const adjacent = await api("POST", "/booking/reservations", {
    roomId: "room-a",
    memberId: "member-1",
    date,
    startHour: 16,
    endHour: 17,
  });
  record("紧邻时段 16:00-17:00 仍可正常预约", adjacent.status === 201, adjacent.json.booking?.id);
  const overlapEdge = await api("POST", "/booking/reservations", {
    roomId: "room-a",
    memberId: "member-1",
    date,
    startHour: 15,
    endHour: 17,
  });
  record(
    "与既有单边界重叠 15:00-17:00 被拒绝",
    overlapEdge.status === 409,
    overlapEdge.json.error,
  );

  /* ---------------- 场景 2：余额不足整次拒绝 ---------------- */
  console.log("\n--- 场景 2：黄金会员赵金金余额 ¥50，预约 沉浸剧本室(¥120/h) 2 小时 ---");
  const before = (await api("GET", "/booking/state")).json.members.find(
    (m) => m.id === "member-3",
  );
  const poorAttempt = await api("POST", "/booking/reservations", {
    roomId: "room-c",
    memberId: "member-3",
    date,
    startHour: 14,
    endHour: 16, // ¥240 > 余额 ¥50
  });
  const after = (await api("GET", "/booking/state")).json.members.find(
    (m) => m.id === "member-3",
  );
  console.log("拒绝原因：", poorAttempt.json.error);
  record("余额不足返回 409 且整次拒绝", poorAttempt.status === 409);
  record("没有生成任何预约记录", !(await api("GET", "/booking/state")).json.bookings.some(
    (b) => b.roomId === "room-c" && b.date === date,
  ));
  record(
    "没有扣款：余额保持 ¥50.00、积分保持 600",
    after.balance === before.balance && after.points === before.points,
    `余额 ¥${after.balance} / 积分 ${after.points}`,
  );

  // 边界：刚好够的订单可以下
  const affordable = await api("POST", "/booking/reservations", {
    roomId: "room-c",
    memberId: "member-3",
    date,
    startHour: 9,
    endHour: 10, // ¥120 仍超过 50，再验证一次
  });
  record("¥50 余额预约 ¥120 单小时仍被拒绝", affordable.status === 409);

  /* ---------------- 场景 3：到店结算 + 并发重复结算幂等 ---------------- */
  console.log("\n--- 场景 3：对场景 1 成功的预约做 1 次正常结算 + 10 次并发重复结算 ---");
  const winnerId = okOnes[0].json.booking.id;
  const winnerMemberId = okOnes[0].json.member.id;
  const memberBefore = (await api("GET", "/booking/state")).json.members.find(
    (m) => m.id === winnerMemberId,
  );
  const expectedPaid = Math.round(120 * memberBefore.discount * 100) / 100; // ¥120 * 折扣

  const firstSettle = await api("POST", `/booking/reservations/${winnerId}/settle`);
  record(
    "首次结算成功：按会员折扣扣款并累计积分（1 元 = 1 分）",
    firstSettle.status === 201 &&
      firstSettle.json.settlement.paidAmount === expectedPaid &&
      firstSettle.json.settlement.earnedPoints === Math.floor(expectedPaid),
    `折扣 ${memberBefore.discount}，原价 ¥120，实扣 ¥${firstSettle.json.settlement?.paidAmount}，积分 +${firstSettle.json.settlement?.earnedPoints}`,
  );

  const duplicateAttempts = await Promise.all(
    Array.from({ length: 10 }, () =>
      api("POST", `/booking/reservations/${winnerId}/settle`),
    ),
  );
  const idempotentCount = duplicateAttempts.filter((item) => item.json.idempotent === true).length;
  record(
    "10 次并发重复结算全部识别为幂等（idempotent=true）",
    idempotentCount === 10,
    `${idempotentCount}/10`,
  );

  const snapshot3 = await api("GET", "/booking/state");
  const settleRows = snapshot3.json.settlements.filter((s) => s.bookingId === winnerId);
  const memberAfter = snapshot3.json.members.find((m) => m.id === winnerMemberId);
  const bookingAfter = snapshot3.json.bookings.find((b) => b.id === winnerId);

  record("结算记录只有 1 条", settleRows.length === 1, `实际 ${settleRows.length} 条`);
  record(
    "余额只扣了一次",
    Math.round((memberBefore.balance - memberAfter.balance) * 100) ===
      Math.round(expectedPaid * 100),
    `扣款前 ¥${memberBefore.balance} -> 扣款后 ¥${memberAfter.balance}（应扣 ¥${expectedPaid}）`,
  );
  record(
    "积分只增加一次",
    memberAfter.points - memberBefore.points === Math.floor(expectedPaid),
    `${memberBefore.points} -> ${memberAfter.points}`,
  );
  record("预约状态原子翻转为 settled", bookingAfter.status === "settled");

  /* ---------------- 场景 4：刷新回读 / 持久化 ---------------- */
  console.log("\n--- 场景 4：重启服务后数据可回读（模拟刷新 + 进程重启） ---");
  const rawOnDisk = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  record(
    "磁盘文件已持久化：余额、积分、预约状态一致",
    rawOnDisk.members.find((m) => m.id === winnerMemberId).balance === memberAfter.balance &&
      rawOnDisk.bookings.find((b) => b.id === winnerId).status === "settled",
  );

  server.kill();
  await sleep(500);

  const server2 = spawn("node", [path.join(__dirname, "..", "dist", "index.js")], {
    env: { ...process.env, PORT: String(PORT), BOOKING_DATA_FILE: DATA_FILE },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server2.stdout.on("data", (chunk) => process.stdout.write(`[server2] ${chunk}`));
  server2.stderr.on("data", (chunk) => process.stderr.write(`[server2] ${chunk}`));
  global.__server2 = server2;
  await waitHealthy();

  const reread = await api("GET", "/booking/state");
  const rereadSettlements = reread.json.settlements.filter((s) => s.bookingId === winnerId);
  record(
    "重启后回读：结算记录仍为 1 条，预约仍为 settled，余额积分不变",
    rereadSettlements.length === 1 &&
      reread.json.bookings.find((b) => b.id === winnerId).status === "settled" &&
      reread.json.members.find((m) => m.id === winnerMemberId).balance === memberAfter.balance &&
      reread.json.members.find((m) => m.id === winnerMemberId).points === memberAfter.points,
    `余额 ¥${reread.json.members.find((m) => m.id === winnerMemberId).balance} / 积分 ${reread.json.members.find((m) => m.id === winnerMemberId).points}`,
  );

  const availability = await api("GET", `/booking/availability?date=${date}`);
  const roomA = availability.json.rooms.find((r) => r.room.id === "room-a");
  const slot14 = roomA.slots.find((s) => s.hour === 14);
  record("空档视图：14 点档显示为已结算（settled），其余档可区分", slot14.status === "settled");

  server2.kill();

  const failed = results.filter((item) => !item.ok);
  console.log(`\n========== 结果：${results.length - failed.length}/${results.length} 通过 ==========\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  server.kill();
  process.exit(1);
});

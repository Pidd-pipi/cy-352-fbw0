/**
 * 端到端实测脚本：
 * 1. 启动内存版 MongoDB（真实 mongod 进程）并启动后端 API；
 * 2. 通过 HTTP 接口实测：并发预约、余额不足、时段冲突、重复结算；
 * 3. 直接查库验证余额、积分、预约状态与结算记录，输出真实结果。
 *
 * 运行：npx tsx scripts/e2e-test.ts
 */
import { MongoMemoryServer } from "mongodb-memory-server";
import type { AddressInfo } from "node:net";

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, details: string) {
  results.push({ name, passed, details });
  console.log(`${passed ? "✅" : "❌"} ${name}\n   ${details}`);
}

async function main() {
  const mongod = await MongoMemoryServer.create();
  process.env.DATABASE_URL = mongod.getUri("e2e_booking");
  process.env.PORT = "0";

  // 动态导入，保证 DATABASE_URL 在连接前已注入
  const { app } = await import("../src/app");
  const { connectDatabase, disconnectDatabase } = await import("../src/config/database");
  const { MemberModel, RoomModel, BookingModel, SettlementModel } = await import("../src/modules/booking/models");

  await connectDatabase();

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const post = (path: string, body?: unknown) =>
    fetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  try {
    // ---------- 测试夹具：固定价格包厢 + 精确余额会员 ----------
    const room = await RoomModel.create({
      name: "测试包厢",
      capacity: 6,
      facilities: ["投影"],
      hourlyPrice: 5000, // ¥50/小时
    });
    const rich = await MemberModel.create({ name: "测试-富豪", level: "金卡会员", discountRate: 0.8, balance: 1_000_000, points: 0 });
    const poor = await MemberModel.create({ name: "测试-清贫", level: "普通会员", discountRate: 1, balance: 5_000, points: 0 });
    const other = await MemberModel.create({ name: "测试-路人", level: "银卡会员", discountRate: 0.9, balance: 1_000_000, points: 0 });

    const DATE = "2026-10-01";
    const bookingPayload = { roomId: String(room._id), memberId: String(rich._id), date: DATE, startHour: 14, endHour: 16 };

    // ---------- 用例 1：10 路并发预约同一包厢同一时段，只能成功一单 ----------
    const concurrent = await Promise.all(Array.from({ length: 10 }, () => post("/api/bookings", bookingPayload)));
    const statuses = concurrent.map((r) => r.status);
    const created = statuses.filter((s) => s === 201).length;
    const conflicted = statuses.filter((s) => s === 409).length;
    const bookingsInDb = await BookingModel.countDocuments({ room: room._id, date: DATE });
    const richAfterConcurrent = await MemberModel.findById(rich._id).lean();
    const expectedBalance = 1_000_000 - 2 * 5000; // 2 小时 × ¥50 = ¥100 = 10000 分
    record(
      "并发预约：同一包厢重叠时段 10 并发仅 1 单成功",
      created === 1 && conflicted === 9 && bookingsInDb === 1 && richAfterConcurrent?.balance === expectedBalance,
      `HTTP 201×${created} / 409×${conflicted}；库中预约 ${bookingsInDb} 条；余额 ${richAfterConcurrent?.balance} 分（预期 ${expectedBalance}，仅扣一次）`,
    );

    // ---------- 用例 2：余额不足，整次拒绝（不生成预约、不扣款） ----------
    const poorBefore = (await MemberModel.findById(poor._id).lean())!;
    const insufficient = await post("/api/bookings", {
      roomId: String(room._id),
      memberId: String(poor._id),
      date: "2026-10-02",
      startHour: 10,
      endHour: 13, // 3 小时 × ¥50 = ¥150 > 余额 ¥50
    });
    const insufficientBody = (await insufficient.json()) as { error?: { code?: string } };
    const poorAfter = (await MemberModel.findById(poor._id).lean())!;
    const poorBookings = await BookingModel.countDocuments({ member: poor._id });
    record(
      "余额不足：整次拒绝，不生成预约也不扣款",
      insufficient.status === 400 &&
        insufficientBody.error?.code === "INSUFFICIENT_BALANCE" &&
        poorBookings === 0 &&
        poorAfter.balance === poorBefore.balance,
      `HTTP ${insufficient.status}（${insufficientBody.error?.code}）；该会员预约 ${poorBookings} 条；余额 ${poorBefore.balance} -> ${poorAfter.balance} 分（未变）`,
    );

    // ---------- 用例 3：时段冲突，整次拒绝（他人重叠预约不扣款） ----------
    const otherBefore = (await MemberModel.findById(other._id).lean())!;
    const conflict = await post("/api/bookings", {
      roomId: String(room._id),
      memberId: String(other._id),
      date: DATE,
      startHour: 15,
      endHour: 17, // 与已成功的 14:00-16:00 重叠
    });
    const conflictBody = (await conflict.json()) as { error?: { code?: string } };
    const otherAfter = (await MemberModel.findById(other._id).lean())!;
    record(
      "时段冲突：重叠预约被拒绝且不扣款",
      conflict.status === 409 && conflictBody.error?.code === "SLOT_CONFLICT" && otherAfter.balance === otherBefore.balance,
      `HTTP ${conflict.status}（${conflictBody.error?.code}）；余额 ${otherBefore.balance} -> ${otherAfter.balance} 分（未变）`,
    );

    // ---------- 用例 3b：相邻不重叠时段应可正常预约（锁不误伤） ----------
    const adjacent = await post("/api/bookings", {
      roomId: String(room._id),
      memberId: String(other._id),
      date: DATE,
      startHour: 16,
      endHour: 18,
    });
    record("相邻不重叠时段：可正常预约", adjacent.status === 201, `HTTP ${adjacent.status}（16:00-18:00 紧邻 14:00-16:00）`);

    // ---------- 用例 4：到店结算，折扣扣费 + 积分 + 状态联动 ----------
    const booking = await BookingModel.findOne({ room: room._id, date: DATE, member: rich._id }).lean();
    const settle1 = await post(`/api/bookings/${booking!._id}/settle`);
    const settle1Body = (await settle1.json()) as { settlement: { finalAmount: number; refundAmount: number; pointsEarned: number }; duplicated: boolean };
    const richAfterSettle = (await MemberModel.findById(rich._id).lean())!;
    const bookingAfterSettle = (await BookingModel.findById(booking!._id).lean())!;
    // 预付 10000，金卡 8 折实付 8000，退 2000，积分 +80
    const settleOk =
      settle1.status === 201 &&
      settle1Body.duplicated === false &&
      settle1Body.settlement.finalAmount === 8000 &&
      settle1Body.settlement.refundAmount === 2000 &&
      settle1Body.settlement.pointsEarned === 80 &&
      richAfterSettle.balance === expectedBalance + 2000 &&
      richAfterSettle.points === 80 &&
      bookingAfterSettle.status === "SETTLED";
    record(
      "到店结算：会员折扣扣费，余额/积分/预约状态一起变化",
      settleOk,
      `HTTP ${settle1.status}；实付 ${settle1Body.settlement.finalAmount} 分（8 折）、退 ${settle1Body.settlement.refundAmount} 分、积分 +${settle1Body.settlement.pointsEarned}；余额 ${richAfterSettle.balance} 分、积分 ${richAfterSettle.points}、状态 ${bookingAfterSettle.status}`,
    );

    // ---------- 用例 5：重复结算（顺序 + 并发）只生效一次 ----------
    const settle2 = await post(`/api/bookings/${booking!._id}/settle`);
    const settle2Body = (await settle2.json()) as { duplicated: boolean };
    const parallelSettles = await Promise.all(Array.from({ length: 5 }, () => post(`/api/bookings/${booking!._id}/settle`)));
    const parallelBodies = await Promise.all(parallelSettles.map((r) => r.json())) as Array<{ duplicated: boolean }>;
    const settlementsInDb = await SettlementModel.countDocuments({ booking: booking!._id });
    const richFinal = (await MemberModel.findById(rich._id).lean())!;
    const dupOk =
      settle2.status === 200 &&
      settle2Body.duplicated === true &&
      parallelBodies.every((b) => b.duplicated === true) &&
      settlementsInDb === 1 &&
      richFinal.balance === expectedBalance + 2000 &&
      richFinal.points === 80;
    record(
      "重复结算：顺序重试 + 5 路并发重试均只生效一次",
      dupOk,
      `顺序重试 HTTP ${settle2.status} duplicated=${settle2Body.duplicated}；并发 5 路全部 duplicated=${parallelBodies.every((b) => b.duplicated)}；库中结算单 ${settlementsInDb} 条；余额 ${richFinal.balance} 分、积分 ${richFinal.points}（未二次变动）`,
    );

    // ---------- 用例 6：并发首结竞态——6 路同时首结，仅 1 路真实生效 ----------
    const booking2 = await BookingModel.findOne({ room: room._id, date: DATE, member: other._id }).lean();
    const otherBeforeRace = (await MemberModel.findById(other._id).lean())!;
    const race = await Promise.all(Array.from({ length: 6 }, () => post(`/api/bookings/${booking2!._id}/settle`)));
    const raceBodies = (await Promise.all(race.map((r) => r.json()))) as Array<{ duplicated: boolean }>;
    const realSettles = raceBodies.filter((b) => b.duplicated === false).length;
    const dupSettles = raceBodies.filter((b) => b.duplicated === true).length;
    const settlements2 = await SettlementModel.countDocuments({ booking: booking2!._id });
    const otherAfterRace = (await MemberModel.findById(other._id).lean())!;
    // 路人预约 16:00-18:00 预付 10000，银卡 9 折实付 9000，退 1000，积分 +90
    const raceOk =
      realSettles === 1 &&
      dupSettles === 5 &&
      settlements2 === 1 &&
      otherAfterRace.balance === otherBeforeRace.balance + 1000 &&
      otherAfterRace.points === otherBeforeRace.points + 90;
    record(
      "并发首结竞态：6 路同时结算仅 1 路生效",
      raceOk,
      `真实生效 ${realSettles} 路 / 幂等回读 ${dupSettles} 路；库中结算单 ${settlements2} 条；余额 +${otherAfterRace.balance - otherBeforeRace.balance} 分、积分 +${otherAfterRace.points - otherBeforeRace.points}（仅一次）`,
    );

    // ---------- 用例 7：空档查询回读（页面刷新可回读的数据源） ----------
    const availability = (await (await fetch(`${base}/api/availability?date=${DATE}`)).json()) as Array<{
      room: { _id: string };
      occupied: Array<{ startHour: number; endHour: number }>;
      freeSlots: Array<{ startHour: number; endHour: number }>;
    }>;
    const roomAvailability = availability.find((item) => String(item.room._id) === String(room._id));
    const occupiedHours = roomAvailability?.occupied.flatMap((s) => [s.startHour, s.endHour]) ?? [];
    const availabilityOk =
      !!roomAvailability &&
      roomAvailability.occupied.length === 2 &&
      occupiedHours.includes(14) &&
      occupiedHours.includes(18) &&
      !roomAvailability.freeSlots.some((s) => s.startHour <= 14 && s.endHour > 14);
    record(
      "空档查询：已约时段正确占用，刷新可回读",
      availabilityOk,
      `已约区间 ${JSON.stringify(roomAvailability?.occupied)}；空档区间 ${JSON.stringify(roomAvailability?.freeSlots)}`,
    );
  } finally {
    server.close();
    await disconnectDatabase();
    await mongod.stop();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n===== 实测汇总：${results.length - failed.length}/${results.length} 通过 =====`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("E2E 执行异常：", error);
  process.exit(1);
});

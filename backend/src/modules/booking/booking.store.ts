import { promises as fs } from "fs";
import path from "path";

import { AppError } from "../../common/errors";
import type { BookingState } from "./booking.types";

const DEFAULT_DATA_FILE = path.join(process.cwd(), "data", "booking-store.json");
const DATA_FILE = process.env.BOOKING_DATA_FILE
  ? path.resolve(process.env.BOOKING_DATA_FILE)
  : DEFAULT_DATA_FILE;

let cachedState: BookingState | null = null;
let writeChain: Promise<void> = Promise.resolve();
/** 临界区队列：前一个事务（含落盘）完成后，下一个才能拿到状态 */
let txChain: Promise<unknown> = Promise.resolve();

function createSeedState(): BookingState {
  // 以“今天”为锚点生成种子数据，保证刷新当天页面即可看到空档 / 预约 / 结算
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();

  const rooms: BookingState["rooms"] = [
    {
      id: "room-a",
      name: "策略大师厅",
      capacity: 8,
      facilities: ["长桌", "白板", "桌游库", "独立空调"],
      hourlyRate: 60,
    },
    {
      id: "room-b",
      name: "欢乐聚会房",
      capacity: 12,
      facilities: ["沙发", "音响", "KTV", "茶水"],
      hourlyRate: 90,
    },
    {
      id: "room-c",
      name: "沉浸剧本室",
      capacity: 6,
      facilities: ["换装", "灯光", "音响", "道具墙"],
      hourlyRate: 120,
    },
  ];

  const members: BookingState["members"] = [
    { id: "member-1", name: "王小明", level: "普通会员", discount: 1, balance: 200, points: 40 },
    { id: "member-2", name: "李大方", level: "白银会员", discount: 0.9, balance: 500, points: 180 },
    { id: "member-3", name: "赵金金", level: "黄金会员", discount: 0.8, balance: 50, points: 600 },
  ];

  const seedSettledBooking: BookingState["bookings"] = [
    {
      id: "booking-seed-1",
      roomId: "room-a",
      memberId: "member-2",
      date: today,
      startHour: 10,
      endHour: 12,
      amount: 120,
      status: "settled",
      createdAt: now,
    },
  ];

  const seedSettlement: BookingState["settlements"] = [
    {
      id: "settlement-seed-1",
      bookingId: "booking-seed-1",
      roomId: "room-a",
      memberId: "member-2",
      date: today,
      startHour: 10,
      endHour: 12,
      originalAmount: 120,
      discount: 0.9,
      paidAmount: 108,
      earnedPoints: 108,
      settledAt: now,
    },
  ];

  return {
    rooms,
    members,
    bookings: seedSettledBooking,
    settlements: seedSettlement,
    sequence: 1000,
  };
}

async function loadState(): Promise<BookingState> {
  if (cachedState) {
    return cachedState;
  }

  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    cachedState = JSON.parse(raw) as BookingState;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
    cachedState = createSeedState();
    await persist(cachedState);
  }

  return cachedState as BookingState;
}

async function persist(state: BookingState): Promise<void> {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tmpFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tmpFile, DATA_FILE);
}

/**
 * 全局互斥：同一 Node 进程内所有读-校验-写操作都串行执行。
 * 冲突检查 + 写入在同一个临界区内完成，杜绝并发下的重复预约 / 重复结算。
 */
export function withTransaction<T>(
  operation: (state: BookingState) => T | Promise<T>,
): Promise<T> {
  const run = txChain.then(async () => {
    const state = await loadState();
    const result = await operation(state);
    // 先基于内存状态落盘，保证下一个临界区开始前磁盘已是最新
    writeChain = writeChain.then(() => persist(state));
    await writeChain;
    return result;
  });
  // 失败的事务不能污染整条队列
  txChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** 只读快照，刷新回读场景使用（磁盘文件即权威数据） */
export async function readState(): Promise<BookingState> {
  return withTransaction((state) => deepClone(state));
}

/** 测试 / 演示：重置为种子数据 */
export async function resetState(): Promise<BookingState> {
  cachedState = createSeedState();
  await persist(cachedState);
  return deepClone(cachedState);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 业务错误快捷方式 */
export function reject(message: string, statusCode = 409): never {
  throw new AppError(statusCode, message);
}

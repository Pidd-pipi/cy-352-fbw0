import { AppError } from "../../common/errors";
import {
  readState,
  reject,
  resetState,
  withTransaction,
} from "./booking.store";
import type {
  Booking,
  BookingState,
  CreateBookingInput,
  Room,
  Settlement,
} from "./booking.types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BUSINESS_START = 9;
const BUSINESS_END = 23;

/* ------------------------------- 查询读取 ------------------------------- */

export interface SlotView {
  hour: number;
  label: string;
  status: "free" | "booked" | "settled";
  bookingId?: string;
  memberName?: string;
}

export interface RoomAvailability {
  room: Room;
  slots: SlotView[];
  busyRanges: Array<{ startHour: number; endHour: number; status: Booking["status"] }>;
}

export function getSnapshot() {
  return readState();
}

export function getAvailability(date: string): Promise<{ date: string; rooms: RoomAvailability[] }> {
  if (!DATE_PATTERN.test(date)) {
    throw new AppError(400, "日期格式必须为 YYYY-MM-DD");
  }
  return withTransaction((state) => {
    const rooms = state.rooms.map((room) => buildRoomAvailability(state, room.id, date));
    return { date, rooms: rooms.filter((room): room is RoomAvailability => room !== null) };
  });
}

function buildRoomAvailability(
  state: BookingState,
  roomId: string,
  date: string,
): RoomAvailability | null {
  const room = state.rooms.find((item) => item.id === roomId);
  if (!room) {
    return null;
  }

  const dayBookings = state.bookings.filter(
    (booking) => booking.roomId === roomId && booking.date === date,
  );
  const busyRanges = dayBookings
    .filter((booking) => booking.status !== "cancelled")
    .map((booking) => ({
      startHour: booking.startHour,
      endHour: booking.endHour,
      status: booking.status,
    }));

  const slots: SlotView[] = [];
  for (let hour = BUSINESS_START; hour < BUSINESS_END; hour += 1) {
    const hit = dayBookings
      .filter((booking) => booking.status !== "cancelled")
      .find((booking) => hour >= booking.startHour && hour < booking.endHour);
    slots.push({
      hour,
      label: `${pad(hour)}:00-${pad(hour + 1)}:00`,
      status: hit ? (hit.status === "settled" ? "settled" : "booked") : "free",
      bookingId: hit?.id,
      memberName: hit
        ? state.members.find((member) => member.id === hit.memberId)?.name
        : undefined,
    });
  }

  return { room, slots, busyRanges };
}

/* -------------------------------- 预约 -------------------------------- */

export async function createBooking(input: CreateBookingInput): Promise<{
  booking: Booking;
  member: { id: string; name: string; balance: number; points: number };
}> {
  validateSlot(input.date, input.startHour, input.endHour);

  return withTransaction((state) => {
    const room = state.rooms.find((item) => item.id === input.roomId);
    if (!room) {
      reject(`包厢不存在：${input.roomId}`, 404);
    }
    const member = state.members.find((item) => item.id === input.memberId);
    if (!member) {
      reject(`会员不存在：${input.memberId}`, 404);
    }

    // 规则一：同一包厢重叠时段只能存在一单（已结算 / 已预约都占用时段）
    const overlapped = state.bookings
      .filter((booking) => booking.status !== "cancelled")
      .find(
        (booking) =>
          booking.roomId === input.roomId &&
          booking.date === input.date &&
          input.startHour < booking.endHour &&
          booking.startHour < input.endHour,
      );
    if (overlapped) {
      reject(
        `时段冲突：${room!.name} 在 ${input.date} ${pad(overlapped.startHour)}:00-${pad(
          overlapped.endHour,
        )}:00 已被预约`,
      );
    }

    const hours = input.endHour - input.startHour;
    const amount = Math.round(room!.hourlyRate * hours * 100) / 100;

    // 规则二：余额不足整次拒绝，预约不生成、不扣款
    if (member!.balance < amount) {
      reject(
        `余额不足：${member!.name} 当前余额 ¥${member!.balance.toFixed(
          2,
        )}，本次预约需预校验 ¥${amount.toFixed(2)}`,
      );
    }

    state.sequence += 1;
    const booking: Booking = {
      id: `booking-${state.sequence}`,
      roomId: room!.id,
      memberId: member!.id,
      date: input.date,
      startHour: input.startHour,
      endHour: input.endHour,
      amount,
      status: "booked",
      createdAt: new Date().toISOString(),
    };
    state.bookings.push(booking);

    return {
      booking: clone(booking),
      member: {
        id: member!.id,
        name: member!.name,
        balance: member!.balance,
        points: member!.points,
      },
    };
  });
}

/* -------------------------------- 结算 -------------------------------- */

export async function settleBooking(bookingId: string): Promise<{
  settlement: Settlement;
  booking: Booking;
  member: { id: string; name: string; balance: number; points: number };
  idempotent: boolean;
}> {
  return withTransaction((state) => {
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking) {
      reject(`预约不存在：${bookingId}`, 404);
    }

    const member = state.members.find((item) => item.id === booking!.memberId);
    if (!member) {
      reject(`会员不存在：${booking!.memberId}`, 404);
    }

    // 规则三：重复结算只生效一次（幂等，返回原结算记录，不再扣款 / 加积分）
    const existing = state.settlements.find((item) => item.bookingId === bookingId);
    if (existing) {
      return {
        settlement: clone(existing),
        booking: clone(booking!),
        member: {
          id: member!.id,
          name: member!.name,
          balance: member!.balance,
          points: member!.points,
        },
        idempotent: true,
      };
    }

    if (booking!.status === "cancelled") {
      reject("预约已取消，无法结算");
    }

    const discount = member!.discount;
    const paidAmount = Math.round(booking!.amount * discount * 100) / 100;

    // 结算时再次原子校验余额，不足则整体拒绝，预约保持未结算
    if (member!.balance < paidAmount) {
      reject(
        `余额不足：${member!.name} 当前余额 ¥${member!.balance.toFixed(
          2,
        )}，结算需要 ¥${paidAmount.toFixed(2)}`,
      );
    }

    // 余额、积分、预约状态在同一临界区内一起变化
    member!.balance = Math.round((member!.balance - paidAmount) * 100) / 100;
    const earnedPoints = Math.floor(paidAmount);
    member!.points += earnedPoints;
    booking!.status = "settled";

    state.sequence += 1;
    const settlement: Settlement = {
      id: `settlement-${state.sequence}`,
      bookingId: booking!.id,
      roomId: booking!.roomId,
      memberId: member!.id,
      date: booking!.date,
      startHour: booking!.startHour,
      endHour: booking!.endHour,
      originalAmount: booking!.amount,
      discount,
      paidAmount,
      earnedPoints,
      settledAt: new Date().toISOString(),
    };
    state.settlements.push(settlement);

    return {
      settlement: clone(settlement),
      booking: clone(booking!),
      member: {
        id: member!.id,
        name: member!.name,
        balance: member!.balance,
        points: member!.points,
      },
      idempotent: false,
    };
  });
}

/* -------------------------------- 充值（演示辅助） ------------------------ */

export async function rechargeMember(memberId: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, "充值金额必须为正数");
  }
  return withTransaction((state) => {
    const member = state.members.find((item) => item.id === memberId);
    if (!member) {
      reject(`会员不存在：${memberId}`, 404);
    }
    member!.balance = Math.round((member!.balance + amount) * 100) / 100;
    return { id: member!.id, name: member!.name, balance: member!.balance };
  });
}

/* -------------------------------- 重置（测试辅助） ------------------------ */

export function resetDemo() {
  return resetState();
}

/* -------------------------------- 校验工具 ------------------------------ */

function validateSlot(date: string, startHour: number, endHour: number) {
  if (!DATE_PATTERN.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00`))) {
    throw new AppError(400, "日期不合法，格式必须为 YYYY-MM-DD");
  }
  if (
    !Number.isInteger(startHour) ||
    !Number.isInteger(endHour) ||
    startHour < BUSINESS_START ||
    endHour > BUSINESS_END ||
    startHour >= endHour
  ) {
    throw new AppError(
      400,
      `时段必须是 ${pad(BUSINESS_START)}:00-${pad(BUSINESS_END)}:00 之间、起小于止的整数小时区间`,
    );
  }
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

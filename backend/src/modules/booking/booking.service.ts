import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { AppError, ERROR_MESSAGES } from "../../common/errors";
import {
  BookingModel,
  MemberModel,
  RoomModel,
  SettlementModel,
  type BookingDoc,
  type SettlementDoc,
} from "./models";

const LOCK_TTL_MS = 5000;
const LOCK_RETRY_TIMES = 30;
const LOCK_RETRY_INTERVAL_MS = 100;

export interface CreateBookingInput {
  roomId: string;
  memberId: string;
  date: string;
  startHour: number;
  endHour: number;
}

export interface SettleResult {
  settlement: SettlementDoc;
  duplicated: boolean;
}

function assertObjectId(value: string, label: string) {
  if (!Types.ObjectId.isValid(value)) {
    throw new AppError(400, "VALIDATION_FAILED", `${label} 不是合法的 ID`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BookingService {
  async listRooms() {
    return RoomModel.find().sort({ hourlyPrice: 1 }).lean();
  }

  async listMembers() {
    return MemberModel.find().sort({ createdAt: 1 }).lean();
  }

  async listBookings() {
    return BookingModel.find().populate("room member").sort({ createdAt: -1 }).limit(200).lean();
  }

  async listSettlements() {
    return SettlementModel.find().populate("room member").sort({ createdAt: -1 }).limit(200).lean();
  }

  /** 查询指定日期的包厢空档：返回每个包厢已约时段与空闲时段 */
  async getAvailability(date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, "VALIDATION_FAILED", "日期格式应为 YYYY-MM-DD");
    }
    const rooms = await RoomModel.find().sort({ hourlyPrice: 1 }).lean();
    // 已预约与已结算都占用时段，只有取消才释放
    const bookings = await BookingModel.find({ date, status: { $ne: "CANCELLED" } }).lean();

    return rooms.map((room) => {
      const occupied = bookings
        .filter((booking) => String(booking.room) === String(room._id))
        .map((booking) => ({ startHour: booking.startHour, endHour: booking.endHour, bookingId: booking._id }));
      const freeSlots: Array<{ startHour: number; endHour: number }> = [];
      let cursor = 0;
      const sorted = [...occupied].sort((a, b) => a.startHour - b.startHour);
      for (const slot of sorted) {
        if (slot.startHour > cursor) {
          freeSlots.push({ startHour: cursor, endHour: slot.startHour });
        }
        cursor = Math.max(cursor, slot.endHour);
      }
      if (cursor < 24) {
        freeSlots.push({ startHour: cursor, endHour: 24 });
      }
      return { room, occupied, freeSlots };
    });
  }

  /**
   * 创建预约（整次原子）：
   * 1. 抢占包厢互斥锁，串行化同一包厢的并发预约；
   * 2. 校验时段重叠，冲突则整次拒绝；
   * 3. 条件原子扣款（余额不足则整次拒绝，不落预约、不扣款）；
   * 4. 写入预约；任一步失败都会回滚已扣金额并释放锁。
   */
  async createBooking(input: CreateBookingInput): Promise<BookingDoc> {
    const { roomId, memberId, date, startHour, endHour } = input;
    assertObjectId(roomId, "包厢");
    assertObjectId(memberId, "会员");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new AppError(400, "VALIDATION_FAILED", "日期格式应为 YYYY-MM-DD");
    }
    if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24 || startHour >= endHour) {
      throw new AppError(400, "VALIDATION_FAILED", "时段不合法：需为 0-24 点之间且开始早于结束");
    }

    const member = await MemberModel.findById(memberId).lean();
    if (!member) {
      throw new AppError(404, "MEMBER_NOT_FOUND", ERROR_MESSAGES.memberNotFound);
    }

    const lockToken = randomUUID();
    const room = await this.acquireRoomLock(roomId, lockToken);
    const amount = (endHour - startHour) * room.hourlyPrice;

    try {
      const overlap = await BookingModel.findOne({
        room: room._id,
        date,
        status: { $ne: "CANCELLED" },
        startHour: { $lt: endHour },
        endHour: { $gt: startHour },
      }).lean();
      if (overlap) {
        throw new AppError(409, "SLOT_CONFLICT", ERROR_MESSAGES.slotConflict);
      }

      // 条件原子扣款：只有余额足够才会扣，不足返回 null，整次拒绝
      const charged = await MemberModel.findOneAndUpdate(
        { _id: member._id, balance: { $gte: amount } },
        { $inc: { balance: -amount } },
        { new: true },
      ).lean();
      if (!charged) {
        throw new AppError(400, "INSUFFICIENT_BALANCE", ERROR_MESSAGES.insufficientBalance);
      }

      try {
        const booking = await BookingModel.create({
          room: room._id,
          member: member._id,
          date,
          startHour,
          endHour,
          prepaidAmount: amount,
          status: "BOOKED",
        });
        return booking.toObject() as BookingDoc;
      } catch (error) {
        // 兜底补偿：预约写入失败则退回已扣金额，保证「不生成预约就不扣款」
        await MemberModel.findByIdAndUpdate(member._id, { $inc: { balance: amount } });
        throw error;
      }
    } finally {
      await this.releaseRoomLock(room._id, lockToken);
    }
  }

  /**
   * 到店结算（幂等）：
   * 1. 原子状态门闩：仅 BOOKED -> SETTLED 成功的一方继续，其余请求按重复结算处理；
   * 2. 按会员折扣计算实付、应退余额与积分，一次性更新会员；
   * 3. 写入结算记录（booking 唯一索引兜底），重复请求回读已存在的结算单。
   */
  async settleBooking(bookingId: string): Promise<SettleResult> {
    assertObjectId(bookingId, "预约");

    const gate = await BookingModel.findOneAndUpdate(
      { _id: bookingId, status: "BOOKED" },
      { $set: { status: "SETTLED", settledAt: new Date() } },
      { new: true },
    ).lean();

    if (!gate) {
      const existing = await BookingModel.findById(bookingId).lean();
      if (!existing) {
        throw new AppError(404, "BOOKING_NOT_FOUND", ERROR_MESSAGES.bookingNotFound);
      }
      // 并发首结竞态：状态门闩刚被另一请求翻走，结算单可能尚未落库，短暂轮询等待
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const settled = await SettlementModel.findOne({ booking: existing._id }).lean();
        if (settled) {
          // 重复结算：直接回读首次结果，不再改动余额、积分和状态
          return { settlement: settled as SettlementDoc, duplicated: true };
        }
        await sleep(100);
      }
      throw new AppError(409, "ALREADY_SETTLED", "预约已结算或已取消");
    }

    const member = await MemberModel.findById(gate.member).lean();
    if (!member) {
      throw new AppError(404, "MEMBER_NOT_FOUND", ERROR_MESSAGES.memberNotFound);
    }

    const hours = gate.endHour - gate.startHour;
    const originalAmount = gate.prepaidAmount;
    const finalAmount = Math.round(originalAmount * member.discountRate);
    const refundAmount = originalAmount - finalAmount;
    const pointsEarned = Math.floor(finalAmount / 100);

    // 余额、积分随状态门闩之后一次性变更
    await MemberModel.findByIdAndUpdate(member._id, {
      $inc: { balance: refundAmount, points: pointsEarned },
    });

    try {
      const settlement = await SettlementModel.create({
        booking: gate._id,
        room: gate.room,
        member: gate.member,
        date: gate.date,
        startHour: gate.startHour,
        endHour: gate.endHour,
        hours,
        originalAmount,
        discountRate: member.discountRate,
        finalAmount,
        refundAmount,
        pointsEarned,
      });
      return { settlement: settlement.toObject() as SettlementDoc, duplicated: false };
    } catch (error) {
      // 唯一索引兜底：并发下另一请求已写入结算单，则回读视为重复结算
      if ((error as { code?: number }).code === 11000) {
        const settled = await SettlementModel.findOne({ booking: gate._id }).lean();
        if (settled) {
          return { settlement: settled as SettlementDoc, duplicated: true };
        }
      }
      throw error;
    }
  }

  async recharge(memberId: string, amount: number) {
    assertObjectId(memberId, "会员");
    if (!Number.isInteger(amount) || amount <= 0) {
      throw new AppError(400, "VALIDATION_FAILED", "充值金额必须为正整数（分）");
    }
    const member = await MemberModel.findByIdAndUpdate(memberId, { $inc: { balance: amount } }, { new: true }).lean();
    if (!member) {
      throw new AppError(404, "MEMBER_NOT_FOUND", ERROR_MESSAGES.memberNotFound);
    }
    return member;
  }

  /** 原子抢占包厢锁，带短重试以串行化并发预约 */
  private async acquireRoomLock(roomId: string, token: string) {
    for (let attempt = 0; attempt < LOCK_RETRY_TIMES; attempt += 1) {
      const now = new Date();
      const room = await RoomModel.findOneAndUpdate(
        {
          _id: roomId,
          $or: [{ lockOwner: null }, { lockExpiresAt: { $lte: now } }, { lockExpiresAt: null }],
        },
        { $set: { lockOwner: token, lockExpiresAt: new Date(now.getTime() + LOCK_TTL_MS) } },
        { new: true },
      ).lean();
      if (room) {
        return room;
      }
      const exists = await RoomModel.exists({ _id: roomId });
      if (!exists) {
        throw new AppError(404, "ROOM_NOT_FOUND", ERROR_MESSAGES.roomNotFound);
      }
      await sleep(LOCK_RETRY_INTERVAL_MS);
    }
    throw new AppError(409, "ROOM_BUSY", ERROR_MESSAGES.roomBusy);
  }

  private async releaseRoomLock(roomId: Types.ObjectId, token: string) {
    await RoomModel.updateOne({ _id: roomId, lockOwner: token }, { $set: { lockOwner: null, lockExpiresAt: null } });
  }
}

export const bookingService = new BookingService();

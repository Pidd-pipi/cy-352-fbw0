export type BookingStatus = "booked" | "settled" | "cancelled";

export interface Room {
  id: string;
  name: string;
  capacity: number;
  facilities: string[];
  /** 每小时价格（元） */
  hourlyRate: number;
}

export interface Member {
  id: string;
  name: string;
  level: "普通会员" | "白银会员" | "黄金会员";
  /** 折扣，1 表示无折扣，0.88 表示 88 折 */
  discount: number;
  /** 储值余额（元） */
  balance: number;
  /** 累计积分 */
  points: number;
}

export interface Booking {
  id: string;
  roomId: string;
  memberId: string;
  /** 预约日期，格式 YYYY-MM-DD */
  date: string;
  /** 开始小时（0-23），闭区间 */
  startHour: number;
  /** 结束小时（0-24），开区间 */
  endHour: number;
  /** 预估原价（元），到店结算前不扣款 */
  amount: number;
  status: BookingStatus;
  createdAt: string;
}

export interface Settlement {
  id: string;
  bookingId: string;
  roomId: string;
  memberId: string;
  date: string;
  startHour: number;
  endHour: number;
  /** 原价 */
  originalAmount: number;
  /** 使用的折扣 */
  discount: number;
  /** 实扣金额 */
  paidAmount: number;
  /** 本次获得积分 */
  earnedPoints: number;
  settledAt: string;
}

export interface BookingState {
  rooms: Room[];
  members: Member[];
  bookings: Booking[];
  settlements: Settlement[];
  sequence: number;
}

export interface CreateBookingInput {
  roomId: string;
  memberId: string;
  date: string;
  startHour: number;
  endHour: number;
}

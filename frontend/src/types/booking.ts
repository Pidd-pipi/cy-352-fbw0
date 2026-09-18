export type BookingStatus = "booked" | "settled" | "cancelled";

export interface Room {
  id: string;
  name: string;
  capacity: number;
  facilities: string[];
  hourlyRate: number;
}

export interface Member {
  id: string;
  name: string;
  level: string;
  discount: number;
  balance: number;
  points: number;
}

export interface Booking {
  id: string;
  roomId: string;
  memberId: string;
  date: string;
  startHour: number;
  endHour: number;
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
  originalAmount: number;
  discount: number;
  paidAmount: number;
  earnedPoints: number;
  settledAt: string;
}

export interface BookingState {
  rooms: Room[];
  members: Member[];
  bookings: Booking[];
  settlements: Settlement[];
}

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
  busyRanges: Array<{ startHour: number; endHour: number; status: BookingStatus }>;
}

export interface BookingActionResult {
  booking: Booking;
  member: { id: string; name: string; balance: number; points: number };
}

export interface SettlementActionResult {
  settlement: Settlement;
  booking: Booking;
  member: { id: string; name: string; balance: number; points: number };
  idempotent: boolean;
}

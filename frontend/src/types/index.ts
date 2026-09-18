export interface Room {
  _id: string;
  name: string;
  capacity: number;
  facilities: string[];
  hourlyPrice: number;
}

export interface Member {
  _id: string;
  name: string;
  level: string;
  discountRate: number;
  balance: number;
  points: number;
}

export interface Booking {
  _id: string;
  room: Room | string;
  member: Member | string;
  date: string;
  startHour: number;
  endHour: number;
  prepaidAmount: number;
  status: "BOOKED" | "SETTLED" | "CANCELLED";
  createdAt: string;
  settledAt?: string | null;
}

export interface Settlement {
  _id: string;
  booking: string;
  room: Room | string;
  member: Member | string;
  date: string;
  startHour: number;
  endHour: number;
  hours: number;
  originalAmount: number;
  discountRate: number;
  finalAmount: number;
  refundAmount: number;
  pointsEarned: number;
  createdAt: string;
}

export interface OccupiedSlot {
  startHour: number;
  endHour: number;
  bookingId: string;
}

export interface FreeSlot {
  startHour: number;
  endHour: number;
}

export interface RoomAvailability {
  room: Room;
  occupied: OccupiedSlot[];
  freeSlots: FreeSlot[];
}

export interface ApiErrorBody {
  error?: { code: string; message: string };
}

import { API_BASE_URL } from "../constants/app";
import type { ApiErrorBody, Booking, Member, Room, RoomAvailability, Settlement } from "../types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const body = (await response.json()) as ApiErrorBody;
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // 保留默认错误信息
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function fetchRooms(): Promise<Room[]> {
  return request<Room[]>("/rooms");
}

export function fetchMembers(): Promise<Member[]> {
  return request<Member[]>("/members");
}

export function fetchAvailability(date: string): Promise<RoomAvailability[]> {
  return request<RoomAvailability[]>(`/availability?date=${encodeURIComponent(date)}`);
}

export function fetchBookings(): Promise<Booking[]> {
  return request<Booking[]>("/bookings");
}

export function fetchSettlements(): Promise<Settlement[]> {
  return request<Settlement[]>("/settlements");
}

export interface CreateBookingPayload {
  roomId: string;
  memberId: string;
  date: string;
  startHour: number;
  endHour: number;
}

export function createBooking(payload: CreateBookingPayload): Promise<Booking> {
  return request<Booking>("/bookings", { method: "POST", body: JSON.stringify(payload) });
}

export interface SettleResponse {
  settlement: Settlement;
  duplicated: boolean;
}

export function settleBooking(bookingId: string): Promise<SettleResponse> {
  return request<SettleResponse>(`/bookings/${bookingId}/settle`, { method: "POST" });
}

export function rechargeMember(memberId: string, amount: number): Promise<Member> {
  return request<Member>(`/members/${memberId}/recharge`, { method: "POST", body: JSON.stringify({ amount }) });
}

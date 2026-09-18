import { API_BASE_URL } from "../constants/app";
import type {
  BookingActionResult,
  BookingState,
  RoomAvailability,
  SettlementActionResult,
} from "../types/booking";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string }).error ?? `请求失败：${response.status}`);
  }
  return payload as T;
}

export function fetchState(): Promise<BookingState> {
  return request<BookingState>("/booking/state");
}

export function fetchAvailability(date: string): Promise<{ date: string; rooms: RoomAvailability[] }> {
  return request<{ date: string; rooms: RoomAvailability[] }>(
    `/booking/availability?date=${encodeURIComponent(date)}`,
  );
}

export function createReservation(payload: {
  roomId: string;
  memberId: string;
  date: string;
  startHour: number;
  endHour: number;
}): Promise<BookingActionResult> {
  return request<BookingActionResult>("/booking/reservations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function settleReservation(bookingId: string): Promise<SettlementActionResult> {
  return request<SettlementActionResult>(`/booking/reservations/${bookingId}/settle`, {
    method: "POST",
  });
}

export function rechargeMember(memberId: string, amount: number): Promise<{ balance: number }> {
  return request<{ balance: number }>(`/booking/members/${memberId}/recharge`, {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export function resetDemo(): Promise<BookingState> {
  return request<BookingState>("/booking/reset", { method: "POST" });
}

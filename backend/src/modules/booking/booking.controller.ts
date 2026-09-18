import type { Request, Response } from "express";

import type { CreateBookingInput } from "./booking.types";
import {
  createBooking,
  getAvailability,
  getSnapshot,
  rechargeMember,
  resetDemo,
  settleBooking,
} from "./booking.service";

export async function getState(_request: Request, response: Response) {
  response.json(await getSnapshot());
}

export async function getRoomAvailability(request: Request, response: Response) {
  const date = String(request.query.date ?? new Date().toISOString().slice(0, 10));
  response.json(await getAvailability(date));
}

export async function postBooking(request: Request, response: Response) {
  const { roomId, memberId, date, startHour, endHour } = request.body as Partial<CreateBookingInput>;
  const result = await createBooking({
    roomId: String(roomId),
    memberId: String(memberId),
    date: String(date),
    startHour: Number(startHour),
    endHour: Number(endHour),
  });
  response.status(201).json(result);
}

export async function postSettlement(request: Request, response: Response) {
  const bookingId = String(request.params.bookingId);
  const result = await settleBooking(bookingId);
  response.status(result.idempotent ? 200 : 201).json(result);
}

export async function postRecharge(request: Request, response: Response) {
  const memberId = String(request.params.memberId);
  const { amount } = request.body as { amount: number };
  response.json(await rechargeMember(memberId, Number(amount)));
}

export async function postReset(_request: Request, response: Response) {
  response.json(await resetDemo());
}

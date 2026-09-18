import type { Request, Response, NextFunction } from "express";
import { bookingService } from "./booking.service";

export async function listRooms(_request: Request, response: Response, next: NextFunction) {
  try {
    response.json(await bookingService.listRooms());
  } catch (error) {
    next(error);
  }
}

export async function listMembers(_request: Request, response: Response, next: NextFunction) {
  try {
    response.json(await bookingService.listMembers());
  } catch (error) {
    next(error);
  }
}

export async function listBookings(_request: Request, response: Response, next: NextFunction) {
  try {
    response.json(await bookingService.listBookings());
  } catch (error) {
    next(error);
  }
}

export async function listSettlements(_request: Request, response: Response, next: NextFunction) {
  try {
    response.json(await bookingService.listSettlements());
  } catch (error) {
    next(error);
  }
}

export async function getAvailability(request: Request, response: Response, next: NextFunction) {
  try {
    const date = String(request.query.date ?? "");
    response.json(await bookingService.getAvailability(date));
  } catch (error) {
    next(error);
  }
}

export async function createBooking(request: Request, response: Response, next: NextFunction) {
  try {
    const booking = await bookingService.createBooking({
      roomId: String(request.body?.roomId ?? ""),
      memberId: String(request.body?.memberId ?? ""),
      date: String(request.body?.date ?? ""),
      startHour: Number(request.body?.startHour),
      endHour: Number(request.body?.endHour),
    });
    response.status(201).json(booking);
  } catch (error) {
    next(error);
  }
}

export async function settleBooking(request: Request, response: Response, next: NextFunction) {
  try {
    const result = await bookingService.settleBooking(String(request.params.id ?? ""));
    response.status(result.duplicated ? 200 : 201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function rechargeMember(request: Request, response: Response, next: NextFunction) {
  try {
    const member = await bookingService.recharge(String(request.params.id ?? ""), Number(request.body?.amount));
    response.json(member);
  } catch (error) {
    next(error);
  }
}

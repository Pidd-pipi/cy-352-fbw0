import { Router } from "express";
import {
  createBooking,
  getAvailability,
  listBookings,
  listMembers,
  listRooms,
  listSettlements,
  rechargeMember,
  settleBooking,
} from "./booking.controller";

export const bookingRouter = Router();

bookingRouter.get("/rooms", listRooms);
bookingRouter.get("/members", listMembers);
bookingRouter.get("/bookings", listBookings);
bookingRouter.post("/bookings", createBooking);
bookingRouter.post("/bookings/:id/settle", settleBooking);
bookingRouter.get("/settlements", listSettlements);
bookingRouter.get("/availability", getAvailability);
bookingRouter.post("/members/:id/recharge", rechargeMember);

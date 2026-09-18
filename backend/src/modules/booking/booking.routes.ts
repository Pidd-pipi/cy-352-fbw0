import { Router } from "express";

import {
  getRoomAvailability,
  getState,
  postBooking,
  postRecharge,
  postReset,
  postSettlement,
} from "./booking.controller";
import { asyncHandler } from "../../common/async-handler";

export const bookingRouter = Router();

bookingRouter.get("/booking/state", asyncHandler(getState));
bookingRouter.get("/booking/availability", asyncHandler(getRoomAvailability));
bookingRouter.post("/booking/reservations", asyncHandler(postBooking));
bookingRouter.post("/booking/reservations/:bookingId/settle", asyncHandler(postSettlement));
bookingRouter.post("/booking/members/:memberId/recharge", asyncHandler(postRecharge));
bookingRouter.post("/booking/reset", asyncHandler(postReset));

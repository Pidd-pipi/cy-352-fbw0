import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { AppError } from "./common/errors";
import { logger } from "./common/logger";
import { bookingRouter } from "./modules/booking/booking.routes";
import { overviewRouter } from "./modules/overview/overview.routes";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
app.use("/", overviewRouter);
app.use("/api", overviewRouter);
app.use("/", bookingRouter);
app.use("/api", bookingRouter);

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({ error: { code: error.code, message: error.message } });
    return;
  }
  logger.error(error instanceof Error ? error.message : String(error));
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } });
});

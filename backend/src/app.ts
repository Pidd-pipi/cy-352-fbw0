import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { overviewRouter } from "./modules/overview/overview.routes";
import { bookingRouter } from "./modules/booking/booking.routes";
import { AppError } from "./common/errors";
import { logger } from "./common/logger";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.get("/health", (_request, response) => response.json({ status: "ok" }));
app.get("/api/health", (_request, response) => response.json({ status: "ok" }));
app.use("/", overviewRouter);
app.use("/api", overviewRouter);
app.use("/api", bookingRouter);

// 统一错误响应：业务冲突 / 参数错误都以 JSON 返回，不产生任何半截副作用
app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }
  logger.error(error instanceof Error ? error.stack ?? error.message : String(error));
  response.status(500).json({ error: "服务内部错误" });
});

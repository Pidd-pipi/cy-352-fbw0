export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const ERROR_MESSAGES = {
  overviewUnavailable: "Overview data is unavailable",
  roomNotFound: "包厢不存在",
  memberNotFound: "会员不存在",
  bookingNotFound: "预约不存在",
  slotConflict: "该包厢此时段已被预约，整次预约已拒绝",
  insufficientBalance: "会员余额不足，整次预约已拒绝",
  roomBusy: "包厢预约通道繁忙，请稍后重试",
  invalidPayload: "请求参数不合法",
};

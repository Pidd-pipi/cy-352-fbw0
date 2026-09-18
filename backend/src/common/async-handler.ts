import type { NextFunction, Request, Response } from "express";

/**
 * 统一捕获 async 路由抛出的错误并交给错误处理中间件，
 * 避免在每个 controller 里手写 try/catch。
 */
export function asyncHandler(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response, next).catch(next);
  };
}

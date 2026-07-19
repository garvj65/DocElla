import type { NextFunction, Request, Response } from "express";

import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";

export const notFound = (request: Request, _response: Response, next: NextFunction): void => {
  next(
    new AppError({
      code: ERROR_CODES.ROUTE_NOT_FOUND,
      details: {
        method: request.method,
        path: request.path,
      },
      message: "The requested route does not exist.",
      status: 404,
    }),
  );
};

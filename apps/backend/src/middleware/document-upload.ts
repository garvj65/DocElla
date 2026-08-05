import type { NextFunction, Request, RequestHandler, Response } from "express";
import multer, { MulterError } from "multer";

import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { validateDocumentInput } from "../document-layout/document-format.js";
import {
  DOCUMENT_LAYOUT_LIMITS,
  type ValidatedDocumentInput,
} from "../document-layout/document-layout-types.js";

export const DOCUMENT_FILE_FIELD = "file" as const;

const validatedUploads = new WeakMap<Request, ValidatedDocumentInput>();

const uploadError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return new AppError({
        cause: error,
        code: ERROR_CODES.UPLOAD_TOO_LARGE,
        message: "The uploaded document exceeds the size limit.",
        status: 413,
      });
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE" || error.code === "LIMIT_FILE_COUNT") {
      return new AppError({
        cause: error,
        code: ERROR_CODES.UPLOAD_UNEXPECTED_FILE,
        message: "The request must include exactly one document in the file field.",
        status: 400,
      });
    }

    return new AppError({
      cause: error,
      code: ERROR_CODES.UPLOAD_INVALID_MULTIPART,
      message: "The multipart upload is invalid.",
      status: 400,
    });
  }

  return new AppError({
    cause: error,
    code: ERROR_CODES.UPLOAD_INVALID_MULTIPART,
    message: "The multipart upload is invalid.",
    status: 400,
  });
};

export const getValidatedDocumentUpload = (request: Request): ValidatedDocumentInput => {
  const upload = validatedUploads.get(request);
  if (upload === undefined) {
    throw new AppError({
      code: ERROR_CODES.UPLOAD_REQUIRED,
      message: "A document file is required.",
      status: 400,
    });
  }
  return upload;
};

export const createDocumentUploadMiddleware = (): RequestHandler => {
  const upload = multer({
    limits: {
      fieldNameSize: 100,
      fields: 0,
      fileSize: DOCUMENT_LAYOUT_LIMITS.maxFileBytes,
      files: 1,
      parts: 2,
    },
    storage: multer.memoryStorage(),
  }).single(DOCUMENT_FILE_FIELD);

  return (request: Request, response: Response, next: NextFunction): void => {
    upload(request, response, (error: unknown): void => {
      if (error !== undefined) {
        next(uploadError(error));
        return;
      }

      try {
        const file = request.file;
        if (file === undefined) {
          throw new AppError({
            code: ERROR_CODES.UPLOAD_REQUIRED,
            message: "A document file is required.",
            status: 400,
          });
        }

        const validated = validateDocumentInput({
          bytes: new Uint8Array(file.buffer),
          filename: file.originalname,
          mediaType: file.mimetype,
        });
        validatedUploads.set(request, validated);
        next();
      } catch (validationError) {
        next(validationError);
      }
    });
  };
};

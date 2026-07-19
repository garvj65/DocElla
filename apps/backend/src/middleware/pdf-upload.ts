import type { NextFunction, Request, RequestHandler, Response } from "express";
import multer, { MulterError } from "multer";

import { EXTRACTION_LIMITS, type ExtractionLimits } from "../config/extraction-limits.js";
import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";

export const PDF_FILE_FIELD = "file" as const;
export const SCHEMA_TYPE_FIELD = "schemaType" as const;

export interface PdfUploadOptions {
  readonly limits?: Partial<ExtractionLimits>;
}

const toLimitConfig = (limits: Partial<ExtractionLimits>) => ({
  fieldNameSize: 100,
  fieldSize: 100,
  fields: limits.maxTextFields ?? EXTRACTION_LIMITS.maxTextFields,
  fileSize: limits.maxFileBytes ?? EXTRACTION_LIMITS.maxFileBytes,
  files: limits.maxFiles ?? EXTRACTION_LIMITS.maxFiles,
  // Busboy raises LIMIT_PART_COUNT as the final allowed part arrives, so permit
  // the parser to see one boundary beyond the declared file+field maximum.
  parts: (limits.maxParts ?? EXTRACTION_LIMITS.maxParts) + 1,
});

const uploadError = (error: unknown): AppError => {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return new AppError({
        cause: error,
        code: ERROR_CODES.UPLOAD_TOO_LARGE,
        message: "The uploaded PDF exceeds the size limit.",
        status: 413,
      });
    }

    if (error.code === "LIMIT_UNEXPECTED_FILE" || error.code === "LIMIT_FILE_COUNT") {
      return new AppError({
        cause: error,
        code: ERROR_CODES.UPLOAD_UNEXPECTED_FILE,
        message: "The request must include exactly one PDF in the file field.",
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

const hasPdfHeader = (buffer: Buffer): boolean => {
  const headerSearch = buffer.subarray(0, 1024).toString("latin1");
  return headerSearch.includes("%PDF-");
};

const validateUpload = (request: Request): void => {
  if (request.file === undefined) {
    throw new AppError({
      code: ERROR_CODES.UPLOAD_REQUIRED,
      message: "A PDF file is required.",
      status: 400,
    });
  }

  if (request.file.mimetype !== "application/pdf") {
    throw new AppError({
      code: ERROR_CODES.UPLOAD_INVALID_TYPE,
      message: "Only PDF uploads are supported.",
      status: 415,
    });
  }

  if (!hasPdfHeader(request.file.buffer)) {
    throw new AppError({
      code: ERROR_CODES.PDF_INVALID,
      message: "The uploaded file is not a valid text-based PDF.",
      status: 422,
    });
  }
};

export const createPdfUploadMiddleware = ({
  limits = {},
}: PdfUploadOptions = {}): RequestHandler => {
  const upload = multer({
    fileFilter: (_request, file, callback) => {
      if (file.mimetype !== "application/pdf") {
        callback(
          new AppError({
            code: ERROR_CODES.UPLOAD_INVALID_TYPE,
            message: "Only PDF uploads are supported.",
            status: 415,
          }),
        );
        return;
      }

      callback(null, true);
    },
    limits: toLimitConfig(limits),
    storage: multer.memoryStorage(),
  }).single(PDF_FILE_FIELD);

  return (request: Request, response: Response, next: NextFunction): void => {
    upload(request, response, (error: unknown): void => {
      if (error !== undefined) {
        next(uploadError(error));
        return;
      }

      try {
        validateUpload(request);
        next();
      } catch (validationError) {
        next(validationError);
      }
    });
  };
};

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { TemplateDefinition } from "@docella/schemas";

import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";

export interface PdfTemplateRepository {
  readonly load: (template: TemplateDefinition, signal?: AbortSignal) => Promise<Uint8Array>;
}

const checkSignal = (signal: AbortSignal | undefined): void => {
  signal?.throwIfAborted();
};

const ensureTrailingSeparator = (value: string): string =>
  value.endsWith(path.sep) ? value : `${value}${path.sep}`;

export const createFilePdfTemplateRepository = (trustedRoot: URL): PdfTemplateRepository => {
  const trustedRootPath = path.resolve(fileURLToPath(trustedRoot));
  const trustedRootWithSeparator = ensureTrailingSeparator(trustedRootPath);

  return {
    load: async (template, signal) => {
      checkSignal(signal);

      let resolvedPath: string;
      try {
        const resolvedUrl = new URL(template.assetPath, pathToFileURL(trustedRootWithSeparator));
        resolvedPath = path.resolve(fileURLToPath(resolvedUrl));
      } catch (error) {
        throw new AppError({
          cause: error,
          code: ERROR_CODES.PDF_TEMPLATE_UNAVAILABLE,
          logCause: false,
          message: "The requested PDF template is unavailable.",
          status: 500,
        });
      }

      if (resolvedPath !== trustedRootPath && !resolvedPath.startsWith(trustedRootWithSeparator)) {
        throw new AppError({
          code: ERROR_CODES.PDF_TEMPLATE_UNAVAILABLE,
          logCause: false,
          message: "The requested PDF template is unavailable.",
          status: 500,
        });
      }

      try {
        const bytes = await readFile(resolvedPath);
        checkSignal(signal);
        return new Uint8Array(bytes);
      } catch (error) {
        throw new AppError({
          cause: error,
          code: ERROR_CODES.PDF_TEMPLATE_UNAVAILABLE,
          logCause: false,
          message: "The requested PDF template is unavailable.",
          status: 500,
        });
      }
    },
  };
};

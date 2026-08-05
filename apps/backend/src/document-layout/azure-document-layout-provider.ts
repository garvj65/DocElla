import type {
  GenericBoundingPoint,
  GenericContentUnit,
  GenericEvidenceLocation,
  GenericSourceFormat,
} from "@docella/schemas";

import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import {
  DOCUMENT_LAYOUT_LIMITS,
  type DocumentLayoutProvider,
  type DocumentLayoutRegion,
  type DocumentLayoutRequest,
  type DocumentLayoutResult,
  type DocumentLayoutSpan,
  type DocumentLayoutTable,
  type DocumentLayoutTableCell,
  type DocumentLayoutTextBlock,
} from "./document-layout-types.js";

const AZURE_API_VERSION = "2024-11-30" as const;
const AZURE_MODEL_ID = "prebuilt-layout" as const;

export interface AzureDocumentLayoutProviderOptions {
  readonly endpoint: string;
  readonly fetchImpl?: typeof fetch;
  readonly key: string;
  readonly pollIntervalMs?: number;
  readonly timeoutMs?: number;
}

interface ProviderPage {
  readonly height?: unknown;
  readonly pageNumber?: unknown;
  readonly width?: unknown;
}

interface ProviderBoundingRegion {
  readonly pageNumber?: unknown;
  readonly polygon?: unknown;
}

interface ProviderSpan {
  readonly length?: unknown;
  readonly offset?: unknown;
}

interface ProviderParagraph {
  readonly boundingRegions?: unknown;
  readonly content?: unknown;
  readonly role?: unknown;
  readonly spans?: unknown;
}

interface ProviderTableCell {
  readonly boundingRegions?: unknown;
  readonly columnIndex?: unknown;
  readonly columnSpan?: unknown;
  readonly content?: unknown;
  readonly confidence?: unknown;
  readonly rowIndex?: unknown;
  readonly rowSpan?: unknown;
  readonly spans?: unknown;
}

interface ProviderTable {
  readonly boundingRegions?: unknown;
  readonly cells?: unknown;
  readonly columnCount?: unknown;
  readonly rowCount?: unknown;
  readonly spans?: unknown;
}

interface ProviderAnalyzeResult {
  readonly content?: unknown;
  readonly pages?: unknown;
  readonly paragraphs?: unknown;
  readonly tables?: unknown;
}

interface ProviderOperationResult {
  readonly analyzeResult?: unknown;
  readonly error?: unknown;
  readonly status?: unknown;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const providerError = (
  code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES],
  message: string,
  status: number,
  cause?: unknown,
): AppError =>
  new AppError({
    cause,
    code,
    logCause: false,
    message,
    safeLogContext: {
      documentLayoutModel: AZURE_MODEL_ID,
      documentLayoutProvider: "azure-document-intelligence",
    },
    status,
  });

const mapHttpError = (status: number): AppError => {
  if (status === 429) {
    return providerError(
      ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_RATE_LIMITED,
      "The document layout provider is rate limited.",
      503,
    );
  }
  if (status >= 500) {
    return providerError(
      ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_UNAVAILABLE,
      "The document layout provider is unavailable.",
      503,
    );
  }
  return providerError(
    ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_UNAVAILABLE,
    "The document layout provider rejected the document.",
    502,
  );
};

const invalidResponse = (cause?: unknown): AppError =>
  providerError(
    ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_INVALID_RESPONSE,
    "The document layout provider returned an invalid response.",
    502,
    cause,
  );

const timeoutError = (): AppError =>
  providerError(
    ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_TIMEOUT,
    "The document layout provider timed out.",
    503,
  );

const readBoundedJson = async (response: Response): Promise<unknown> => {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > DOCUMENT_LAYOUT_LIMITS.maxOperationResponseBytes
  ) {
    throw invalidResponse();
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > DOCUMENT_LAYOUT_LIMITS.maxOperationResponseBytes) {
    throw invalidResponse();
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch (error) {
    throw invalidResponse(error);
  }
};

const positiveInteger = (value: unknown, fallback = 1): number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;

const nonnegativeInteger = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;

const confidence = (value: unknown): number | undefined =>
  typeof value === "number" && value >= 0 && value <= 1 ? value : undefined;

const boundedString = (value: unknown, maximum: number): string | undefined =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maximum
    ? value
    : undefined;

const parseSpans = (value: unknown): readonly DocumentLayoutSpan[] => {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, DOCUMENT_LAYOUT_LIMITS.maxLayoutItems)
    .flatMap((candidate): DocumentLayoutSpan[] => {
      if (!isRecord(candidate)) return [];
      const span = candidate as ProviderSpan;
      const offset = nonnegativeInteger(span.offset, -1);
      const length = nonnegativeInteger(span.length, -1);
      return offset >= 0 && length >= 0 ? [{ length, offset }] : [];
    });
};

const contentUnitFor = (sourceFormat: GenericSourceFormat): GenericContentUnit => {
  switch (sourceFormat) {
    case "xlsx":
      return "sheet";
    case "pptx":
      return "slide";
    case "html":
      return "document";
    case "pdf":
    case "image":
    case "docx":
      return "page";
  }
};

const evidenceLocation = (
  sourceFormat: GenericSourceFormat,
  pageNumber: number,
): GenericEvidenceLocation => {
  switch (sourceFormat) {
    case "xlsx":
      return { kind: "sheet", sheetName: `Sheet ${String(pageNumber)}` };
    case "pptx":
      return { kind: "slide", slideNumber: pageNumber };
    case "html":
      return { kind: "html" };
    case "pdf":
    case "image":
    case "docx":
      return { kind: "page", pageNumber };
  }
};

const normalizePolygon = (
  value: unknown,
  width: number,
  height: number,
): readonly GenericBoundingPoint[] | undefined => {
  if (
    !Array.isArray(value) ||
    value.length < 8 ||
    value.length % 2 !== 0 ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }

  const points: GenericBoundingPoint[] = [];
  for (let index = 0; index < value.length; index += 2) {
    const x = value[index];
    const y = value[index + 1];
    if (typeof x !== "number" || typeof y !== "number") return undefined;
    points.push({
      x: Math.min(1, Math.max(0, x / width)),
      y: Math.min(1, Math.max(0, y / height)),
    });
  }

  return points.length >= 4 && points.length <= 8 ? points : undefined;
};

const parsePages = (
  value: unknown,
): ReadonlyMap<number, { readonly height: number; readonly width: number }> => {
  const pages = new Map<number, { readonly height: number; readonly width: number }>();
  if (!Array.isArray(value)) return pages;

  for (const candidate of value.slice(0, DOCUMENT_LAYOUT_LIMITS.maxLayoutItems)) {
    if (!isRecord(candidate)) continue;
    const page = candidate as ProviderPage;
    const pageNumber = positiveInteger(page.pageNumber, pages.size + 1);
    const width = typeof page.width === "number" && page.width > 0 ? page.width : 1;
    const height = typeof page.height === "number" && page.height > 0 ? page.height : 1;
    pages.set(pageNumber, { height, width });
  }
  return pages;
};

const parseRegions = (
  value: unknown,
  pages: ReadonlyMap<number, { readonly height: number; readonly width: number }>,
  sourceFormat: GenericSourceFormat,
): readonly DocumentLayoutRegion[] => {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 100).flatMap((candidate): DocumentLayoutRegion[] => {
    if (!isRecord(candidate)) return [];
    const region = candidate as ProviderBoundingRegion;
    const pageNumber = positiveInteger(region.pageNumber);
    const dimensions = pages.get(pageNumber) ?? { height: 1, width: 1 };
    const polygon = normalizePolygon(region.polygon, dimensions.width, dimensions.height);
    return [
      polygon === undefined
        ? { location: evidenceLocation(sourceFormat, pageNumber) }
        : { boundingPolygon: polygon, location: evidenceLocation(sourceFormat, pageNumber) },
    ];
  });
};

const parseParagraphs = (
  value: unknown,
  pages: ReadonlyMap<number, { readonly height: number; readonly width: number }>,
  sourceFormat: GenericSourceFormat,
): readonly DocumentLayoutTextBlock[] => {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, DOCUMENT_LAYOUT_LIMITS.maxLayoutItems)
    .flatMap((candidate): DocumentLayoutTextBlock[] => {
      if (!isRecord(candidate)) return [];
      const paragraph = candidate as ProviderParagraph;
      const content = boundedString(paragraph.content, DOCUMENT_LAYOUT_LIMITS.maxContentCharacters);
      if (content === undefined) return [];
      const role = boundedString(paragraph.role, 100);
      const base = {
        content,
        regions: parseRegions(paragraph.boundingRegions, pages, sourceFormat),
        spans: parseSpans(paragraph.spans),
      };
      return [role === undefined ? base : { ...base, role }];
    });
};

const parseTableCells = (
  value: unknown,
  pages: ReadonlyMap<number, { readonly height: number; readonly width: number }>,
  sourceFormat: GenericSourceFormat,
): readonly DocumentLayoutTableCell[] => {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, DOCUMENT_LAYOUT_LIMITS.maxTableCells)
    .flatMap((candidate): DocumentLayoutTableCell[] => {
      if (!isRecord(candidate)) return [];
      const cell = candidate as ProviderTableCell;
      const content = typeof cell.content === "string" ? cell.content.slice(0, 10_000) : "";
      const parsedConfidence = confidence(cell.confidence);
      const base = {
        columnIndex: nonnegativeInteger(cell.columnIndex),
        columnSpan: positiveInteger(cell.columnSpan),
        content,
        regions: parseRegions(cell.boundingRegions, pages, sourceFormat),
        rowIndex: nonnegativeInteger(cell.rowIndex),
        rowSpan: positiveInteger(cell.rowSpan),
        spans: parseSpans(cell.spans),
      };
      return [parsedConfidence === undefined ? base : { ...base, confidence: parsedConfidence }];
    });
};

const parseTables = (
  value: unknown,
  pages: ReadonlyMap<number, { readonly height: number; readonly width: number }>,
  sourceFormat: GenericSourceFormat,
): readonly DocumentLayoutTable[] => {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, DOCUMENT_LAYOUT_LIMITS.maxTables)
    .flatMap((candidate): DocumentLayoutTable[] => {
      if (!isRecord(candidate)) return [];
      const table = candidate as ProviderTable;
      const rowCount = positiveInteger(table.rowCount, 0);
      const columnCount = positiveInteger(table.columnCount, 0);
      if (rowCount < 1 || columnCount < 1) return [];
      return [
        {
          cells: parseTableCells(table.cells, pages, sourceFormat),
          columnCount,
          regions: parseRegions(table.boundingRegions, pages, sourceFormat),
          rowCount,
          spans: parseSpans(table.spans),
        },
      ];
    });
};

const parseAnalyzeResult = (
  operation: ProviderOperationResult,
  sourceFormat: GenericSourceFormat,
): DocumentLayoutResult => {
  if (!isRecord(operation.analyzeResult)) throw invalidResponse();
  const result = operation.analyzeResult as ProviderAnalyzeResult;
  const content = boundedString(result.content, DOCUMENT_LAYOUT_LIMITS.maxContentCharacters);
  if (content === undefined) throw invalidResponse();
  const pages = parsePages(result.pages);
  const contentUnit = contentUnitFor(sourceFormat);
  return {
    content,
    contentUnit,
    contentUnitCount: contentUnit === "document" ? 1 : Math.max(1, pages.size),
    paragraphs: parseParagraphs(result.paragraphs, pages, sourceFormat),
    provider: "azure-document-intelligence",
    sourceFormat,
    tables: parseTables(result.tables, pages, sourceFormat),
  };
};

const delay = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    const onAbort = (): void => {
      clearTimeout(timeout);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void Promise.resolve().then(() => {
      if (!signal.aborted) return;
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    });
  });

const createRequestSignal = (
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): { readonly cleanup: () => void; readonly signal: AbortSignal } => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(timeoutError()), timeoutMs);
  const onAbort = (): void => controller.abort(callerSignal?.reason);
  callerSignal?.addEventListener("abort", onAbort, { once: true });

  return {
    cleanup: () => {
      clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", onAbort);
    },
    signal: controller.signal,
  };
};

const mapFetchError = (error: unknown, signal: AbortSignal): AppError => {
  if (signal.aborted && signal.reason instanceof AppError) return signal.reason;
  if (signal.aborted) {
    return providerError(
      ERROR_CODES.DOCUMENT_LAYOUT_FAILED,
      "Document layout analysis was cancelled.",
      499,
      error,
    );
  }
  return providerError(
    ERROR_CODES.DOCUMENT_LAYOUT_PROVIDER_UNAVAILABLE,
    "The document layout provider is unavailable.",
    503,
    error,
  );
};

export const createAzureDocumentLayoutProvider = ({
  endpoint,
  fetchImpl = fetch,
  key,
  pollIntervalMs = 500,
  timeoutMs = 90_000,
}: AzureDocumentLayoutProviderOptions): DocumentLayoutProvider => {
  const endpointUrl = new URL(endpoint);
  const analyzeUrl = new URL(
    `/documentintelligence/documentModels/${AZURE_MODEL_ID}:analyze`,
    endpointUrl,
  );
  analyzeUrl.searchParams.set("_overload", "analyzeDocument");
  analyzeUrl.searchParams.set("api-version", AZURE_API_VERSION);
  analyzeUrl.searchParams.set("outputContentFormat", "markdown");

  return {
    analyze: async (request: DocumentLayoutRequest): Promise<DocumentLayoutResult> => {
      const requestSignal = createRequestSignal(request.signal, timeoutMs);
      try {
        let initialResponse: Response;
        try {
          initialResponse = await fetchImpl(analyzeUrl, {
            body: JSON.stringify({ base64Source: Buffer.from(request.bytes).toString("base64") }),
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "Ocp-Apim-Subscription-Key": key,
            },
            method: "POST",
            signal: requestSignal.signal,
          });
        } catch (error) {
          throw mapFetchError(error, requestSignal.signal);
        }

        if (initialResponse.status !== 202) throw mapHttpError(initialResponse.status);
        const operationLocation = initialResponse.headers.get("operation-location");
        if (operationLocation === null) throw invalidResponse();

        let operationUrl: URL;
        try {
          operationUrl = new URL(operationLocation);
        } catch (error) {
          throw invalidResponse(error);
        }
        if (operationUrl.protocol !== "https:" || operationUrl.origin !== endpointUrl.origin) {
          throw invalidResponse();
        }

        for (let poll = 0; poll < DOCUMENT_LAYOUT_LIMITS.maxProviderPolls; poll += 1) {
          let response: Response;
          try {
            response = await fetchImpl(operationUrl, {
              headers: {
                Accept: "application/json",
                "Ocp-Apim-Subscription-Key": key,
              },
              method: "GET",
              signal: requestSignal.signal,
            });
          } catch (error) {
            throw mapFetchError(error, requestSignal.signal);
          }

          if (!response.ok) throw mapHttpError(response.status);
          const parsed = await readBoundedJson(response);
          if (!isRecord(parsed)) throw invalidResponse();
          const operation = parsed as ProviderOperationResult;
          const status =
            typeof operation.status === "string" ? operation.status.toLocaleLowerCase() : "";

          if (status === "succeeded") return parseAnalyzeResult(operation, request.sourceFormat);
          if (status === "failed") {
            throw providerError(
              ERROR_CODES.DOCUMENT_LAYOUT_FAILED,
              "The document layout provider could not analyze the document.",
              422,
            );
          }
          if (status !== "running" && status !== "notstarted") throw invalidResponse();
          await delay(pollIntervalMs, requestSignal.signal);
        }

        throw timeoutError();
      } finally {
        requestSignal.cleanup();
      }
    },
  };
};

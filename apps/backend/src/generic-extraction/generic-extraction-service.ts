import type { Environment } from "../config/environment.js";
import type { DocumentLayoutService } from "../document-layout/document-layout-types.js";
import { AppError } from "../errors/app-error.js";
import { ExtractionAbortedError } from "../errors/extraction-aborted-error.js";
import { genericProviderInputLimit } from "./generic-provider-budget.js";
import type {
  GenericDocumentExtractionService,
  GenericGroundingService,
  GenericSchemaDiscoverer,
  GenericValueExtractor,
} from "./generic-extraction-types.js";
import { toLayoutRequest } from "./generic-extraction-types.js";

export interface CreateGenericDocumentExtractionServiceOptions {
  readonly environment: Environment;
  readonly groundingService: GenericGroundingService;
  readonly layoutService: DocumentLayoutService;
  readonly schemaDiscoverer: GenericSchemaDiscoverer;
  readonly valueExtractor: GenericValueExtractor;
}

type GenericExtractionStage = "discovery" | "extraction";

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throw new ExtractionAbortedError();
  }
};

const withStageContext = async <T>(
  stage: GenericExtractionStage,
  operation: () => Promise<T>,
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof AppError)) throw error;

    throw new AppError({
      cause: error.cause,
      code: error.code,
      ...(error.details === undefined ? {} : { details: error.details }),
      isOperational: error.isOperational,
      logCause: error.logCause,
      message: error.message,
      safeLogContext: {
        ...error.safeLogContext,
        genericExtractionStage: stage,
      },
      status: error.status,
    });
  }
};

export const createGenericDocumentExtractionService = ({
  environment,
  groundingService,
  layoutService,
  schemaDiscoverer,
  valueExtractor,
}: CreateGenericDocumentExtractionServiceOptions): GenericDocumentExtractionService => ({
  extract: async (request) => {
    throwIfAborted(request.signal);
    const layout = await layoutService.analyze(toLayoutRequest(request));
    throwIfAborted(request.signal);

    const discoveryRequest =
      request.signal === undefined ? { layout } : { layout, signal: request.signal };
    const documentSchema = await withStageContext("discovery", () =>
      schemaDiscoverer.discover(discoveryRequest),
    );
    throwIfAborted(request.signal);

    const valueRequest =
      request.signal === undefined
        ? { documentSchema, layout }
        : { documentSchema, layout, signal: request.signal };
    const values = await withStageContext("extraction", () => valueExtractor.extract(valueRequest));
    throwIfAborted(request.signal);

    return groundingService.ground({
      documentSchema,
      inputTruncated: layout.content.length > genericProviderInputLimit(environment),
      layout,
      values,
    });
  },
});

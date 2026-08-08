import type { Environment } from "../config/environment.js";
import type { DocumentLayoutService } from "../document-layout/document-layout-types.js";
import { ExtractionAbortedError } from "../errors/extraction-aborted-error.js";
import {
  genericProviderInputLimit,
} from "./generic-provider-budget.js";
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

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throw new ExtractionAbortedError();
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
    const documentSchema = await schemaDiscoverer.discover(discoveryRequest);
    throwIfAborted(request.signal);

    const valueRequest =
      request.signal === undefined
        ? { documentSchema, layout }
        : { documentSchema, layout, signal: request.signal };
    const values = await valueExtractor.extract(valueRequest);
    throwIfAborted(request.signal);

    return groundingService.ground({
      documentSchema,
      inputTruncated: layout.content.length > genericProviderInputLimit(environment),
      layout,
      values,
    });
  },
});

import type {
  GenericBoundingPoint,
  GenericContentUnit,
  GenericEvidenceLocation,
  GenericSourceFormat,
} from "@docella/schemas";

export const DOCUMENT_LAYOUT_LIMITS = Object.freeze({
  maxContentCharacters: 100_000,
  maxFileBytes: 10 * 1024 * 1024,
  maxHtmlCharacters: 1_000_000,
  maxLayoutItems: 20_000,
  maxOfficeEntries: 10_000,
  maxOfficeEntryNameBytes: 2_048,
  maxOfficePackageBytes: 10 * 1024 * 1024,
  maxOperationResponseBytes: 5 * 1024 * 1024,
  maxProviderPolls: 240,
  maxTables: 100,
  maxTableCells: 20_000,
});

export interface ValidatedDocumentInput {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly mediaType: string;
  readonly sourceFormat: GenericSourceFormat;
}

export interface DocumentLayoutRequest extends ValidatedDocumentInput {
  readonly signal?: AbortSignal;
}

export interface DocumentLayoutSpan {
  readonly length: number;
  readonly offset: number;
}

export interface DocumentLayoutRegion {
  readonly boundingPolygon?: readonly GenericBoundingPoint[];
  readonly location: GenericEvidenceLocation;
}

export interface DocumentLayoutTextBlock {
  readonly content: string;
  readonly confidence?: number;
  readonly regions: readonly DocumentLayoutRegion[];
  readonly role?: string;
  readonly spans: readonly DocumentLayoutSpan[];
}

export interface DocumentLayoutTableCell {
  readonly columnIndex: number;
  readonly columnSpan: number;
  readonly content: string;
  readonly confidence?: number;
  readonly regions: readonly DocumentLayoutRegion[];
  readonly rowIndex: number;
  readonly rowSpan: number;
  readonly spans: readonly DocumentLayoutSpan[];
}

export interface DocumentLayoutTable {
  readonly cells: readonly DocumentLayoutTableCell[];
  readonly columnCount: number;
  readonly regions: readonly DocumentLayoutRegion[];
  readonly rowCount: number;
  readonly spans: readonly DocumentLayoutSpan[];
}

export interface DocumentLayoutResult {
  readonly content: string;
  readonly contentUnit: GenericContentUnit;
  readonly contentUnitCount: number;
  readonly paragraphs: readonly DocumentLayoutTextBlock[];
  readonly provider: "azure-document-intelligence" | "pdfjs";
  readonly sourceFormat: GenericSourceFormat;
  readonly tables: readonly DocumentLayoutTable[];
}

export interface DocumentLayoutProvider {
  readonly analyze: (request: DocumentLayoutRequest) => Promise<DocumentLayoutResult>;
}

export interface DocumentLayoutService {
  readonly analyze: (request: DocumentLayoutRequest) => Promise<DocumentLayoutResult>;
}

import {
  GENERIC_DOCUMENT_LIMITS,
  buildGenericDocumentExtractionResultSchema,
  type DiscoveredDocumentSchema,
  type DiscoveredField,
  type GenericDocumentExtractionResult,
  type GenericDocumentWarning,
  type GenericEvidenceAnchor,
  type GenericEvidenceLocation,
  type GenericFieldValue,
  type GenericScalarValue,
  type GenericTableCellValue,
  type GenericTableReview,
  type GenericValueReview,
} from "@docella/schemas";

import type {
  DocumentLayoutRegion,
  DocumentLayoutResult,
} from "../document-layout/document-layout-types.js";
import {
  buildDateCandidates,
  canonicalizeNumber,
  digitsOnly,
  extractNumericMentions,
  normalizeEmail,
  normalizeMinimal,
  normalizeSearch,
  numbersMatch,
  parseIsoDate,
} from "../grounding/normalization.js";
import type {
  GenericGroundingRequest,
  GenericGroundingService,
} from "./generic-extraction-types.js";

const CONFIDENCE = {
  lowOcr: 0.55,
  missing: 0,
  needsReview: 0.25,
  verified: 0.95,
} as const;

interface EvidenceCandidate {
  readonly confidence?: number;
  readonly regions: readonly DocumentLayoutRegion[];
  readonly text: string;
}

interface MatchedEvidence {
  readonly anchors: readonly GenericEvidenceAnchor[];
  readonly lowOcr: boolean;
}

const roundTwo = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const defaultLocation = (layout: DocumentLayoutResult): GenericEvidenceLocation => {
  switch (layout.contentUnit) {
    case "page":
      return { kind: "page", pageNumber: 1 };
    case "sheet":
      return { kind: "sheet", sheetName: "Sheet 1" };
    case "slide":
      return { kind: "slide", slideNumber: 1 };
    case "document":
      return { kind: "html" };
  }
};

const candidatesFromLayout = (layout: DocumentLayoutResult): readonly EvidenceCandidate[] => {
  const candidates: EvidenceCandidate[] = layout.paragraphs.map((paragraph) => ({
    regions: paragraph.regions,
    text: paragraph.content,
  }));

  for (const table of layout.tables) {
    for (const cell of table.cells) {
      candidates.push(
        cell.confidence === undefined
          ? { regions: cell.regions, text: cell.content }
          : { confidence: cell.confidence, regions: cell.regions, text: cell.content },
      );
    }
  }

  if (candidates.length === 0) {
    candidates.push({ regions: [], text: layout.content });
  }
  return candidates;
};

const anchorFromCandidate = (
  candidate: EvidenceCandidate,
  layout: DocumentLayoutResult,
): GenericEvidenceAnchor => {
  const region = candidate.regions[0];
  const base = {
    location: region?.location ?? defaultLocation(layout),
    text: candidate.text.trim().slice(0, GENERIC_DOCUMENT_LIMITS.maxEvidenceTextLength),
  };
  const withPolygon =
    region?.boundingPolygon === undefined
      ? base
      : { ...base, boundingPolygon: region.boundingPolygon };
  return candidate.confidence === undefined
    ? withPolygon
    : { ...withPolygon, providerConfidence: candidate.confidence };
};

const matchesText = (value: string, candidate: string): boolean => {
  const minimalValue = normalizeMinimal(value);
  if (minimalValue.length === 0) return false;
  if (normalizeMinimal(candidate).includes(minimalValue)) return true;
  const searchValue = normalizeSearch(value);
  return searchValue.length > 0 && normalizeSearch(candidate).includes(searchValue);
};

const matchesDate = (value: string, candidate: string): boolean => {
  const date = parseIsoDate(value);
  return (
    date !== undefined &&
    buildDateCandidates(date).some((dateCandidate) => matchesText(dateCandidate, candidate))
  );
};

const matchesNumber = (value: number, candidate: string): boolean =>
  extractNumericMentions(candidate).some((mention) => numbersMatch(mention, value));

const matchesBoolean = (value: boolean, candidate: string): boolean => {
  const normalized = normalizeSearch(candidate);
  const values = value ? ["true", "yes", "checked"] : ["false", "no", "unchecked"];
  return values.some((item) => normalized === item || normalized.includes(` ${item} `));
};

const candidateMatches = (
  field: DiscoveredField,
  value: GenericScalarValue,
  candidate: EvidenceCandidate,
): boolean => {
  switch (field.valueType) {
    case "email":
      return normalizeEmail(candidate.text).includes(normalizeEmail(String(value)));
    case "phone": {
      const expected = digitsOnly(String(value));
      return expected.length >= 7 && digitsOnly(candidate.text).includes(expected);
    }
    case "date":
      return matchesDate(String(value), candidate.text);
    case "number":
    case "currency": {
      const expected = canonicalizeNumber(value);
      return expected !== undefined && matchesNumber(expected, candidate.text);
    }
    case "boolean":
      return typeof value === "boolean" && matchesBoolean(value, candidate.text);
    case "text":
    case "long_text":
    case "address":
    case "identifier":
    case "select":
      return matchesText(String(value), candidate.text);
  }
};

const deduplicateAnchors = (
  anchors: readonly GenericEvidenceAnchor[],
): readonly GenericEvidenceAnchor[] => {
  const unique = new Map<string, GenericEvidenceAnchor>();
  for (const anchor of anchors) {
    unique.set(JSON.stringify(anchor), anchor);
  }
  return [...unique.values()].slice(0, GENERIC_DOCUMENT_LIMITS.maxEvidenceItemsPerValue);
};

const matchScalar = (
  field: DiscoveredField,
  value: GenericScalarValue,
  candidates: readonly EvidenceCandidate[],
  layout: DocumentLayoutResult,
): MatchedEvidence => {
  const matched = candidates.filter((candidate) => candidateMatches(field, value, candidate));
  return {
    anchors: deduplicateAnchors(matched.map((candidate) => anchorFromCandidate(candidate, layout))),
    lowOcr: matched.some(
      (candidate) => candidate.confidence !== undefined && candidate.confidence < 0.5,
    ),
  };
};

const missingReview = (): GenericValueReview => ({
  confidence: CONFIDENCE.missing,
  evidence: [],
  status: "missing",
});

const reviewValue = (
  field: DiscoveredField,
  value: GenericFieldValue,
  candidates: readonly EvidenceCandidate[],
  layout: DocumentLayoutResult,
): GenericValueReview => {
  if (value === null) return missingReview();
  const values = Array.isArray(value) ? value : [value];
  const matches = values.map((item) => matchScalar(field, item, candidates, layout));
  const anchors = deduplicateAnchors(matches.flatMap((match) => match.anchors));
  const supportedValues = matches.filter((match) => match.anchors.length > 0).length;

  if (supportedValues === values.length && anchors.length > 0) {
    const lowOcr = matches.some((match) => match.lowOcr);
    return {
      confidence: lowOcr ? CONFIDENCE.lowOcr : CONFIDENCE.verified,
      evidence: anchors,
      message: lowOcr ? "The source evidence has low OCR confidence." : undefined,
      status: lowOcr ? "low_ocr_confidence" : "verified",
    };
  }

  return {
    confidence:
      supportedValues === 0
        ? CONFIDENCE.needsReview
        : roundTwo((CONFIDENCE.verified * supportedValues) / values.length),
    evidence: anchors,
    message: "One or more extracted values could not be grounded in source evidence.",
    status: "needs_review",
  };
};

const tableCellField = (valueType: DiscoveredField["valueType"]): DiscoveredField => ({
  description: "Discovered table cell.",
  id: "table_cell",
  label: "Table cell",
  repeatable: false,
  required: false,
  valueType: valueType === "long_text" || valueType === "select" ? "text" : valueType,
});

const reviewTable = (
  schema: DiscoveredDocumentSchema,
  tableId: string,
  rows: readonly Readonly<Record<string, GenericTableCellValue>>[],
  candidates: readonly EvidenceCandidate[],
  layout: DocumentLayoutResult,
): GenericTableReview => {
  if (rows.length === 0) {
    return { confidence: 0, evidence: [], rowCount: 0, status: "missing" };
  }

  const table = schema.tables.find((item) => item.id === tableId);
  if (table === undefined) {
    return { confidence: 0.25, evidence: [], rowCount: rows.length, status: "needs_review" };
  }

  const evidence: GenericEvidenceAnchor[] = [];
  let populatedCells = 0;
  let supportedCells = 0;
  let lowOcr = false;

  for (const row of rows) {
    for (const column of table.columns) {
      const value = row[column.id];
      if (value === null || value === undefined) continue;
      populatedCells += 1;
      const match = matchScalar(tableCellField(column.valueType), value, candidates, layout);
      if (match.anchors.length > 0) supportedCells += 1;
      lowOcr ||= match.lowOcr;
      evidence.push(...match.anchors);
    }
  }

  const anchors = deduplicateAnchors(evidence);
  if (populatedCells > 0 && supportedCells === populatedCells && anchors.length > 0) {
    return {
      confidence: lowOcr ? CONFIDENCE.lowOcr : CONFIDENCE.verified,
      evidence: anchors,
      message: lowOcr ? "Some table evidence has low OCR confidence." : undefined,
      rowCount: rows.length,
      status: lowOcr ? "low_ocr_confidence" : "verified",
    };
  }

  return {
    confidence:
      populatedCells === 0
        ? CONFIDENCE.needsReview
        : roundTwo((CONFIDENCE.verified * supportedCells) / populatedCells),
    evidence: anchors,
    message: "One or more table cells could not be grounded in source evidence.",
    rowCount: rows.length,
    status: "needs_review",
  };
};

const warningForField = (fieldId: string, review: GenericValueReview): GenericDocumentWarning => {
  switch (review.status) {
    case "missing":
      return {
        code: "field_missing",
        fieldIds: [fieldId],
        message: "A discovered field is missing from the document.",
      };
    case "low_ocr_confidence":
      return {
        code: "low_ocr_confidence",
        fieldIds: [fieldId],
        message: "A field is supported by low-confidence OCR evidence.",
      };
    case "conflicting":
      return {
        code: "field_conflict",
        fieldIds: [fieldId],
        message: "A field has conflicting source evidence.",
      };
    case "needs_review":
      return {
        code: "field_needs_review",
        fieldIds: [fieldId],
        message: "A field could not be fully grounded in source evidence.",
      };
    case "verified":
      throw new Error("Verified fields do not require warnings.");
  }
};

export const createGenericGroundingService = (): GenericGroundingService => ({
  ground: ({ documentSchema, inputTruncated, layout, values }): GenericDocumentExtractionResult => {
    const candidates = candidatesFromLayout(layout);
    const fieldReviews: Record<string, GenericValueReview> = {};
    const tableReviews: Record<string, GenericTableReview> = {};
    const warnings: GenericDocumentWarning[] = [];
    let included = 0;
    let score = 0;

    for (const section of documentSchema.sections) {
      for (const field of section.fields) {
        const value = values.fields[field.id] ?? null;
        const review = reviewValue(field, value, candidates, layout);
        fieldReviews[field.id] = review;
        if (value !== null || field.required) {
          included += 1;
          score += review.confidence;
        }
        if (review.status !== "verified") warnings.push(warningForField(field.id, review));
      }
    }

    for (const table of documentSchema.tables) {
      const rows = values.tables[table.id] ?? [];
      const review = reviewTable(documentSchema, table.id, rows, candidates, layout);
      tableReviews[table.id] = review;
      included += 1;
      score += review.confidence;
      if (review.status !== "verified") {
        warnings.push({
          code:
            review.status === "low_ocr_confidence" ? "low_ocr_confidence" : "table_needs_review",
          message: "A discovered table requires review.",
          tableIds: [table.id],
        });
      }
    }

    if (inputTruncated) {
      warnings.push({
        code: "truncated_input",
        message:
          "Only the configured leading document content was provided to the extraction model.",
      });
    }

    const confidence = roundTwo(included === 0 ? 0 : score / included);
    const reviewRequired =
      inputTruncated ||
      confidence < 0.75 ||
      Object.values(fieldReviews).some((review) => review.status !== "verified") ||
      Object.values(tableReviews).some((review) => review.status !== "verified");

    const result: GenericDocumentExtractionResult = {
      confidence,
      document: {
        contentUnit: layout.contentUnit,
        contentUnitCount: layout.contentUnitCount,
        detectedType: documentSchema.documentType,
        language: documentSchema.language,
        sourceFormat: layout.sourceFormat,
        title: documentSchema.title,
      },
      review: { fields: fieldReviews, tables: tableReviews },
      reviewRequired,
      schema: documentSchema,
      values,
      warnings: warnings.slice(0, GENERIC_DOCUMENT_LIMITS.maxWarnings),
    };

    return buildGenericDocumentExtractionResultSchema(documentSchema).parse(result);
  },
});

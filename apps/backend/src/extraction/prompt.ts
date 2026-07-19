import type { DocumentDefinition } from "@docella/schemas";

export const buildExtractionPrompt = (documentDefinition: DocumentDefinition): string =>
  [
    `Extract values for the "${documentDefinition.label}" document schema.`,
    "Return only JSON that conforms to the provided schema.",
    "Use null for missing or uncertain values.",
    "Do not invent values that are not supported by the document text.",
  ].join("\n");

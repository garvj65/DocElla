import type { DiscoveredDocumentSchema, GenericDocumentValues } from "@docella/schemas/public";

const safeFilename = (value: string): string => {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 80);
  return normalized.length === 0 ? "docella-extraction" : normalized;
};

export const exportGenericDocumentJson = (
  schema: DiscoveredDocumentSchema,
  values: GenericDocumentValues,
): void => {
  const payload = JSON.stringify(
    {
      documentType: schema.documentType,
      schemaVersion: schema.schemaVersion,
      values,
    },
    null,
    2,
  );
  const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.download = `${safeFilename(schema.title ?? schema.documentType)}.json`;
  anchor.href = url;
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

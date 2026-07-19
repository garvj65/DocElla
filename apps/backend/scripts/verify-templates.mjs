import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listDocumentDefinitions } from "@docella/schemas";
import { PDFDocument, PDFTextField } from "pdf-lib";

const assetRoot = path.resolve(fileURLToPath(new URL("../assets/", import.meta.url)));
const assetRootWithSeparator = `${assetRoot}${path.sep}`;

const resolveAsset = (assetPath) => {
  const resolved = path.resolve(assetRoot, assetPath);
  if (resolved !== assetRoot && !resolved.startsWith(assetRootWithSeparator)) {
    throw new Error(`Template asset escapes trusted root: ${assetPath}`);
  }
  return resolved;
};

const assertNoDuplicates = (names, templateId) => {
  const seen = new Set();
  for (const name of names) {
    if (seen.has(name)) {
      throw new Error(`Template ${templateId} has duplicate field ${name}.`);
    }
    seen.add(name);
  }
};

const verifyTemplate = async (definition, template) => {
  const bytes = await readFile(resolveAsset(template.assetPath));
  const pdfDocument = await PDFDocument.load(bytes);
  const form = pdfDocument.getForm();

  if (typeof form.hasXFA === "function" && form.hasXFA()) {
    throw new Error(`Template ${template.id} uses unsupported XFA.`);
  }

  const fields = form.getFields();
  if (fields.length === 0) {
    throw new Error(`Template ${template.id} has no AcroForm fields.`);
  }

  const actualNames = fields.map((field) => field.getName());
  const expectedNames = definition.fields.map((field) => field.pdfFieldName);
  assertNoDuplicates(actualNames, template.id);

  for (const name of expectedNames) {
    if (!actualNames.includes(name)) {
      throw new Error(`Template ${template.id} is missing mapped field ${name}.`);
    }
  }

  for (const name of actualNames) {
    if (!expectedNames.includes(name)) {
      throw new Error(`Template ${template.id} has unexpected field ${name}.`);
    }
  }

  for (const field of definition.fields) {
    const pdfField = form.getField(field.pdfFieldName);
    if (!(pdfField instanceof PDFTextField)) {
      throw new Error(`Template ${template.id} has unsupported field type for ${field.key}.`);
    }
    if (field.kind === "textarea" && !pdfField.isMultiline()) {
      throw new Error(`Template ${template.id} textarea ${field.key} is not multiline.`);
    }
  }
};

try {
  for (const definition of listDocumentDefinitions()) {
    for (const template of definition.templates) {
      await verifyTemplate(definition, template);
    }
  }
} catch (error) {
  process.stderr.write(
    error instanceof Error ? `${error.message}\n` : "Template verification failed.\n",
  );
  process.exitCode = 1;
}

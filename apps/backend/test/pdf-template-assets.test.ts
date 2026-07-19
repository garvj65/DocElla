import { listDocumentDefinitions } from "@docella/schemas";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFTextField } from "pdf-lib";
import { describe, expect, it } from "vitest";

const assetRoot = path.resolve(fileURLToPath(new URL("../assets/", import.meta.url)));

describe("committed PDF template assets", () => {
  it("match registered document field mappings", async () => {
    for (const definition of listDocumentDefinitions()) {
      for (const template of definition.templates) {
        const bytes = await readFile(path.join(assetRoot, template.assetPath));
        expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
        const pdfDocument = await PDFDocument.load(bytes);
        const form = pdfDocument.getForm();
        expect(typeof form.hasXFA === "function" ? form.hasXFA() : false).toBe(false);

        const actualNames = form
          .getFields()
          .map((field) => field.getName())
          .sort();
        const expectedNames = definition.fields.map((field) => field.pdfFieldName).sort();
        expect(actualNames).toEqual(expectedNames);

        for (const field of definition.fields) {
          const pdfField = form.getField(field.pdfFieldName);
          expect(pdfField).toBeInstanceOf(PDFTextField);
          if (field.kind === "textarea") {
            expect((pdfField as PDFTextField).isMultiline()).toBe(true);
          }
        }

        const serialized = Buffer.from(bytes).toString("latin1");
        expect(serialized).not.toContain("PRIVATE_");
        expect(template.flattenByDefault).toBe(true);
      }
    }
  });
});

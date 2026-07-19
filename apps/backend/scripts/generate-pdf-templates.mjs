import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listDocumentDefinitions } from "@docella/schemas";
import { PDFDocument, StandardFonts, TextAlignment } from "pdf-lib";

const backendRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const assetRoot = path.join(backendRoot, "assets");
const knownTemplates = new Map([
  ["job-application-default", "templates/job-application-default.pdf"],
  ["basic-invoice-default", "templates/basic-invoice-default.pdf"],
]);

const layouts = {
  "job-application": {
    title: "DocElla Job Application",
    subtitle: "Synthetic fillable template for schema-driven generation.",
  },
  "basic-invoice": {
    title: "DocElla Basic Invoice",
    subtitle: "Synthetic fillable template for schema-driven generation.",
  },
};

const ensureInsideAssetRoot = (targetPath) => {
  const resolved = path.resolve(targetPath);
  const root = `${assetRoot}${path.sep}`;
  if (resolved !== assetRoot && !resolved.startsWith(root)) {
    throw new Error("Refusing to write outside the trusted asset root.");
  }
  return resolved;
};

const drawTemplate = async (definition, template) => {
  const pdfDocument = await PDFDocument.create();
  pdfDocument.setTitle(layouts[definition.id]?.title ?? `DocElla ${definition.label}`);
  pdfDocument.setCreator("DocElla");
  pdfDocument.setProducer("DocElla");
  pdfDocument.setCreationDate(new Date("2026-01-01T00:00:00.000Z"));
  pdfDocument.setModificationDate(new Date("2026-01-01T00:00:00.000Z"));

  const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDocument.embedFont(StandardFonts.HelveticaBold);
  const form = pdfDocument.getForm();
  let page = pdfDocument.addPage([612, 792]);
  let y = 740;

  page.drawText(layouts[definition.id]?.title ?? definition.label, {
    font: boldFont,
    size: 18,
    x: 48,
    y,
  });
  y -= 24;
  page.drawText(layouts[definition.id]?.subtitle ?? "DocElla fillable template.", {
    font,
    size: 9,
    x: 48,
    y,
  });
  y -= 32;

  for (const field of definition.fields) {
    const height = field.kind === "textarea" ? 54 : 22;
    if (y - height < 54) {
      page = pdfDocument.addPage([612, 792]);
      y = 740;
    }

    page.drawText(field.label, { font: boldFont, size: 9, x: 48, y: y + height - 8 });
    const textField = form.createTextField(field.pdfFieldName);
    textField.setAlignment(TextAlignment.Left);
    if (field.kind === "textarea") {
      textField.enableMultiline();
    }
    textField.addToPage(page, {
      borderColor: undefined,
      borderWidth: 1,
      height,
      textColor: undefined,
      width: 330,
      x: 218,
      y,
    });
    textField.setText("");
    textField.updateAppearances(font);
    y -= height + 14;
  }

  form.updateFieldAppearances(font);
  const outputPath = ensureInsideAssetRoot(path.join(assetRoot, template.assetPath));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, await pdfDocument.save({ useObjectStreams: false }));
};

try {
  const definitions = listDocumentDefinitions();

  for (const definition of definitions) {
    for (const template of definition.templates) {
      if (knownTemplates.get(template.id) !== template.assetPath) {
        throw new Error(`Unexpected registered template ${template.id}.`);
      }
      await drawTemplate(definition, template);
    }
  }
} catch (error) {
  process.stderr.write(
    error instanceof Error ? `${error.message}\n` : "Failed to generate PDF templates.\n",
  );
  process.exitCode = 1;
}

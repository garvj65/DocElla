import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { listDocumentDefinitions } from "@docella/schemas";
import { PDFDocument, StandardFonts, TextAlignment, rgb } from "pdf-lib";

const backendRoot = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const assetRoot = path.join(backendRoot, "assets");
const knownTemplates = new Map([
  ["job-application-default", "templates/job-application-default.pdf"],
  ["basic-invoice-default", "templates/basic-invoice-default.pdf"],
]);

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 48;
const RIGHT = 564;
const FULL_WIDTH = RIGHT - LEFT;
const COLUMN_WIDTH = 250;
const SECOND_COLUMN_X = 314;

const palette = {
  accent: rgb(37 / 255, 99 / 255, 235 / 255),
  border: rgb(203 / 255, 213 / 255, 225 / 255),
  ink: rgb(15 / 255, 23 / 255, 42 / 255),
  muted: rgb(100 / 255, 116 / 255, 139 / 255),
  surface: rgb(248 / 255, 250 / 255, 252 / 255),
  white: rgb(1, 1, 1),
};

const ensureInsideAssetRoot = (targetPath) => {
  const resolved = path.resolve(targetPath);
  const root = `${assetRoot}${path.sep}`;
  if (resolved !== assetRoot && !resolved.startsWith(root)) {
    throw new Error("Refusing to write outside the trusted asset root.");
  }
  return resolved;
};

const fieldMap = (definition) => new Map(definition.fields.map((field) => [field.key, field]));

const requiredField = (fields, key) => {
  const field = fields.get(key);
  if (field === undefined) throw new Error(`Missing PDF layout field ${key}.`);
  return field;
};

const drawHeader = (page, font, boldFont, title, subtitle, tag) => {
  page.drawRectangle({
    color: palette.ink,
    height: 54,
    width: 528,
    x: 42,
    y: 706,
  });
  page.drawText(title, {
    color: palette.white,
    font: boldFont,
    size: 18,
    x: 60,
    y: 735,
  });
  page.drawText(subtitle, {
    color: palette.white,
    font,
    size: 8.5,
    x: 60,
    y: 718,
  });
  page.drawRectangle({
    color: palette.accent,
    height: 18,
    width: 56,
    x: 494,
    y: 724,
  });
  const tagWidth = boldFont.widthOfTextAtSize(tag, 7.5);
  page.drawText(tag, {
    color: palette.white,
    font: boldFont,
    size: 7.5,
    x: 522 - tagWidth / 2,
    y: 730,
  });
};

const drawFooter = (page, font) => {
  page.drawLine({
    color: palette.border,
    end: { x: RIGHT, y: 40 },
    start: { x: LEFT, y: 40 },
    thickness: 0.6,
  });
  page.drawText("DocElla - schema-driven document extraction and generation", {
    color: palette.muted,
    font,
    size: 7.5,
    x: LEFT,
    y: 27,
  });
  const pageNumber = "1 / 1";
  page.drawText(pageNumber, {
    color: palette.muted,
    font,
    size: 7.5,
    x: RIGHT - font.widthOfTextAtSize(pageNumber, 7.5),
    y: 27,
  });
};

const drawSection = (page, boldFont, title, y) => {
  page.drawText(title, {
    color: palette.ink,
    font: boldFont,
    size: 10.5,
    x: LEFT,
    y,
  });
  page.drawLine({
    color: palette.border,
    end: { x: RIGHT, y: y - 10 },
    start: { x: LEFT, y: y - 10 },
    thickness: 0.6,
  });
};

const addField = ({ field, font, form, height = 30, page, width, x, y }) => {
  page.drawText(field.label.toLocaleUpperCase(), {
    color: palette.muted,
    font,
    size: 7.4,
    x,
    y: y + height + 7,
  });

  const textField = form.createTextField(field.pdfFieldName);
  textField.setAlignment(TextAlignment.Left);
  if (field.kind === "textarea") textField.enableMultiline();
  textField.setFontSize(field.kind === "textarea" ? 9 : 10);
  textField.addToPage(page, {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 0.6,
    height,
    textColor: palette.ink,
    width,
    x,
    y,
  });
  textField.setText("");
  textField.updateAppearances(font);
};

const drawJobApplication = (definition, page, form, font, boldFont) => {
  const fields = fieldMap(definition);
  drawHeader(
    page,
    font,
    boldFont,
    "Job Application",
    "Reviewed applicant information - generated with DocElla",
    "DOCELLA",
  );

  drawSection(page, boldFont, "Applicant details", 678);
  addField({
    field: requiredField(fields, "fullName"),
    font,
    form,
    page,
    width: FULL_WIDTH,
    x: LEFT,
    y: 630,
  });
  addField({
    field: requiredField(fields, "email"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: LEFT,
    y: 576,
  });
  addField({
    field: requiredField(fields, "phone"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: SECOND_COLUMN_X,
    y: 576,
  });
  addField({
    field: requiredField(fields, "address"),
    font,
    form,
    height: 46,
    page,
    width: FULL_WIDTH,
    x: LEFT,
    y: 504,
  });

  drawSection(page, boldFont, "Current role", 446);
  addField({
    field: requiredField(fields, "currentEmployer"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: LEFT,
    y: 398,
  });
  addField({
    field: requiredField(fields, "currentJobTitle"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: SECOND_COLUMN_X,
    y: 398,
  });
  addField({
    field: requiredField(fields, "yearsOfExperience"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: LEFT,
    y: 344,
  });
  addField({
    field: requiredField(fields, "highestEducation"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: SECOND_COLUMN_X,
    y: 344,
  });

  drawSection(page, boldFont, "Application details", 286);
  addField({
    field: requiredField(fields, "positionAppliedFor"),
    font,
    form,
    page,
    width: FULL_WIDTH,
    x: LEFT,
    y: 238,
  });
  addField({
    field: requiredField(fields, "availableStartDate"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: LEFT,
    y: 184,
  });
  addField({
    field: requiredField(fields, "salaryExpectation"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: SECOND_COLUMN_X,
    y: 184,
  });
  addField({
    field: requiredField(fields, "additionalNotes"),
    font,
    form,
    height: 46,
    page,
    width: FULL_WIDTH,
    x: LEFT,
    y: 112,
  });

  drawFooter(page, font);
};

const drawBasicInvoice = (definition, page, form, font, boldFont) => {
  const fields = fieldMap(definition);
  drawHeader(
    page,
    font,
    boldFont,
    "Invoice",
    "Structured invoice details - generated with DocElla",
    "INVOICE",
  );

  drawSection(page, boldFont, "Invoice details", 678);
  addField({
    field: requiredField(fields, "invoiceNumber"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: LEFT,
    y: 630,
  });
  addField({
    field: requiredField(fields, "currency"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: SECOND_COLUMN_X,
    y: 630,
  });
  addField({
    field: requiredField(fields, "issueDate"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: LEFT,
    y: 576,
  });
  addField({
    field: requiredField(fields, "dueDate"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: SECOND_COLUMN_X,
    y: 576,
  });

  drawSection(page, boldFont, "Parties", 506);
  addField({
    field: requiredField(fields, "issuerName"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: LEFT,
    y: 458,
  });
  addField({
    field: requiredField(fields, "customerName"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: SECOND_COLUMN_X,
    y: 458,
  });
  addField({
    field: requiredField(fields, "issuerAddress"),
    font,
    form,
    height: 52,
    page,
    width: COLUMN_WIDTH,
    x: LEFT,
    y: 380,
  });
  addField({
    field: requiredField(fields, "customerAddress"),
    font,
    form,
    height: 52,
    page,
    width: COLUMN_WIDTH,
    x: SECOND_COLUMN_X,
    y: 380,
  });

  drawSection(page, boldFont, "Amounts", 312);
  addField({
    field: requiredField(fields, "subtotal"),
    font,
    form,
    page,
    width: 160,
    x: LEFT,
    y: 264,
  });
  addField({
    field: requiredField(fields, "tax"),
    font,
    form,
    page,
    width: 160,
    x: 226,
    y: 264,
  });
  addField({
    field: requiredField(fields, "total"),
    font,
    form,
    page,
    width: 160,
    x: 404,
    y: 264,
  });

  drawSection(page, boldFont, "Payment", 196);
  addField({
    field: requiredField(fields, "paymentTerms"),
    font,
    form,
    page,
    width: COLUMN_WIDTH,
    x: LEFT,
    y: 148,
  });
  addField({
    field: requiredField(fields, "notes"),
    font,
    form,
    height: 46,
    page,
    width: COLUMN_WIDTH,
    x: SECOND_COLUMN_X,
    y: 132,
  });

  drawFooter(page, font);
};

const drawFallback = (definition, pdfDocument, form, font, boldFont) => {
  let page = pdfDocument.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = 720;
  page.drawText(definition.label, {
    color: palette.ink,
    font: boldFont,
    size: 18,
    x: LEFT,
    y,
  });
  y -= 42;

  for (const field of definition.fields) {
    const height = field.kind === "textarea" ? 54 : 30;
    if (y - height < 64) {
      page = pdfDocument.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = 720;
    }
    addField({ field, font, form, height, page, width: FULL_WIDTH, x: LEFT, y: y - height });
    y -= height + 30;
  }
};

const drawTemplate = async (definition, template) => {
  const pdfDocument = await PDFDocument.create();
  pdfDocument.setTitle(`DocElla ${definition.label}`);
  pdfDocument.setCreator("DocElla");
  pdfDocument.setProducer("DocElla");
  pdfDocument.setCreationDate(new Date("2026-01-01T00:00:00.000Z"));
  pdfDocument.setModificationDate(new Date("2026-01-01T00:00:00.000Z"));

  const font = await pdfDocument.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDocument.embedFont(StandardFonts.HelveticaBold);
  const form = pdfDocument.getForm();

  if (definition.id === "job-application") {
    const page = pdfDocument.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawJobApplication(definition, page, form, font, boldFont);
  } else if (definition.id === "basic-invoice") {
    const page = pdfDocument.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawBasicInvoice(definition, page, form, font, boldFont);
  } else {
    drawFallback(definition, pdfDocument, form, font, boldFont);
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

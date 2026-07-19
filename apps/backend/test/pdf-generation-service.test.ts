import { basicInvoiceDefinition, jobApplicationDefinition } from "@docella/schemas";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { AppError } from "../src/errors/app-error.js";
import { createPdfGenerationService } from "../src/pdf-generation/pdf-generation-service.js";
import type { PdfTemplateRepository } from "../src/pdf-generation/pdf-template-repository.js";

const jobValues = {
  additionalNotes: null,
  address: "123 Example Street",
  availableStartDate: null,
  currentEmployer: null,
  currentJobTitle: null,
  email: "alex@example.test",
  fullName: "Alex Morgan",
  highestEducation: null,
  phone: "+1 555 010 2200",
  positionAppliedFor: "Product Analyst",
  salaryExpectation: 75000,
  yearsOfExperience: 5,
};

const invoiceValues = {
  currency: "USD",
  customerAddress: null,
  customerName: "Example Customer",
  dueDate: null,
  invoiceNumber: "INV-1001",
  issueDate: "2026-07-19",
  issuerAddress: "100 Sample Ave",
  issuerName: "Example Services",
  notes: null,
  paymentTerms: null,
  subtotal: 1000,
  tax: 80,
  total: 1080,
};

const templateFor = (definition: typeof jobApplicationDefinition | typeof basicInvoiceDefinition) =>
  definition.templates[0];

const makeTemplate = async (
  definition: typeof jobApplicationDefinition | typeof basicInvoiceDefinition,
) => {
  const pdfDocument = await PDFDocument.create();
  const page = pdfDocument.addPage([300, 300]);
  const form = pdfDocument.getForm();
  let y = 260;
  for (const field of definition.fields) {
    const pdfField = form.createTextField(field.pdfFieldName);
    if (field.kind === "textarea") {
      pdfField.enableMultiline();
    }
    pdfField.addToPage(page, { height: 12, width: 120, x: 20, y });
    y -= 16;
  }
  return pdfDocument.save();
};

const serviceWithBytes = (bytes: Uint8Array, observedSignals: AbortSignal[] = []) => {
  const source = new Uint8Array(bytes);
  const repository: PdfTemplateRepository = {
    load: async (_template, signal) => {
      if (signal !== undefined) {
        observedSignals.push(signal);
      }
      signal?.throwIfAborted();
      return new Uint8Array(source);
    },
  };
  return { service: createPdfGenerationService(repository), source };
};

describe("createPdfGenerationService", () => {
  it("fills editable and flattened PDFs for registered schemas", async () => {
    const { service, source } = serviceWithBytes(await makeTemplate(jobApplicationDefinition));
    const template = templateFor(jobApplicationDefinition);
    const editable = await service.generate({
      documentDefinition: jobApplicationDefinition,
      flatten: false,
      template,
      values: jobValues,
    });
    expect(Buffer.from(editable.bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(editable.filename).toBe("docella-job-application-job-application-default.pdf");
    expect(editable.flattened).toBe(false);

    const editableDocument = await PDFDocument.load(editable.bytes);
    const form = editableDocument.getForm();
    expect(form.getTextField("job.full_name").getText()).toBe("Alex Morgan");
    expect(form.getTextField("job.years_of_experience").getText()).toBe("5");
    expect(form.getTextField("job.salary_expectation").getText()).toBe("75000");
    expect(form.getTextField("job.current_employer").getText() ?? "").toBe("");
    expect(form.getFields().length).toBe(jobApplicationDefinition.fields.length);

    const second = await service.generate({
      documentDefinition: jobApplicationDefinition,
      flatten: false,
      template,
      values: { ...jobValues, fullName: "Jordan Lee" },
    });
    expect(
      (await PDFDocument.load(second.bytes)).getForm().getTextField("job.full_name").getText(),
    ).toBe("Jordan Lee");
    expect(source).toEqual(source);

    const flattened = await service.generate({
      documentDefinition: jobApplicationDefinition,
      flatten: true,
      template,
      values: jobValues,
    });
    expect((await PDFDocument.load(flattened.bytes)).getForm().getFields()).toHaveLength(0);

    const invoice = await createPdfGenerationService({
      load: async () => makeTemplate(basicInvoiceDefinition),
    }).generate({
      documentDefinition: basicInvoiceDefinition,
      flatten: false,
      template: templateFor(basicInvoiceDefinition),
      values: invoiceValues,
    });
    expect(
      (await PDFDocument.load(invoice.bytes)).getForm().getTextField("invoice.total").getText(),
    ).toBe("1080");
  });

  it("uses template flatten default when omitted", async () => {
    const { service } = serviceWithBytes(await makeTemplate(jobApplicationDefinition));
    const generated = await service.generate({
      documentDefinition: jobApplicationDefinition,
      template: templateFor(jobApplicationDefinition),
      values: jobValues,
    });
    expect(generated.flattened).toBe(true);
  });

  it("fails safely for template drift, corrupt assets, unsupported characters, and cancellation", async () => {
    const missingFieldDocument = await PDFDocument.create();
    missingFieldDocument.addPage([300, 300]);
    missingFieldDocument
      .getForm()
      .createTextField("wrong")
      .addToPage(missingFieldDocument.getPages()[0], {
        height: 12,
        width: 120,
        x: 20,
        y: 20,
      });
    await expect(
      serviceWithBytes(await missingFieldDocument.save()).service.generate({
        documentDefinition: jobApplicationDefinition,
        flatten: false,
        template: templateFor(jobApplicationDefinition),
        values: jobValues,
      }),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      serviceWithBytes(new TextEncoder().encode("not a pdf")).service.generate({
        documentDefinition: jobApplicationDefinition,
        template: templateFor(jobApplicationDefinition),
        values: jobValues,
      }),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      serviceWithBytes(await makeTemplate(jobApplicationDefinition)).service.generate({
        documentDefinition: jobApplicationDefinition,
        flatten: false,
        template: templateFor(jobApplicationDefinition),
        values: { ...jobValues, fullName: "Ālex" },
      }),
    ).rejects.toMatchObject({ code: "PDF_VALUE_UNSUPPORTED" });

    const controller = new AbortController();
    controller.abort();
    const observedSignals: AbortSignal[] = [];
    await expect(
      serviceWithBytes(
        await makeTemplate(jobApplicationDefinition),
        observedSignals,
      ).service.generate({
        documentDefinition: jobApplicationDefinition,
        template: templateFor(jobApplicationDefinition),
        values: jobValues,
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(observedSignals).toHaveLength(0);
  });

  it("rejects a wrong AcroForm field type", async () => {
    const pdfDocument = await PDFDocument.create();
    const page = pdfDocument.addPage([300, 300]);
    const form = pdfDocument.getForm();
    for (const field of jobApplicationDefinition.fields) {
      if (field.key === "fullName") {
        form
          .createCheckBox(field.pdfFieldName)
          .addToPage(page, { height: 12, width: 12, x: 20, y: 20 });
      } else {
        form
          .createTextField(field.pdfFieldName)
          .addToPage(page, { height: 12, width: 120, x: 20, y: 20 });
      }
    }

    await expect(
      serviceWithBytes(await pdfDocument.save()).service.generate({
        documentDefinition: jobApplicationDefinition,
        template: templateFor(jobApplicationDefinition),
        values: jobValues,
      }),
    ).rejects.toMatchObject({ code: "PDF_TEMPLATE_MAPPING_INVALID" });
  });
});

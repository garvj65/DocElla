import { jobApplicationDefinition } from "@docella/schemas";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { createPdfGenerationService } from "../src/pdf-generation/pdf-generation-service.js";

const longNotes =
  "Open to customer-facing implementation work, cross-functional discovery, relocation, and detailed technical documentation across product and engineering teams.";

const values = {
  additionalNotes: longNotes,
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

describe("PDF template maximum lengths", () => {
  it("removes an inherited field cap when it would block a schema-valid value", async () => {
    const templateDocument = await PDFDocument.create();
    const page = templateDocument.addPage([612, 792]);
    const form = templateDocument.getForm();

    for (const field of jobApplicationDefinition.fields) {
      const pdfField = form.createTextField(field.pdfFieldName);
      if (field.kind === "textarea") pdfField.enableMultiline();
      if (field.key === "additionalNotes") pdfField.setMaxLength(100);
      pdfField.addToPage(page, { height: 30, width: 250, x: 48, y: 100 });
    }

    const templateBytes = await templateDocument.save();
    const service = createPdfGenerationService({ load: async () => templateBytes });
    const generated = await service.generate({
      documentDefinition: jobApplicationDefinition,
      flatten: false,
      template: jobApplicationDefinition.templates[0],
      values,
    });

    const generatedDocument = await PDFDocument.load(generated.bytes);
    const notesField = generatedDocument.getForm().getTextField("job.additional_notes");
    expect(notesField.getText()).toBe(longNotes);
    expect(notesField.getMaxLength()).toBeUndefined();
  });
});

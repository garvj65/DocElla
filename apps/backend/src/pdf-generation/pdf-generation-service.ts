import { PDFDocument, PDFTextField, StandardFonts } from "pdf-lib";

import { AppError } from "../errors/app-error.js";
import { ERROR_CODES } from "../errors/error-codes.js";
import { formatPdfFieldValue } from "./pdf-value-formatter.js";
import type { PdfTemplateRepository } from "./pdf-template-repository.js";
import type {
  GeneratedPdf,
  PdfGenerationRequest,
  PdfGenerationService,
} from "./pdf-generation-types.js";

const checkSignal = (signal: AbortSignal | undefined): void => {
  signal?.throwIfAborted();
};

const safeFilename = (schemaType: string, templateId: string): string =>
  `docella-${schemaType}-${templateId}.pdf`.replaceAll(/[^A-Za-z0-9._-]/g, "-");

const mapPdfLoadError = (error: unknown): never => {
  throw new AppError({
    cause: error,
    code: ERROR_CODES.PDF_TEMPLATE_INVALID,
    logCause: false,
    message: "The selected PDF template is invalid.",
    status: 500,
  });
};

export const createPdfGenerationService = (
  templateRepository: PdfTemplateRepository,
): PdfGenerationService => ({
  generate: async (request: PdfGenerationRequest): Promise<GeneratedPdf> => {
    const { documentDefinition, signal, template } = request;

    checkSignal(signal);
    const templateBytes = await templateRepository.load(template, signal);
    checkSignal(signal);

    const pdfDocument = await PDFDocument.load(templateBytes).catch(mapPdfLoadError);
    const form = pdfDocument.getForm();

    if (typeof form.hasXFA === "function" && form.hasXFA()) {
      throw new AppError({
        code: ERROR_CODES.PDF_TEMPLATE_INVALID,
        logCause: false,
        message: "The selected PDF template is invalid.",
        status: 500,
      });
    }

    const appearanceFont = await pdfDocument.embedFont(StandardFonts.Helvetica);
    pdfDocument.setTitle(`DocElla ${documentDefinition.label}`);
    pdfDocument.setCreator("DocElla");
    pdfDocument.setProducer("DocElla");

    try {
      for (const field of documentDefinition.fields) {
        checkSignal(signal);
        const pdfField = form.getFieldMaybe(field.pdfFieldName);

        if (pdfField === undefined || !(pdfField instanceof PDFTextField)) {
          throw new AppError({
            code: ERROR_CODES.PDF_TEMPLATE_MAPPING_INVALID,
            logCause: false,
            message: "The selected PDF template does not match the requested schema.",
            status: 500,
          });
        }

        const value = formatPdfFieldValue(field, request.values[field.key]);
        try {
          appearanceFont.encodeText(value);
        } catch (error) {
          throw new AppError({
            cause: error,
            code: ERROR_CODES.PDF_VALUE_UNSUPPORTED,
            logCause: false,
            message:
              "One or more submitted characters are unsupported by the selected PDF template font.",
            status: 422,
          });
        }
        pdfField.setText(value);
      }

      checkSignal(signal);
      form.updateFieldAppearances(appearanceFont);

      const flattened = request.flatten ?? template.flattenByDefault;
      if (flattened) {
        form.flatten();
      }

      const bytes = await pdfDocument.save();
      checkSignal(signal);

      return {
        bytes,
        filename: safeFilename(documentDefinition.id, template.id),
        flattened,
        schemaType: documentDefinition.id,
        templateId: template.id,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError({
        cause: error,
        code: ERROR_CODES.PDF_GENERATION_FAILED,
        logCause: false,
        message: "The PDF could not be generated.",
        status: 500,
      });
    }
  },
});

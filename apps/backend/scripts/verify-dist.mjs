const appModule = await import("../dist/app.js");
const pdfModule = await import("../dist/extraction/pdf-text-extractor.js");
const groqExtractorModule = await import("../dist/extraction/groq-structured-extractor.js");
const extractionServiceModule = await import("../dist/extraction/extraction-service.js");

if (typeof appModule.createApp !== "function") {
  throw new TypeError("Expected dist/app.js to export createApp.");
}

if (typeof pdfModule.createPdfTextExtractor !== "function") {
  throw new TypeError(
    "Expected dist/extraction/pdf-text-extractor.js to export createPdfTextExtractor.",
  );
}

if (typeof groqExtractorModule.createGroqStructuredExtractor !== "function") {
  throw new TypeError(
    "Expected dist/extraction/groq-structured-extractor.js to export createGroqStructuredExtractor.",
  );
}

if (typeof extractionServiceModule.createDocumentExtractionService !== "function") {
  throw new TypeError(
    "Expected dist/extraction/extraction-service.js to export createDocumentExtractionService.",
  );
}

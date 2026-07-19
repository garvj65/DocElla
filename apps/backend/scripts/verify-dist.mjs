const appModule = await import("../dist/app.js");
const pdfModule = await import("../dist/extraction/pdf-text-extractor.js");
const groqExtractorModule = await import("../dist/extraction/groq-structured-extractor.js");
const extractionServiceModule = await import("../dist/extraction/extraction-service.js");
const groundingServiceModule = await import("../dist/grounding/grounding-service.js");
const groundingNormalizationModule = await import("../dist/grounding/normalization.js");
const textSimilarityModule = await import("../dist/grounding/text-similarity.js");

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

if (typeof groundingServiceModule.createGroundingService !== "function") {
  throw new TypeError(
    "Expected dist/grounding/grounding-service.js to export createGroundingService.",
  );
}

if (typeof groundingNormalizationModule.normalizeMinimal !== "function") {
  throw new TypeError("Expected dist/grounding/normalization.js to export normalizeMinimal.");
}

if (typeof groundingNormalizationModule.extractCanonicalEmails !== "function") {
  throw new TypeError("Expected dist/grounding/normalization.js to export extractCanonicalEmails.");
}

if (typeof textSimilarityModule.fuzzyTokenWindowMatch !== "function") {
  throw new TypeError(
    "Expected dist/grounding/text-similarity.js to export fuzzyTokenWindowMatch.",
  );
}

if (typeof textSimilarityModule.containsTokenSequence !== "function") {
  throw new TypeError(
    "Expected dist/grounding/text-similarity.js to export containsTokenSequence.",
  );
}

import { PDFDocument, StandardFonts } from "pdf-lib";

export const createTestPdf = async (
  pages: readonly string[] = [
    "Alex Morgan\nalex@example.test\nPosition Applied For: Product Analyst",
  ],
): Promise<Buffer> => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pageTexts = pages.length > 0 ? pages : [""];

  for (const pageText of pageTexts) {
    const page = pdf.addPage([612, 792]);
    const lines = pageText.split("\n");
    lines.forEach((line, index) => {
      page.drawText(line, {
        font,
        size: 12,
        x: 72,
        y: 720 - index * 18,
      });
    });
  }

  return Buffer.from(await pdf.save());
};

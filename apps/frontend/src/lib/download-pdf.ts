export const downloadPdf = (bytes: Uint8Array, filename: string): void => {
  const pdfBytes = new Uint8Array(bytes);
  const blob = new Blob([pdfBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.append(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
};

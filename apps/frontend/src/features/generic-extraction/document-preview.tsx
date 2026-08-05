import type { GenericEvidenceAnchor } from "@docella/schemas/public";
import { FileText, Image as ImageIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const extensionOf = (filename: string): string => {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot).toLocaleLowerCase();
};

const evidenceLocation = (evidence: GenericEvidenceAnchor): string => {
  switch (evidence.location.kind) {
    case "page":
      return `Page ${String(evidence.location.pageNumber)}`;
    case "sheet":
      return evidence.location.cellRange === undefined
        ? evidence.location.sheetName
        : `${evidence.location.sheetName} · ${evidence.location.cellRange}`;
    case "slide":
      return `Slide ${String(evidence.location.slideNumber)}`;
    case "html":
      return evidence.location.elementPath ?? "HTML document";
  }
};

export function DocumentPreview({
  evidence,
  file,
}: {
  readonly evidence?: GenericEvidenceAnchor;
  readonly file: File;
}) {
  const [objectUrl, setObjectUrl] = useState("");
  const extension = extensionOf(file.name);
  const previewKind = useMemo(() => {
    if (extension === ".pdf") return "pdf";
    if ([".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff", ".heic", ".heif"].includes(extension)) {
      return "image";
    }
    return "summary";
  }, [extension]);

  useEffect(() => {
    if (previewKind === "summary") {
      setObjectUrl("");
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, previewKind]);

  return (
    <section aria-label="Source document" className="enterprise-panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-slate-950">Source document</h2>
          <p className="truncate text-xs text-slate-500">{file.name}</p>
        </div>
        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-600">
          {extension.replace(".", "") || "file"}
        </span>
      </div>

      <div className="bg-slate-100 p-3">
        {previewKind === "pdf" && objectUrl.length > 0 ? (
          <iframe
            className="h-[440px] w-full rounded border border-slate-200 bg-white"
            src={objectUrl}
            title={`Preview of ${file.name}`}
          />
        ) : null}
        {previewKind === "image" && objectUrl.length > 0 ? (
          <div className="flex min-h-[360px] items-center justify-center overflow-auto rounded border border-slate-200 bg-white p-3">
            <img
              alt={`Preview of ${file.name}`}
              className="max-h-[420px] max-w-full object-contain"
              src={objectUrl}
            />
          </div>
        ) : null}
        {previewKind === "summary" ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded border border-slate-200 bg-white px-6 text-center">
            {extension === ".html" || extension === ".htm" ? (
              <FileText aria-hidden="true" className="mb-3 h-8 w-8 text-slate-400" />
            ) : (
              <ImageIcon aria-hidden="true" className="mb-3 h-8 w-8 text-slate-400" />
            )}
            <p className="text-sm font-medium text-slate-800">Inline preview is not available</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
              DocElla keeps this document in memory and presents grounded source evidence below.
            </p>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-200 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Selected evidence
          </h3>
          {evidence === undefined ? null : (
            <span className="text-xs font-medium text-slate-600">
              {evidenceLocation(evidence)}
            </span>
          )}
        </div>
        {evidence === undefined ? (
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Select a field or table to inspect its source evidence.
          </p>
        ) : (
          <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm leading-6 text-slate-800">{evidence.text}</p>
            {evidence.providerConfidence === undefined ? null : (
              <p className="mt-2 text-xs text-slate-500">
                OCR confidence: {Math.round(evidence.providerConfidence * 100)}%
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

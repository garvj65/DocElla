import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ExtractionApi } from "../src/api/extraction-api";
import type { SchemaApi } from "../src/api/schema-api";
import { ExtractionWorkspace } from "../src/features/extraction/extraction-workspace";
import { buildExtractionResult, everyFieldConfig, everyFieldSummary } from "./support/schemas";
import { renderWithProviders } from "./support/render";

const schemaApi: SchemaApi = {
  getDocumentConfig: vi.fn(() => Promise.resolve(everyFieldConfig)),
  listDocumentSummaries: vi.fn(() => Promise.resolve([everyFieldSummary])),
};

describe("ExtractionWorkspace", () => {
  it("extracts only after explicit action and renders the editable review flow", async () => {
    const user = userEvent.setup();
    const extract = vi.fn(() => Promise.resolve(buildExtractionResult(everyFieldConfig)));
    const extractionApi: ExtractionApi = { extract };

    renderWithProviders(
      <ExtractionWorkspace extractionApi={extractionApi} schemaApi={schemaApi} />,
    );

    expect(await screen.findByRole("heading", { name: "PDF to Form" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /extract/i })).toBeDisabled();

    const file = new File(["%PDF-1.7 synthetic text"], "Synthetic Resume.pdf", {
      type: "application/pdf",
    });
    await user.upload(screen.getByLabelText(/PDF file/i), file);
    expect(extract).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: /extract/i })).toBeEnabled());

    await user.click(screen.getByRole("button", { name: /extract/i }));
    await screen.findByRole("heading", { name: "Extraction review" });
    expect(extract).toHaveBeenCalledTimes(1);
    const firstCall = extract.mock.calls[0] as unknown as [
      { readonly config: typeof everyFieldConfig; readonly file: File },
    ];
    expect(firstCall[0]).toMatchObject({ config: everyFieldConfig, file });
    expect(screen.getAllByText(/Grounding confidence/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Verified").length).toBeGreaterThan(0);

    await user.clear(screen.getByLabelText(/Full name/i));
    await user.type(screen.getByLabelText(/Full name/i), "Sensitive Sentinel");
    expect(screen.getByText("Edited")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /validate reviewed fields/i }));
    await screen.findByText(/Reviewed form is valid/i);

    expect(screen.queryByText(/source text/i)).not.toBeInTheDocument();
    expect(
      extract.mock.calls.some((call) => JSON.stringify(call).includes("/api/generate-pdf")),
    ).toBe(false);
  }, 10000);

  it("prevents invalid files from calling the extraction API", async () => {
    const user = userEvent.setup();
    const extractionApi: ExtractionApi = { extract: vi.fn() };
    renderWithProviders(
      <ExtractionWorkspace extractionApi={extractionApi} schemaApi={schemaApi} />,
    );

    await screen.findByRole("heading", { name: "PDF to Form" });
    await user.upload(
      screen.getByLabelText(/PDF file/i),
      new File(["not a pdf"], "not-pdf.pdf", { type: "application/pdf" }),
    );

    expect(await screen.findByText(/could not be read as a valid PDF/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /extract/i })).toBeDisabled();
    expect(extractionApi.extract).not.toHaveBeenCalled();
  });
});

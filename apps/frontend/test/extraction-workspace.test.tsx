import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExtractionApi } from "../src/api/extraction-api";
import type { SchemaApi } from "../src/api/schema-api";
import { ExtractionWorkspace } from "../src/features/extraction/extraction-workspace";
import { buildExtractionResult, everyFieldConfig, everyFieldSummary } from "./support/schemas";
import { renderWithProviders } from "./support/render";

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
};

const validPdf = (name: string) =>
  new File(["%PDF-1.7 synthetic text"], name, {
    type: "application/pdf",
  });

describe("ExtractionWorkspace", () => {
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:reviewed-pdf"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("extracts only after explicit action and renders the editable review flow", async () => {
    const user = userEvent.setup();
    const extract = vi.fn(() => Promise.resolve(buildExtractionResult(everyFieldConfig)));
    const extractionApi: ExtractionApi = { extract };
    const schemaApi = mockSchemaApi();

    renderWithProviders(
      <ExtractionWorkspace extractionApi={extractionApi} schemaApi={schemaApi} />,
    );

    expect(await screen.findByRole("heading", { name: "PDF to Form" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /extract/i })).toBeDisabled();

    const file = validPdf("Synthetic Resume.pdf");
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

    await user.selectOptions(screen.getByLabelText(/PDF output/i), "editable");
    await user.click(screen.getByRole("button", { name: /generate reviewed pdf/i }));
    await waitFor(() => expect(schemaApi.generatePdf).toHaveBeenCalledTimes(1));
    expect(schemaApi.generatePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        flatten: false,
        templateId: "synthetic-default",
        values: expect.objectContaining({
          fullName: "Sensitive Sentinel",
        }),
      }),
    );
    expect(extract).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/Grounding confidence/i).length).toBeGreaterThan(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:reviewed-pdf");
    expect(screen.queryByText(/source text/i)).not.toBeInTheDocument();
    expect(
      extract.mock.calls.some((call) => JSON.stringify(call).includes("/api/generate-pdf")),
    ).toBe(false);
  }, 10000);

  it("prevents invalid files from calling the extraction API", async () => {
    const user = userEvent.setup();
    const extractionApi: ExtractionApi = { extract: vi.fn() };
    const schemaApi = mockSchemaApi();
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

  it("ignores out-of-order PDF preflight results for older selected files", async () => {
    const user = userEvent.setup();
    const extractionApi: ExtractionApi = { extract: vi.fn() };
    const schemaApi = mockSchemaApi();
    const validations: ReturnType<
      typeof deferred<
        | { readonly valid: true }
        | {
            readonly valid: false;
            readonly code: "FILE_SIGNATURE_INVALID";
            readonly message: string;
          }
      >
    >[] = [];
    const validateFile = vi.fn(() => {
      const next = deferred<
        | { readonly valid: true }
        | {
            readonly valid: false;
            readonly code: "FILE_SIGNATURE_INVALID";
            readonly message: string;
          }
      >();
      validations.push(next);
      return next.promise;
    });

    renderWithProviders(
      <ExtractionWorkspace
        extractionApi={extractionApi}
        schemaApi={schemaApi}
        validateFile={validateFile}
      />,
    );

    await screen.findByRole("heading", { name: "PDF to Form" });
    const input = screen.getByLabelText(/PDF file/i);
    await user.upload(input, validPdf("file-a.pdf"));
    await user.upload(input, validPdf("file-b.pdf"));

    validations[1]?.resolve({
      code: "FILE_SIGNATURE_INVALID",
      message: "The selected file could not be read as a valid PDF.",
      valid: false,
    });
    expect(await screen.findByText(/could not be read as a valid PDF/i)).toBeInTheDocument();

    validations[0]?.resolve({ valid: true });
    await waitFor(() => expect(screen.getByText(/file-b\.pdf/i)).toBeInTheDocument());
    expect(screen.getByText(/could not be read as a valid PDF/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /extract/i })).toBeDisabled();
    expect(extractionApi.extract).not.toHaveBeenCalled();
  });

  it("ignores successful results from a cancelled extraction and keeps the file ready", async () => {
    const user = userEvent.setup();
    const extraction =
      deferred<ReturnType<ExtractionApi["extract"]> extends Promise<infer T> ? T : never>();
    const extract = vi.fn(() => extraction.promise);
    const extractionApi: ExtractionApi = { extract };
    const schemaApi = mockSchemaApi();

    renderWithProviders(
      <ExtractionWorkspace extractionApi={extractionApi} schemaApi={schemaApi} />,
    );

    await screen.findByRole("heading", { name: "PDF to Form" });
    await user.upload(screen.getByLabelText(/PDF file/i), validPdf("cancel-me.pdf"));
    await waitFor(() => expect(screen.getByRole("button", { name: /extract/i })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /extract/i }));
    expect(await screen.findByRole("button", { name: /cancel/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    extraction.resolve(buildExtractionResult(everyFieldConfig));

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Extraction review" })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/cancel-me\.pdf/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /extract/i })).toBeEnabled());
  });

  it("allows selecting the same file again after Clear and Start Over", async () => {
    const user = userEvent.setup();
    const extractionApi: ExtractionApi = { extract: vi.fn() };
    const schemaApi = mockSchemaApi();
    const validateFile = vi.fn(() => Promise.resolve({ valid: true } as const));
    const file = validPdf("same-file.pdf");

    renderWithProviders(
      <ExtractionWorkspace
        extractionApi={extractionApi}
        schemaApi={schemaApi}
        validateFile={validateFile}
      />,
    );

    await screen.findByRole("heading", { name: "PDF to Form" });
    const input = screen.getByLabelText(/PDF file/i);
    await user.upload(input, file);
    await waitFor(() => expect(validateFile).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: /clear file/i }));
    await user.upload(input, file);
    await waitFor(() => expect(validateFile).toHaveBeenCalledTimes(2));

    await user.click(screen.getByRole("button", { name: /^start over$/i }));
    await user.upload(input, file);
    await waitFor(() => expect(validateFile).toHaveBeenCalledTimes(3));
    expect(screen.getByText(/same-file\.pdf/i)).toBeInTheDocument();
  });
});

function mockSchemaApi(): SchemaApi {
  return {
    generatePdf: vi.fn(() =>
      Promise.resolve({
        bytes: new TextEncoder().encode("%PDF-reviewed"),
        filename: "reviewed.pdf",
      }),
    ),
    getDocumentConfig: vi.fn(() => Promise.resolve(everyFieldConfig)),
    listDocumentSummaries: vi.fn(() => Promise.resolve([everyFieldSummary])),
  };
}

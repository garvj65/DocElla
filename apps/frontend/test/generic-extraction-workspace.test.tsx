import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FrontendApiError } from "../src/api/api-error";
import type { GenericDocumentApi } from "../src/api/generic-document-api";
import { GenericExtractionWorkspace } from "../src/features/generic-extraction/generic-extraction-workspace";
import { genericDocumentResult } from "./support/generic-document";

const validPdf = () =>
  new File(["%PDF-1.7\nInvoice INV-1001"], "invoice.pdf", {
    type: "application/pdf",
  });

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
};

describe("generic extraction workspace", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("validates a file, submits it explicitly, and renders the structured review", async () => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });
    const api: GenericDocumentApi = {
      extract: vi.fn(() => Promise.resolve(genericDocumentResult)),
    };

    render(<GenericExtractionWorkspace api={api} />);
    const input = screen.getByLabelText(/Drop a document here/i);
    const file = validPdf();
    await userEvent.upload(input, file);

    const analyze = await screen.findByRole("button", { name: "Analyze document" });
    expect(analyze).toBeEnabled();
    expect(api.extract).not.toHaveBeenCalled();

    await userEvent.click(analyze);
    expect(await screen.findByRole("heading", { name: "Invoice INV-1001" })).toBeInTheDocument();
    expect(api.extract).toHaveBeenCalledWith(
      expect.objectContaining({ file, signal: expect.any(AbortSignal) }),
    );
  });

  it("invalidates a cancelled request even when the API ignores abort and resolves late", async () => {
    const pending = deferred<typeof genericDocumentResult>();
    const api: GenericDocumentApi = {
      extract: vi.fn(() => pending.promise),
    };

    render(<GenericExtractionWorkspace api={api} />);
    await userEvent.upload(screen.getByLabelText(/Drop a document here/i), validPdf());
    await userEvent.click(await screen.findByRole("button", { name: "Analyze document" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    await act(async () => {
      pending.resolve(genericDocumentResult);
      await pending.promise;
    });

    expect(screen.queryByRole("heading", { name: "Invoice INV-1001" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Analyze document" })).toBeEnabled();
  });

  it("maps backend failures to safe messages and request IDs", async () => {
    const api: GenericDocumentApi = {
      extract: vi.fn(() =>
        Promise.reject(
          new FrontendApiError({
            code: "DOCUMENT_LAYOUT_PROVIDER_NOT_CONFIGURED",
            message: "raw provider detail",
            requestId: "req_layout_1",
            status: 503,
          }),
        ),
      ),
    };

    render(<GenericExtractionWorkspace api={api} />);
    await userEvent.upload(screen.getByLabelText(/Drop a document here/i), validPdf());
    await userEvent.click(await screen.findByRole("button", { name: "Analyze document" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/not configured/i));
    expect(screen.getByRole("alert")).toHaveTextContent("req_layout_1");
    expect(screen.getByRole("alert")).not.toHaveTextContent("raw provider detail");
  });
});

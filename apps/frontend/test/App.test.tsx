import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../src/App";
import { everyFieldConfig, everyFieldSummary, successEnvelope } from "./support/schemas";
import { renderWithProviders } from "./support/render";

describe("App shell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the enterprise workflows while preserving the fixed-schema tools", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/schemas")) {
          return Promise.resolve(
            new Response(JSON.stringify(successEnvelope([everyFieldSummary])), {
              headers: { "content-type": "application/json" },
            }),
          );
        }

        return Promise.resolve(
          new Response(JSON.stringify(successEnvelope(everyFieldConfig)), {
            headers: { "content-type": "application/json" },
          }),
        );
      }),
    );

    renderWithProviders(<App environment={{ apiBaseUrl: "" }} />);

    expect(screen.getByText("DocElla")).toBeInTheDocument();
    expect(screen.getByText(/Memory-only document processing/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Extract" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Template review" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Create PDF" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Extract structured data from any business document",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Drop a document here/i)).toHaveAttribute(
      "accept",
      expect.stringContaining(".docx"),
    );

    await userEvent.click(screen.getByRole("tab", { name: "Template review" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "PDF to Form" })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/PDF file/i)).toHaveAttribute("accept", "application/pdf,.pdf");

    await userEvent.click(screen.getByRole("tab", { name: "Create PDF" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Synthetic Document" })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/Full name/)).toHaveAttribute("type", "text");
    expect(screen.getByLabelText(/Email/)).toHaveAttribute("type", "email");
  }, 10000);
});

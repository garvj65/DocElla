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

  it("renders privacy messaging, accessible tabs, and no upload input", async () => {
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

    expect(screen.getByRole("heading", { level: 1, name: "DocElla" })).toBeInTheDocument();
    expect(screen.getByText(/without persistent storage/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "PDF to Form" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Form to PDF" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "PDF to Form" }));
    expect(screen.getByText(/Extraction review arrives in T09/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/upload/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Form to PDF" }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Synthetic Document" })).toBeInTheDocument(),
    );
    expect(screen.getByLabelText(/Full name/)).toHaveAttribute("type", "text");
    expect(screen.getByLabelText(/Email/)).toHaveAttribute("type", "email");
  });
});

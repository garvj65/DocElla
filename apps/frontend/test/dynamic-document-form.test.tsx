import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SchemaApi } from "../src/api/schema-api";
import { DynamicDocumentForm } from "../src/features/dynamic-form/dynamic-document-form";
import { everyFieldConfig } from "./support/schemas";

describe("DynamicDocumentForm", () => {
  beforeEach(() => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:pdf"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders every public field kind and validates locally without leaking values", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const user = userEvent.setup();

    renderForm();

    expect(screen.getByLabelText(/Full name/)).toHaveAttribute("placeholder", "Alex Morgan");
    expect(screen.getByLabelText("Notes")).toBeInstanceOf(HTMLTextAreaElement);
    expect(screen.getByLabelText(/Email/)).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Phone")).toHaveAttribute("autocomplete", "tel");
    expect(screen.getByLabelText("Start date")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Years")).toHaveAttribute("type", "number");
    expect(screen.getByLabelText("Amount")).toHaveAttribute("type", "number");

    await user.click(screen.getByRole("button", { name: /validate fields/i }));
    expect(await screen.findByText(/need attention/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Full name/), "Sensitive Sentinel");
    await user.type(screen.getByLabelText(/Email/), "bad-email");
    await user.click(screen.getByRole("button", { name: /validate fields/i }));
    expect(await screen.findByText(/Invalid email/i)).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Email/));
    await user.type(screen.getByLabelText(/Email/), "alex@example.com");
    await user.click(screen.getByRole("combobox", { name: /status/i }));
    await user.click(screen.getByRole("option", { name: "Open" }));
    await user.click(screen.getByRole("button", { name: /validate fields/i }));

    await waitFor(() => expect(screen.getByText(/passed local validation/i)).toBeInTheDocument());
    expect(screen.queryByText("Sensitive Sentinel")).not.toBeInTheDocument();
    expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining("Sensitive Sentinel"));
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);

    await user.click(screen.getByRole("button", { name: /reset form/i }));
    expect(screen.getByLabelText(/Full name/)).toHaveValue("");
    consoleSpy.mockRestore();
  }, 10000);

  it("generates one PDF after local validation and sends flatten state", async () => {
    const user = userEvent.setup();
    const schemaApi = mockSchemaApi();

    renderForm(schemaApi);

    await fillValidRequiredFields(user);
    await user.click(screen.getByLabelText(/PDF output/i));
    await user.selectOptions(screen.getByLabelText(/PDF output/i), "editable");
    await user.click(screen.getByRole("button", { name: /generate pdf/i }));

    await waitFor(() => expect(schemaApi.generatePdf).toHaveBeenCalledTimes(1));
    expect(schemaApi.generatePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        config: everyFieldConfig,
        flatten: false,
        templateId: "synthetic-default",
        values: expect.objectContaining({
          email: "alex@example.com",
          fullName: "Sensitive Sentinel",
          status: "open",
        }),
      }),
    );
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf");
    expect(screen.queryByText("Sensitive Sentinel")).not.toBeInTheDocument();
  });

  it("does not generate when local validation fails", async () => {
    const user = userEvent.setup();
    const schemaApi = mockSchemaApi();

    renderForm(schemaApi);
    await user.click(screen.getByRole("button", { name: /generate pdf/i }));

    await waitFor(() => expect(screen.getByText(/need attention/i)).toBeInTheDocument());
    expect(schemaApi.generatePdf).not.toHaveBeenCalled();
  });

  it("aborts when the user cancels generation", async () => {
    const user = userEvent.setup();
    const schemaApi = mockSchemaApi(new Promise(() => undefined));

    renderForm(schemaApi);
    await fillValidRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /generate pdf/i }));
    await user.click(await screen.findByRole("button", { name: /cancel/i }));

    const call = schemaApi.generatePdf.mock.calls[0]?.[0];
    expect(call?.signal).toBeDefined();
    expect(call?.signal?.aborted).toBe(true);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("does not download a late result after the selected template changes", async () => {
    const user = userEvent.setup();
    let resolvePdf:
      ((value: { readonly bytes: Uint8Array; readonly filename: string }) => void) | undefined;
    const pendingPdf = new Promise<{ readonly bytes: Uint8Array; readonly filename: string }>(
      (resolve) => {
        resolvePdf = resolve;
      },
    );
    const schemaApi = mockSchemaApi(pendingPdf);
    const { rerender } = render(
      <DynamicDocumentForm
        config={everyFieldConfig}
        schemaApi={schemaApi}
        selectedTemplateId="synthetic-default"
        selectedTemplateLabel="Synthetic Default"
      />,
    );

    await fillValidRequiredFields(user);
    await user.click(screen.getByRole("button", { name: /generate pdf/i }));
    rerender(
      <DynamicDocumentForm
        config={{
          ...everyFieldConfig,
          templates: [
            ...everyFieldConfig.templates,
            { flattenByDefault: false, id: "alternate", label: "Alternate" },
          ],
        }}
        schemaApi={schemaApi}
        selectedTemplateId="alternate"
        selectedTemplateLabel="Alternate"
      />,
    );
    resolvePdf?.({ bytes: new TextEncoder().encode("%PDF-late"), filename: "late.pdf" });

    await waitFor(() => expect(URL.createObjectURL).not.toHaveBeenCalled());
  });
});

function renderForm(schemaApi: SchemaApi = mockSchemaApi()) {
  render(
    <DynamicDocumentForm
      config={everyFieldConfig}
      schemaApi={schemaApi}
      selectedTemplateId="synthetic-default"
      selectedTemplateLabel="Synthetic Default"
    />,
  );
}

function mockSchemaApi(
  generateResult: Promise<{
    readonly bytes: Uint8Array;
    readonly filename: string;
  }> = Promise.resolve({
    bytes: new TextEncoder().encode("%PDF-test"),
    filename: "synthetic-default.pdf",
  }),
) {
  return {
    generatePdf: vi.fn<SchemaApi["generatePdf"]>(() => generateResult),
    getDocumentConfig: vi.fn(),
    listDocumentSummaries: vi.fn(),
  };
}

async function fillValidRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Full name/), "Sensitive Sentinel");
  await user.type(screen.getByLabelText(/Email/), "alex@example.com");
  await user.click(screen.getByRole("combobox", { name: /status/i }));
  await user.click(screen.getByRole("option", { name: "Open" }));
}

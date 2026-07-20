import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DynamicDocumentForm } from "../src/features/dynamic-form/dynamic-document-form";
import { everyFieldConfig } from "./support/schemas";

describe("DynamicDocumentForm", () => {
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
  });
});

function renderForm() {
  render(
    <DynamicDocumentForm
      config={everyFieldConfig}
      selectedTemplateId="synthetic-default"
      selectedTemplateLabel="Synthetic Default"
    />,
  );
}

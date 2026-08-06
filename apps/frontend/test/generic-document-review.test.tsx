import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GenericDocumentReview } from "../src/features/generic-extraction/generic-document-review";
import { parseRepeatableFieldText } from "../src/features/generic-extraction/generic-review-values";
import { genericDocumentResult, genericDocumentSchema } from "./support/generic-document";

const findField = (fieldId: string) => {
  const field = genericDocumentSchema.sections
    .flatMap((section) => section.fields)
    .find((candidate) => candidate.id === fieldId);
  if (field === undefined) throw new Error(`Missing test field ${fieldId}.`);
  return field;
};

describe("generic document review", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses typed repeatable values instead of converting every item to text", () => {
    expect(parseRepeatableFieldText(findField("amounts"), "10\n20.5")).toEqual([10, 20.5]);
    expect(parseRepeatableFieldText(findField("flags"), "yes\nno\ntrue\nfalse")).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(parseRepeatableFieldText(findField("tags"), "alpha\nbeta")).toEqual(["alpha", "beta"]);
  });

  it("associates labels, exposes evidence, validates edits, and blocks invalid JSON export", async () => {
    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:generic-export");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(
      <GenericDocumentReview
        file={new File(["PK"], "invoice.docx")}
        onStartOver={vi.fn()}
        result={genericDocumentResult}
      />,
    );

    expect(screen.getByLabelText(/Invoice number/i)).toHaveValue("INV-1001");
    expect(screen.getByLabelText(/Amounts/i)).toHaveValue("100\n25.5");

    await userEvent.click(
      screen.getByRole("button", { name: "Inspect evidence for Invoice number" }),
    );
    expect(screen.getByText(/Invoice INV-1001 priority approved/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Amounts/i), { target: { value: "10\n20.5" } });
    fireEvent.change(screen.getByLabelText(/Flags/i), { target: { value: "yes\nno" } });
    await userEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(screen.getByText(/match the discovered schema/i)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/Invoice number/i));
    await userEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(screen.getByText(/need attention/i)).toBeInTheDocument();
    expect(createObjectUrl).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/Invoice number/i), "INV-2002");
    await userEvent.click(screen.getByRole("button", { name: "Export JSON" }));
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:generic-export");
  });

  it("marks table edits and supports adding and removing rows", async () => {
    render(
      <GenericDocumentReview
        file={new File(["PK"], "invoice.docx")}
        onStartOver={vi.fn()}
        result={genericDocumentResult}
      />,
    );

    expect(screen.getByText(/1 rows/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add row" }));
    expect(screen.getByText(/2 rows/i)).toBeInTheDocument();
    expect(screen.getAllByText("Edited").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "Remove row 2" }));
    expect(screen.getByText(/1 rows/i)).toBeInTheDocument();
  });
});

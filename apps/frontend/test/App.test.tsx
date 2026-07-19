import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "../src/App";

describe("App", () => {
  it("renders the DocElla scaffold", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "DocElla" })).toBeInTheDocument();
    expect(screen.getByText("PDF ⇄ Form")).toBeInTheDocument();
    expect(screen.getByText(/scaffold is ready/i)).toBeInTheDocument();
  });
});

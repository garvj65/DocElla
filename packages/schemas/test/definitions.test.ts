import { describe, expect, it } from "vitest";

import type { DocumentDefinition } from "../src/contracts/document-definition";
import { defineDocument } from "../src/define-document";
import { assertUniqueDocumentDefinitions } from "../src/registry";

const minimalDocument = (overrides: Partial<DocumentDefinition> = {}) =>
  ({
    id: "test-document",
    version: 1,
    label: "Test Document",
    description: "A test document.",
    fields: [
      {
        key: "fullName",
        label: "Full name",
        description: "The person's full name.",
        kind: "text",
        required: true,
        pdfFieldName: "test.full_name",
      },
    ],
    templates: [
      {
        id: "test-default",
        label: "Default Test",
        assetPath: "templates/test.pdf",
        flattenByDefault: true,
      },
    ],
    ...overrides,
  }) satisfies DocumentDefinition;

describe("defineDocument", () => {
  it("rejects duplicate document ids in registry initialization", () => {
    expect(() =>
      assertUniqueDocumentDefinitions([
        minimalDocument({ id: "duplicate" }),
        minimalDocument({ id: "duplicate" }),
      ]),
    ).toThrow(/Duplicate document definition id "duplicate"/);
  });

  it("rejects duplicate field keys", () => {
    expect(() =>
      defineDocument(
        minimalDocument({
          fields: [
            {
              key: "fullName",
              label: "Full name",
              description: "The person's full name.",
              kind: "text",
              required: true,
              pdfFieldName: "test.full_name",
            },
            {
              key: "fullName",
              label: "Applicant name",
              description: "A duplicate key.",
              kind: "text",
              required: false,
              pdfFieldName: "test.applicant_name",
            },
          ],
        }),
      ),
    ).toThrow(/duplicate field key "fullName"/);
  });

  it("rejects duplicate PDF field names", () => {
    expect(() =>
      defineDocument(
        minimalDocument({
          fields: [
            {
              key: "fullName",
              label: "Full name",
              description: "The person's full name.",
              kind: "text",
              required: true,
              pdfFieldName: "test.full_name",
            },
            {
              key: "applicantName",
              label: "Applicant name",
              description: "A duplicate PDF field.",
              kind: "text",
              required: false,
              pdfFieldName: "test.full_name",
            },
          ],
        }),
      ),
    ).toThrow(/duplicate PDF field name "test.full_name"/);
  });

  it("rejects duplicate template ids", () => {
    expect(() =>
      defineDocument(
        minimalDocument({
          templates: [
            {
              id: "test-default",
              label: "Default Test",
              assetPath: "templates/test.pdf",
              flattenByDefault: true,
            },
            {
              id: "test-default",
              label: "Duplicate Test",
              assetPath: "templates/test-duplicate.pdf",
              flattenByDefault: true,
            },
          ],
        }),
      ),
    ).toThrow(/duplicate template id "test-default"/);
  });

  it("rejects invalid template ids", () => {
    expect(() =>
      defineDocument(
        minimalDocument({
          templates: [
            {
              id: "not a stable id",
              label: "Default Test",
              assetPath: "templates/test.pdf",
              flattenByDefault: true,
            },
          ],
        }),
      ),
    ).toThrow(/template id "not a stable id" must be a stable identifier/);
  });

  it("rejects empty field and template lists", () => {
    expect(() => defineDocument(minimalDocument({ fields: [] }))).toThrow(/at least one field/);
    expect(() => defineDocument(minimalDocument({ templates: [] }))).toThrow(
      /at least one template/,
    );
  });

  it("rejects invalid versions", () => {
    expect(() => defineDocument(minimalDocument({ version: 0 }))).toThrow(/positive integer/);
    expect(() => defineDocument(minimalDocument({ version: 1.5 }))).toThrow(/positive integer/);
  });

  it("rejects blank labels and descriptions", () => {
    expect(() => defineDocument(minimalDocument({ label: " " }))).toThrow(/nonblank label/);
    expect(() => defineDocument(minimalDocument({ description: " " }))).toThrow(
      /nonblank description/,
    );
    expect(() =>
      defineDocument(
        minimalDocument({
          fields: [
            {
              key: "fullName",
              label: " ",
              description: "The person's full name.",
              kind: "text",
              required: true,
              pdfFieldName: "test.full_name",
            },
          ],
        }),
      ),
    ).toThrow(/nonblank label/);
  });

  it("rejects invalid select option configuration", () => {
    const emptyOptions = minimalDocument({
      fields: [
        {
          key: "status",
          label: "Status",
          description: "The status.",
          kind: "select",
          required: true,
          options: [],
          pdfFieldName: "test.status",
        },
      ],
    } as Partial<DocumentDefinition>);

    expect(() => defineDocument(emptyOptions as DocumentDefinition)).toThrow(/at least one option/);

    expect(() =>
      defineDocument(
        minimalDocument({
          fields: [
            {
              key: "status",
              label: "Status",
              description: "The status.",
              kind: "select",
              required: true,
              options: [
                { label: "Open", value: "open" },
                { label: "Open again", value: "open" },
              ],
              pdfFieldName: "test.status",
            },
          ],
        }),
      ),
    ).toThrow(/duplicate option value "open"/);

    expect(() =>
      defineDocument(
        minimalDocument({
          fields: [
            {
              key: "status",
              label: "Status",
              description: "The status.",
              kind: "select",
              required: true,
              options: [{ label: "Open", value: " " }],
              pdfFieldName: "test.status",
            },
          ],
        }),
      ),
    ).toThrow(/blank value/);
  });
});

import {
  buildGenericDocumentSubmissionSchema,
  type DiscoveredField,
  type DiscoveredTableColumn,
  type GenericDocumentExtractionResult,
  type GenericDocumentValues,
  type GenericEvidenceAnchor,
  type GenericFieldValue,
  type GenericScalarValue,
  type GenericTableCellValue,
} from "@docella/schemas/public";
import { Check, Download, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "../../components/ui/button";
import { DocumentPreview } from "./document-preview";
import { exportGenericDocumentJson } from "./export-generic-json";
import { ReviewStatusChip } from "./review-status-chip";

type MutableFieldValue = GenericScalarValue | GenericScalarValue[] | null;
type MutableTableRow = Record<string, GenericTableCellValue>;

interface MutableDocumentValues {
  readonly fields: Record<string, MutableFieldValue>;
  readonly tables: Record<string, MutableTableRow[]>;
}

const cloneValues = (values: GenericDocumentValues): MutableDocumentValues => ({
  fields: Object.fromEntries(
    Object.entries(values.fields).map(([key, value]) => [
      key,
      Array.isArray(value) ? [...value] : value,
    ]),
  ),
  tables: Object.fromEntries(
    Object.entries(values.tables).map(([key, rows]) => [key, rows.map((row) => ({ ...row }))]),
  ),
});

const toReadonlyValues = (values: MutableDocumentValues): GenericDocumentValues => ({
  fields: values.fields,
  tables: values.tables,
});

const isScalarArray = (value: MutableFieldValue): value is GenericScalarValue[] =>
  Array.isArray(value);

const fieldTextValue = (value: MutableFieldValue): string => {
  if (value === null || typeof value === "boolean") return "";
  return Array.isArray(value) ? value.join("\n") : String(value);
};

const tableTextValue = (value: GenericTableCellValue | undefined): string =>
  value === null || value === undefined ? "" : String(value);

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const inputClass =
  "min-h-10 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-50";

function ScalarFieldInput({
  field,
  onChange,
  value,
}: {
  readonly field: DiscoveredField;
  readonly onChange: (value: MutableFieldValue) => void;
  readonly value: MutableFieldValue;
}) {
  if (field.repeatable) {
    return (
      <textarea
        className={`${inputClass} min-h-24 resize-y`}
        onChange={(event) => {
          const values = event.target.value
            .split("\n")
            .map((item) => item.trim())
            .filter(Boolean);
          onChange(values.length === 0 ? null : values);
        }}
        placeholder="One value per line"
        value={isScalarArray(value) ? value.join("\n") : ""}
      />
    );
  }

  if (field.valueType === "boolean") {
    return (
      <select
        className={inputClass}
        onChange={(event) => {
          onChange(event.target.value.length === 0 ? null : event.target.value === "true");
        }}
        value={value === true ? "true" : value === false ? "false" : ""}
      >
        <option value="">Not available</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  if (field.valueType === "select") {
    return (
      <select
        className={inputClass}
        onChange={(event) => onChange(event.target.value || null)}
        value={typeof value === "string" ? value : ""}
      >
        <option value="">Not available</option>
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.valueType === "long_text" || field.valueType === "address") {
    return (
      <textarea
        className={`${inputClass} min-h-24 resize-y`}
        onChange={(event) =>
          onChange(event.target.value.trim().length === 0 ? null : event.target.value)
        }
        value={fieldTextValue(value)}
      />
    );
  }

  const inputType =
    field.valueType === "email"
      ? "email"
      : field.valueType === "date"
        ? "date"
        : field.valueType === "number" || field.valueType === "currency"
          ? "number"
          : "text";

  return (
    <input
      className={inputClass}
      inputMode={field.valueType === "phone" ? "tel" : undefined}
      onChange={(event) =>
        onChange(
          field.valueType === "number" || field.valueType === "currency"
            ? parseNumber(event.target.value)
            : event.target.value.trim().length === 0
              ? null
              : event.target.value,
        )
      }
      step={field.valueType === "number" || field.valueType === "currency" ? "any" : undefined}
      type={inputType}
      value={fieldTextValue(value)}
    />
  );
}

function TableCellInput({
  column,
  onChange,
  value,
}: {
  readonly column: DiscoveredTableColumn;
  readonly onChange: (value: GenericTableCellValue) => void;
  readonly value: GenericTableCellValue | undefined;
}) {
  if (column.valueType === "boolean") {
    return (
      <select
        aria-label={column.label}
        className={`${inputClass} min-w-28`}
        onChange={(event) =>
          onChange(event.target.value.length === 0 ? null : event.target.value === "true")
        }
        value={value === true ? "true" : value === false ? "false" : ""}
      >
        <option value="">—</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    );
  }

  const numeric = column.valueType === "number" || column.valueType === "currency";
  return (
    <input
      aria-label={column.label}
      className={`${inputClass} min-w-32`}
      onChange={(event) =>
        onChange(
          numeric
            ? parseNumber(event.target.value)
            : event.target.value.trim().length === 0
              ? null
              : event.target.value,
        )
      }
      step={numeric ? "any" : undefined}
      type={column.valueType === "date" ? "date" : numeric ? "number" : "text"}
      value={tableTextValue(value)}
    />
  );
}

const locationLabel = (evidence: GenericEvidenceAnchor): string => {
  switch (evidence.location.kind) {
    case "page":
      return `Page ${String(evidence.location.pageNumber)}`;
    case "sheet":
      return evidence.location.sheetName;
    case "slide":
      return `Slide ${String(evidence.location.slideNumber)}`;
    case "html":
      return "HTML";
  }
};

export function GenericDocumentReview({
  file,
  onStartOver,
  result,
}: {
  readonly file: File;
  readonly onStartOver: () => void;
  readonly result: GenericDocumentExtractionResult;
}) {
  const initialValues = useMemo(() => cloneValues(result.values), [result.values]);
  const [values, setValues] = useState<MutableDocumentValues>(() => cloneValues(result.values));
  const [selectedEvidence, setSelectedEvidence] = useState<GenericEvidenceAnchor | undefined>(
    undefined,
  );
  const [validationState, setValidationState] = useState<"idle" | "valid" | "invalid">("idle");
  const fieldCount = result.schema.sections.reduce(
    (total, section) => total + section.fields.length,
    0,
  );
  const tableCount = result.schema.tables.length;
  const confidencePercent = Math.round(result.confidence * 100);

  const updateField = (fieldId: string, value: MutableFieldValue): void => {
    setValues((current) => ({
      ...current,
      fields: { ...current.fields, [fieldId]: value },
    }));
    setValidationState("idle");
  };

  const updateTableCell = (
    tableId: string,
    rowIndex: number,
    columnId: string,
    value: GenericTableCellValue,
  ): void => {
    setValues((current) => ({
      ...current,
      tables: {
        ...current.tables,
        [tableId]: (current.tables[tableId] ?? []).map((row, index) =>
          index === rowIndex ? { ...row, [columnId]: value } : row,
        ),
      },
    }));
    setValidationState("idle");
  };

  const addTableRow = (tableId: string, columns: readonly DiscoveredTableColumn[]): void => {
    setValues((current) => ({
      ...current,
      tables: {
        ...current.tables,
        [tableId]: [
          ...(current.tables[tableId] ?? []),
          Object.fromEntries(columns.map((column) => [column.id, null])),
        ],
      },
    }));
    setValidationState("idle");
  };

  const removeTableRow = (tableId: string, rowIndex: number): void => {
    setValues((current) => ({
      ...current,
      tables: {
        ...current.tables,
        [tableId]: (current.tables[tableId] ?? []).filter((_, index) => index !== rowIndex),
      },
    }));
    setValidationState("idle");
  };

  const validate = (): void => {
    const parsed = buildGenericDocumentSubmissionSchema(result.schema).safeParse(
      toReadonlyValues(values),
    );
    setValidationState(parsed.success ? "valid" : "invalid");
  };

  return (
    <div className="space-y-4">
      <section className="enterprise-panel px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight text-slate-950">
                {result.schema.title ?? result.schema.documentTypeLabel}
              </h1>
              <ReviewStatusChip status={result.reviewRequired ? "needs_review" : "verified"} />
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {result.schema.documentTypeLabel} · {String(result.document.contentUnitCount)}{" "}
              {result.document.contentUnit}
              {result.document.contentUnitCount === 1 ? "" : "s"} · {String(fieldCount)} fields ·{" "}
              {String(tableCount)} tables
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-2 text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Grounded</p>
              <p className="text-lg font-semibold text-slate-950">{confidencePercent}%</p>
            </div>
            <Button type="button" variant="secondary" onClick={validate}>
              <Check aria-hidden="true" className="h-4 w-4" />
              Validate
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => exportGenericDocumentJson(result.schema, toReadonlyValues(values))}
            >
              <Download aria-hidden="true" className="h-4 w-4" />
              Export JSON
            </Button>
            <Button type="button" variant="secondary" onClick={onStartOver}>
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Start over
            </Button>
          </div>
        </div>
        <div aria-live="polite" className="mt-3 text-sm">
          {validationState === "valid" ? (
            <p className="text-emerald-700">Reviewed values match the discovered schema.</p>
          ) : null}
          {validationState === "invalid" ? (
            <p className="text-red-700">Some required or typed values need attention.</p>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.86fr)_minmax(0,1.14fr)]">
        <div className="xl:sticky xl:top-4 xl:self-start">
          <DocumentPreview evidence={selectedEvidence} file={file} />
        </div>

        <div className="space-y-4">
          {result.warnings.length > 0 ? (
            <section className="enterprise-panel border-amber-200 bg-amber-50 px-4 py-3">
              <h2 className="text-sm font-semibold text-amber-950">Review summary</h2>
              <ul className="mt-2 space-y-1 text-sm text-amber-900">
                {result.warnings.slice(0, 5).map((warning, index) => (
                  <li key={`${warning.code}-${String(index)}`}>{warning.message}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {result.schema.sections.map((section) => (
            <section className="enterprise-panel" key={section.id}>
              <div className="border-b border-slate-200 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-950">{section.label}</h2>
                {section.description.length > 0 ? (
                  <p className="mt-1 text-xs text-slate-500">{section.description}</p>
                ) : null}
              </div>
              <div className="grid gap-x-5 gap-y-4 p-4 md:grid-cols-2">
                {section.fields.map((field) => {
                  const review = result.review.fields[field.id];
                  const current = values.fields[field.id] ?? null;
                  const initial = initialValues.fields[field.id] ?? null;
                  const edited = JSON.stringify(current) !== JSON.stringify(initial);
                  const evidence = review?.evidence[0];
                  return (
                    <div
                      className={
                        field.valueType === "long_text" || field.valueType === "address"
                          ? "md:col-span-2"
                          : ""
                      }
                      key={field.id}
                    >
                      <div className="mb-1.5 flex items-start justify-between gap-3">
                        <label className="text-sm font-medium text-slate-800">
                          {field.label}
                          {field.required ? <span className="ml-1 text-red-600">*</span> : null}
                        </label>
                        <button
                          className="rounded outline-none focus:ring-2 focus:ring-teal-200"
                          disabled={evidence === undefined}
                          title={
                            evidence === undefined ? "No source evidence" : locationLabel(evidence)
                          }
                          type="button"
                          onClick={() => setSelectedEvidence(evidence)}
                        >
                          <ReviewStatusChip edited={edited} status={review?.status ?? "missing"} />
                        </button>
                      </div>
                      <ScalarFieldInput
                        field={field}
                        onChange={(value) => updateField(field.id, value)}
                        value={current}
                      />
                      {field.description.length > 0 ? (
                        <p className="mt-1 text-xs leading-5 text-slate-500">{field.description}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {result.schema.tables.map((table) => {
            const rows = values.tables[table.id] ?? [];
            const review = result.review.tables[table.id];
            const evidence = review?.evidence[0];
            return (
              <section className="enterprise-panel overflow-hidden" key={table.id}>
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-950">{table.label}</h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {String(rows.length)} rows · {table.description}
                    </p>
                  </div>
                  <button
                    className="rounded outline-none focus:ring-2 focus:ring-teal-200"
                    disabled={evidence === undefined}
                    title={evidence === undefined ? "No source evidence" : locationLabel(evidence)}
                    type="button"
                    onClick={() => setSelectedEvidence(evidence)}
                  >
                    <ReviewStatusChip status={review?.status ?? "missing"} />
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        {table.columns.map((column) => (
                          <th className="border-b border-slate-200 px-3 py-2" key={column.id}>
                            {column.label}
                          </th>
                        ))}
                        <th className="w-12 border-b border-slate-200 px-3 py-2">
                          <span className="sr-only">Row actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, rowIndex) => (
                        <tr className="border-b border-slate-100 last:border-b-0" key={rowIndex}>
                          {table.columns.map((column) => (
                            <td className="px-3 py-2 align-top" key={column.id}>
                              <TableCellInput
                                column={column}
                                onChange={(value) =>
                                  updateTableCell(table.id, rowIndex, column.id, value)
                                }
                                value={row[column.id]}
                              />
                            </td>
                          ))}
                          <td className="px-3 py-2 align-middle">
                            <button
                              aria-label={`Remove row ${String(rowIndex + 1)}`}
                              className="rounded p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-200"
                              type="button"
                              onClick={() => removeTableRow(table.id, rowIndex)}
                            >
                              <Trash2 aria-hidden="true" className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {rows.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-500">
                      No rows extracted.
                    </p>
                  ) : null}
                </div>
                <div className="border-t border-slate-200 px-4 py-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => addTableRow(table.id, table.columns)}
                  >
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Add row
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

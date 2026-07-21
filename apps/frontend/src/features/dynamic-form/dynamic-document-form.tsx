import { zodResolver } from "@hookform/resolvers/zod";
import {
  buildPublicDefaultValues,
  buildPublicSubmissionSchema,
  type PublicDefaultValues,
  type PublicDocumentConfig,
  type PublicSubmissionData,
} from "@docella/schemas/public";
import { Download, RefreshCcw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type Resolver, useForm } from "react-hook-form";

import { FrontendApiError } from "../../api/api-error";
import type { SchemaApi } from "../../api/schema-api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Label } from "../../components/ui/label";
import { downloadPdf } from "../../lib/download-pdf";
import { DynamicField } from "./dynamic-field";
import { FormReadiness } from "./form-readiness";
import { FormSummary } from "./form-summary";
import type { DynamicFormValues, ValidationState } from "./form-types";

interface DynamicDocumentFormProps {
  readonly config: PublicDocumentConfig;
  readonly schemaApi: SchemaApi;
  readonly selectedTemplateId: string;
  readonly selectedTemplateLabel: string;
}

export interface GenerationOptions {
  readonly buttonLabel: string;
  readonly schemaApi: SchemaApi;
  readonly selectedTemplateId: string;
}

export interface SchemaDrivenFormProps {
  readonly config: PublicDocumentConfig;
  readonly fieldAccessory?: (fieldKey: string, dirty: boolean) => ReactNode;
  readonly footerContent?: ReactNode;
  readonly generation?: GenerationOptions;
  readonly initialValues: PublicDefaultValues;
  readonly onReset?: () => void;
  readonly onValid: (values: PublicSubmissionData) => void;
  readonly resetLabel?: string;
  readonly submitLabel: string;
  readonly title?: string;
  readonly validationSuccessMessage?: string;
}

export function DynamicDocumentForm({
  config,
  schemaApi,
  selectedTemplateId,
  selectedTemplateLabel,
}: DynamicDocumentFormProps) {
  return (
    <DynamicDocumentFormInner
      key={`${config.id}-${String(config.version)}`}
      config={config}
      schemaApi={schemaApi}
      selectedTemplateId={selectedTemplateId}
      selectedTemplateLabel={selectedTemplateLabel}
    />
  );
}

function DynamicDocumentFormInner({
  config,
  schemaApi,
  selectedTemplateId,
  selectedTemplateLabel,
}: DynamicDocumentFormProps) {
  const defaultValues = useMemo(() => buildPublicDefaultValues(config), [config]);

  return (
    <SchemaDrivenForm
      config={config}
      generation={{
        buttonLabel: "Generate PDF",
        schemaApi,
        selectedTemplateId,
      }}
      initialValues={defaultValues}
      onValid={() => undefined}
      resetLabel="Reset form"
      submitLabel="Validate fields"
    >
      {(validationState) => (
        <FormSummary
          config={config}
          selectedTemplateId={selectedTemplateId}
          selectedTemplateLabel={selectedTemplateLabel}
          validationState={validationState}
        />
      )}
    </SchemaDrivenForm>
  );
}

export function SchemaDrivenForm({
  children,
  config,
  fieldAccessory,
  footerContent,
  generation,
  initialValues,
  onReset,
  onValid,
  resetLabel = "Reset form",
  submitLabel,
  title,
  validationSuccessMessage,
}: SchemaDrivenFormProps & {
  readonly children?: ReactNode | ((validationState: ValidationState) => ReactNode);
}) {
  const [validationState, setValidationState] = useState<ValidationState>("idle");
  const [flatten, setFlatten] = useState(
    config.templates.find((template) => template.id === generation?.selectedTemplateId)
      ?.flattenByDefault ?? true,
  );
  const [generationState, setGenerationState] = useState<
    "idle" | "generating" | "success" | "error"
  >("idle");
  const [generationError, setGenerationError] = useState("");
  const [requestId, setRequestId] = useState<string | undefined>();
  const activeRequestRef = useRef(0);
  const abortControllerRef = useRef<AbortController | undefined>(undefined);
  const errorRef = useRef<HTMLDivElement>(null);
  const schema = useMemo(() => buildPublicSubmissionSchema(config), [config]);
  const {
    control,
    formState: { dirtyFields, errors },
    handleSubmit,
    register,
    reset,
    trigger,
  } = useForm<DynamicFormValues>({
    defaultValues: initialValues,
    resolver: zodResolver(schema) as unknown as Resolver<DynamicFormValues>,
  });

  const cancelGeneration = useCallback(() => {
    activeRequestRef.current += 1;
    abortControllerRef.current?.abort();
    abortControllerRef.current = undefined;
  }, []);

  const cancelGenerationAndReset = useCallback(() => {
    cancelGeneration();
    setGenerationState("idle");
    setGenerationError("");
    setRequestId(undefined);
  }, [cancelGeneration]);

  useEffect(() => {
    const selectedTemplate = config.templates.find(
      (template) => template.id === generation?.selectedTemplateId,
    );
    setFlatten(selectedTemplate?.flattenByDefault ?? true);
    setGenerationState("idle");
    setGenerationError("");
    setRequestId(undefined);
    cancelGeneration();
  }, [cancelGeneration, config.templates, generation?.selectedTemplateId]);

  useEffect(
    () => () => {
      cancelGeneration();
    },
    [cancelGeneration],
  );

  useEffect(() => {
    if (generationState === "error") {
      errorRef.current?.focus();
    }
  }, [generationState]);

  const validateFields = handleSubmit(
    (values) => {
      setValidationState("valid");
      onValid(values);
    },
    () => {
      setValidationState("invalid");
      void trigger(undefined, { shouldFocus: true });
    },
  );

  const generatePdf = handleSubmit(
    async (values) => {
      if (generation === undefined) {
        return;
      }

      cancelGeneration();
      const generationId = activeRequestRef.current + 1;
      activeRequestRef.current = generationId;
      const abortController = new AbortController();
      abortControllerRef.current = abortController;
      setValidationState("valid");
      setGenerationState("generating");
      setGenerationError("");
      setRequestId(undefined);

      try {
        const pdf = await generation.schemaApi.generatePdf({
          config,
          flatten,
          signal: abortController.signal,
          templateId: generation.selectedTemplateId,
          values,
        });

        if (activeRequestRef.current !== generationId || abortController.signal.aborted) {
          return;
        }

        downloadPdf(pdf.bytes, pdf.filename);
        setGenerationState("success");
      } catch (error) {
        if (abortController.signal.aborted || activeRequestRef.current !== generationId) {
          return;
        }

        if (error instanceof FrontendApiError) {
          setRequestId(error.requestId);
          setGenerationError(generationMessage(error.code));
        } else {
          setGenerationError("PDF generation failed. Try again in a moment.");
        }
        setGenerationState("error");
      } finally {
        if (activeRequestRef.current === generationId) {
          abortControllerRef.current = undefined;
        }
      }
    },
    () => {
      setValidationState("invalid");
      void trigger(undefined, { shouldFocus: true });
    },
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Card>
        <CardHeader>
          <h2 className="text-xl font-semibold">{title ?? config.label}</h2>
          <p className="text-sm text-[var(--color-muted)]">{config.description}</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={(event) => void validateFields(event)}>
            <FormReadiness
              state={validationState}
              {...(validationSuccessMessage === undefined
                ? {}
                : { successMessage: validationSuccessMessage })}
            />
            <div className="grid gap-5 md:grid-cols-2">
              {config.fields.map((field) => (
                <DynamicField
                  control={control}
                  error={errors[field.key]}
                  field={field}
                  fieldAccessory={fieldAccessory?.(field.key, Boolean(dirtyFields[field.key]))}
                  key={field.key}
                  register={register}
                />
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-5 sm:flex-row">
              <Button type="submit">
                <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                {submitLabel}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  cancelGeneration();
                  reset(initialValues);
                  setValidationState("idle");
                  setGenerationState("idle");
                  setGenerationError("");
                  setRequestId(undefined);
                  onReset?.();
                }}
              >
                <RefreshCcw aria-hidden="true" className="h-4 w-4" />
                {resetLabel}
              </Button>
              {footerContent}
            </div>
            {generation === undefined ? null : (
              <>
                <div className="grid gap-4 rounded-md border border-[var(--color-border)] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <div className="space-y-2">
                    <Label htmlFor="pdf-output-mode">PDF output</Label>
                    <select
                      className="min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm"
                      disabled={generationState === "generating"}
                      id="pdf-output-mode"
                      onChange={(event) => {
                        setFlatten(event.target.value === "flattened");
                      }}
                      value={flatten ? "flattened" : "editable"}
                    >
                      <option value="flattened">Flattened PDF</option>
                      <option value="editable">Editable PDF</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      disabled={
                        generation.selectedTemplateId.length === 0 ||
                        generationState === "generating"
                      }
                      type="button"
                      onClick={() => {
                        void generatePdf();
                      }}
                    >
                      <Download aria-hidden="true" className="h-4 w-4" />
                      {generationState === "generating" ? "Generating..." : generation.buttonLabel}
                    </Button>
                    {generationState === "generating" ? (
                      <Button type="button" variant="secondary" onClick={cancelGenerationAndReset}>
                        <X aria-hidden="true" className="h-4 w-4" />
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div aria-live="polite" role="status">
                  {generationState === "generating" ? "Generating PDF." : null}
                  {generationState === "success" ? "PDF download started." : null}
                </div>
                {generationState === "error" ? (
                  <div
                    aria-live="assertive"
                    className="rounded-md border border-[var(--color-danger)] p-3 text-sm"
                    ref={errorRef}
                    role="alert"
                    tabIndex={-1}
                  >
                    <p>{generationError}</p>
                    {requestId !== undefined ? <p>Request ID: {requestId}</p> : null}
                  </div>
                ) : null}
              </>
            )}
          </form>
        </CardContent>
      </Card>
      {typeof children === "function" ? children(validationState) : children}
    </div>
  );
}

const generationMessage = (code: string): string => {
  switch (code) {
    case "INVALID_GENERATION_REQUEST":
      return "The PDF request could not be accepted.";
    case "INVALID_GENERATION_VALUES":
      return "Some reviewed fields need attention before PDF generation.";
    case "UNKNOWN_SCHEMA":
      return "The selected schema is no longer available.";
    case "UNKNOWN_TEMPLATE":
      return "The selected template is no longer available.";
    case "PDF_VALUE_UNSUPPORTED":
      return "One or more values cannot be placed in this PDF.";
    case "PDF_TEMPLATE_UNAVAILABLE":
      return "The selected PDF template is unavailable.";
    case "PDF_TEMPLATE_INVALID":
      return "The selected PDF template cannot be used.";
    case "PDF_TEMPLATE_MAPPING_INVALID":
      return "This template is not compatible with the selected schema.";
    case "PDF_GENERATION_FAILED":
      return "PDF generation failed. Try again in a moment.";
    case "GENERATION_RATE_LIMITED":
      return "PDF generation is temporarily rate limited. Try again shortly.";
    default:
      return "PDF generation failed. Try again in a moment.";
  }
};

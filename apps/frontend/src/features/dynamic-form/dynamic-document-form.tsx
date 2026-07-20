import { zodResolver } from "@hookform/resolvers/zod";
import {
  buildPublicDefaultValues,
  buildPublicSubmissionSchema,
  type PublicDefaultValues,
  type PublicDocumentConfig,
  type PublicSubmissionData,
} from "@docella/schemas/public";
import { RefreshCcw, ShieldCheck } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { type Resolver, useForm } from "react-hook-form";

import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { DynamicField } from "./dynamic-field";
import { FormReadiness } from "./form-readiness";
import { FormSummary } from "./form-summary";
import type { DynamicFormValues, ValidationState } from "./form-types";

interface DynamicDocumentFormProps {
  readonly config: PublicDocumentConfig;
  readonly selectedTemplateId: string;
  readonly selectedTemplateLabel: string;
}

export interface SchemaDrivenFormProps {
  readonly config: PublicDocumentConfig;
  readonly fieldAccessory?: (fieldKey: string, dirty: boolean) => ReactNode;
  readonly footerContent?: ReactNode;
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
  selectedTemplateId,
  selectedTemplateLabel,
}: DynamicDocumentFormProps) {
  return (
    <DynamicDocumentFormInner
      key={`${config.id}-${String(config.version)}`}
      config={config}
      selectedTemplateId={selectedTemplateId}
      selectedTemplateLabel={selectedTemplateLabel}
    />
  );
}

function DynamicDocumentFormInner({
  config,
  selectedTemplateId,
  selectedTemplateLabel,
}: DynamicDocumentFormProps) {
  const defaultValues = useMemo(() => buildPublicDefaultValues(config), [config]);

  return (
    <SchemaDrivenForm
      config={config}
      footerContent={
        <Button disabled type="button" variant="ghost">
          PDF download connects in T10
        </Button>
      }
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
                  reset(initialValues);
                  setValidationState("idle");
                  onReset?.();
                }}
              >
                <RefreshCcw aria-hidden="true" className="h-4 w-4" />
                {resetLabel}
              </Button>
              {footerContent}
            </div>
          </form>
        </CardContent>
      </Card>
      {typeof children === "function" ? children(validationState) : children}
    </div>
  );
}

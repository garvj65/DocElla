import { zodResolver } from "@hookform/resolvers/zod";
import {
  buildPublicDefaultValues,
  buildPublicSubmissionSchema,
  type PublicDocumentConfig,
} from "@docella/schemas/public";
import { RefreshCcw, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
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
  const [validationState, setValidationState] = useState<ValidationState>("idle");
  const schema = useMemo(() => buildPublicSubmissionSchema(config), [config]);
  const defaultValues = useMemo(() => buildPublicDefaultValues(config), [config]);
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
    reset,
    trigger,
  } = useForm<DynamicFormValues>({
    defaultValues,
    resolver: zodResolver(schema) as unknown as Resolver<DynamicFormValues>,
  });

  const validateFields = handleSubmit(
    () => {
      setValidationState("valid");
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
          <h2 className="text-xl font-semibold">{config.label}</h2>
          <p className="text-sm text-[var(--color-muted)]">{config.description}</p>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={(event) => void validateFields(event)}>
            <FormReadiness state={validationState} />
            <div className="grid gap-5 md:grid-cols-2">
              {config.fields.map((field) => (
                <DynamicField
                  control={control}
                  error={errors[field.key]}
                  field={field}
                  key={field.key}
                  register={register}
                />
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-5 sm:flex-row">
              <Button type="submit">
                <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                Validate fields
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  reset(defaultValues);
                  setValidationState("idle");
                }}
              >
                <RefreshCcw aria-hidden="true" className="h-4 w-4" />
                Reset form
              </Button>
              <Button disabled type="button" variant="ghost">
                PDF download connects in T10
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <FormSummary
        config={config}
        selectedTemplateId={selectedTemplateId}
        selectedTemplateLabel={selectedTemplateLabel}
        validationState={validationState}
      />
    </div>
  );
}

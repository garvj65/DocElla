import type { PublicFieldConfig } from "@docella/schemas/public";
import type { ReactNode } from "react";
import type { Control, FieldError, UseFormRegister } from "react-hook-form";
import { Controller } from "react-hook-form";

import { FieldMessage } from "../../components/ui/field-message";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import type { DynamicFormValues } from "./form-types";

interface DynamicFieldProps {
  readonly control: Control<DynamicFormValues>;
  readonly error: FieldError | undefined;
  readonly field: PublicFieldConfig;
  readonly fieldAccessory?: ReactNode;
  readonly register: UseFormRegister<DynamicFormValues>;
}

const describedBy = (descriptionId: string, errorId: string, hasError: boolean): string =>
  hasError ? `${descriptionId} ${errorId}` : descriptionId;

export function DynamicField({
  control,
  error,
  field,
  fieldAccessory,
  register,
}: DynamicFieldProps) {
  const inputId = `field-${field.key}`;
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;
  const commonProps = {
    "aria-describedby": describedBy(descriptionId, errorId, error !== undefined),
    "aria-invalid": error !== undefined,
    id: inputId,
  } as const;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={inputId}>
          {field.label}
          {field.required ? (
            <span className="ml-1 text-[var(--color-danger)]">(required)</span>
          ) : null}
        </Label>
        {fieldAccessory}
      </div>
      <FieldMessage id={descriptionId}>{field.description}</FieldMessage>
      {renderField({ commonProps, control, field, register })}
      <FieldMessage id={errorId} tone="error">
        {error?.message}
      </FieldMessage>
    </div>
  );
}

function renderField({
  commonProps,
  control,
  field,
  register,
}: {
  readonly commonProps: {
    readonly "aria-describedby": string;
    readonly "aria-invalid": boolean;
    readonly id: string;
  };
  readonly control: Control<DynamicFormValues>;
  readonly field: PublicFieldConfig;
  readonly register: UseFormRegister<DynamicFormValues>;
}) {
  switch (field.kind) {
    case "textarea":
      return <Textarea placeholder={field.placeholder} {...commonProps} {...register(field.key)} />;
    case "email":
      return (
        <Input
          autoComplete="email"
          placeholder={field.placeholder}
          type="email"
          {...commonProps}
          {...register(field.key)}
        />
      );
    case "phone":
      return (
        <Input
          autoComplete="tel"
          placeholder={field.placeholder}
          type="tel"
          {...commonProps}
          {...register(field.key)}
        />
      );
    case "date":
      return (
        <Input
          placeholder={field.placeholder}
          type="date"
          {...commonProps}
          {...register(field.key)}
        />
      );
    case "number":
    case "currency":
      return (
        <Controller
          control={control}
          name={field.key}
          render={({ field: controllerField }) => (
            <Input
              inputMode="decimal"
              onBlur={controllerField.onBlur}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                controllerField.onChange(
                  nextValue === "" ? null : event.currentTarget.valueAsNumber,
                );
              }}
              placeholder={field.placeholder ?? (field.kind === "currency" ? "Amount" : undefined)}
              ref={controllerField.ref}
              step="any"
              type="number"
              value={controllerField.value === null ? "" : String(controllerField.value)}
              {...commonProps}
            />
          )}
        />
      );
    case "select":
      return (
        <Controller
          control={control}
          name={field.key}
          render={({ field: controllerField }) => (
            <Select
              onValueChange={controllerField.onChange}
              value={typeof controllerField.value === "string" ? controllerField.value : ""}
            >
              <SelectTrigger {...commonProps} ref={controllerField.ref}>
                <SelectValue placeholder={field.placeholder ?? "Choose an option"} />
              </SelectTrigger>
              <SelectContent>
                {(field.options ?? []).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      );
    case "text":
      return (
        <Input
          placeholder={field.placeholder}
          type="text"
          {...commonProps}
          {...register(field.key)}
        />
      );
  }
}

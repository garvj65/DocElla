import type { DiscoveredField, GenericScalarValue } from "@docella/schemas/public";

const parseRepeatableItem = (field: DiscoveredField, value: string): GenericScalarValue => {
  switch (field.valueType) {
    case "number":
    case "currency": {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    }
    case "boolean": {
      const normalized = value.toLocaleLowerCase();
      if (["true", "yes", "1"].includes(normalized)) return true;
      if (["false", "no", "0"].includes(normalized)) return false;
      return value;
    }
    case "text":
    case "long_text":
    case "email":
    case "phone":
    case "address":
    case "identifier":
    case "date":
    case "select":
      return value;
  }
};

export const parseRepeatableFieldText = (
  field: DiscoveredField,
  input: string,
): GenericScalarValue[] | null => {
  const items = input
    .split("\n")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => parseRepeatableItem(field, item));
  return items.length === 0 ? null : items;
};

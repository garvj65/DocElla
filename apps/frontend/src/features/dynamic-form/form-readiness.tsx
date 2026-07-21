import { Alert } from "../../components/ui/alert";
import type { ValidationState } from "./form-types";

export function FormReadiness({
  state,
  successMessage = "All configured fields passed local validation.",
}: {
  readonly state: ValidationState;
  readonly successMessage?: string;
}) {
  if (state === "idle") {
    return (
      <Alert>
        Complete the required fields, then generate an editable or flattened PDF from the selected
        trusted template.
      </Alert>
    );
  }

  if (state === "invalid") {
    return <Alert tone="error">Some fields need attention before this form is ready.</Alert>;
  }

  return <Alert tone="success">{successMessage}</Alert>;
}

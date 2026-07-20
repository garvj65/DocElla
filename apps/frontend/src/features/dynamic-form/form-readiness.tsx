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
        Fields are ready for local validation. No values are sent to the backend in this task.
      </Alert>
    );
  }

  if (state === "invalid") {
    return <Alert tone="error">Some fields need attention before this form is ready.</Alert>;
  }

  return <Alert tone="success">{successMessage}</Alert>;
}

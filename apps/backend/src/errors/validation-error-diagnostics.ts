import type { SafeLogContext } from "./app-error.js";

const MAX_VALIDATION_ISSUES = 8;
const MAX_PATH_LENGTH = 160;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const safeSegment = (value: unknown): string | undefined => {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  if (typeof value !== "string" || value.length === 0 || value.length > 80) return undefined;
  return /^[A-Za-z0-9_.-]+$/u.test(value) ? value : undefined;
};

const safeIssuePath = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) return undefined;
  const segments = value.map(safeSegment);
  if (segments.some((segment) => segment === undefined)) return undefined;
  const path = segments.join(".");
  return path.length > MAX_PATH_LENGTH ? path.slice(0, MAX_PATH_LENGTH) : path;
};

const safeIssueCode = (value: unknown): string | undefined =>
  typeof value === "string" && /^[A-Za-z0-9_.-]{1,80}$/u.test(value) ? value : undefined;

export const validationErrorDiagnosticContext = (cause: unknown): SafeLogContext => {
  if (!isRecord(cause) || !Array.isArray(cause.issues)) return {};

  const issues = cause.issues.filter(isRecord);
  const visibleIssues = issues.slice(0, MAX_VALIDATION_ISSUES);
  const codes = visibleIssues
    .map((issue) => safeIssueCode(issue.code))
    .filter((code): code is string => code !== undefined);
  const paths = visibleIssues
    .map((issue) => safeIssuePath(issue.path))
    .filter((path): path is string => path !== undefined);

  return {
    validationIssueCount: issues.length,
    ...(codes.length === 0 ? {} : { validationIssueCodes: codes.join(",") }),
    ...(paths.length === 0 ? {} : { validationIssuePaths: paths.join("|") }),
  };
};

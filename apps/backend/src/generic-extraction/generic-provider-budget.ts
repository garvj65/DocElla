import type { Environment } from "../config/environment.js";

export const GENERIC_PROVIDER_MAX_INPUT_CHARACTERS = 12_000 as const;
export const GENERIC_PROVIDER_BACKOFF_CHARACTERS = [12_000, 6_000, 3_000] as const;

export const genericProviderInputLimit = (environment: Environment): number =>
  Math.min(environment.groqMaxInputCharacters, GENERIC_PROVIDER_MAX_INPUT_CHARACTERS);

export const genericProviderBudgets = (environment: Environment): readonly number[] => {
  const configuredMaximum = genericProviderInputLimit(environment);
  const budgets = GENERIC_PROVIDER_BACKOFF_CHARACTERS.map((budget) =>
    Math.min(budget, configuredMaximum),
  );
  return [...new Set(budgets)].sort((left, right) => right - left);
};

export const sampleGenericProviderContent = (content: string, maximumCharacters: number): string => {
  if (content.length <= maximumCharacters) return content;

  const separator = "\n\n[DOCELLA_CONTENT_TRUNCATED]\n\n";
  const availableCharacters = Math.max(0, maximumCharacters - separator.length);
  const leadingCharacters = Math.ceil(availableCharacters * 0.65);
  const trailingCharacters = availableCharacters - leadingCharacters;

  return `${content.slice(0, leadingCharacters)}${separator}${content.slice(
    content.length - trailingCharacters,
  )}`;
};

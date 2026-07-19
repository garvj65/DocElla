import { tokenizeSearch } from "./normalization.js";

export interface FuzzyMatchResult {
  readonly matched: boolean;
  readonly windowsExamined: number;
}

const splitNormalizedTokens = (value: string): readonly string[] =>
  value.split(" ").filter(Boolean);

export const containsTokenSequence = (
  sourceSearchText: string,
  candidateSearchText: string,
): boolean => {
  const sourceTokens = splitNormalizedTokens(sourceSearchText);
  const candidateTokens = splitNormalizedTokens(candidateSearchText);

  if (candidateTokens.length === 0 || candidateTokens.length > sourceTokens.length) {
    return false;
  }

  for (let start = 0; start + candidateTokens.length <= sourceTokens.length; start += 1) {
    let matches = true;
    for (let offset = 0; offset < candidateTokens.length; offset += 1) {
      if (sourceTokens[start + offset] !== candidateTokens[offset]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return true;
    }
  }

  return false;
};

const countTokens = (tokens: readonly string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
};

const overlapCount = (left: Map<string, number>, right: Map<string, number>): number => {
  let overlap = 0;
  for (const [token, count] of left) {
    overlap += Math.min(count, right.get(token) ?? 0);
  }
  return overlap;
};

export const fuzzyTokenWindowMatch = (
  candidate: string,
  sourceSearchText: string,
  threshold = 0.85,
): FuzzyMatchResult => {
  const candidateTokens = tokenizeSearch(candidate);
  const alphanumericLength = candidateTokens.join("").length;

  if (
    candidateTokens.length < 2 ||
    candidateTokens.length > 80 ||
    alphanumericLength < 8 ||
    sourceSearchText.length === 0
  ) {
    return { matched: false, windowsExamined: 0 };
  }

  const sourceTokens = splitNormalizedTokens(sourceSearchText);
  const candidateCounts = countTokens(candidateTokens);
  const minWindow = Math.max(1, candidateTokens.length - 2);
  const maxWindow = Math.min(sourceTokens.length, candidateTokens.length + 2);
  let windowsExamined = 0;

  for (let width = minWindow; width <= maxWindow; width += 1) {
    for (let start = 0; start + width <= sourceTokens.length; start += 1) {
      windowsExamined += 1;
      const windowCounts = countTokens(sourceTokens.slice(start, start + width));
      const overlap = overlapCount(candidateCounts, windowCounts);
      const precision = overlap / width;
      const recall = overlap / candidateTokens.length;
      const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

      if (f1 >= threshold) {
        return { matched: true, windowsExamined };
      }
    }
  }

  return { matched: false, windowsExamined };
};

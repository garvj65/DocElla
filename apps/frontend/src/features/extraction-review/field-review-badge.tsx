import type { FieldReview } from "@docella/schemas/public";

import { Badge } from "../../components/ui/badge";

const reviewLabel = (review: FieldReview): string => {
  if (review.status === "verified") return "Verified";
  if (review.status === "needs_review") return "Needs review";
  return "Missing";
};

const matchLabel = (review: FieldReview): string => {
  if (review.status === "missing") return "No value extracted";
  if (review.matchType === "exact") return "Exact match";
  if (review.matchType === "normalized") return "Normalized match";
  if (review.matchType === "fuzzy") return "Fuzzy match";
  return "No source match";
};

export function FieldReviewBadge({
  edited,
  review,
}: {
  readonly edited: boolean;
  readonly review: FieldReview;
}) {
  return (
    <span
      className="flex flex-wrap gap-1"
      aria-label={`Original extraction: ${reviewLabel(review)}, ${matchLabel(review)}${edited ? ". Edited locally." : ""}`}
    >
      <Badge>{reviewLabel(review)}</Badge>
      <Badge>{matchLabel(review)}</Badge>
      {edited ? <Badge>Edited</Badge> : null}
    </span>
  );
}

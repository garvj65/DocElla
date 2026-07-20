import type { PublicDocumentSummary } from "@docella/schemas/public";

import { Badge } from "../../components/ui/badge";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

interface SchemaSelectorProps {
  readonly onSchemaChange: (schemaId: string) => void;
  readonly schemaId: string;
  readonly summaries: readonly PublicDocumentSummary[];
}

export function SchemaSelector({ onSchemaChange, schemaId, summaries }: SchemaSelectorProps) {
  const selected = summaries.find((summary) => summary.id === schemaId);

  return (
    <div className="space-y-2">
      <Label id="schema-selector-label">Document schema</Label>
      <Select onValueChange={onSchemaChange} value={schemaId}>
        <SelectTrigger aria-labelledby="schema-selector-label">
          <SelectValue placeholder="Choose a schema" />
        </SelectTrigger>
        <SelectContent>
          {summaries.map((summary) => (
            <SelectItem key={summary.id} value={summary.id}>
              {summary.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected === undefined ? null : (
        <div className="space-y-1 text-sm text-[var(--color-muted)]">
          <p>{selected.description}</p>
          <div className="flex flex-wrap gap-2">
            <Badge>{selected.id}</Badge>
            <Badge>v{selected.version}</Badge>
          </div>
        </div>
      )}
    </div>
  );
}

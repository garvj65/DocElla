import type { PublicTemplateConfig } from "@docella/schemas/public";

import { Badge } from "../../components/ui/badge";
import { Label } from "../../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

interface TemplateSelectorProps {
  readonly onTemplateChange: (templateId: string) => void;
  readonly templateId: string;
  readonly templates: readonly PublicTemplateConfig[];
}

export function TemplateSelector({
  onTemplateChange,
  templateId,
  templates,
}: TemplateSelectorProps) {
  const selected = templates.find((template) => template.id === templateId);

  return (
    <div className="space-y-2">
      <Label id="template-selector-label">Registered template</Label>
      <Select onValueChange={onTemplateChange} value={templateId}>
        <SelectTrigger aria-labelledby="template-selector-label">
          <SelectValue placeholder="Choose a template" />
        </SelectTrigger>
        <SelectContent>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected === undefined ? null : (
        <div className="flex flex-wrap gap-2">
          <Badge>{selected.id}</Badge>
          <Badge>{selected.flattenByDefault ? "Flattened output" : "Editable output"}</Badge>
        </div>
      )}
    </div>
  );
}

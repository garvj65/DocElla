import { FileSearch } from "lucide-react";

import type { SchemaApi } from "../../api/schema-api";
import { Alert } from "../../components/ui/alert";
import { Card, CardContent, CardHeader } from "../../components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { DocumentConfigPanel } from "../document-config/document-config-panel";
import { DynamicDocumentForm } from "../dynamic-form/dynamic-document-form";

export function WorkflowTabs({ schemaApi }: { readonly schemaApi: SchemaApi }) {
  return (
    <Tabs defaultValue="form-to-pdf">
      <nav aria-label="Workflow direction">
        <TabsList>
          <TabsTrigger value="pdf-to-form">PDF to Form</TabsTrigger>
          <TabsTrigger value="form-to-pdf">Form to PDF</TabsTrigger>
        </TabsList>
      </nav>
      <TabsContent value="pdf-to-form">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <FileSearch aria-hidden="true" className="h-5 w-5 text-[var(--color-accent)]" />
              <div>
                <h2 className="text-xl font-semibold">Extraction review arrives in T09</h2>
                <p className="text-sm text-[var(--color-muted)]">
                  The supported schemas already load from the backend in this foundation.
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Alert>
              Upload controls are intentionally absent in T08, and this tab makes no extraction
              request.
            </Alert>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="form-to-pdf">
        <DocumentConfigPanel schemaApi={schemaApi}>
          {({ config, selectedTemplateId, selectedTemplateLabel }) => (
            <DynamicDocumentForm
              config={config}
              selectedTemplateId={selectedTemplateId}
              selectedTemplateLabel={selectedTemplateLabel}
            />
          )}
        </DocumentConfigPanel>
      </TabsContent>
    </Tabs>
  );
}

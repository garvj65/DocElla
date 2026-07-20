import type { ExtractionApi } from "../../api/extraction-api";
import type { SchemaApi } from "../../api/schema-api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { DocumentConfigPanel } from "../document-config/document-config-panel";
import { DynamicDocumentForm } from "../dynamic-form/dynamic-document-form";
import { ExtractionWorkspace } from "../extraction/extraction-workspace";

export function WorkflowTabs({
  extractionApi,
  schemaApi,
}: {
  readonly extractionApi: ExtractionApi;
  readonly schemaApi: SchemaApi;
}) {
  return (
    <Tabs defaultValue="form-to-pdf">
      <nav aria-label="Workflow direction">
        <TabsList>
          <TabsTrigger value="pdf-to-form">PDF to Form</TabsTrigger>
          <TabsTrigger value="form-to-pdf">Form to PDF</TabsTrigger>
        </TabsList>
      </nav>
      <TabsContent value="pdf-to-form">
        <ExtractionWorkspace extractionApi={extractionApi} schemaApi={schemaApi} />
      </TabsContent>
      <TabsContent value="form-to-pdf">
        <DocumentConfigPanel schemaApi={schemaApi}>
          {({ config, selectedTemplateId, selectedTemplateLabel }) => (
            <DynamicDocumentForm
              config={config}
              schemaApi={schemaApi}
              selectedTemplateId={selectedTemplateId}
              selectedTemplateLabel={selectedTemplateLabel}
            />
          )}
        </DocumentConfigPanel>
      </TabsContent>
    </Tabs>
  );
}

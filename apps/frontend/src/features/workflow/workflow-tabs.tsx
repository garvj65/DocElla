import type { ExtractionApi } from "../../api/extraction-api";
import type { GenericDocumentApi } from "../../api/generic-document-api";
import type { SchemaApi } from "../../api/schema-api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { DocumentConfigPanel } from "../document-config/document-config-panel";
import { DynamicDocumentForm } from "../dynamic-form/dynamic-document-form";
import { ExtractionWorkspace } from "../extraction/extraction-workspace";
import { GenericExtractionWorkspace } from "../generic-extraction/generic-extraction-workspace";

export function WorkflowTabs({
  extractionApi,
  genericDocumentApi,
  schemaApi,
}: {
  readonly extractionApi: ExtractionApi;
  readonly genericDocumentApi: GenericDocumentApi;
  readonly schemaApi: SchemaApi;
}) {
  return (
    <Tabs defaultValue="extract">
      <nav aria-label="DocElla workspace" className="mb-5 border-b border-slate-200">
        <TabsList className="min-h-11 gap-1 rounded-none border-0 bg-transparent p-0 shadow-none">
          <TabsTrigger
            className="min-h-11 rounded-none border-x-0 border-b-2 border-t-0 border-transparent bg-transparent px-4 shadow-none data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-teal-800 data-[state=active]:shadow-none"
            value="extract"
          >
            Extract
          </TabsTrigger>
          <TabsTrigger
            className="min-h-11 rounded-none border-x-0 border-b-2 border-t-0 border-transparent bg-transparent px-4 shadow-none data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-teal-800 data-[state=active]:shadow-none"
            value="template-review"
          >
            Template review
          </TabsTrigger>
          <TabsTrigger
            className="min-h-11 rounded-none border-x-0 border-b-2 border-t-0 border-transparent bg-transparent px-4 shadow-none data-[state=active]:border-teal-700 data-[state=active]:bg-transparent data-[state=active]:text-teal-800 data-[state=active]:shadow-none"
            value="create"
          >
            Create PDF
          </TabsTrigger>
        </TabsList>
      </nav>

      <TabsContent value="extract">
        <GenericExtractionWorkspace api={genericDocumentApi} />
      </TabsContent>
      <TabsContent value="template-review">
        <ExtractionWorkspace extractionApi={extractionApi} schemaApi={schemaApi} />
      </TabsContent>
      <TabsContent value="create">
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

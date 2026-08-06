import { useMemo } from "react";

import { createExtractionApi } from "./api/extraction-api";
import { createGenericDocumentApi } from "./api/generic-document-api";
import { createSchemaApi } from "./api/schema-api";
import { AppErrorBoundary } from "./app/app-error-boundary";
import { AppFooter } from "./components/app-footer";
import { AppHeader } from "./components/app-header";
import type { FrontendEnvironment } from "./config/environment";
import { WorkflowTabs } from "./features/workflow/workflow-tabs";
import "./styles.css";

export function App({ environment }: { readonly environment: FrontendEnvironment }) {
  const schemaApi = useMemo(() => createSchemaApi(environment), [environment]);
  const extractionApi = useMemo(() => createExtractionApi(environment), [environment]);
  const genericDocumentApi = useMemo(() => createGenericDocumentApi(environment), [environment]);

  return (
    <div className="min-h-screen bg-[var(--color-app)] text-[var(--color-ink)]">
      <AppHeader />
      <main className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8">
        <AppErrorBoundary>
          <WorkflowTabs
            extractionApi={extractionApi}
            genericDocumentApi={genericDocumentApi}
            schemaApi={schemaApi}
          />
        </AppErrorBoundary>
      </main>
      <AppFooter />
    </div>
  );
}

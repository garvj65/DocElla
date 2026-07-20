import { useMemo } from "react";

import { createSchemaApi } from "./api/schema-api";
import { createExtractionApi } from "./api/extraction-api";
import { AppErrorBoundary } from "./app/app-error-boundary";
import { AppFooter } from "./components/app-footer";
import { AppHeader } from "./components/app-header";
import type { FrontendEnvironment } from "./config/environment";
import { WorkflowTabs } from "./features/workflow/workflow-tabs";
import "./styles.css";

export function App({ environment }: { readonly environment: FrontendEnvironment }) {
  const schemaApi = useMemo(() => createSchemaApi(environment), [environment]);
  const extractionApi = useMemo(() => createExtractionApi(environment), [environment]);

  return (
    <div className="min-h-screen bg-[var(--color-app)] text-[var(--color-ink)]">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <AppErrorBoundary>
          <WorkflowTabs extractionApi={extractionApi} schemaApi={schemaApi} />
        </AppErrorBoundary>
      </main>
      <AppFooter />
    </div>
  );
}

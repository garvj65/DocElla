import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { createAppQueryClient } from "./app/query-client";
import { parseFrontendEnvironment } from "./config/environment";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element was not found.");
}

const queryClient = createAppQueryClient();
const environment = parseFrontendEnvironment(import.meta.env);

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App environment={environment} />
    </QueryClientProvider>
  </StrictMode>,
);

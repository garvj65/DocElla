import { QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";

import { createAppQueryClient } from "../../src/app/query-client";

export const renderWithProviders = (ui: ReactElement, options?: RenderOptions) => {
  const queryClient = createAppQueryClient();

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>, options);
};

import { QueryClient } from "@tanstack/react-query";

import { FrontendApiError } from "../api/api-error";

export const createAppQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof FrontendApiError && error.status >= 400 && error.status < 500) {
            return false;
          }

          return failureCount < 1;
        },
        staleTime: 5 * 60 * 1000,
      },
    },
  });

import type { PublicDocumentConfig } from "@docella/schemas/public";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { ExtractionApi } from "../../api/extraction-api";

export const useExtractionMutation = (extractionApi: ExtractionApi) => {
  const controllerRef = useRef<AbortController | null>(null);

  const mutation = useMutation({
    mutationFn: async ({
      config,
      file,
    }: {
      readonly config: PublicDocumentConfig;
      readonly file: File;
    }) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      return extractionApi.extract({ config, file, signal: controller.signal });
    },
    retry: false,
  });

  const cancel = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    mutation.reset();
  };

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  return { ...mutation, cancel };
};

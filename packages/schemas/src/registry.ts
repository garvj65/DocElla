import type { DocumentDefinition } from "./contracts/document-definition";
import type {
  PublicDocumentConfig,
  PublicDocumentSummary,
} from "./contracts/public-document-config";
import {
  buildPublicDocumentConfig,
  buildPublicDocumentSummary,
} from "./builders/build-public-config";
import { basicInvoiceDefinition } from "./definitions/basic-invoice";
import { jobApplicationDefinition } from "./definitions/job-application";

const freezeDefinitions = <TDefinition extends DocumentDefinition>(
  definitions: readonly TDefinition[],
): readonly TDefinition[] => {
  const ids = new Set<string>();

  for (const definition of definitions) {
    if (ids.has(definition.id)) {
      throw new Error(`Duplicate document definition id "${definition.id}" in registry.`);
    }

    ids.add(definition.id);
  }

  return Object.freeze([...definitions]);
};

const documentDefinitions = freezeDefinitions([
  jobApplicationDefinition,
  basicInvoiceDefinition,
] as const);

export const listDocumentDefinitions = (): readonly DocumentDefinition[] =>
  Object.freeze([...documentDefinitions]);

export const getDocumentDefinition = (id: string): DocumentDefinition | undefined =>
  documentDefinitions.find((definition) => definition.id === id);

export const listPublicDocumentSummaries = (): readonly PublicDocumentSummary[] =>
  Object.freeze(documentDefinitions.map(buildPublicDocumentSummary));

export const getPublicDocumentConfig = (id: string): PublicDocumentConfig | undefined => {
  const definition = getDocumentDefinition(id);

  return definition === undefined ? undefined : buildPublicDocumentConfig(definition);
};

export const assertUniqueDocumentDefinitions = (
  definitions: readonly DocumentDefinition[],
): void => {
  void freezeDefinitions(definitions);
};

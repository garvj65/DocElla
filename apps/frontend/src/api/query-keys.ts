export const schemaQueryKeys = {
  all: ["schemas"] as const,
  detail: (schemaType: string) => ["schemas", "detail", schemaType] as const,
  list: () => ["schemas", "list"] as const,
};

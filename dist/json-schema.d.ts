export type JsonSchema = {
    type?: string;
    description?: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
    additionalProperties?: boolean | JsonSchema;
    enum?: Array<string | number | boolean | null>;
    default?: unknown;
};
export declare const stringSchema: (description: string) => JsonSchema;
export declare const numberSchema: (description: string) => JsonSchema;
export declare const booleanSchema: (description: string) => JsonSchema;
export declare const objectSchema: (description: string) => JsonSchema;
export declare const arraySchema: (description: string, items?: JsonSchema) => JsonSchema;
export declare const inputObject: (properties: Record<string, JsonSchema>, required?: string[]) => JsonSchema;
export declare const commonPaging: {
    limit: JsonSchema;
    skip: JsonSchema;
};

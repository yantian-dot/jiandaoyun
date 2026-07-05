export const stringSchema = (description) => ({
    type: "string",
    description
});
export const numberSchema = (description) => ({
    type: "number",
    description
});
export const booleanSchema = (description) => ({
    type: "boolean",
    description
});
export const objectSchema = (description) => ({
    type: "object",
    description,
    additionalProperties: true
});
export const arraySchema = (description, items = {}) => ({
    type: "array",
    description,
    items
});
export const inputObject = (properties, required = []) => ({
    type: "object",
    properties,
    required,
    additionalProperties: false
});
export const commonPaging = {
    limit: numberSchema("Number of rows to return. Jiandaoyun usually supports 1-100."),
    skip: numberSchema("Number of rows to skip.")
};
//# sourceMappingURL=json-schema.js.map
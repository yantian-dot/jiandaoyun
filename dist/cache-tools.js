import { booleanSchema, inputObject, numberSchema, stringSchema } from "./json-schema.js";
import { clearNorthwestSchemaCache, getNorthwestSchemaCacheStatus, refreshNorthwestSchemaCache, summarizeNorthwestSchemaCache } from "./schema-cache.js";
export const cacheTools = [
    {
        name: "jdy_northwest_refresh_schema",
        description: "Refresh the local northwest-company schema cache by fetching app forms and widgets. Stores metadata only, never API keys or records.",
        inputSchema: inputObject({
            app_query: stringSchema("Optional northwest-company app keyword to refresh only part of the preset."),
            include_widgets: booleanSchema("Whether to fetch fields/widgets. Defaults to true."),
            limit_per_app: numberSchema("Maximum forms to fetch per app. Defaults to 100.")
        }),
        handler: async (input, client) => {
            const cache = await refreshNorthwestSchemaCache(client, {
                appQuery: optionalString(input.app_query, "app_query"),
                includeWidgets: input.include_widgets !== false,
                limitPerApp: input.limit_per_app === undefined ? undefined : boundedPositiveInt(input.limit_per_app, 100, 1, 100)
            });
            return {
                ok: true,
                cache: summarizeNorthwestSchemaCache(cache)
            };
        }
    },
    {
        name: "jdy_northwest_schema_status",
        description: "Inspect the local northwest-company schema cache status.",
        inputSchema: inputObject({}),
        handler: async () => ({
            ok: true,
            cache: await getNorthwestSchemaCacheStatus()
        })
    },
    {
        name: "jdy_northwest_clear_schema_cache",
        description: "Delete the local northwest-company schema cache.",
        inputSchema: inputObject({}),
        handler: async () => ({
            ok: true,
            deleted: await clearNorthwestSchemaCache()
        })
    }
];
function optionalString(value, field) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Expected string for ${field}.`);
    }
    return value;
}
function boundedPositiveInt(value, fallback, min, max) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
        throw new Error(`Expected number between ${min} and ${max}.`);
    }
    return Math.min(Math.floor(value), max);
}
//# sourceMappingURL=cache-tools.js.map
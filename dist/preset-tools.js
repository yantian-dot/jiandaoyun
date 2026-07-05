import { booleanSchema, inputObject, numberSchema, stringSchema } from "./json-schema.js";
import { businessPresets, northwestCompanyPreset } from "./presets.js";
export const presetTools = [
    {
        name: "jdy_preset_list",
        description: "List built-in Jiandaoyun business presets available to OpenClaw agents.",
        inputSchema: inputObject({}),
        handler: async () => ({
            presets: businessPresets.map((preset) => ({
                id: preset.id,
                name: preset.name,
                description: preset.description,
                source: preset.source,
                app_count: preset.apps.length
            }))
        })
    },
    {
        name: "jdy_preset_northwest_apps",
        description: "List or search the built-in 西北公司 app preset.",
        inputSchema: inputObject({
            query: stringSchema("Optional keyword matched against app name, app ID, and aliases.")
        }),
        handler: async (input) => {
            const query = optionalString(input.query, "query");
            const apps = filterApps(query);
            return {
                preset_id: northwestCompanyPreset.id,
                preset_name: northwestCompanyPreset.name,
                source: northwestCompanyPreset.source,
                count: apps.length,
                apps
            };
        }
    },
    {
        name: "jdy_preset_northwest_forms",
        description: "Fetch forms for built-in 西北公司 apps. Use app_query/app_id/form_query to limit scope; set include_widgets only when field details are needed.",
        inputSchema: inputObject({
            app_id: stringSchema("Optional app ID from the northwest_company preset."),
            app_query: stringSchema("Optional app keyword matched against name, app ID, and aliases."),
            form_query: stringSchema("Optional form keyword matched against form name or entry ID."),
            include_widgets: booleanSchema("Whether to fetch fields/widgets for each matched form. Defaults to false."),
            limit_per_app: numberSchema("Maximum forms to fetch per app. Defaults to 100."),
            max_apps: numberSchema("Maximum apps to inspect after filtering. Defaults to all matched apps.")
        }),
        handler: async (input, client) => {
            const apps = selectApps(input);
            const includeWidgets = input.include_widgets === true;
            const limitPerApp = boundedPositiveInt(input.limit_per_app, 100, 1, 100);
            const formQuery = optionalString(input.form_query, "form_query");
            const results = await fetchFormsForApps(client, apps, {
                formQuery,
                includeWidgets,
                limitPerApp,
                maxResults: undefined
            });
            return {
                preset_id: northwestCompanyPreset.id,
                preset_name: northwestCompanyPreset.name,
                inspected_apps: apps.length,
                form_count: results.reduce((sum, app) => sum + app.forms.length, 0),
                apps: results
            };
        }
    },
    {
        name: "jdy_preset_northwest_find_form",
        description: "Search forms across the built-in 西北公司 preset by app/form business keywords. Prefer this when the user gives natural-language business context.",
        inputSchema: inputObject({
            keyword: stringSchema("Business keyword, for example 中卫, 工作日志, 生产运维, QHSE, 安全环保."),
            include_widgets: booleanSchema("Whether to fetch fields/widgets for matched forms. Defaults to false."),
            limit_per_app: numberSchema("Maximum forms to fetch per inspected app. Defaults to 100."),
            max_results: numberSchema("Maximum matched forms to return. Defaults to 50.")
        }, ["keyword"]),
        handler: async (input, client) => {
            const keyword = requireString(input.keyword, "keyword");
            const includeWidgets = input.include_widgets === true;
            const limitPerApp = boundedPositiveInt(input.limit_per_app, 100, 1, 100);
            const maxResults = boundedPositiveInt(input.max_results, 50, 1, 500);
            const appMatches = filterApps(keyword);
            const apps = appMatches.length > 0 ? appMatches : northwestCompanyPreset.apps;
            const results = await fetchFormsForApps(client, apps, {
                formQuery: appMatches.length > 0 ? undefined : keyword,
                includeWidgets,
                limitPerApp,
                maxResults
            });
            const matches = flattenForms(results)
                .filter((item) => appMatches.length > 0 || matchesEntry(keyword, item.entry))
                .slice(0, maxResults);
            return {
                preset_id: northwestCompanyPreset.id,
                preset_name: northwestCompanyPreset.name,
                keyword,
                inspected_apps: apps.length,
                match_count: matches.length,
                matches
            };
        }
    }
];
async function fetchFormsForApps(client, apps, options) {
    const results = [];
    let total = 0;
    for (const app of apps) {
        if (options.maxResults !== undefined && total >= options.maxResults)
            break;
        const entries = await fetchAllEntries(client, app.app_id, options.limitPerApp);
        const formQuery = options.formQuery;
        const filtered = formQuery ? entries.filter((entry) => matchesEntry(formQuery, entry)) : entries;
        const forms = [];
        for (const entry of filtered) {
            if (options.maxResults !== undefined && total >= options.maxResults)
                break;
            const form = { entry };
            const entryId = readIdentity(entry, ["entry_id", "_id", "id"]);
            if (options.includeWidgets && entryId) {
                const widgetsResponse = await client.post("/api/v5/app/entry/widget/list", {
                    app_id: app.app_id,
                    entry_id: entryId
                });
                form.widgets = extractItems(widgetsResponse);
            }
            forms.push(form);
            total += 1;
        }
        results.push({ app, forms });
    }
    return results;
}
async function fetchAllEntries(client, appId, limit) {
    const entries = [];
    let skip = 0;
    while (true) {
        const response = await client.post("/api/v5/app/entry/list", {
            app_id: appId,
            limit,
            skip
        });
        const page = extractItems(response);
        entries.push(...page);
        if (page.length < limit || page.length === 0)
            break;
        skip += page.length;
    }
    return entries;
}
function selectApps(input) {
    const appId = optionalString(input.app_id, "app_id");
    const query = optionalString(input.app_query, "app_query");
    const maxApps = input.max_apps === undefined ? undefined : boundedPositiveInt(input.max_apps, northwestCompanyPreset.apps.length, 1, northwestCompanyPreset.apps.length);
    const apps = appId ? northwestCompanyPreset.apps.filter((app) => app.app_id === appId) : filterApps(query);
    return maxApps === undefined ? apps : apps.slice(0, maxApps);
}
function filterApps(query) {
    if (!query)
        return northwestCompanyPreset.apps;
    const terms = tokenize(query);
    return northwestCompanyPreset.apps.filter((app) => {
        const searchable = normalize([app.name, app.app_id, app.group, ...app.aliases].join(" "));
        return terms.every((term) => searchable.includes(term));
    });
}
function flattenForms(results) {
    return results.flatMap((appResult) => appResult.forms.map((form) => {
        const entry = isObject(form.entry) ? form.entry : {};
        return {
            app: appResult.app,
            entry,
            ...(form.widgets === undefined ? {} : { widgets: form.widgets })
        };
    }));
}
function matchesEntry(query, entry) {
    const terms = tokenize(query);
    const searchable = normalize([
        readIdentity(entry, ["entry_id", "_id", "id"]),
        readIdentity(entry, ["name", "entry_name", "title"])
    ]
        .filter(Boolean)
        .join(" "));
    return terms.every((term) => searchable.includes(term));
}
function extractItems(value) {
    const found = findFirstArray(value, new Set());
    return found.filter(isObject);
}
function findFirstArray(value, seen) {
    if (Array.isArray(value))
        return value;
    if (!isObject(value) || seen.has(value))
        return [];
    seen.add(value);
    for (const key of ["entries", "entry_list", "forms", "widgets", "fields", "data", "result", "items", "list"]) {
        const child = value[key];
        if (Array.isArray(child))
            return child;
        const nested = findFirstArray(child, seen);
        if (nested.length > 0)
            return nested;
    }
    return [];
}
function requireString(value, field) {
    const result = optionalString(value, field);
    if (!result)
        throw new Error(`Expected non-empty string for ${field}.`);
    return result;
}
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
function readIdentity(record, keys) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.length > 0)
            return value;
    }
    return undefined;
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function tokenize(value) {
    const normalized = normalize(value);
    const parts = normalized.split(/\s+/).filter(Boolean);
    return parts.length > 0 ? parts : [normalized];
}
function normalize(value) {
    return value.trim().toLowerCase();
}
//# sourceMappingURL=preset-tools.js.map
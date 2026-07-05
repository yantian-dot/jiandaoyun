import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { northwestCompanyPreset } from "./presets.js";
export function getSchemaCachePath() {
    return process.env.JIANDAOYUN_SCHEMA_CACHE_PATH ?? join(homedir(), ".jiandaoyun-mcp", "cache", "northwest-schema.json");
}
export async function readNorthwestSchemaCache(cachePath = getSchemaCachePath()) {
    try {
        const raw = await readFile(cachePath, "utf8");
        return JSON.parse(raw);
    }
    catch (error) {
        if (isNotFound(error))
            return undefined;
        throw error;
    }
}
export async function writeNorthwestSchemaCache(cache, cachePath = getSchemaCachePath()) {
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}
export async function clearNorthwestSchemaCache(cachePath = getSchemaCachePath()) {
    try {
        await rm(cachePath, { force: true });
        return true;
    }
    catch (error) {
        if (isNotFound(error))
            return false;
        throw error;
    }
}
export async function getNorthwestSchemaCacheStatus(cachePath = getSchemaCachePath()) {
    const cache = await readNorthwestSchemaCache(cachePath);
    let fileSize;
    if (cache) {
        try {
            fileSize = (await stat(cachePath)).size;
        }
        catch {
            fileSize = undefined;
        }
    }
    return {
        path: cachePath,
        exists: cache !== undefined,
        generated_at: cache?.generated_at,
        preset_id: cache?.preset_id,
        app_count: cache?.apps.length ?? 0,
        form_count: cache ? countForms(cache) : 0,
        widget_count: cache ? countWidgets(cache) : 0,
        file_size_bytes: fileSize
    };
}
export async function refreshNorthwestSchemaCache(client, options = {}, cachePath = getSchemaCachePath()) {
    const includeWidgets = options.includeWidgets !== false;
    const limitPerApp = options.limitPerApp ?? 100;
    const apps = selectApps(options.appQuery);
    const cachedApps = [];
    for (const app of apps) {
        const entries = await fetchAllEntries(client, app.app_id, limitPerApp);
        const cachedEntries = [];
        for (const entry of entries) {
            const entryId = readIdentity(entry, ["entry_id", "_id", "id"]);
            const widgets = includeWidgets && entryId ? await fetchWidgets(client, app.app_id, entryId) : [];
            cachedEntries.push({
                entry,
                entry_id: entryId,
                widgets
            });
        }
        cachedApps.push({
            app,
            entries: cachedEntries
        });
    }
    const cache = {
        version: 1,
        preset_id: "northwest_company",
        generated_at: new Date().toISOString(),
        base_url: readClientBaseUrl(client),
        apps: cachedApps
    };
    await writeNorthwestSchemaCache(cache, cachePath);
    return cache;
}
export function summarizeNorthwestSchemaCache(cache) {
    return {
        preset_id: cache.preset_id,
        generated_at: cache.generated_at,
        base_url: cache.base_url,
        app_count: cache.apps.length,
        form_count: countForms(cache),
        widget_count: countWidgets(cache)
    };
}
function selectApps(query) {
    if (!query)
        return northwestCompanyPreset.apps;
    const terms = tokenize(query);
    return northwestCompanyPreset.apps.filter((app) => {
        const searchable = normalize([app.name, app.app_id, app.group, ...app.aliases].join(" "));
        return terms.every((term) => searchable.includes(term));
    });
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
async function fetchWidgets(client, appId, entryId) {
    const response = await client.post("/api/v5/app/entry/widget/list", {
        app_id: appId,
        entry_id: entryId
    });
    return extractItems(response);
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
function countForms(cache) {
    return cache.apps.reduce((sum, app) => sum + app.entries.length, 0);
}
function countWidgets(cache) {
    return cache.apps.reduce((sum, app) => sum + app.entries.reduce((entrySum, entry) => entrySum + entry.widgets.length, 0), 0);
}
function readClientBaseUrl(client) {
    const maybeSummary = client;
    return typeof maybeSummary.getConfigSummary === "function" ? maybeSummary.getConfigSummary().baseUrl : undefined;
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
function isNotFound(error) {
    return isObject(error) && error.code === "ENOENT";
}
function tokenize(value) {
    const normalized = normalize(value);
    const parts = normalized.split(/\s+/).filter(Boolean);
    return parts.length > 0 ? parts : [normalized];
}
function normalize(value) {
    return value.trim().toLowerCase();
}
//# sourceMappingURL=schema-cache.js.map
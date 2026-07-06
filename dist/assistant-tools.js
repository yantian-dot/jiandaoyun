import { arraySchema, booleanSchema, inputObject, numberSchema, objectSchema, stringSchema } from "./json-schema.js";
import { existsSync, readFileSync } from "node:fs";
const stringArray = (description) => arraySchema(description, { type: "string" });
export const assistantTools = [
    {
        name: "jdy_assistant_check_connection",
        description: "Check Jiandaoyun environment configuration and optionally probe read-only app access. Use this before business operations.",
        inputSchema: inputObject({
            probe: booleanSchema("Whether to call the read-only app list API. Defaults to true.")
        }),
        handler: async (input, client) => {
            const probe = input.probe !== false;
            const config = getClientSummary(client);
            if (!probe) {
                return {
                    ok: true,
                    config,
                    probe_skipped: true
                };
            }
            const result = await client.post("/api/v5/app/list", { limit: 1, skip: 0 });
            return {
                ok: true,
                config,
                probe: {
                    path: "/api/v5/app/list",
                    result
                }
            };
        }
    },
    {
        name: "jdy_assistant_discover",
        description: "Discover applications, forms, and optionally fields by app/form ID or display name. Prefer this before querying or writing form data.",
        inputSchema: inputObject({
            app_id: stringSchema("Known Jiandaoyun application ID. If omitted, app list will be searched."),
            app_name: stringSchema("Application display name keyword."),
            entry_id: stringSchema("Known Jiandaoyun form ID."),
            entry_name: stringSchema("Form display name keyword."),
            include_widgets: booleanSchema("Whether to include fields/widgets for matched forms."),
            limit: numberSchema("Maximum number of apps/forms to inspect. Defaults to 20.")
        }),
        handler: async (input, client) => {
            const limit = positiveInt(input.limit, 20);
            const appFilter = optionalString(input.app_name, "app_name");
            const entryFilter = optionalString(input.entry_name, "entry_name");
            const appId = optionalString(input.app_id, "app_id");
            const entryId = optionalString(input.entry_id, "entry_id");
            const includeWidgets = input.include_widgets === true;
            const appsResponse = appId ? { apps: [{ app_id: appId }] } : await client.post("/api/v5/app/list", { limit, skip: 0 });
            const apps = filterByIdOrName(extractItems(appsResponse), appId, appFilter, appIdentity).slice(0, limit);
            const discovered = [];
            for (const app of apps) {
                const resolvedAppId = readIdentity(app, ["app_id", "_id", "id"]);
                if (!resolvedAppId) {
                    discovered.push({ app, warning: "Could not resolve app_id from this app object." });
                    continue;
                }
                const entriesResponse = await client.post("/api/v5/app/entry/list", { app_id: resolvedAppId, limit, skip: 0 });
                const entries = filterByIdOrName(extractItems(entriesResponse), entryId, entryFilter, entryIdentity).slice(0, limit);
                const entryResults = [];
                for (const entry of entries) {
                    const resolvedEntryId = readIdentity(entry, ["entry_id", "_id", "id"]);
                    const result = { entry };
                    if (includeWidgets && resolvedEntryId) {
                        const widgetsResponse = await client.post("/api/v5/app/entry/widget/list", {
                            app_id: resolvedAppId,
                            entry_id: resolvedEntryId
                        });
                        result.widgets = extractItems(widgetsResponse);
                    }
                    entryResults.push(result);
                }
                discovered.push({
                    app,
                    entries: entryResults
                });
            }
            return {
                ok: true,
                matched_apps: apps.length,
                query: compactObject({ app_id: appId, app_name: appFilter, entry_id: entryId, entry_name: entryFilter, include_widgets: includeWidgets }),
                discovered
            };
        }
    },
    {
        name: "jdy_assistant_read_records",
        description: "Read form records with optional field display-name mapping. Use field_labels when users know Chinese field names instead of _widget IDs.",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID."),
            fields: stringArray("Field IDs such as _widget_123 to return."),
            field_labels: stringArray("Field labels/display names to resolve through widget list."),
            filter: objectSchema("Jiandaoyun data filter object."),
            data_id: stringSchema("Pagination cursor. Use previous result's last data ID."),
            limit: numberSchema("Number of records to return, usually 1-100.")
        }, ["app_id", "entry_id"]),
        handler: async (input, client) => {
            const appId = requireString(input.app_id, "app_id");
            const entryId = requireString(input.entry_id, "entry_id");
            const fields = readStringArray(input.fields, "fields");
            const labels = readStringArray(input.field_labels, "field_labels");
            const resolved = labels.length > 0 ? await resolveFieldNames(client, appId, entryId, labels) : emptyFieldResolution();
            const allFields = uniqueStrings([...fields, ...resolved.fields]);
            const body = compactObject({
                app_id: appId,
                entry_id: entryId,
                data_id: optionalString(input.data_id, "data_id"),
                fields: allFields.length > 0 ? allFields : undefined,
                filter: input.filter === undefined ? undefined : asObject(input.filter, "filter"),
                limit: input.limit === undefined ? undefined : positiveInt(input.limit, 100)
            });
            const result = await client.post("/api/v5/app/entry/data/list", body);
            return {
                ok: true,
                request: body,
                resolved_fields: resolved,
                result
            };
        }
    },
    {
        name: "jdy_assistant_create_record",
        description: "Create one form record from user-friendly field labels or field IDs. Values are converted to Jiandaoyun { value } data shape after required/business-required field validation. When called from WeACT/OpenClaw, pass data_creator, initiator_username, initiator_open_id, or initiator_name whenever the requester is known; otherwise Jiandaoyun may use its default creator.",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID."),
            values: objectSchema("Record values keyed by field ID or field display label."),
            data_creator: stringSchema("Optional submitter username."),
            initiator_username: stringSchema("Optional Jiandaoyun username of the upstream requester. Used as data_creator when data_creator is omitted."),
            initiator_open_id: stringSchema("Optional upstream requester open_id. Resolved through JIANDAOYUN_USER_MAP_JSON or JIANDAOYUN_USER_MAP_FILE."),
            initiator_name: stringSchema("Optional upstream requester display name. Resolved through JIANDAOYUN_USER_MAP_JSON or JIANDAOYUN_USER_MAP_FILE."),
            requester_username: stringSchema("Optional alias of initiator_username."),
            requester_open_id: stringSchema("Optional alias of initiator_open_id."),
            requester_name: stringSchema("Optional alias of initiator_name."),
            sender_open_id: stringSchema("Optional WeACT SenderId alias of initiator_open_id."),
            sender_name: stringSchema("Optional WeACT sender display-name alias of initiator_name."),
            user_open_id: stringSchema("Optional current user open_id alias of initiator_open_id."),
            user_name: stringSchema("Optional current user display-name alias of initiator_name."),
            omit_empty_fields: booleanSchema("Omit blank values before create/update. Defaults to true."),
            clear_fields: stringArray("Field labels or IDs to explicitly clear by writing an empty value."),
            allow_blank_fields: stringArray("Field labels or IDs allowed to be written as blank values."),
            required_fields: stringArray("Additional business-required field labels or IDs that must be non-empty before create."),
            validate_required_fields: booleanSchema("Check required fields before create. Defaults to true."),
            reject_unresolved_fields: booleanSchema("Reject values whose labels cannot be resolved to Jiandaoyun fields. Defaults to true."),
            is_start_workflow: booleanSchema("Whether to start workflow for workflow forms."),
            is_start_trigger: booleanSchema("Whether to trigger Jiandaoyun assistant."),
            transaction_id: stringSchema("Optional transaction ID, required when binding uploaded files.")
        }, ["app_id", "entry_id", "values"]),
        handler: async (input, client) => {
            const appId = requireString(input.app_id, "app_id");
            const entryId = requireString(input.entry_id, "entry_id");
            const values = asObject(input.values, "values");
            const mapped = await mapValuesToJdyData(client, appId, entryId, values, readWriteOptions(input, "create", appId, entryId));
            const body = compactObject({
                app_id: appId,
                entry_id: entryId,
                data: mapped.data,
                data_creator: resolveDataCreator(input),
                is_start_workflow: optionalBoolean(input.is_start_workflow, "is_start_workflow"),
                is_start_trigger: optionalBoolean(input.is_start_trigger, "is_start_trigger"),
                transaction_id: optionalString(input.transaction_id, "transaction_id")
            });
            const result = await client.post("/api/v5/app/entry/data/create", body);
            return {
                ok: true,
                resolved_fields: mapped.resolution,
                request: body,
                result
            };
        }
    },
    {
        name: "jdy_assistant_update_record",
        description: "Update one form record from user-friendly field labels or field IDs. Values are converted to Jiandaoyun { value } data shape.",
        inputSchema: inputObject({
            app_id: stringSchema("Jiandaoyun application ID."),
            entry_id: stringSchema("Jiandaoyun form ID."),
            data_id: stringSchema("Jiandaoyun data record ID."),
            values: objectSchema("Updated values keyed by field ID or field display label."),
            omit_empty_fields: booleanSchema("Omit blank values before create/update. Defaults to true."),
            clear_fields: stringArray("Field labels or IDs to explicitly clear by writing an empty value."),
            allow_blank_fields: stringArray("Field labels or IDs allowed to be written as blank values."),
            reject_unresolved_fields: booleanSchema("Reject values whose labels cannot be resolved to Jiandaoyun fields. Defaults to true."),
            is_start_trigger: booleanSchema("Whether to trigger Jiandaoyun assistant."),
            transaction_id: stringSchema("Optional transaction ID, required when binding uploaded files.")
        }, ["app_id", "entry_id", "data_id", "values"]),
        handler: async (input, client) => {
            const appId = requireString(input.app_id, "app_id");
            const entryId = requireString(input.entry_id, "entry_id");
            const values = asObject(input.values, "values");
            const mapped = await mapValuesToJdyData(client, appId, entryId, values, readWriteOptions(input, "update", appId, entryId));
            const body = compactObject({
                app_id: appId,
                entry_id: entryId,
                data_id: requireString(input.data_id, "data_id"),
                data: mapped.data,
                is_start_trigger: optionalBoolean(input.is_start_trigger, "is_start_trigger"),
                transaction_id: optionalString(input.transaction_id, "transaction_id")
            });
            const result = await client.post("/api/v5/app/entry/data/update", body);
            return {
                ok: true,
                resolved_fields: mapped.resolution,
                request: body,
                result
            };
        }
    },
    {
        name: "jdy_assistant_todo_summary",
        description: "Read workflow todo tasks and return a compact summary plus raw result. This is safer than directly approving tasks.",
        inputSchema: inputObject({
            body: objectSchema("Jiandaoyun workflow task list request body.")
        }),
        handler: async (input, client) => {
            const body = input.body === undefined ? {} : asObject(input.body, "body");
            const result = await client.post("/api/v6/workflow/task/list", body);
            const tasks = extractItems(result);
            return {
                ok: true,
                count: tasks.length,
                tasks: tasks.map(summarizeTask),
                result
            };
        }
    }
];
function readWriteOptions(input, mode, appId, entryId) {
    const configuredRequiredFields = mode === "create" ? getConfiguredRequiredFields(appId, entryId) : [];
    return {
        mode,
        omitEmptyFields: input.omit_empty_fields !== false,
        clearFields: readStringArray(input.clear_fields, "clear_fields"),
        allowBlankFields: readStringArray(input.allow_blank_fields, "allow_blank_fields"),
        requiredFields: uniqueStrings([...configuredRequiredFields, ...readStringArray(input.required_fields, "required_fields")]),
        validateRequiredFields: input.validate_required_fields !== false,
        rejectUnresolvedFields: input.reject_unresolved_fields !== false
    };
}
async function mapValuesToJdyData(client, appId, entryId, values, options) {
    const keys = Object.keys(values);
    const widgetsResponse = await client.post("/api/v5/app/entry/widget/list", { app_id: appId, entry_id: entryId });
    const widgets = extractItems(widgetsResponse);
    const resolution = resolveFieldNamesFromWidgets(widgets, keys);
    const clearResolution = resolveFieldNamesFromWidgets(widgets, options.clearFields);
    const allowBlankResolution = resolveFieldNamesFromWidgets(widgets, options.allowBlankFields);
    const unresolved = uniqueStrings([...resolution.unresolved, ...clearResolution.unresolved, ...allowBlankResolution.unresolved]);
    if (options.rejectUnresolvedFields && unresolved.length > 0) {
        throw new Error(`Unresolved Jiandaoyun field label(s): ${unresolved.join(", ")}. Use jdy_assistant_discover or field IDs before writing.`);
    }
    const allowBlank = new Set([...Object.values(allowBlankResolution.by_input), ...options.allowBlankFields]);
    const data = {};
    const omittedEmptyFields = [];
    for (const [labelOrField, rawValue] of Object.entries(values)) {
        const field = resolution.by_input[labelOrField] ?? labelOrField;
        if (options.omitEmptyFields && isBlankJdyValue(rawValue) && !allowBlank.has(field) && !allowBlank.has(labelOrField)) {
            omittedEmptyFields.push(labelOrField);
            continue;
        }
        data[field] = isValueObject(rawValue) ? rawValue : { value: rawValue };
    }
    for (const labelOrField of options.clearFields) {
        const field = clearResolution.by_input[labelOrField] ?? labelOrField;
        data[field] = { value: "" };
    }
    let missingRequiredFields = [];
    if (options.mode === "create" && options.validateRequiredFields) {
        missingRequiredFields = findMissingRequiredFields(widgets, data);
        missingRequiredFields = mergeMissingFields(missingRequiredFields, findMissingConfiguredRequiredFields(widgets, data, options.requiredFields));
        if (missingRequiredFields.length > 0) {
            throw new Error(`缺少必填字段：${missingRequiredFields.map((field) => field.label).join("、")}。请先向用户追问这些字段，补齐后再创建记录；不要用空值或占位值写入。`);
        }
    }
    if (Object.keys(data).length === 0) {
        throw new Error("No writable Jiandaoyun fields remain after omitting blank values. Provide at least one non-empty value or use clear_fields explicitly.");
    }
    return {
        data,
        resolution: {
            ...resolution,
            unresolved,
            omitted_empty_fields: omittedEmptyFields,
            clear_fields: clearResolution.by_input,
            allow_blank_fields: allowBlankResolution.by_input,
            missing_required_fields: missingRequiredFields
        }
    };
}
async function resolveFieldNames(client, appId, entryId, labels) {
    if (labels.length === 0)
        return emptyFieldResolution();
    const widgetsResponse = await client.post("/api/v5/app/entry/widget/list", { app_id: appId, entry_id: entryId });
    const widgets = extractItems(widgetsResponse);
    return resolveFieldNamesFromWidgets(widgets, labels);
}
function resolveFieldNamesFromWidgets(widgets, labels) {
    if (labels.length === 0)
        return emptyFieldResolution();
    const fieldMap = createFieldMap(widgets);
    const byInput = {};
    const unresolved = [];
    for (const label of labels) {
        const resolved = fieldMap.get(normalize(label));
        if (resolved) {
            byInput[label] = resolved;
        }
        else if (looksLikeFieldId(label)) {
            byInput[label] = label;
        }
        else {
            unresolved.push(label);
            byInput[label] = label;
        }
    }
    return {
        by_input: byInput,
        fields: uniqueStrings(Object.values(byInput)),
        unresolved,
        widgets_seen: widgets.length
    };
}
function findMissingRequiredFields(widgets, data) {
    const missing = [];
    for (const widget of widgets) {
        if (!isObject(widget) || !isRequiredWidget(widget))
            continue;
        const fieldId = readIdentity(widget, ["name", "widget_id", "field_id", "_id", "id"]);
        if (!fieldId)
            continue;
        if (!Object.prototype.hasOwnProperty.call(data, fieldId) || isBlankJdyValue(data[fieldId])) {
            missing.push({ field_id: fieldId, label: readIdentity(widget, ["label", "title", "name", "widget_id", "field_id"]) ?? fieldId });
        }
    }
    return missing;
}
function findMissingConfiguredRequiredFields(widgets, data, requiredFields) {
    if (requiredFields.length === 0)
        return [];
    const resolution = resolveFieldNamesFromWidgets(widgets, requiredFields);
    if (resolution.unresolved.length > 0) {
        throw new Error(`Configured required Jiandaoyun field label(s) cannot be resolved: ${resolution.unresolved.join(", ")}. Check JIANDAOYUN_REQUIRED_FIELDS_JSON or required_fields.`);
    }
    const missing = [];
    for (const labelOrField of requiredFields) {
        const fieldId = resolution.by_input[labelOrField] ?? labelOrField;
        if (!Object.prototype.hasOwnProperty.call(data, fieldId) || isBlankJdyValue(data[fieldId])) {
            missing.push({ field_id: fieldId, label: labelOrField });
        }
    }
    return missing;
}
function mergeMissingFields(...groups) {
    const seen = new Set();
    const merged = [];
    for (const group of groups) {
        for (const field of group) {
            const key = field.field_id || field.label;
            if (seen.has(key))
                continue;
            seen.add(key);
            merged.push(field);
        }
    }
    return merged;
}
function isRequiredWidget(widget) {
    return isRequiredValue(widget.required) ||
        isRequiredValue(widget.is_required) ||
        isRequiredValue(widget.required_field) ||
        isRequiredValue(widget.isRequired) ||
        hasRequiredFlag(widget.validator) ||
        hasRequiredFlag(widget.validate) ||
        hasRequiredFlag(widget.validation) ||
        hasRequiredFlag(widget.setting) ||
        hasRequiredFlag(widget.settings) ||
        hasRequiredFlag(widget.field_setting) ||
        hasRequiredFlag(widget.props) ||
        hasRequiredRule(widget.rules);
}
function hasRequiredFlag(value) {
    return isObject(value) && (isRequiredValue(value.required) ||
        isRequiredValue(value.is_required) ||
        isRequiredValue(value.required_field) ||
        isRequiredValue(value.isRequired));
}
function hasRequiredRule(value) {
    if (isRequiredValue(value))
        return true;
    if (Array.isArray(value))
        return value.some((item) => isRequiredValue(item) || hasRequiredFlag(item));
    return hasRequiredFlag(value);
}
function isRequiredValue(value) {
    if (value === true || value === 1)
        return true;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        return normalized === "true" || normalized === "1" || normalized === "required" || normalized === "yes" || normalized === "必填";
    }
    return false;
}
function isBlankJdyValue(value) {
    const actual = isValueObject(value) ? value.value : value;
    if (actual === undefined || actual === null)
        return true;
    if (typeof actual === "string")
        return actual.trim().length === 0;
    if (Array.isArray(actual))
        return actual.length === 0;
    if (isObject(actual))
        return Object.keys(actual).length === 0;
    return false;
}
function createFieldMap(widgets) {
    const map = new Map();
    for (const widget of widgets) {
        if (!isObject(widget))
            continue;
        const fieldId = readIdentity(widget, ["name", "widget_id", "field_id", "_id", "id"]);
        if (!fieldId)
            continue;
        for (const key of ["name", "widget_id", "field_id", "_id", "id", "label", "title"]) {
            const value = readString(widget[key]);
            if (value)
                map.set(normalize(value), fieldId);
        }
    }
    return map;
}
function emptyFieldResolution() {
    return {
        by_input: {},
        fields: [],
        unresolved: [],
        widgets_seen: 0
    };
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
    for (const key of ["apps", "app_list", "entries", "entry_list", "widgets", "fields", "tasks", "data", "data_list", "result", "items", "list"]) {
        const child = value[key];
        if (Array.isArray(child))
            return child;
        const nested = findFirstArray(child, seen);
        if (nested.length > 0)
            return nested;
    }
    return [];
}
function filterByIdOrName(items, id, name, identity) {
    if (!id && !name)
        return items;
    const normalizedName = name ? normalize(name) : undefined;
    return items.filter((item) => {
        const candidate = identity(item);
        if (id && candidate.id === id)
            return true;
        if (!normalizedName)
            return false;
        const itemName = candidate.name ? normalize(candidate.name) : "";
        return itemName.includes(normalizedName);
    });
}
function appIdentity(item) {
    return {
        id: readIdentity(item, ["app_id", "_id", "id"]),
        name: readIdentity(item, ["name", "app_name", "title"])
    };
}
function entryIdentity(item) {
    return {
        id: readIdentity(item, ["entry_id", "_id", "id"]),
        name: readIdentity(item, ["name", "entry_name", "title"])
    };
}
function summarizeTask(task) {
    return compactObject({
        task_id: readIdentity(task, ["task_id", "id", "_id"]),
        instance_id: readIdentity(task, ["instance_id", "flow_instance_id"]),
        app_id: readIdentity(task, ["app_id"]),
        entry_id: readIdentity(task, ["entry_id"]),
        title: readIdentity(task, ["title", "name", "entry_name", "flow_name"]),
        status: readIdentity(task, ["status", "state"]),
        create_time: readIdentity(task, ["create_time", "created_at"])
    });
}
function getClientSummary(client) {
    const maybeSummary = client;
    return typeof maybeSummary.getConfigSummary === "function" ? maybeSummary.getConfigSummary() : { available: true };
}
const builtInRequiredFields = {
    "669501b6c47c535dfe561619/6743d2b19d81b4a42b36e4d9": ["启机原因", "作业位置", "启动设备", "开始时间"]
};
function getConfiguredRequiredFields(appId, entryId) {
    const keys = uniqueStrings([
        appId && entryId ? `${appId}/${entryId}` : undefined,
        entryId
    ].filter(Boolean));
    const fields = [];
    for (const key of keys) {
        fields.push(...(builtInRequiredFields[key] ?? []));
    }
    const configured = readRequiredFieldConfig();
    for (const key of keys) {
        fields.push(...readStringList(configured[key]));
    }
    return uniqueStrings(fields);
}
function readRequiredFieldConfig() {
    const raw = process.env.JIANDAOYUN_REQUIRED_FIELDS_JSON;
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            return isObject(parsed) ? parsed : {};
        }
        catch {
            return {};
        }
    }
    const path = process.env.JIANDAOYUN_REQUIRED_FIELDS_FILE ?? `${process.env.HOME ?? ""}/.openclaw-main/jiandaoyun-required-fields.json`;
    if (!path || !existsSync(path))
        return {};
    try {
        const parsed = JSON.parse(readFileSync(path, "utf8"));
        return isObject(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
}
function readStringList(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}
function resolveDataCreator(input) {
    const explicit = optionalString(input.data_creator, "data_creator") ??
        optionalString(input.initiator_username, "initiator_username") ??
        optionalString(input.requester_username, "requester_username");
    if (explicit)
        return explicit;
    const fallback = envString("JIANDAOYUN_DEFAULT_DATA_CREATOR");
    const candidates = [
        optionalString(input.initiator_open_id, "initiator_open_id"),
        optionalString(input.requester_open_id, "requester_open_id"),
        optionalString(input.sender_open_id, "sender_open_id"),
        optionalString(input.user_open_id, "user_open_id"),
        optionalString(input.initiator_name, "initiator_name"),
        optionalString(input.requester_name, "requester_name"),
        optionalString(input.sender_name, "sender_name"),
        optionalString(input.user_name, "user_name")
    ].filter(Boolean);
    if (candidates.length === 0)
        return fallback;
    const creatorMap = readCreatorMap();
    for (const key of candidates) {
        const mapped = creatorMap[key];
        if (typeof mapped === "string" && mapped.trim().length > 0)
            return mapped.trim();
    }
    return fallback;
}
function envString(name) {
    const value = process.env[name];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
function readCreatorMap() {
    const raw = process.env.JIANDAOYUN_USER_MAP_JSON;
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            return isObject(parsed) ? parsed : {};
        }
        catch {
            return {};
        }
    }
    const path = process.env.JIANDAOYUN_USER_MAP_FILE ?? `${process.env.HOME ?? ""}/.openclaw-main/jiandaoyun-user-map.json`;
    if (!path || !existsSync(path))
        return {};
    try {
        const parsed = JSON.parse(readFileSync(path, "utf8"));
        return isObject(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
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
function optionalBoolean(value, field) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== "boolean") {
        throw new Error(`Expected boolean for ${field}.`);
    }
    return value;
}
function positiveInt(value, fallback) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        throw new Error("Expected positive number.");
    }
    return Math.floor(value);
}
function readStringArray(value, field) {
    if (value === undefined || value === null)
        return [];
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
        throw new Error(`Expected string array for ${field}.`);
    }
    return value;
}
function asObject(value, field) {
    if (!isObject(value)) {
        throw new Error(`Expected object for ${field}.`);
    }
    return value;
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isValueObject(value) {
    return isObject(value) && Object.prototype.hasOwnProperty.call(value, "value");
}
function readIdentity(record, keys) {
    for (const key of keys) {
        const value = readString(record[key]);
        if (value)
            return value;
    }
    return undefined;
}
function readString(value) {
    return typeof value === "string" && value.length > 0 ? value : undefined;
}
function looksLikeFieldId(value) {
    return value.startsWith("_widget_") || value.startsWith("widget_");
}
function normalize(value) {
    return value.trim().toLowerCase();
}
function uniqueStrings(values) {
    return [...new Set(values)];
}
function compactObject(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
//# sourceMappingURL=assistant-tools.js.map

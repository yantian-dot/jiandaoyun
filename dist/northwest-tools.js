import { arraySchema, booleanSchema, inputObject, numberSchema, objectSchema, stringSchema } from "./json-schema.js";
import { northwestCompanyPreset } from "./presets.js";
import { existsSync, readFileSync } from "node:fs";
import { resolveDataCreator as resolveIdentityDataCreator } from "./creator-resolver.js";
import { resolveJdyFieldValue } from "./value-resolver.js";
const stringArray = (description) => arraySchema(description, { type: "string" });
export const northwestTools = [
    {
        name: "jdy_openclaw_doctor",
        description: "Run an OpenClaw-oriented Jiandaoyun health check for configuration, API probing, and northwest-company preset integrity.",
        inputSchema: inputObject({
            probe: booleanSchema("Whether to call the read-only app list API. Defaults to true.")
        }),
        handler: async (input, client) => {
            const config = getClientSummary(client);
            const checks = [
                {
                    name: "api_key",
                    ok: config.hasApiKey === true,
                    detail: config.hasApiKey === true ? "JIANDAOYUN_API_KEY is present." : "JIANDAOYUN_API_KEY is missing."
                },
                {
                    name: "base_url",
                    ok: config.baseUrl === "https://nocode.pipechina.com.cn",
                    detail: `baseUrl=${config.baseUrl ?? "unknown"}`
                },
                {
                    name: "northwest_company_preset",
                    ok: northwestCompanyPreset.apps.length === 21,
                    detail: `app_count=${northwestCompanyPreset.apps.length}`
                }
            ];
            if (input.probe !== false) {
                try {
                    const result = await client.post("/api/v5/app/list", { limit: 1, skip: 0 });
                    checks.push({
                        name: "readonly_probe",
                        ok: true,
                        detail: "POST /api/v5/app/list succeeded.",
                        sample: result
                    });
                }
                catch (error) {
                    checks.push({
                        name: "readonly_probe",
                        ok: false,
                        detail: error instanceof Error ? error.message : String(error)
                    });
                }
            }
            return {
                ok: checks.every((check) => check.ok === true),
                status: checks.every((check) => check.ok === true) ? "healthy" : "needs_attention",
                config,
                checks
            };
        }
    },
    {
        name: "jdy_northwest_get_form_context",
        description: "Resolve northwest-company app/form context and return matched forms with fields. Use before read/write when the target form is unclear.",
        inputSchema: inputObject({
            app_id: stringSchema("Optional app ID in the northwest_company preset."),
            app_query: stringSchema("Optional app keyword, for example 中卫, QHSE, 生产运维."),
            entry_id: stringSchema("Optional form/entry ID."),
            form_query: stringSchema("Optional form keyword, for example 工作日志."),
            include_widgets: booleanSchema("Whether to include fields/widgets. Defaults to true."),
            limit_per_app: numberSchema("Maximum forms to fetch per app. Defaults to 100."),
            max_results: numberSchema("Maximum matched forms to return. Defaults to 20.")
        }),
        handler: async (input, client) => {
            const includeWidgets = input.include_widgets !== false;
            const context = await findNorthwestForms(client, input, {
                includeWidgets,
                requireFormQuery: false,
                maxResults: boundedPositiveInt(input.max_results, 20, 1, 200)
            });
            return {
                ok: true,
                preset_id: northwestCompanyPreset.id,
                preset_name: northwestCompanyPreset.name,
                query: context.query,
                inspected_apps: context.inspectedApps,
                match_count: context.matches.length,
                matches: context.matches.map(formatResolvedForm)
            };
        }
    },
    {
        name: "jdy_northwest_read_records",
        description: "One-step northwest-company record query. Resolves app/form by business keywords, maps Chinese field labels, and calls Jiandaoyun data list.",
        inputSchema: inputObject({
            app_id: stringSchema("Optional app ID in the northwest_company preset."),
            app_query: stringSchema("Optional app keyword, for example 中卫, QHSE, 生产运维."),
            entry_id: stringSchema("Optional form/entry ID."),
            form_query: stringSchema("Form keyword, for example 工作日志."),
            fields: stringArray("Field IDs such as _widget_123 to return."),
            field_labels: stringArray("Field labels/display names to resolve through widget list."),
            filter: objectSchema("Jiandaoyun data filter object."),
            data_id: stringSchema("Pagination cursor. Use previous result's last data ID."),
            limit: numberSchema("Number of records to return, usually 1-100."),
            allow_first_match: booleanSchema("Use the first matched form when multiple forms match. Defaults to false.")
        }, ["form_query"]),
        handler: async (input, client) => {
            const resolved = await resolveSingleNorthwestForm(client, input);
            const fields = readStringArray(input.fields, "fields");
            const labels = readStringArray(input.field_labels, "field_labels");
            const fieldResolution = labels.length > 0 ? resolveFieldNames(resolved.widgets, labels) : emptyFieldResolution();
            const allFields = uniqueStrings([...fields, ...fieldResolution.fields]);
            const body = compactObject({
                app_id: resolved.app.app_id,
                entry_id: resolved.entryId,
                data_id: optionalString(input.data_id, "data_id"),
                fields: allFields.length > 0 ? allFields : undefined,
                filter: input.filter === undefined ? undefined : asObject(input.filter, "filter"),
                limit: input.limit === undefined ? undefined : boundedPositiveInt(input.limit, 100, 1, 100)
            });
            const result = await client.post("/api/v5/app/entry/data/list", body);
            return {
                ok: true,
                form: formatResolvedForm(resolved),
                resolved_fields: fieldResolution,
                request: body,
                result
            };
        }
    },
    {
        name: "jdy_northwest_create_record",
        description: "One-step northwest-company record creation. Resolves app/form by business keywords, maps Chinese field labels, checks required/business-required fields, and creates a record. In WeACT/OpenClaw multi-user deployments, set JIANDAOYUN_CREATOR_POLICY=locked and pass the real SenderId/open_id so the tool can resolve data_creator from the server-side user map.",
        inputSchema: inputObject({
            app_id: stringSchema("Optional app ID in the northwest_company preset."),
            app_query: stringSchema("Optional app keyword, for example 中卫, QHSE, 生产运维."),
            entry_id: stringSchema("Optional form/entry ID."),
            form_query: stringSchema("Form keyword, for example 工作日志."),
            values: objectSchema("Record values keyed by field ID or field display label."),
            data_creator: stringSchema("Optional submitter username. Ignored when JIANDAOYUN_CREATOR_POLICY=locked."),
            initiator_username: stringSchema("Optional Jiandaoyun username of the upstream requester. Ignored when JIANDAOYUN_CREATOR_POLICY=locked."),
            initiator_open_id: stringSchema("Optional upstream requester open_id. In locked mode this must come from the WeACT message SenderId and resolve through JIANDAOYUN_USER_MAP_JSON or JIANDAOYUN_USER_MAP_FILE."),
            initiator_name: stringSchema("Optional upstream requester display name. Resolved only outside locked creator mode."),
            requester_username: stringSchema("Optional alias of initiator_username. Ignored when JIANDAOYUN_CREATOR_POLICY=locked."),
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
            transaction_id: stringSchema("Optional transaction ID, required when binding uploaded files."),
            allow_first_match: booleanSchema("Use the first matched form when multiple forms match. Defaults to false.")
        }, ["form_query", "values"]),
        handler: async (input, client) => {
            const resolved = await resolveSingleNorthwestForm(client, input);
            const mapped = await mapValuesToJdyData(client, resolved.widgets, asObject(input.values, "values"), readWriteOptions(input, "create", resolved));
            const body = compactObject({
                app_id: resolved.app.app_id,
                entry_id: resolved.entryId,
                data: mapped.data,
                data_creator: await resolveIdentityDataCreator(input),
                is_start_workflow: optionalBoolean(input.is_start_workflow, "is_start_workflow"),
                is_start_trigger: optionalBoolean(input.is_start_trigger, "is_start_trigger"),
                transaction_id: optionalString(input.transaction_id, "transaction_id")
            });
            const result = await client.post("/api/v5/app/entry/data/create", body);
            return {
                ok: true,
                form: formatResolvedForm(resolved),
                resolved_fields: mapped.resolution,
                request: body,
                result
            };
        }
    },
    {
        name: "jdy_northwest_update_record",
        description: "One-step northwest-company record update. Resolves app/form by business keywords, maps Chinese field labels, and updates one record by data_id.",
        inputSchema: inputObject({
            app_id: stringSchema("Optional app ID in the northwest_company preset."),
            app_query: stringSchema("Optional app keyword, for example 中卫, QHSE, 生产运维."),
            entry_id: stringSchema("Optional form/entry ID."),
            form_query: stringSchema("Form keyword, for example 工作日志."),
            data_id: stringSchema("Jiandaoyun data record ID."),
            values: objectSchema("Updated values keyed by field ID or field display label."),
            omit_empty_fields: booleanSchema("Omit blank values before create/update. Defaults to true."),
            clear_fields: stringArray("Field labels or IDs to explicitly clear by writing an empty value."),
            allow_blank_fields: stringArray("Field labels or IDs allowed to be written as blank values."),
            reject_unresolved_fields: booleanSchema("Reject values whose labels cannot be resolved to Jiandaoyun fields. Defaults to true."),
            is_start_trigger: booleanSchema("Whether to trigger Jiandaoyun assistant."),
            transaction_id: stringSchema("Optional transaction ID, required when binding uploaded files."),
            allow_first_match: booleanSchema("Use the first matched form when multiple forms match. Defaults to false.")
        }, ["form_query", "data_id", "values"]),
        handler: async (input, client) => {
            const resolved = await resolveSingleNorthwestForm(client, input);
            const mapped = await mapValuesToJdyData(client, resolved.widgets, asObject(input.values, "values"), readWriteOptions(input, "update", resolved));
            const body = compactObject({
                app_id: resolved.app.app_id,
                entry_id: resolved.entryId,
                data_id: requireString(input.data_id, "data_id"),
                data: mapped.data,
                is_start_trigger: optionalBoolean(input.is_start_trigger, "is_start_trigger"),
                transaction_id: optionalString(input.transaction_id, "transaction_id")
            });
            const result = await client.post("/api/v5/app/entry/data/update", body);
            return {
                ok: true,
                form: formatResolvedForm(resolved),
                resolved_fields: mapped.resolution,
                request: body,
                result
            };
        }
    }
];
async function resolveSingleNorthwestForm(client, input) {
    const allowFirstMatch = input.allow_first_match === true;
    const context = await findNorthwestForms(client, input, {
        includeWidgets: true,
        requireFormQuery: true,
        maxResults: allowFirstMatch ? 1 : 10
    });
    if (context.matches.length === 0) {
        throw new Error(`No northwest-company form matched ${JSON.stringify(context.query)}.`);
    }
    if (context.matches.length > 1 && !allowFirstMatch) {
        throw new Error(`Multiple northwest-company forms matched. Narrow app_query/form_query or set allow_first_match=true. Candidates: ${summarizeCandidates(context.matches)}`);
    }
    return context.matches[0];
}
async function findNorthwestForms(client, input, options) {
    const appId = optionalString(input.app_id, "app_id");
    const appQuery = optionalString(input.app_query, "app_query");
    const entryId = optionalString(input.entry_id, "entry_id");
    const formQuery = optionalString(input.form_query, "form_query");
    const limitPerApp = boundedPositiveInt(input.limit_per_app, 100, 1, 100);
    if (options.requireFormQuery && !entryId && !formQuery) {
        throw new Error("Expected form_query or entry_id for northwest-company form resolution.");
    }
    const apps = selectApps(appId, appQuery);
    const matches = [];
    for (const app of apps) {
        if (matches.length >= options.maxResults)
            break;
        const entries = await fetchAllEntries(client, app.app_id, limitPerApp);
        const filtered = entries.filter((entry) => {
            if (entryId)
                return readIdentity(entry, ["entry_id", "_id", "id"]) === entryId;
            if (formQuery)
                return matchesEntry(formQuery, entry);
            return true;
        });
        for (const entry of filtered) {
            if (matches.length >= options.maxResults)
                break;
            const resolvedEntryId = readIdentity(entry, ["entry_id", "_id", "id"]);
            if (!resolvedEntryId)
                continue;
            const widgets = options.includeWidgets ? await fetchWidgets(client, app.app_id, resolvedEntryId) : [];
            matches.push({
                app,
                entry,
                entryId: resolvedEntryId,
                widgets
            });
        }
    }
    return {
        query: compactObject({ app_id: appId, app_query: appQuery, entry_id: entryId, form_query: formQuery }),
        inspectedApps: apps.length,
        matches
    };
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
    const widgetsResponse = await client.post("/api/v5/app/entry/widget/list", {
        app_id: appId,
        entry_id: entryId
    });
    return extractItems(widgetsResponse);
}
function selectApps(appId, query) {
    if (appId)
        return northwestCompanyPreset.apps.filter((app) => app.app_id === appId);
    if (!query)
        return northwestCompanyPreset.apps;
    const terms = tokenize(query);
    return northwestCompanyPreset.apps.filter((app) => {
        const searchable = normalize([app.name, app.app_id, app.group, ...app.aliases].join(" "));
        return terms.every((term) => searchable.includes(term));
    });
}
function readWriteOptions(input, mode, resolved) {
    const configuredRequiredFields = mode === "create" ? getConfiguredRequiredFields(resolved) : [];
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
async function mapValuesToJdyData(client, widgets, values, options) {
    const resolution = resolveFieldNames(widgets, Object.keys(values));
    const clearResolution = resolveFieldNames(widgets, options.clearFields);
    const allowBlankResolution = resolveFieldNames(widgets, options.allowBlankFields);
    const unresolved = uniqueStrings([...resolution.unresolved, ...clearResolution.unresolved, ...allowBlankResolution.unresolved]);
    if (options.rejectUnresolvedFields && unresolved.length > 0) {
        throw new Error(`Unresolved Jiandaoyun field label(s): ${unresolved.join(", ")}. Use jdy_northwest_get_form_context or field IDs before writing.`);
    }
    const allowBlank = new Set([...Object.values(allowBlankResolution.by_input), ...options.allowBlankFields]);
    const widgetByField = createWidgetMap(widgets);
    const data = {};
    const omittedEmptyFields = [];
    const valueConversions = [];
    for (const [labelOrField, rawValue] of Object.entries(values)) {
        const field = resolution.by_input[labelOrField] ?? labelOrField;
        if (options.omitEmptyFields && isBlankJdyValue(rawValue) && !allowBlank.has(field) && !allowBlank.has(labelOrField)) {
            omittedEmptyFields.push(labelOrField);
            continue;
        }
        const baseValue = isValueObject(rawValue) ? rawValue.value : rawValue;
        const resolvedValue = await resolveJdyFieldValue(client, widgetByField.get(field), baseValue);
        if (resolvedValue.conversion) {
            valueConversions.push({
                field,
                label: labelOrField,
                ...resolvedValue.conversion
            });
        }
        data[field] = isValueObject(rawValue) ? { ...rawValue, value: resolvedValue.value } : { value: resolvedValue.value };
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
            value_conversions: valueConversions,
            clear_fields: clearResolution.by_input,
            allow_blank_fields: allowBlankResolution.by_input,
            missing_required_fields: missingRequiredFields
        }
    };
}
function resolveFieldNames(widgets, labels) {
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
function createFieldMap(widgets) {
    const map = new Map();
    for (const widget of widgets) {
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
function createWidgetMap(widgets) {
    const map = new Map();
    for (const widget of widgets) {
        const fieldId = readIdentity(widget, ["name", "widget_id", "field_id", "_id", "id"]);
        if (fieldId)
            map.set(fieldId, widget);
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
    const resolution = resolveFieldNames(widgets, requiredFields);
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
function formatResolvedForm(resolved) {
    return {
        app: resolved.app,
        entry: resolved.entry,
        entry_id: resolved.entryId,
        widgets: resolved.widgets
    };
}
function summarizeCandidates(matches) {
    return matches
        .slice(0, 10)
        .map((match) => `${match.app.name}/${readIdentity(match.entry, ["name", "entry_name", "title"]) ?? match.entryId} (${match.entryId})`)
        .join("; ");
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
function getClientSummary(client) {
    const maybeSummary = client;
    return typeof maybeSummary.getConfigSummary === "function" ? maybeSummary.getConfigSummary() : {};
}
const builtInRequiredFields = {
    "669501b6c47c535dfe561619/6743d2b19d81b4a42b36e4d9": ["启机原因", "作业位置", "启动设备", "开始时间"],
    "西北-中卫维抢修中心/机械队发电统计": ["启机原因", "作业位置", "启动设备", "开始时间"],
    "机械队发电统计": ["启机原因", "作业位置", "启动设备", "开始时间"]
};
function getConfiguredRequiredFields(resolved) {
    const keys = requiredFieldContextKeys(resolved);
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
function requiredFieldContextKeys(resolved) {
    const appName = resolved?.app?.name;
    const appId = resolved?.app?.app_id;
    const entryName = readIdentity(resolved?.entry, ["name", "entry_name", "title"]);
    const entryId = resolved?.entryId;
    return uniqueStrings([
        appId && entryId ? `${appId}/${entryId}` : undefined,
        appName && entryName ? `${appName}/${entryName}` : undefined,
        entryName,
        entryId
    ].filter(Boolean));
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
    const policy = readCreatorPolicy();
    if (policy === "locked")
        return resolveLockedDataCreator(input);
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
function readCreatorPolicy() {
    const raw = envString("JIANDAOYUN_CREATOR_POLICY")?.toLowerCase();
    if (raw === "locked" || raw === "strict" || raw === "trusted" || raw === "trusted_required")
        return "locked";
    return "caller";
}
function resolveLockedDataCreator(input) {
    const candidates = [
        optionalString(input.initiator_open_id, "initiator_open_id"),
        optionalString(input.requester_open_id, "requester_open_id"),
        optionalString(input.sender_open_id, "sender_open_id"),
        optionalString(input.user_open_id, "user_open_id")
    ].filter(Boolean);
    if (candidates.length === 0) {
        throw new Error("JIANDAOYUN_CREATOR_POLICY=locked: 创建记录必须提供可映射的 WeACT SenderId/open_id（sender_open_id、initiator_open_id、requester_open_id 或 user_open_id）。已拒绝写入，避免提交人被写成 creator 或被用户手动覆盖。");
    }
    const creatorMap = readCreatorMap();
    for (const key of candidates) {
        const mapped = creatorMap[key];
        if (typeof mapped === "string" && mapped.trim().length > 0)
            return mapped.trim();
    }
    throw new Error(`JIANDAOYUN_CREATOR_POLICY=locked: 发起人 open_id 未映射到简道云 username：${candidates.join(", ")}。请在 JIANDAOYUN_USER_MAP_FILE 中配置映射后再写入。`);
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
function boundedPositiveInt(value, fallback, min, max) {
    if (value === undefined || value === null)
        return fallback;
    if (typeof value !== "number" || !Number.isFinite(value) || value < min) {
        throw new Error(`Expected number between ${min} and ${max}.`);
    }
    return Math.min(Math.floor(value), max);
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
function tokenize(value) {
    const normalized = normalize(value);
    const parts = normalized.split(/\s+/).filter(Boolean);
    return parts.length > 0 ? parts : [normalized];
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
//# sourceMappingURL=northwest-tools.js.map

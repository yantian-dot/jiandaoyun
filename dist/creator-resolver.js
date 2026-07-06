import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DEFAULT_WEACT_IDENTITY_MAP_FIELDS = [
    "open_id",
    "user_id",
    "union_id",
    "employee_no",
    "employee_number",
    "job_number",
    "work_id",
    "employee_id",
    "email",
    "enterprise_email",
    "mail"
];

export async function resolveDataCreator(input) {
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
    return findMappedCreator(creatorMap, candidates) ?? fallback;
}

function readCreatorPolicy() {
    const raw = envString("JIANDAOYUN_CREATOR_POLICY")?.toLowerCase();
    if (raw === "locked" || raw === "strict" || raw === "trusted" || raw === "trusted_required")
        return "locked";
    return "caller";
}

function resolveLockedDataCreator(input) {
    const openIds = uniqueStrings([
        optionalString(input.initiator_open_id, "initiator_open_id"),
        optionalString(input.requester_open_id, "requester_open_id"),
        optionalString(input.sender_open_id, "sender_open_id"),
        optionalString(input.user_open_id, "user_open_id")
    ].filter(Boolean));
    if (openIds.length === 0) {
        throw new Error("JIANDAOYUN_CREATOR_POLICY=locked: 创建记录必须提供可映射的 WeACT SenderId/open_id（sender_open_id、initiator_open_id、requester_open_id 或 user_open_id）。已拒绝写入，避免提交人被写成 creator 或被用户手动覆盖。");
    }
    const creatorMap = readCreatorMap();
    const direct = findMappedCreator(creatorMap, openIds);
    if (direct)
        return direct;
    const lookupMode = readWeactIdentityLookupMode();
    const diagnostics = [];
    if (lookupMode !== "off") {
        for (const openId of openIds) {
            const identityResult = resolveWeactIdentity(openId);
            diagnostics.push(identityResult.diagnostic);
            if (!identityResult.identity)
                continue;
            const identityCandidates = collectIdentityMapCandidates(identityResult.identity);
            const mapped = findMappedCreator(creatorMap, identityCandidates);
            if (mapped)
                return mapped;
            const creatorField = envString("JIANDAOYUN_WEACT_CREATOR_FIELD");
            if (creatorField) {
                const creator = firstIdentityField(identityResult.identity, parseCsv(creatorField));
                if (creator)
                    return creator;
            }
        }
    }
    const extra = diagnostics.filter(Boolean).length > 0 ? `；WeACT 身份解析结果：${diagnostics.filter(Boolean).join("；")}` : "";
    throw new Error(`JIANDAOYUN_CREATOR_POLICY=locked: 发起人 open_id 未映射到简道云 username：${openIds.join(", ")}。请在 JIANDAOYUN_USER_MAP_FILE 中配置映射，或配置 JIANDAOYUN_WEACT_CREATOR_FIELD 作为显式可信字段后再写入${extra}。`);
}

function readWeactIdentityLookupMode() {
    const raw = envString("JIANDAOYUN_WEACT_IDENTITY_LOOKUP")?.toLowerCase() ?? "auto";
    if (raw === "0" || raw === "false" || raw === "off" || raw === "disabled" || raw === "none")
        return "off";
    return raw === "required" ? "required" : "auto";
}

function resolveWeactIdentity(openId) {
    if (!/^[A-Za-z0-9_.:-]+$/.test(openId)) {
        return { identity: undefined, diagnostic: `${openId}: open_id 格式不安全，已跳过 weact-cli 查询` };
    }
    const timeout = positiveIntFromEnv("JIANDAOYUN_WEACT_IDENTITY_TIMEOUT_MS", 5000);
    const commandTemplate = envString("JIANDAOYUN_WEACT_IDENTITY_COMMAND");
    const result = commandTemplate ? runCustomIdentityCommand(commandTemplate, openId, timeout) : runDefaultIdentityCommand(openId, timeout);
    if (result.status !== 0) {
        return { identity: undefined, diagnostic: `${openId}: weact-cli 查询失败 ${summarizeCommandFailure(result)}` };
    }
    const parsed = parseJsonFromOutput(result.stdout);
    if (!parsed) {
        return { identity: undefined, diagnostic: `${openId}: weact-cli 输出不是可解析 JSON` };
    }
    const identity = unwrapIdentity(parsed);
    const summary = summarizeIdentity(identity);
    return { identity, diagnostic: `${openId}: ${summary || "已取得身份但无可用唯一字段"}` };
}

function runDefaultIdentityCommand(openId, timeout) {
    const bin = envString("JIANDAOYUN_WEACT_CLI_BIN") ?? "weact-cli";
    const auth = envString("JIANDAOYUN_WEACT_CLI_AUTH") ?? "bot";
    return spawnSync(bin, [
        "contact",
        "+get-user",
        "--user-id",
        openId,
        "--as",
        auth,
        "--format",
        "json"
    ], {
        encoding: "utf8",
        timeout,
        maxBuffer: 1024 * 1024,
        env: process.env
    });
}

function runCustomIdentityCommand(template, openId, timeout) {
    const rendered = template
        .replaceAll("{open_id}", shellQuote(openId))
        .replaceAll("{user_id}", shellQuote(openId));
    return spawnSync("bash", ["-lc", rendered], {
        encoding: "utf8",
        timeout,
        maxBuffer: 1024 * 1024,
        env: process.env
    });
}

function summarizeCommandFailure(result) {
    if (result.error) {
        return result.error.message;
    }
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
    const detail = stderr || stdout;
    return `exit=${result.status ?? "unknown"}${detail ? ` ${truncate(detail, 180)}` : ""}`;
}

function parseJsonFromOutput(output) {
    const text = typeof output === "string" ? output.trim() : "";
    if (!text)
        return undefined;
    try {
        return JSON.parse(text);
    }
    catch {
        const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (!match)
            return undefined;
        try {
            return JSON.parse(match[1]);
        }
        catch {
            return undefined;
        }
    }
}

function unwrapIdentity(value) {
    if (!isObject(value))
        return {};
    const data = isObject(value.data) ? value.data : value;
    if (isObject(data.user))
        return { ...data, ...data.user };
    if (Array.isArray(data.users) && isObject(data.users[0]))
        return { ...data, ...data.users[0] };
    if (Array.isArray(data.items) && isObject(data.items[0]))
        return { ...data, ...data.items[0] };
    return data;
}

function collectIdentityMapCandidates(identity) {
    const fields = parseCsv(envString("JIANDAOYUN_WEACT_IDENTITY_MAP_FIELDS"))
        .concat(DEFAULT_WEACT_IDENTITY_MAP_FIELDS);
    return uniqueStrings(identityFieldValues(identity, fields));
}

function firstIdentityField(identity, fields) {
    return identityFieldValues(identity, fields).find((value) => value.trim().length > 0)?.trim();
}

function identityFieldValues(identity, fields) {
    const wanted = new Set(fields.map((field) => field.trim()).filter(Boolean));
    if (wanted.size === 0)
        return [];
    const flat = flattenObject(identity);
    const values = [];
    for (const [path, value] of Object.entries(flat)) {
        if (typeof value !== "string" || value.trim().length === 0)
            continue;
        const tail = path.split(".").pop() ?? path;
        if (wanted.has(path) || wanted.has(tail))
            values.push(value.trim());
    }
    return uniqueStrings(values);
}

function summarizeIdentity(identity) {
    const parts = [];
    for (const key of ["name", "user_name", "display_name", "employee_name", "open_id", "user_id", "employee_no", "email", "enterprise_email"]) {
        const value = firstIdentityField(identity, [key]);
        if (value)
            parts.push(`${key}=${value}`);
        if (parts.length >= 4)
            break;
    }
    return parts.join(", ");
}

function flattenObject(value, prefix = "", output = {}) {
    if (!isObject(value))
        return output;
    for (const [key, item] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (isObject(item)) {
            flattenObject(item, path, output);
        }
        else if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
            output[path] = String(item);
        }
    }
    return output;
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

function findMappedCreator(creatorMap, candidates) {
    for (const key of candidates) {
        const mapped = readMappedCreator(creatorMap[key]) ?? readMappedCreator(creatorMap[key.toLowerCase()]);
        if (mapped)
            return mapped;
    }
    return undefined;
}

function readMappedCreator(value) {
    if (typeof value === "string" && value.trim().length > 0)
        return value.trim();
    if (isObject(value)) {
        for (const key of ["jdy_username", "username", "data_creator", "creator"]) {
            const candidate = value[key];
            if (typeof candidate === "string" && candidate.trim().length > 0)
                return candidate.trim();
        }
    }
    return undefined;
}

function envString(name) {
    const value = process.env[name];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalString(value, field) {
    if (value === undefined || value === null)
        return undefined;
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`Expected string for ${field}.`);
    }
    return value;
}

function positiveIntFromEnv(name, fallback) {
    const raw = envString(name);
    if (!raw)
        return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0)
        return fallback;
    return Math.floor(value);
}

function parseCsv(value) {
    if (!value)
        return [];
    return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function shellQuote(value) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

function truncate(value, max) {
    return value.length <= max ? value : `${value.slice(0, max)}...`;
}

function uniqueStrings(values) {
    return [...new Set(values)];
}

function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

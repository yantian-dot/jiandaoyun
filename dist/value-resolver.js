import { existsSync, readFileSync } from "node:fs";

const USER_FIELD_TYPES = new Set(["user", "usergroup"]);
const USER_LIST_CACHE = new WeakMap();

export async function resolveJdyFieldValue(client, widget, rawValue) {
    const widgetType = readWidgetType(widget);
    if (!USER_FIELD_TYPES.has(widgetType)) {
        return { value: rawValue };
    }
    if (isExplicitUserValue(rawValue, widgetType)) {
        return { value: rawValue };
    }
    const names = splitUserInput(rawValue);
    if (names.length === 0) {
        return { value: rawValue };
    }
    const users = [];
    const conversions = [];
    for (const name of names) {
        const user = await resolveJdyUser(client, name);
        users.push(user);
        conversions.push({ input: name, username: user.username, name: user.name });
    }
    return {
        value: widgetType === "user" ? users[0] : users,
        conversion: {
            type: widgetType,
            inputs: names,
            users: conversions
        }
    };
}

export async function resolveJdyUser(client, input) {
    const mapped = readMemberMapValue(input);
    if (mapped) {
        const user = await getUserByUsername(client, mapped);
        if (user)
            return user;
        return minimalUser(mapped, input);
    }
    const direct = await getUserByUsername(client, input);
    if (direct)
        return direct;
    let allUsers;
    try {
        allUsers = await listAllUsers(client);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`成员字段无法匹配“${input}”：读取简道云通讯录失败。请确认 API key 有通讯录读取权限，或在 JIANDAOYUN_MEMBER_MAP_FILE 中配置姓名到 username 的映射。原始错误：${detail}`);
    }
    const matches = allUsers.filter((user) => userMatches(user, input));
    if (matches.length === 1)
        return normalizeUser(matches[0]);
    if (matches.length > 1) {
        throw new Error(`成员字段无法唯一匹配“${input}”：找到 ${matches.length} 个同名成员（${matches.map((user) => user.username).filter(Boolean).join(", ")}）。请提供简道云 username，或在 JIANDAOYUN_MEMBER_MAP_FILE 中配置姓名到 username 的映射。`);
    }
    throw new Error(`成员字段无法匹配“${input}”：请确认该成员在简道云通讯录中存在，或在 JIANDAOYUN_MEMBER_MAP_FILE 中配置姓名到 username 的映射。`);
}

async function getUserByUsername(client, username) {
    if (!username || !isSafeLookupText(username))
        return undefined;
    try {
        const response = await client.post("/api/v5/corp/user/get", { username });
        const user = unwrapUser(response);
        return user?.username ? normalizeUser(user) : undefined;
    }
    catch {
        return undefined;
    }
}

async function listAllUsers(client) {
    const cached = USER_LIST_CACHE.get(client);
    if (cached)
        return cached;
    const deptNo = positiveIntFromEnv("JIANDAOYUN_ROOT_DEPT_NO", 1);
    const response = await client.post("/api/v5/corp/department/user/list", {
        dept_no: deptNo,
        has_child: true
    });
    const users = extractUsers(response).map(normalizeUser).filter((user) => Boolean(user.username));
    USER_LIST_CACHE.set(client, users);
    return users;
}

function readWidgetType(widget) {
    if (!isObject(widget))
        return "";
    for (const key of ["type", "widget_type", "field_type", "control_type"]) {
        const value = readString(widget[key]);
        if (value)
            return value.trim().toLowerCase();
    }
    return "";
}

function isExplicitUserValue(value, widgetType) {
    if (widgetType === "user") {
        return isObject(value) && typeof value.username === "string";
    }
    return Array.isArray(value) && value.every((item) => isObject(item) && typeof item.username === "string");
}

function splitUserInput(value) {
    if (typeof value === "string") {
        return value
            .split(/[,\uFF0C\u3001;；\n]/)
            .map((item) => item.trim())
            .filter(Boolean);
    }
    if (Array.isArray(value)) {
        return value.flatMap(splitUserInput);
    }
    return [];
}

function readMemberMapValue(input) {
    const map = readMemberMap();
    const direct = map[input] ?? map[input.toLowerCase()];
    return readMappedUsername(direct);
}

function readMemberMap() {
    const raw = process.env.JIANDAOYUN_MEMBER_MAP_JSON;
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            return isObject(parsed) ? parsed : {};
        }
        catch {
            return {};
        }
    }
    const path = process.env.JIANDAOYUN_MEMBER_MAP_FILE ?? process.env.JIANDAOYUN_USER_MAP_FILE ?? `${process.env.HOME ?? ""}/.openclaw-main/jiandaoyun-user-map.json`;
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

function readMappedUsername(value) {
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

function unwrapUser(response) {
    if (!isObject(response))
        return undefined;
    if (isObject(response.user))
        return response.user;
    if (isObject(response.data) && isObject(response.data.user))
        return response.data.user;
    if (isObject(response.result) && isObject(response.result.user))
        return response.result.user;
    return undefined;
}

function extractUsers(response) {
    const found = findFirstArray(response, new Set());
    return found.filter(isObject);
}

function findFirstArray(value, seen) {
    if (Array.isArray(value))
        return value;
    if (!isObject(value) || seen.has(value))
        return [];
    seen.add(value);
    for (const key of ["users", "data", "result", "items", "list"]) {
        const child = value[key];
        if (Array.isArray(child))
            return child;
        const nested = findFirstArray(child, seen);
        if (nested.length > 0)
            return nested;
    }
    return [];
}

function userMatches(user, input) {
    const normalized = normalize(input);
    const fields = [
        user.username,
        user.name,
        user.integrate_id,
        user.email,
        user.enterprise_email,
        user.mobile,
        user.phone
    ].filter((item) => typeof item === "string" && item.length > 0);
    return fields.some((field) => normalize(field) === normalized);
}

function normalizeUser(value) {
    const user = {
        username: String(value.username ?? "").trim(),
        name: readString(value.name) ?? readString(value.username) ?? "",
        departments: Array.isArray(value.departments) ? value.departments : [],
        type: typeof value.type === "number" ? value.type : 0,
        status: typeof value.status === "number" ? value.status : 1
    };
    const integrateId = readString(value.integrate_id);
    if (integrateId)
        user.integrate_id = integrateId;
    return user;
}

function minimalUser(username, name) {
    return {
        username,
        name,
        departments: [],
        type: 0,
        status: 1
    };
}

function isSafeLookupText(value) {
    return /^[\w.@:+\-\u4e00-\u9fa5]+$/u.test(value);
}

function positiveIntFromEnv(name, fallback) {
    const raw = process.env[name];
    if (!raw)
        return fallback;
    const parsed = Number(raw);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalize(value) {
    return value.trim().toLowerCase();
}

function readString(value) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

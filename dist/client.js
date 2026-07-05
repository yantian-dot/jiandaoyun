import { basename } from "node:path";
import { readFile, stat } from "node:fs/promises";
export class JiandaoyunError extends Error {
    status;
    code;
    details;
    constructor(message, options = {}) {
        super(message);
        this.name = "JiandaoyunError";
        this.status = options.status;
        this.code = options.code;
        this.details = options.details;
    }
}
export class JiandaoyunClient {
    apiKey;
    baseUrl;
    timeoutMs;
    fetchImpl;
    constructor(options = {}) {
        const apiKey = options.apiKey ?? process.env.JIANDAOYUN_API_KEY;
        if (!apiKey) {
            throw new JiandaoyunError("Missing JIANDAOYUN_API_KEY environment variable.");
        }
        this.apiKey = apiKey;
        this.baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.JIANDAOYUN_BASE_URL ?? "https://nocode.pipechina.com.cn");
        this.timeoutMs = options.timeoutMs ?? readTimeoutFromEnv();
        this.fetchImpl = options.fetchImpl ?? fetch;
    }
    getConfigSummary() {
        return {
            baseUrl: this.baseUrl.replace(/\/$/, ""),
            timeoutMs: this.timeoutMs,
            hasApiKey: this.apiKey.length > 0
        };
    }
    async post(path, body = {}) {
        const url = this.resolveApiPath(path);
        const response = await this.fetchWithTimeout(url, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(body)
        });
        const text = await response.text();
        const parsed = parseJson(text, response.status);
        if (!response.ok) {
            throw new JiandaoyunError(`Jiandaoyun HTTP ${response.status}: ${summarize(parsed)}`, {
                status: response.status,
                details: parsed
            });
        }
        if (isFailureResponse(parsed)) {
            const message = typeof parsed.message === "string" ? parsed.message : summarize(parsed);
            throw new JiandaoyunError(`Jiandaoyun API failure: ${message}`, {
                code: parsed.code,
                details: parsed
            });
        }
        return parsed;
    }
    async rawPost(path, body = {}) {
        if (!path.startsWith("/api/")) {
            throw new JiandaoyunError("raw_post path must start with /api/.");
        }
        return this.post(path, body);
    }
    async uploadLocalFile(params) {
        const url = new URL(params.uploadUrl);
        const bytes = await readFile(params.filePath);
        const fileStat = await stat(params.filePath);
        if (!fileStat.isFile()) {
            throw new JiandaoyunError(`Path is not a file: ${params.filePath}`);
        }
        const formData = new FormData();
        formData.append("token", params.token);
        const blob = new Blob([bytes], { type: params.mime ?? "application/octet-stream" });
        formData.append("file", blob, basename(params.filePath));
        const response = await this.fetchWithTimeout(url, {
            method: "POST",
            body: formData
        });
        const text = await response.text();
        const parsed = parseJson(text, response.status);
        if (!response.ok) {
            throw new JiandaoyunError(`Jiandaoyun file upload HTTP ${response.status}: ${summarize(parsed)}`, {
                status: response.status,
                details: parsed
            });
        }
        return parsed;
    }
    resolveApiPath(path) {
        if (!path.startsWith("/api/")) {
            throw new JiandaoyunError(`Unsafe Jiandaoyun path: ${path}`);
        }
        return new URL(path.replace(/^\/+/, ""), this.baseUrl);
    }
    async fetchWithTimeout(url, init) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            return await this.fetchImpl(url, {
                ...init,
                signal: controller.signal
            });
        }
        catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                throw new JiandaoyunError(`Jiandaoyun request timed out after ${this.timeoutMs} ms.`);
            }
            throw error;
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
function normalizeBaseUrl(baseUrl) {
    return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}
function readTimeoutFromEnv() {
    const raw = process.env.JIANDAOYUN_TIMEOUT_MS;
    if (!raw)
        return 30_000;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
}
function parseJson(text, status) {
    if (!text.trim())
        return {};
    try {
        return JSON.parse(text);
    }
    catch {
        throw new JiandaoyunError(`Jiandaoyun returned non-JSON response with HTTP ${status}.`, {
            status,
            details: text.slice(0, 500)
        });
    }
}
function isFailureResponse(value) {
    return typeof value === "object" && value !== null && value.status === "failure";
}
function summarize(value) {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return redactApiKey(text.length > 500 ? `${text.slice(0, 500)}...` : text);
}
function redactApiKey(text) {
    return text.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
}
//# sourceMappingURL=client.js.map
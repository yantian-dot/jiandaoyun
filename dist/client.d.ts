export type FetchLike = typeof fetch;
export type JiandaoyunClientOptions = {
    apiKey?: string;
    baseUrl?: string;
    timeoutMs?: number;
    fetchImpl?: FetchLike;
};
export declare class JiandaoyunError extends Error {
    readonly status?: number;
    readonly code?: unknown;
    readonly details?: unknown;
    constructor(message: string, options?: {
        status?: number;
        code?: unknown;
        details?: unknown;
    });
}
export declare class JiandaoyunClient {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly fetchImpl;
    constructor(options?: JiandaoyunClientOptions);
    getConfigSummary(): {
        baseUrl: string;
        timeoutMs: number;
        hasApiKey: boolean;
    };
    post(path: string, body?: Record<string, unknown>): Promise<unknown>;
    rawPost(path: string, body?: Record<string, unknown>): Promise<unknown>;
    uploadLocalFile(params: {
        uploadUrl: string;
        token: string;
        filePath: string;
        mime?: string;
    }): Promise<unknown>;
    private resolveApiPath;
    private fetchWithTimeout;
}

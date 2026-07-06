export declare function resolveJdyFieldValue(client: unknown, widget: Record<string, unknown> | undefined, rawValue: unknown): Promise<{
    value: unknown;
    conversion?: Record<string, unknown>;
}>;
export declare function resolveJdyUser(client: unknown, input: string): Promise<{
    username: string;
    name: string;
    departments: unknown[];
    type: number;
    status: number;
    integrate_id?: string;
}>;

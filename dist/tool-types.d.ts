import type { JsonSchema } from "./json-schema.js";
import type { JiandaoyunClient } from "./client.js";
export type ToolHandler = (input: Record<string, unknown>, client: JiandaoyunClient) => Promise<unknown>;
export type JdyTool = {
    name: string;
    description: string;
    inputSchema: JsonSchema;
    handler: ToolHandler;
};

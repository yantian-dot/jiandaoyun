import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { JiandaoyunClient } from "./client.js";
import { tools } from "./tools.js";
export function createServer(options = {}) {
    const server = new Server({
        name: "jiandaoyun-mcp-plugin",
        version: "0.5.8"
    }, {
        capabilities: {
            tools: {}
        }
    });
    let client = options.client;
    const getClient = () => {
        client ??= new JiandaoyunClient();
        return client;
    };
    const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema
        }))
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const tool = toolMap.get(request.params.name);
        if (!tool) {
            return errorResult(`Unknown tool: ${request.params.name}`);
        }
        try {
            const result = await tool.handler(enrichToolArguments(request.params.arguments ?? {}, request), getClient());
            return textResult(result);
        }
        catch (error) {
            return errorResult(formatError(error));
        }
    });
    return server;
}
function enrichToolArguments(value, request) {
    if (!isObject(value))
        return value;
    const args = { ...value };
    const metaSources = [
        request?.params?._meta,
        request?._meta,
        args._meta
    ].filter(isObject);
    if (!args.initiator_open_id) {
        const openId = firstMetaString(metaSources, [
            "initiator_open_id",
            "initiatorOpenId",
            "weact_open_id",
            "weactOpenId",
            "user_open_id",
            "userOpenId",
            "sender_open_id",
            "senderOpenId",
            "sender_id",
            "senderId",
            "operator_open_id",
            "operatorOpenId",
            "open_id",
            "openId",
            "openID",
            "userId",
            "user_id",
            "senderUserId",
            "sender_user_id",
            "operatorUserId",
            "operator_user_id"
        ]);
        if (openId)
            args.initiator_open_id = openId;
    }
    if (!args.initiator_name) {
        const name = firstMetaString(metaSources, [
            "initiator_name",
            "weact_display_name",
            "display_name",
            "sender_name",
            "operator_name",
            "user_name",
            "username",
            "name"
        ]);
        if (name)
            args.initiator_name = name;
    }
    return args;
}
function firstMetaString(sources, keys) {
    for (const source of sources) {
        for (const key of keys) {
            const value = source[key];
            if (typeof value === "string" && value.trim().length > 0)
                return value.trim();
        }
    }
    return undefined;
}
function isObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function textResult(value) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(value, null, 2)
            }
        ]
    };
}
function errorResult(message) {
    return {
        isError: true,
        content: [
            {
                type: "text",
                text: message
            }
        ]
    };
}
function formatError(error) {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    return String(error);
}
//# sourceMappingURL=server.js.map

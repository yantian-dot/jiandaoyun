import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { JiandaoyunClient } from "./client.js";
export type ServerOptions = {
    client?: JiandaoyunClient;
};
export declare function createServer(options?: ServerOptions): Server;

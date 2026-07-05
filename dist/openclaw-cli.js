#!/usr/bin/env node
import { access } from "node:fs/promises";
const command = process.argv[2] ?? "help";
switch (command) {
    case "doctor":
        await runDoctor();
        break;
    case "print-config":
        printConfig();
        break;
    case "install-template":
        printInstallTemplate();
        break;
    case "help":
    case "--help":
    case "-h":
        printHelp();
        break;
    default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exitCode = 1;
}
async function runDoctor() {
    const checks = [
        {
            name: "node_version",
            ok: isNodeVersionSupported(),
            detail: process.version
        },
        {
            name: "api_key_env",
            ok: Boolean(process.env.JIANDAOYUN_API_KEY),
            detail: process.env.JIANDAOYUN_API_KEY ? "JIANDAOYUN_API_KEY is set." : "JIANDAOYUN_API_KEY is not set."
        },
        {
            name: "base_url",
            ok: (process.env.JIANDAOYUN_BASE_URL ?? "https://nocode.pipechina.com.cn") === "https://nocode.pipechina.com.cn",
            detail: process.env.JIANDAOYUN_BASE_URL ?? "https://nocode.pipechina.com.cn"
        },
        {
            name: "mcp_command",
            ok: await commandExists("jiandaoyun-mcp"),
            detail: "jiandaoyun-mcp"
        }
    ];
    console.log(JSON.stringify({ ok: checks.every((check) => check.ok), checks }, null, 2));
}
function printConfig() {
    console.log(JSON.stringify({
        mcpServers: {
            jiandaoyun: {
                command: "jiandaoyun-mcp",
                args: [],
                env: {
                    JIANDAOYUN_API_KEY: "${JIANDAOYUN_API_KEY}",
                    JIANDAOYUN_BASE_URL: "https://nocode.pipechina.com.cn",
                    JIANDAOYUN_TIMEOUT_MS: "30000"
                }
            }
        }
    }, null, 2));
}
function printInstallTemplate() {
    console.log(`openclaw mcp add jiandaoyun \\
  --command jiandaoyun-mcp \\
  --env JIANDAOYUN_API_KEY=YOUR_API_KEY \\
  --env JIANDAOYUN_BASE_URL=https://nocode.pipechina.com.cn \\
  --env JIANDAOYUN_TIMEOUT_MS=30000`);
}
function printHelp() {
    console.log(`Usage: jiandaoyun-openclaw <command>

Commands:
  doctor            Check local Node/env/command prerequisites.
  print-config      Print an OpenClaw MCP JSON config snippet.
  install-template  Print the recommended openclaw mcp add command.
  help              Show this help.`);
}
function isNodeVersionSupported() {
    const major = Number(process.versions.node.split(".")[0]);
    return Number.isFinite(major) && major >= 20;
}
async function commandExists(commandName) {
    const pathValue = process.env.PATH ?? "";
    const paths = pathValue.split(":").filter(Boolean);
    for (const dir of paths) {
        try {
            await access(`${dir}/${commandName}`);
            return true;
        }
        catch {
            // Continue searching PATH.
        }
    }
    return false;
}
//# sourceMappingURL=openclaw-cli.js.map
#!/usr/bin/env node
import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { tools } from "../dist/tools.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const errors = [];

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function listSkillFiles(relativePath) {
  const absolute = join(root, relativePath);
  if (!existsSync(absolute)) return [];
  const stat = lstatSync(absolute);
  if (stat.isFile()) return absolute.endsWith("SKILL.md") ? [absolute] : [];
  if (!stat.isDirectory()) return [];
  return readdirSync(absolute, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(absolute, entry.name, "SKILL.md"))
    .filter((path) => existsSync(path));
}

const plugin = readJson("openclaw/openclaw.plugin.json");
const mcp = readJson("openclaw/mcp.json");
const packageJson = readJson("package.json");

const exportedTools = tools.map((tool) => tool.name);
const contractTools = plugin.contracts?.tools ?? [];
const exportedSet = new Set(exportedTools);
const contractSet = new Set(contractTools);
const missing = exportedTools.filter((name) => !contractSet.has(name));
const extra = contractTools.filter((name) => !exportedSet.has(name));

assert(plugin.id === "jiandaoyun-mcp-plugin", "openclaw.plugin.json id must be jiandaoyun-mcp-plugin");
assert(plugin.runtime?.type === "mcp", "openclaw.plugin.json runtime.type must be mcp");
assert(plugin.runtime?.config === "./mcp.json", "openclaw.plugin.json runtime.config must point to ./mcp.json");
assert(Array.isArray(plugin.skills) && plugin.skills.includes("./skills"), "openclaw.plugin.json must expose ./skills");
assert(missing.length === 0, `openclaw tool contract is missing exported tools: ${missing.join(", ")}`);
assert(extra.length === 0, `openclaw tool contract contains unknown tools: ${extra.join(", ")}`);

const skillFiles = (plugin.skills ?? []).flatMap((entry) => listSkillFiles(`openclaw/${entry.replace(/^\.\//, "")}`));
assert(skillFiles.length > 0, "openclaw skills must contain at least one SKILL.md");

const server = mcp.mcpServers?.jiandaoyun;
assert(server?.command === "jiandaoyun-mcp", "openclaw/mcp.json must use the installed jiandaoyun-mcp command");
assert(server?.env?.JIANDAOYUN_API_KEY === "${JIANDAOYUN_API_KEY}", "openclaw/mcp.json must not contain a real API key");
assert(server?.env?.JIANDAOYUN_USER_MAP_FILE, "openclaw/mcp.json should configure JIANDAOYUN_USER_MAP_FILE");
assert(server?.env?.JIANDAOYUN_REQUIRED_FIELDS_FILE, "openclaw/mcp.json should configure JIANDAOYUN_REQUIRED_FIELDS_FILE");

assert(packageJson.files?.includes("openclaw"), "package.json files must include openclaw");
assert(packageJson.files?.includes("scripts"), "package.json files must include scripts");

const forbidden = /\b(tool_registry|toolkit\.js|office-assistant-server-workshadow)\b/i;
for (const relativePath of [
  "openclaw/openclaw.plugin.json",
  "openclaw/mcp.json",
  "openclaw/README.md",
  "openclaw/agent.md",
  "openclaw/skills/jiandaoyun-openclaw-tools/SKILL.md",
  "OPENCLAW_INSTALL.md",
  "scripts/install-on-server.sh",
  "scripts/install-openclaw.sh"
]) {
  const body = readFileSync(join(root, relativePath), "utf8");
  assert(!forbidden.test(body), `${relativePath} contains excluded WorkShadow adapter wording`);
}

if (errors.length > 0) {
  console.error("OpenClaw validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  tool_count: exportedTools.length,
  skill_files: skillFiles.map((path) => path.replace(`${root}/`, ""))
}, null, 2));

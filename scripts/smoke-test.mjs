#!/usr/bin/env node
import { assistantTools } from "../dist/assistant-tools.js";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const createTool = assistantTools.find((tool) => tool.name === "jdy_assistant_create_record");
if (!createTool) {
  throw new Error("jdy_assistant_create_record not found");
}

const previous = {
  policy: process.env.JIANDAOYUN_CREATOR_POLICY,
  userMap: process.env.JIANDAOYUN_USER_MAP_JSON,
  lookup: process.env.JIANDAOYUN_WEACT_IDENTITY_LOOKUP,
  cliBin: process.env.JIANDAOYUN_WEACT_CLI_BIN,
  creatorField: process.env.JIANDAOYUN_WEACT_CREATOR_FIELD
};
let tempDir;

try {
  process.env.JIANDAOYUN_CREATOR_POLICY = "locked";
  process.env.JIANDAOYUN_USER_MAP_JSON = JSON.stringify({ ou_test: "zhangsan" });
  process.env.JIANDAOYUN_WEACT_IDENTITY_LOOKUP = "off";

  const calls = [];
  const client = {
    async post(path, body) {
      calls.push({ path, body });
      if (path.endsWith("/widget/list")) {
        return { widgets: [{ name: "_widget_reason", label: "Reason" }] };
      }
      if (path.endsWith("/data/create")) {
        return { data_id: "created" };
      }
      throw new Error(`unexpected API path: ${path}`);
    }
  };

  let blocked = false;
  try {
    await createTool.handler({
      app_id: "app",
      entry_id: "entry",
      values: { Reason: "startup test" }
    }, client);
  } catch (error) {
    blocked = String(error?.message ?? error).includes("JIANDAOYUN_CREATOR_POLICY=locked");
  }
  if (!blocked) {
    throw new Error("locked creator policy did not block create without sender open_id");
  }

  calls.length = 0;
  await createTool.handler({
    app_id: "app",
    entry_id: "entry",
    values: { Reason: "startup test" },
    sender_open_id: "ou_test"
  }, client);
  const createCall = calls.find((call) => call.path.endsWith("/data/create"));
  if (!createCall) {
    throw new Error("create API was not called");
  }
  if (createCall.body.data_creator !== "zhangsan") {
    throw new Error(`expected mapped creator zhangsan, got ${createCall.body.data_creator ?? "undefined"}`);
  }

  tempDir = mkdtempSync(join(tmpdir(), "jdy-weact-cli-"));
  const fakeWeactCli = join(tempDir, "weact-cli");
  writeFileSync(fakeWeactCli, `#!/usr/bin/env bash
printf '%s\\n' '{"user":{"open_id":"ou_cli","name":"张通","enterprise_email":"zt@example.com"}}'
`);
  chmodSync(fakeWeactCli, 0o700);
  process.env.JIANDAOYUN_USER_MAP_JSON = JSON.stringify({ "zt@example.com": "zhangtong01" });
  process.env.JIANDAOYUN_WEACT_IDENTITY_LOOKUP = "auto";
  process.env.JIANDAOYUN_WEACT_CLI_BIN = fakeWeactCli;

  calls.length = 0;
  await createTool.handler({
    app_id: "app",
    entry_id: "entry",
    values: { Reason: "startup test" },
    sender_open_id: "ou_cli"
  }, client);
  const cliCreateCall = calls.find((call) => call.path.endsWith("/data/create"));
  if (!cliCreateCall) {
    throw new Error("create API was not called for weact-cli identity mapping");
  }
  if (cliCreateCall.body.data_creator !== "zhangtong01") {
    throw new Error(`expected mapped creator zhangtong01, got ${cliCreateCall.body.data_creator ?? "undefined"}`);
  }
  rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;

  console.log(JSON.stringify({
    ok: true,
    checks: [
      "locked policy blocks missing sender",
      "sender open_id maps to data_creator",
      "unmapped sender can resolve via weact-cli identity and unique-field map"
    ]
  }, null, 2));
} finally {
  if (previous.policy === undefined) delete process.env.JIANDAOYUN_CREATOR_POLICY;
  else process.env.JIANDAOYUN_CREATOR_POLICY = previous.policy;
  if (previous.userMap === undefined) delete process.env.JIANDAOYUN_USER_MAP_JSON;
  else process.env.JIANDAOYUN_USER_MAP_JSON = previous.userMap;
  if (previous.lookup === undefined) delete process.env.JIANDAOYUN_WEACT_IDENTITY_LOOKUP;
  else process.env.JIANDAOYUN_WEACT_IDENTITY_LOOKUP = previous.lookup;
  if (previous.cliBin === undefined) delete process.env.JIANDAOYUN_WEACT_CLI_BIN;
  else process.env.JIANDAOYUN_WEACT_CLI_BIN = previous.cliBin;
  if (previous.creatorField === undefined) delete process.env.JIANDAOYUN_WEACT_CREATOR_FIELD;
  else process.env.JIANDAOYUN_WEACT_CREATOR_FIELD = previous.creatorField;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
}

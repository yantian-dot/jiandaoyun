#!/usr/bin/env node
import { assistantTools } from "../dist/assistant-tools.js";
import { tools } from "../dist/tools.js";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const createTool = assistantTools.find((tool) => tool.name === "jdy_assistant_create_record");
if (!createTool) {
  throw new Error("jdy_assistant_create_record not found");
}
const rawCreateTool = tools.find((tool) => tool.name === "jdy_data_create");
if (!rawCreateTool) {
  throw new Error("jdy_data_create not found");
}

const previous = {
  policy: process.env.JIANDAOYUN_CREATOR_POLICY,
  userMap: process.env.JIANDAOYUN_USER_MAP_JSON,
  memberMap: process.env.JIANDAOYUN_MEMBER_MAP_JSON,
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
        return {
          widgets: [
            { name: "_widget_reason", label: "Reason", type: "text" },
            { name: "_widget_members", label: "参与人员", type: "usergroup" }
          ]
        };
      }
      if (path.endsWith("/corp/user/get")) {
        if (body.username === "xjy") {
          return { user: { username: "xjy", name: "邢宇嘉", departments: [1], type: 0, status: 1 } };
        }
        throw new Error(`unknown username: ${body.username}`);
      }
      if (path.endsWith("/corp/department/user/list")) {
        return { users: [{ username: "xjy", name: "邢宇嘉", departments: [1], type: 0, status: 1 }] };
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
    values: { Reason: "startup test", "参与人员": "邢宇嘉" },
    sender_open_id: "ou_test"
  }, client);
  const createCall = calls.find((call) => call.path.endsWith("/data/create"));
  if (!createCall) {
    throw new Error("create API was not called");
  }
  if (createCall.body.data_creator !== "zhangsan") {
    throw new Error(`expected mapped creator zhangsan, got ${createCall.body.data_creator ?? "undefined"}`);
  }
  const memberValue = createCall.body.data._widget_members?.value;
  if (!Array.isArray(memberValue) || memberValue[0]?.username !== "xjy") {
    throw new Error(`expected member name to resolve to usergroup username xjy, got ${JSON.stringify(memberValue)}`);
  }

  calls.length = 0;
  await rawCreateTool.handler({
    app_id: "app",
    entry_id: "entry",
    data: { _widget_reason: { value: "raw create" } },
    data_creator: "malicious_override",
    sender_open_id: "ou_test"
  }, client);
  const rawCreateCall = calls.find((call) => call.path.endsWith("/data/create"));
  if (!rawCreateCall) {
    throw new Error("raw create API was not called");
  }
  if (rawCreateCall.body.data_creator !== "zhangsan") {
    throw new Error(`expected core create to enforce mapped creator zhangsan, got ${rawCreateCall.body.data_creator ?? "undefined"}`);
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

  writeFileSync(fakeWeactCli, `#!/usr/bin/env bash
printf '%s\\n' '{"user":{"open_id":"ou_auto","name":"邢宇嘉"}}'
`);
  process.env.JIANDAOYUN_USER_MAP_JSON = JSON.stringify({});

  calls.length = 0;
  await createTool.handler({
    app_id: "app",
    entry_id: "entry",
    values: { Reason: "startup test" },
    sender_open_id: "ou_auto"
  }, client);
  const contactCreateCall = calls.find((call) => call.path.endsWith("/data/create"));
  if (!contactCreateCall) {
    throw new Error("create API was not called for contact-based creator mapping");
  }
  if (contactCreateCall.body.data_creator !== "xjy") {
    throw new Error(`expected contact-based creator xjy, got ${contactCreateCall.body.data_creator ?? "undefined"}`);
  }
  rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;

  console.log(JSON.stringify({
    ok: true,
    checks: [
      "locked policy blocks missing sender",
      "sender open_id maps to data_creator",
      "usergroup display names resolve to Jiandaoyun usernames",
      "core create ignores manual data_creator under locked policy",
      "unmapped sender can resolve via weact-cli identity and unique-field map",
      "weact-cli display name can resolve data_creator through Jiandaoyun contacts"
    ]
  }, null, 2));
} finally {
  if (previous.policy === undefined) delete process.env.JIANDAOYUN_CREATOR_POLICY;
  else process.env.JIANDAOYUN_CREATOR_POLICY = previous.policy;
  if (previous.userMap === undefined) delete process.env.JIANDAOYUN_USER_MAP_JSON;
  else process.env.JIANDAOYUN_USER_MAP_JSON = previous.userMap;
  if (previous.memberMap === undefined) delete process.env.JIANDAOYUN_MEMBER_MAP_JSON;
  else process.env.JIANDAOYUN_MEMBER_MAP_JSON = previous.memberMap;
  if (previous.lookup === undefined) delete process.env.JIANDAOYUN_WEACT_IDENTITY_LOOKUP;
  else process.env.JIANDAOYUN_WEACT_IDENTITY_LOOKUP = previous.lookup;
  if (previous.cliBin === undefined) delete process.env.JIANDAOYUN_WEACT_CLI_BIN;
  else process.env.JIANDAOYUN_WEACT_CLI_BIN = previous.cliBin;
  if (previous.creatorField === undefined) delete process.env.JIANDAOYUN_WEACT_CREATOR_FIELD;
  else process.env.JIANDAOYUN_WEACT_CREATOR_FIELD = previous.creatorField;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
}

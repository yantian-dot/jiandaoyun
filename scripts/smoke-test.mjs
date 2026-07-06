#!/usr/bin/env node
import { assistantTools } from "../dist/assistant-tools.js";

const createTool = assistantTools.find((tool) => tool.name === "jdy_assistant_create_record");
if (!createTool) {
  throw new Error("jdy_assistant_create_record not found");
}

const previous = {
  policy: process.env.JIANDAOYUN_CREATOR_POLICY,
  userMap: process.env.JIANDAOYUN_USER_MAP_JSON
};

try {
  process.env.JIANDAOYUN_CREATOR_POLICY = "locked";
  process.env.JIANDAOYUN_USER_MAP_JSON = JSON.stringify({ ou_test: "zhangsan" });

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

  console.log(JSON.stringify({
    ok: true,
    checks: ["locked policy blocks missing sender", "sender open_id maps to data_creator"]
  }, null, 2));
} finally {
  if (previous.policy === undefined) delete process.env.JIANDAOYUN_CREATOR_POLICY;
  else process.env.JIANDAOYUN_CREATOR_POLICY = previous.policy;
  if (previous.userMap === undefined) delete process.env.JIANDAOYUN_USER_MAP_JSON;
  else process.env.JIANDAOYUN_USER_MAP_JSON = previous.userMap;
}

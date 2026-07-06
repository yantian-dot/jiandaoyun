# OpenClaw Import Template

This directory is a thin OpenClaw companion for the Jiandaoyun MCP server.

It is not a full OpenClaw channel plugin. It keeps the verified MCP server as the runtime and adds:

- `mcp.json`: stdio MCP server template.
- `agent.md`: recommended agent instructions for safer, more natural tool use.
- `openclaw.plugin.json`: tool contract metadata for platforms that can read OpenClaw-style manifests.
- Built-in `northwest_company` preset for apps under the 西北公司 group.

## Recommended Setup

Install the package first:

```bash
npm install -g ./jiandaoyun-mcp-plugin-0.5.5.tgz
```

Or use the helper script from the unpacked project directory:

```bash
./scripts/install-openclaw.sh ./jiandaoyun-mcp-plugin-0.5.5.tgz
```

Then add the MCP server in OpenClaw:

```bash
openclaw mcp add jiandaoyun \
  --command jiandaoyun-mcp \
  --env JIANDAOYUN_API_KEY=YOUR_API_KEY \
  --env JIANDAOYUN_BASE_URL=https://nocode.pipechina.com.cn \
  --env JIANDAOYUN_TIMEOUT_MS=30000
```

After import, ask the agent to run `jdy_openclaw_doctor` first.

For the OpenClaw + openclaw-weact + weact-cli assistant, also expose the native skill directory:

```bash
ln -sfn "$(npm root -g)/jiandaoyun-mcp-plugin/openclaw/skills/jiandaoyun-openclaw-tools" \
  "$HOME/.openclaw-main/plugin-skills/jiandaoyun-openclaw-tools"
```

The server installer handles this automatically.

Local helper commands:

```bash
jiandaoyun-openclaw doctor
jiandaoyun-openclaw print-config
jiandaoyun-openclaw install-template
```

## One-Step Northwest Tools

For most northwest-company work, prefer these one-step tools:

- `jdy_openclaw_doctor`
- `jdy_northwest_refresh_schema`
- `jdy_northwest_schema_status`
- `jdy_northwest_clear_schema_cache`
- `jdy_northwest_get_form_context`
- `jdy_northwest_read_records`
- `jdy_northwest_create_record`
- `jdy_northwest_update_record`

Examples:

- "检查 OpenClaw 简道云插件状态"
- "刷新西北公司表单字段缓存"
- "查看西北公司缓存状态"
- "找中卫工作日志表并列出字段"
- "查中卫工作日志最近 20 条，只看工作内容、负责人、完成情况"
- "在中卫工作日志新增一条：工作内容为完成站场巡检，负责人张三，完成情况已完成"

## Northwest Company Preset

For listing or searching candidate apps/forms without data operations, use:

- `jdy_preset_list`
- `jdy_preset_northwest_apps`
- `jdy_preset_northwest_forms`
- `jdy_preset_northwest_find_form`

Examples:

- "查西北公司有哪些应用"
- "找西北公司的中卫工作日志表"
- "查 QHSE 相关表单"
- "列出西北-中卫维抢修中心下的表单和字段"

## Operating Rules

- Prefer `jdy_northwest_*` for northwest-company read/write operations.
- Prefer `jdy_preset_northwest_*` when only listing candidate apps/forms.
- Prefer `jdy_assistant_read_records`, `jdy_assistant_create_record`, and `jdy_assistant_update_record` for field label mapping.
- Use raw `jdy_data_*` tools only when exact field IDs and API bodies are already known.
- Use delete, workflow approval, department import, and contact management tools only after explicit user confirmation.
- For writes, do not send blank values for fields the user did not mention. If required fields are missing, ask a follow-up question before creating the record.
- To make the Jiandaoyun submitter equal the WeACT requester, keep `JIANDAOYUN_CREATOR_POLICY=locked`, pass the real SenderId/open_id through `sender_open_id` or `initiator_open_id`, and configure `JIANDAOYUN_USER_MAP_FILE`. Version 0.5.5 can use `weact-cli contact +get-user` to resolve unique identity fields such as employee number or email when the direct open_id map is missing. Do not use display names as locked-mode submitter evidence unless `JIANDAOYUN_WEACT_CREATOR_FIELD=name` is explicitly configured and names are guaranteed unique Jiandaoyun usernames.

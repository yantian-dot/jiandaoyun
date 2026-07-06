# Jiandaoyun MCP Plugin

面向 OpenClaw 的简道云私有零代码 MCP 插件包。核心是一个本地 stdio MCP 服务，包含 OpenClaw 使用模板、`northwest_company` 西北公司业务预设，以及一步式西北公司业务工具。

## 能力范围

- 应用/表单：应用列表、表单列表、字段列表。
- 数据：查询、新增、批量新增、修改、批量修改、删除、批量删除。
- 文件：获取上传凭证、上传本地文件并返回 `key`。
- 流程：流程实例、日志、审批意见、待办查询和提交/回退/转交/加签/撤回/否决、抄送列表。
- 通讯录/管理：成员、部门、主管、角色、角色组、企业互联、资源用量、审计日志。
- 兜底：`jdy_raw_post` 可调用 `/api/` 下新增的简道云 POST 接口。
- OpenClaw 诊断与安装辅助：检查 API Key、私有域名、只读连通性、命令可用性和西北公司预设完整性。
- Schema 缓存：可把西北公司应用/表单/字段元数据缓存到本地，减少重复发现成本。
- 一步式业务动作：按西北公司业务关键词自动找应用/表单/字段，并完成查询、新增、更新。
- 智能动作：连接自检、应用/表单/字段发现、字段名映射查询、字段名映射新增/更新、流程待办摘要。
- 西北公司预设：内置截图中 `西北公司` 分组下 21 个应用，通过 API 动态拉取这些应用下的表单和字段。

默认注册全量工具。本版不做代码级危险工具保护。日常使用建议先运行 `jdy_openclaw_doctor`，必要时运行 `jdy_northwest_refresh_schema`，再走 `jdy_northwest_*` 工具；只列候选应用/表单时用 `jdy_preset_*`；只有在明确知道接口请求体时再使用底层 `jdy_*` 工具。

## 安装和构建

```bash
cd /Users/yantian/Documents/Codex/办公助手/jiandaoyun-mcp-plugin
npm install
npm run build
```

配置 API Key：

```bash
export JIANDAOYUN_API_KEY="YOUR_API_KEY"
export JIANDAOYUN_BASE_URL="https://nocode.pipechina.com.cn"
export JIANDAOYUN_TIMEOUT_MS="30000"
```

简道云鉴权方式为 HTTP Header：

```text
Authorization: Bearer <API_KEY>
```

## MCP 配置

通用 stdio 配置：

```json
{
  "mcpServers": {
    "jiandaoyun": {
      "command": "node",
      "args": [
        "/Users/yantian/Documents/Codex/办公助手/jiandaoyun-mcp-plugin/dist/index.js"
      ],
      "env": {
        "JIANDAOYUN_API_KEY": "YOUR_API_KEY",
        "JIANDAOYUN_BASE_URL": "https://nocode.pipechina.com.cn"
      }
    }
  }
}
```

## OpenClaw 接入

- 推荐先按 MCP 接入本地 stdio 服务；本包新增 `openclaw/` 模板目录，包含 `mcp.json`、`agent.md` 和 OpenClaw 风格工具契约清单。
- `openclaw/` 是薄外壳，不是完整 channel 插件；它不会替代 OpenClaw 原生消息、卡片、OAuth 插件。
- 安装 tgz 后可以用全局命令接入：

```bash
openclaw mcp add jiandaoyun \
  --command jiandaoyun-mcp \
  --env JIANDAOYUN_API_KEY=YOUR_API_KEY \
  --env JIANDAOYUN_BASE_URL=https://nocode.pipechina.com.cn \
  --env JIANDAOYUN_TIMEOUT_MS=30000
```

- 导入后把 `openclaw/agent.md` 作为 Agent 指令或技能说明，让 Agent 默认先运行 `jdy_openclaw_doctor`，遇到西北公司业务时优先运行 `jdy_northwest_*`。

本地辅助命令：

```bash
jiandaoyun-openclaw doctor
jiandaoyun-openclaw print-config
jiandaoyun-openclaw install-template
```

也可以参考 [OPENCLAW_INSTALL.md](/Users/yantian/Documents/Codex/办公助手/jiandaoyun-mcp-plugin/OPENCLAW_INSTALL.md)。

## OpenClaw 一步式工具

这些工具是 0.5.6 的推荐入口：

- `jdy_openclaw_doctor`：检查安装配置、私有域名、只读连通性和西北公司预设完整性。
- `jdy_northwest_refresh_schema`：刷新西北公司应用/表单/字段缓存。
- `jdy_northwest_schema_status`：查看缓存路径、生成时间、应用数、表单数、字段数。
- `jdy_northwest_clear_schema_cache`：清理本地 schema 缓存。
- `jdy_northwest_get_form_context`：按业务关键词找到西北公司应用/表单，并返回字段。
- `jdy_northwest_read_records`：按业务关键词找到表单，解析中文字段名并查询数据。
- `jdy_northwest_create_record`：按业务关键词找到表单，解析中文字段名并新增记录。
- `jdy_northwest_update_record`：按业务关键词找到表单，解析中文字段名并更新记录。

### 写入保护和提交人

0.5.6 对 `jdy_northwest_create_record`、`jdy_northwest_update_record`、`jdy_assistant_create_record`、`jdy_assistant_update_record` 增加写入保护，并把 `jdy_data_create`、`jdy_data_batch_create`、面向创建接口的 `jdy_raw_post` 纳入提交人锁定策略：

- 默认 `omit_empty_fields=true`：`null`、空字符串、空数组、空对象不会被提交。
- 默认 `reject_unresolved_fields=true`：无法解析成简道云字段的中文字段名会被拒绝，不会原样写入。
- 创建记录默认 `validate_required_fields=true`：识别到必填字段缺失时返回错误，让上游先向用户追问。
- 对 `西北-中卫维抢修中心/机械队发电统计` 支持业务必填字段配置。当前服务器安装脚本会配置：`启机原因`、`作业位置`、`启动设备`、`开始时间`、`作业详情`。如果用户没提供这些内容，写入工具会拒绝创建并要求补齐。
- 需要主动清空字段时使用 `clear_fields`，不要用空字符串隐式清空。
- 如果某个字段确实允许提交空值，显式放入 `allow_blank_fields`。
- 如果其他表单的 API 没有返回必填标记，可以通过 `required_fields` 参数，或 `JIANDAOYUN_REQUIRED_FIELDS_JSON` / `JIANDAOYUN_REQUIRED_FIELDS_FILE` 配置业务必填字段。
- 对简道云 `user` / `usergroup` 字段，写入前会把自然语言姓名（例如 `邢宇嘉`、`张通, 贾发强`）解析成简道云通讯录成员对象，再按官方要求提交 `username`。如果同名成员不唯一，工具会拒绝猜测并要求补充简道云 `username` 或配置映射。

提交人使用简道云创建接口的 `data_creator`。多人 WeACT/OpenClaw 助手建议启用锁定策略：

```bash
export JIANDAOYUN_CREATOR_POLICY=locked
export JIANDAOYUN_USER_MAP_FILE="$HOME/.openclaw-main/jiandaoyun-user-map.json"
export JIANDAOYUN_MEMBER_MAP_FILE="$HOME/.openclaw-main/jiandaoyun-member-map.json"
export JIANDAOYUN_ROOT_DEPT_NO=1
export JIANDAOYUN_WEACT_IDENTITY_LOOKUP=auto
export JIANDAOYUN_WEACT_CLI_BIN=weact-cli
export JIANDAOYUN_WEACT_CLI_AUTH=bot
```

锁定模式下，工具会忽略用户或模型传入的 `data_creator`、`initiator_username` 和显示名兜底，提交人按以下顺序解析：

1. 直接使用 `JIANDAOYUN_USER_MAP_FILE` 中的 `SenderId/open_id -> 简道云 username` 映射。
2. 如果直接映射缺失，并且 `JIANDAOYUN_WEACT_IDENTITY_LOOKUP=auto`，调用 `weact-cli contact +get-user --user-id <open_id> --as bot --format json` 查询发起人身份。
3. 使用查询到的唯一字段（例如 `open_id`、`user_id`、`employee_no`、`email`、`enterprise_email`）再去 `JIANDAOYUN_USER_MAP_FILE` 查映射。
4. 只有管理员显式设置 `JIANDAOYUN_WEACT_CREATOR_FIELD` 时，才会把该 WeACT 身份字段直接作为简道云 `data_creator`。例如 `JIANDAOYUN_WEACT_CREATOR_FIELD=name` 只适合 WeACT 姓名等于唯一简道云 username 的场景。

映射文件示例：

```json
{
  "ou_xxx": "zhangsan",
  "zhangsan@example.com": "zhangsan",
  "10086": {
    "jdy_username": "zhangsan",
    "weact_name": "张三"
  }
}
```

然后在写入工具参数中传 `sender_open_id` 或 `initiator_open_id`；如果 OpenClaw MCP runtime 传入 `_meta.sender_open_id`、`_meta.sender_id` 或 `_meta.user_open_id`，插件也会自动补为发起人 open_id。没有 open_id、映射缺失且 WeACT 身份解析无法给出可信提交人时，锁定模式会拒绝写入，避免提交人落成 `creator` 或被用户手动覆盖。单用户部署可把 `JIANDAOYUN_CREATOR_POLICY` 设回 `caller` 并使用 `JIANDAOYUN_DEFAULT_DATA_CREATOR`，但不建议给多人助手使用。

人员字段映射文件示例：

```json
{
  "邢宇嘉": "xjy_username",
  "张通": {
    "username": "zt_username"
  }
}
```

如果不配置 `JIANDAOYUN_MEMBER_MAP_FILE`，工具会尝试用 `/api/v5/corp/user/get` 和 `/api/v5/corp/department/user/list` 从简道云通讯录中按 `username`、`name`、`integrate_id`、邮箱或手机号做精确匹配。匹配到 0 个或多个都会拒绝写入，避免把人员字段写成普通文本。

业务必填字段配置示例：

```bash
export JIANDAOYUN_REQUIRED_FIELDS_FILE="$HOME/.openclaw-main/jiandaoyun-required-fields.json"
```

```json
{
  "西北-中卫维抢修中心/机械队发电统计": ["启机原因", "作业位置", "启动设备", "开始时间", "作业详情"],
  "669501b6c47c535dfe561619/6743d2b19d81b4a42b36e4d9": ["启机原因", "作业位置", "启动设备", "开始时间", "作业详情"]
}
```

示例：

```json
{
  "tool": "jdy_northwest_read_records",
  "arguments": {
    "app_query": "中卫",
    "form_query": "工作日志",
    "field_labels": ["工作内容", "负责人", "完成情况"],
    "limit": 20
  }
}
```

## 西北公司预设

预设 ID：

```text
northwest_company
```

预设范围是你确认的 `nocode.pipechina.com.cn/dashboard#/` 工作台中 `西北公司` 分组下 21 个应用。插件内置应用名和 `app_id`，表单和字段运行时通过 API 动态拉取。

预设工具：

- `jdy_preset_list`：列出内置业务预设。
- `jdy_preset_northwest_apps`：按关键词查西北公司应用。
- `jdy_preset_northwest_forms`：拉取西北公司应用下的表单，可按应用/表单关键词过滤。
- `jdy_preset_northwest_find_form`：按自然语言业务关键词跨西北公司应用查找表单。

推荐使用顺序：

1. `jdy_openclaw_doctor`
2. `jdy_northwest_refresh_schema` / `jdy_northwest_schema_status`
3. `jdy_northwest_get_form_context` / `jdy_northwest_read_records`
4. `jdy_northwest_create_record` / `jdy_northwest_update_record`
5. `jdy_preset_northwest_apps` / `jdy_preset_northwest_find_form` 仅用于列候选项

## 智能工具

这些工具用于减少手工参数组装：

- `jdy_assistant_check_connection`：返回脱敏配置摘要，并可只读探测应用列表。
- `jdy_assistant_discover`：按应用名、表单名、ID 发现应用/表单/字段。
- `jdy_assistant_read_records`：支持用字段中文名查询记录，内部会解析字段 ID。
- `jdy_assistant_create_record`：支持用字段中文名新增记录，内部会组装 `{ "value": ... }`。
- `jdy_assistant_update_record`：支持用字段中文名更新记录。
- `jdy_assistant_todo_summary`：查询流程待办并返回摘要。

推荐使用顺序：

1. `jdy_assistant_check_connection`
2. `jdy_assistant_discover`
3. `jdy_assistant_read_records` / `jdy_assistant_create_record` / `jdy_assistant_update_record`

示例：

```json
{
  "tool": "jdy_assistant_create_record",
  "arguments": {
    "app_id": "your_app_id",
    "entry_id": "your_entry_id",
    "values": {
      "工作内容": "完成站场巡检",
      "负责人": "张三",
      "完成情况": "已完成"
    },
    "is_start_workflow": false
  }
}
```

## 常用工具

- `jdy_openclaw_doctor`
- `jdy_northwest_refresh_schema`
- `jdy_northwest_schema_status`
- `jdy_northwest_clear_schema_cache`
- `jdy_northwest_get_form_context`
- `jdy_northwest_read_records`
- `jdy_northwest_create_record`
- `jdy_northwest_update_record`
- `jdy_preset_list`
- `jdy_preset_northwest_apps`
- `jdy_preset_northwest_forms`
- `jdy_preset_northwest_find_form`
- `jdy_assistant_check_connection`
- `jdy_assistant_discover`
- `jdy_assistant_read_records`
- `jdy_assistant_create_record`
- `jdy_assistant_update_record`
- `jdy_assistant_todo_summary`
- `jdy_app_list`
- `jdy_entry_list`
- `jdy_widget_list`
- `jdy_data_list`
- `jdy_data_create`
- `jdy_file_get_upload_token`
- `jdy_file_upload_local`
- `jdy_workflow_task_approve`
- `jdy_corp_user_get`
- `jdy_audit_log_list`

管理类、流程类复杂接口一般使用 `body` 透传简道云官方请求体，例如：

```json
{
  "body": {
    "instance_id": "workflow-instance-id"
  }
}
```

## 验证

```bash
npm run typecheck
npm test
npm run build
```

真实环境烟测建议先只跑只读工具：

1. `jdy_app_list`
2. `jdy_entry_list`
3. `jdy_widget_list`
4. `jdy_data_list`

写入、删除、审批、通讯录导入等操作只应在测试应用、测试表单或明确指定的业务对象上执行。

## 私有域名说明

本包默认面向你当前的私有零代码平台：

```text
https://nocode.pipechina.com.cn
```

不要把浏览器里的完整页面地址直接填入 `JIANDAOYUN_BASE_URL`，例如不要填包含 `#/app/.../flow/todo` 的 URL。通常只填域名即可。

如果私有部署把 API 挂在子路径下，可以把 base URL 配成该路径前缀，例如：

```bash
export JIANDAOYUN_BASE_URL="https://nocode.pipechina.com.cn/custom-prefix"
```

插件会在这个前缀后拼接 `/api/v5/...`。

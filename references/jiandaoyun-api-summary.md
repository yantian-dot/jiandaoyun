# 简道云 API 摘要

来源：`/Users/yantian/Documents/资料/jiandaoyun_api_docs.pdf`，标题为“简道云 API接口说明汇总”，抓取时间为 2026-06-30 20:37。

## 鉴权

- 简道云 API 使用 API Key 鉴权。
- 请求头格式：`Authorization: Bearer <API_KEY>`。
- 本插件仅从 `JIANDAOYUN_API_KEY` 环境变量读取密钥，不在配置、示例或日志中保存真实值。
- 当前交付包默认 API Base 为私有域名 `https://nocode.pipechina.com.cn`，可通过 `JIANDAOYUN_BASE_URL` 覆盖。

## 应用和表单

| 工具 | 接口 | 频率 |
| --- | --- | --- |
| `jdy_app_list` | `POST /api/v5/app/list` | 30 次/秒 |
| `jdy_entry_list` | `POST /api/v5/app/entry/list` | 30 次/秒 |
| `jdy_widget_list` | `POST /api/v5/app/entry/widget/list` | 30 次/秒 |

## 数据

| 工具 | 接口 | 频率 |
| --- | --- | --- |
| `jdy_data_get` | `POST /api/v5/app/entry/data/get` | 30 次/秒 |
| `jdy_data_list` | `POST /api/v5/app/entry/data/list` | 30 次/秒 |
| `jdy_data_create` | `POST /api/v5/app/entry/data/create` | 20 次/秒 |
| `jdy_data_batch_create` | `POST /api/v5/app/entry/data/batch_create` | 10 次/秒 |
| `jdy_data_update` | `POST /api/v5/app/entry/data/update` | 20 次/秒 |
| `jdy_data_batch_update` | `POST /api/v5/app/entry/data/batch_update` | 10 次/秒 |
| `jdy_data_delete` | `POST /api/v5/app/entry/data/delete` | 20 次/秒 |
| `jdy_data_batch_delete` | `POST /api/v5/app/entry/data/batch_delete` | 10 次/秒 |

字段值写入时采用简道云格式：`"_widget_xxx": { "value": ... }`。查询返回值中字段通常直接是值。

## 文件

| 工具 | 接口 | 频率 |
| --- | --- | --- |
| `jdy_file_get_upload_token` | `POST /api/v5/app/entry/file/get_upload_token` | 20 次/秒 |
| `jdy_file_upload_local` | `POST {url}` | 20 次/秒 |

上传流程：

1. 生成 `transaction_id`。
2. 调用 `jdy_file_get_upload_token` 获取上传 URL 和 token。
3. 调用 `jdy_file_upload_local` 上传本地文件并取得 `key`。
4. 在数据新增/修改接口中使用相同 `transaction_id` 绑定文件字段。

## 流程

| 工具 | 接口 |
| --- | --- |
| `jdy_workflow_approval_comments` | `POST /api/v1/app/{app_id}/entry/{entry_id}/data/{data_id}/approval_comments` |
| `jdy_workflow_instance_get` | `POST /api/v6/workflow/instance/get` |
| `jdy_workflow_instance_logs` | `POST /api/v1/workflow/instance/logs` |
| `jdy_workflow_instance_close` | `POST /api/v1/workflow/instance/close` |
| `jdy_workflow_instance_activate` | `POST /api/v1/workflow/instance/activate` |
| `jdy_workflow_task_list` | `POST /api/v6/workflow/task/list` |
| `jdy_workflow_task_approve` | `POST /api/v1/workflow/task/approve` |
| `jdy_workflow_task_rollback` | `POST /api/v2/workflow/task/rollback` |
| `jdy_workflow_task_transfer` | `POST /api/v1/workflow/task/transfer` |
| `jdy_workflow_task_add_sign` | `POST /api/v2/workflow/task/add_sign` |
| `jdy_workflow_task_revoke` | `POST /api/v2/workflow/task/revoke` |
| `jdy_workflow_task_reject` | `POST /api/v1/workflow/task/reject` |
| `jdy_workflow_cc_list` | `POST /api/v1/workflow/cc/list` |

流程类接口参数差异较大，本插件对多数流程接口使用 `body` 透传官方请求体。

## 通讯录、角色、企业互联和审计

成员、部门、角色、角色组、企业互联、资源用量、审计日志均已按文档路径注册为独立工具。由于这些接口权限和参数差异较大，第一版统一使用 `body` 透传官方请求体。

风险较高的接口包括：

- `jdy_corp_user_create`
- `jdy_corp_user_update`
- `jdy_corp_user_delete`
- `jdy_department_import`
- `jdy_role_delete`
- `jdy_role_group_delete`
- 所有流程提交/回退/转交/否决类工具

## 兜底工具

`jdy_raw_post` 仅允许 `path` 以 `/api/` 开头，用于临时调用未封装的新接口。它仍会使用统一鉴权、超时和错误处理。

## 智能动作层

0.2.0 版新增 `jdy_assistant_*` 工具。这些工具不新增官方接口路径，只组合现有只读/读写接口，降低 Agent 直接操作底层请求体的难度。

| 工具 | 作用 |
| --- | --- |
| `jdy_assistant_check_connection` | 脱敏返回当前 base URL、超时配置，并可只读探测应用列表 |
| `jdy_assistant_discover` | 按应用名/表单名/ID 发现应用、表单和字段 |
| `jdy_assistant_read_records` | 用字段显示名解析字段 ID 后查询记录 |
| `jdy_assistant_create_record` | 用字段显示名组装 `{ value: ... }` 后新增记录 |
| `jdy_assistant_update_record` | 用字段显示名组装 `{ value: ... }` 后更新记录 |
| `jdy_assistant_todo_summary` | 查询流程待办并返回摘要 |

智能动作层仍然使用 `Authorization: Bearer <API_KEY>`，不会保存密钥。删除、审批、组织架构管理等高风险动作没有智能封装，仍要求调用方显式使用底层工具。

## OpenClaw 业务预设

0.3.0 版新增 `northwest_company` 预设，面向 OpenClaw 使用。该预设固定保存 `西北公司` 分组下 21 个应用的名称、别名和 `app_id`，但不固定表单清单；表单和字段在运行时通过简道云 API 动态获取。

| 工具 | 作用 |
| --- | --- |
| `jdy_preset_list` | 列出内置业务预设 |
| `jdy_preset_northwest_apps` | 查询西北公司预设应用 |
| `jdy_preset_northwest_forms` | 拉取西北公司应用下的表单，可按应用/表单关键词过滤 |
| `jdy_preset_northwest_find_form` | 跨西北公司应用按业务关键词查找表单 |

该预设使用的接口仍是：

- `POST /api/v5/app/entry/list`
- `POST /api/v5/app/entry/widget/list`

本版按用户要求不增加代码级危险工具保护。

## OpenClaw 一步式业务工具

0.4.0 版新增 `jdy_northwest_*` 工具，面向 OpenClaw 的自然语言业务操作。它们不新增官方接口路径，只组合现有应用、表单、字段和数据接口。

| 工具 | 作用 |
| --- | --- |
| `jdy_openclaw_doctor` | 检查 API Key、base URL、只读连通性和 `northwest_company` 预设完整性 |
| `jdy_northwest_get_form_context` | 按西北公司业务关键词解析应用/表单，并返回字段 |
| `jdy_northwest_read_records` | 解析应用/表单/字段后查询记录 |
| `jdy_northwest_create_record` | 解析应用/表单/字段后新增记录 |
| `jdy_northwest_update_record` | 解析应用/表单/字段后更新记录 |

数据流：

1. 从 `northwest_company` 预设匹配 `app_query` 或 `app_id`。
2. 调用 `POST /api/v5/app/entry/list` 动态获取表单。
3. 用 `form_query` 或 `entry_id` 匹配表单。
4. 调用 `POST /api/v5/app/entry/widget/list` 获取字段。
5. 对读/写操作，把中文字段名映射为字段 ID，再调用数据接口。

当读、写操作匹配到多个表单时，默认返回候选信息并要求缩小 `app_query` / `form_query`；如明确接受第一个结果，可传 `allow_first_match: true`。

## OpenClaw 安装与 Schema 缓存

0.5.0 版新增安装辅助和 schema 缓存能力。

本地 CLI：

| 命令 | 作用 |
| --- | --- |
| `jiandaoyun-openclaw doctor` | 检查 Node 版本、环境变量、`jiandaoyun-mcp` 命令可用性 |
| `jiandaoyun-openclaw print-config` | 输出 OpenClaw MCP JSON 配置片段 |
| `jiandaoyun-openclaw install-template` | 输出推荐的 `openclaw mcp add` 命令 |

缓存工具：

| 工具 | 作用 |
| --- | --- |
| `jdy_northwest_refresh_schema` | 刷新西北公司应用/表单/字段元数据缓存 |
| `jdy_northwest_schema_status` | 查看缓存路径、生成时间和统计数量 |
| `jdy_northwest_clear_schema_cache` | 删除本地 schema 缓存 |

默认缓存路径：

```text
~/.jiandaoyun-mcp/cache/northwest-schema.json
```

可通过 `JIANDAOYUN_SCHEMA_CACHE_PATH` 覆盖。缓存只保存元数据，不保存 API Key 或业务记录。

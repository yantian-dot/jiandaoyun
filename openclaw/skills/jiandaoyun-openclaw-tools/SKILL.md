---
name: jiandaoyun-openclaw-tools
description: |
  管网 WeACT/OpenClaw 办公助手访问简道云、零代码平台、nocode.pipechina.com.cn 表单数据时使用。只要用户提到简道云、零代码平台、机械队发电统计、中卫维抢修中心、西北公司表单、表单记录查询或写入，就优先使用本 skill 和 jiandaoyun MCP tools，不要误用飞书多维表格、云文档或 web_fetch。
---

# Jiandaoyun OpenClaw Tools

## 适用范围

本 skill 只面向 `OpenClaw + openclaw-weact + weact-cli` 运行时。不要套用其他办公助手项目的旧适配层。

当用户说“零代码平台”“简道云”“nocode”“中卫维抢修中心”“机械队发电统计”“西北公司表单”时，按简道云 MCP 工具处理。不要把这类请求转到飞书多维表格、飞书云文档、云空间或浏览器抓取。

OpenClaw 中工具名可能带 MCP 命名空间，例如 `jiandaoyun__jdy_northwest_read_records`。如果平台显示带命名空间的名称，就调用完整名称；如果只显示原始名称，就调用 `jdy_*`。

## 首选工具

先用这些工具完成绝大多数业务：

| 目的 | 工具 |
| --- | --- |
| 检查安装和连通性 | `jdy_openclaw_doctor` |
| 刷新西北公司表单/字段缓存 | `jdy_northwest_refresh_schema` |
| 查看缓存状态 | `jdy_northwest_schema_status` |
| 查应用、表单和字段上下文 | `jdy_northwest_get_form_context` |
| 查询记录 | `jdy_northwest_read_records` |
| 新增记录 | `jdy_northwest_create_record` |
| 更新记录 | `jdy_northwest_update_record` |

只有目标不属于西北公司预设时，才使用 `jdy_assistant_discover`、`jdy_assistant_read_records`、`jdy_assistant_create_record`、`jdy_assistant_update_record`。只有在已经知道精确 `app_id`、`entry_id`、字段 ID 和接口请求体时，才使用底层 `jdy_data_*` 或 `jdy_raw_post`。

## 写入前流程

1. 如果表单不明确，先调用 `jdy_northwest_get_form_context`，并让 `include_widgets` 保持默认 true。
2. 用字段显示名组织 `values`，不要自己编字段 ID。
3. 只传用户已明确提供的字段。未声明字段不要传空字符串、空数组、空对象或占位值。
4. 创建记录时保留默认 `validate_required_fields=true`、`omit_empty_fields=true`、`reject_unresolved_fields=true`。
5. 如果工具返回“缺少必填字段”，停止写入，向用户一次性追问缺失字段。用户补充后，把原始请求和补充信息合并，再重新调用创建工具。
6. 如果用户、管理员或表单上下文明确某些字段是业务必填，但 API 没有返回必填标记，在调用创建工具时把这些字段放入 `required_fields`。

对 `机械队发电统计`，至少要求 `启机原因`、`作业位置`、`启动设备`、`开始时间`。如果运行现场已把 `作业详情` 或其他字段设置为必填，也要把它们纳入 `required_fields`，未提供时先追问。

## 发起人和提交人

简道云提交人由创建接口的 `data_creator` 决定。不要传字面值 `creator`，也不要声称提交人已经是用户，除非工具请求里确实传入了可映射的发起人信息。

在 WeACT 会话中：

- 如果消息上下文有 SenderId 或 `ou_...`，传 `initiator_open_id`。
- 如果只能看到发起人的显示名，传 `initiator_name`。
- 如果已经知道简道云 username，传 `initiator_username` 或 `data_creator`。
- 如果没有映射文件，工具可能无法把 `initiator_open_id` 或显示名转换为简道云 username。此时应说明“需要配置 `JIANDAOYUN_USER_MAP_FILE` 后才能保证提交人为发起人”，不要伪造。

## 安全边界

- 删除、批量删除、流程审批/回退/否决、通讯录/部门/角色管理、`jdy_raw_post` 之前，先复述目标应用、表单、记录 ID 和动作，取得用户明确确认。
- 不要把 API Key、access token、App Secret 或手机号写进回复、文档或安装包。
- 不要把浏览器里的 `dashboard#/app/...` 当作 `JIANDAOYUN_BASE_URL`。基准地址应为 `https://nocode.pipechina.com.cn`。

## 示例

查询机械队发电统计最近五条：

```json
{
  "app_query": "中卫维抢修中心",
  "form_query": "机械队发电统计",
  "limit": 5,
  "allow_first_match": true
}
```

新增记录时，如果用户只说“内容为启机测试，启动设备是济柴90kw发电机，开始时间是今天下午五点半”，应先追问缺失的 `作业位置`，以及当前表单配置要求的其他必填字段，例如 `作业详情`。补齐后再调用：

```json
{
  "app_query": "中卫维抢修中心",
  "form_query": "机械队发电统计",
  "values": {
    "启机原因": "启机测试",
    "作业位置": "机械队",
    "启动设备": "济柴90kw发电机",
    "开始时间": "2026-07-05 17:30",
    "作业详情": "按现场补充内容填写"
  },
  "required_fields": ["启机原因", "作业位置", "启动设备", "开始时间", "作业详情"],
  "initiator_open_id": "ou_来自消息上下文的SenderId"
}
```

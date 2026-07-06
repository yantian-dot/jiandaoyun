# OpenClaw + WeACT 适配说明

## 目标运行时

本项目的 OpenClaw 适配只面向以下链路：

```text
WeACT 消息 -> openclaw-weact channel -> OpenClaw agent -> jiandaoyun MCP tools -> nocode.pipechina.com.cn
```

不包含其他办公助手项目的旧适配层。

## 本版改动点

- `openclaw/openclaw.plugin.json` 的 `contracts.tools` 与实际导出的 79 个 MCP tools 对齐。
- `openclaw/skills/jiandaoyun-openclaw-tools/SKILL.md` 提供 OpenClaw 原生 skill，用于把“零代码平台/简道云/机械队发电统计”等请求路由到 `jiandaoyun` tools。
- `scripts/install-on-server.sh` 会把 skill 链接到 `$HOME/.openclaw-main/plugin-skills/jiandaoyun-openclaw-tools`。
- 安装脚本会从 `tools.deny` 中移除 `jiandaoyun__*`，防止 MCP probe 正常但助手运行时仍无法调用。
- 创建记录时增强必填字段识别，并支持 `required_fields` / `JIANDAOYUN_REQUIRED_FIELDS_FILE` 处理 API 未暴露的业务必填字段。
- 创建记录时增加 `JIANDAOYUN_CREATOR_POLICY=locked`，锁定模式下优先接受 SenderId/open_id 映射出的简道云提交人；如果 direct map 缺失，可用 `weact-cli` 查询发起人身份，再通过工号/邮箱等唯一字段映射到简道云 username。默认拒绝用户传入的 `data_creator` 和显示名兜底。

## 运行时验证

安装后不能只看包是否上传成功，应验证以下层次：

```bash
npm list -g --depth=0 jiandaoyun-mcp-plugin
npm explore -g jiandaoyun-mcp-plugin -- npm run validate:openclaw
test -f "$HOME/.openclaw-main/plugin-skills/jiandaoyun-openclaw-tools/SKILL.md"
openclaw mcp show jiandaoyun
openclaw mcp probe jiandaoyun
systemctl status openclaw-main-gateway.service --no-pager
journalctl -u openclaw-main-gateway.service --since "5 minutes ago" --no-pager | grep -Ei "jiandaoyun|tool-policy|tool call|toolResult" || true
```

最后还需要在 WeACT 会话里 `/reset` 后端到端测试：

```text
请调用工具 jiandaoyun__jdy_openclaw_doctor 检查简道云插件状态。
```

## 必填字段追问

工具会检查两类必填字段：

- API 字段元数据里标记为 required 的字段。
- `JIANDAOYUN_REQUIRED_FIELDS_FILE` 或 `required_fields` 显式配置的业务必填字段。

如果某个表单在页面上设置为必填，但 API 没有返回 required 标记，需要把字段写入 `JIANDAOYUN_REQUIRED_FIELDS_FILE`。当前安装脚本会为机械队发电统计写入：

```json
{
  "西北-中卫维抢修中心/机械队发电统计": ["启机原因", "作业位置", "启动设备", "开始时间", "作业详情"],
  "669501b6c47c535dfe561619/6743d2b19d81b4a42b36e4d9": ["启机原因", "作业位置", "启动设备", "开始时间", "作业详情"]
}
```

其他表单可以按同样格式追加。

## 提交人映射

简道云创建接口只能接收 `data_creator`。如果要让提交人显示为 WeACT 发起人，需要把 WeACT SenderId/open_id 或 WeACT 身份唯一字段映射到简道云 username：

```json
{
  "ou_xxx": "jiandaoyun_username",
  "employee_no_or_email": "jiandaoyun_username"
}
```

映射文件路径：

```text
$HOME/.openclaw-main/jiandaoyun-user-map.json
```

服务器安装脚本会设置：

```text
JIANDAOYUN_CREATOR_POLICY=locked
JIANDAOYUN_WEACT_IDENTITY_LOOKUP=auto
JIANDAOYUN_WEACT_CLI_BIN=weact-cli
JIANDAOYUN_WEACT_CLI_AUTH=bot
```

没有 SenderId/open_id，或 direct map 与 WeACT 身份字段都无法解析成简道云 username 时，工具会在写入前拒绝创建记录。这属于运行时配置缺失，不是前端页面刷新问题。真正不可篡改的发起人仍依赖 OpenClaw/weact 在消息上下文中提供真实 SenderId；插件侧会拒绝用户手动指定 `data_creator` 来覆盖提交人。

如果组织确认 WeACT 姓名等于唯一简道云 username，可以显式设置 `JIANDAOYUN_WEACT_CREATOR_FIELD=name`。存在重名、昵称或姓名不等于账号时不要启用这个字段。

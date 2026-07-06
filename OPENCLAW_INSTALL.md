# OpenClaw 安装说明

## 1. 安装包

```bash
npm install -g ./jiandaoyun-mcp-plugin-0.5.3.tgz
```

也可以使用辅助脚本：

```bash
./scripts/install-openclaw.sh ./jiandaoyun-mcp-plugin-0.5.3.tgz
```

## 2. 添加到 OpenClaw

```bash
openclaw mcp add jiandaoyun \
  --command jiandaoyun-mcp \
  --env JIANDAOYUN_API_KEY=YOUR_API_KEY \
  --env JIANDAOYUN_BASE_URL=https://nocode.pipechina.com.cn \
  --env JIANDAOYUN_TIMEOUT_MS=30000
```

如果需要把 WeACT 发起人映射为简道云提交人，可配置：

```bash
export JIANDAOYUN_USER_MAP_FILE="$HOME/.openclaw-main/jiandaoyun-user-map.json"
```

映射文件内容示例：

```json
{
  "ou_xxx": "zhangsan",
  "张三": "zhangsan"
}
```

不要把浏览器里的 `dashboard#/app/...` 地址填到 `JIANDAOYUN_BASE_URL`。

如果表单 API 没有返回必填标记，但业务上必须补齐字段，可配置业务必填字段：

```bash
export JIANDAOYUN_REQUIRED_FIELDS_FILE="$HOME/.openclaw-main/jiandaoyun-required-fields.json"
```

文件内容示例：

```json
{
  "西北-中卫维抢修中心/机械队发电统计": ["启机原因", "作业位置", "启动设备", "开始时间", "作业详情"]
}
```

单用户部署可临时使用 `JIANDAOYUN_DEFAULT_DATA_CREATOR` 兜底提交人；多人使用时应优先传入发起人的 `initiator_name/open_id` 并配置映射。

## 3. 同步 OpenClaw Skill

`openclaw mcp add` 只注册 MCP 服务，不一定会加载 skill。OpenClaw + openclaw-weact + weact-cli 运行时应把 skill 暴露到 `plugin-skills`：

```bash
mkdir -p "$HOME/.openclaw-main/plugin-skills"
ln -sfn "$(npm root -g)/jiandaoyun-mcp-plugin/openclaw/skills/jiandaoyun-openclaw-tools" \
  "$HOME/.openclaw-main/plugin-skills/jiandaoyun-openclaw-tools"
```

服务器脚本 `scripts/install-on-server.sh` 会自动完成这一步，并会从 `tools.deny` 中移除 `jiandaoyun__*`。

## 4. 本地辅助命令

```bash
jiandaoyun-openclaw doctor
jiandaoyun-openclaw print-config
jiandaoyun-openclaw install-template
```

这些命令不会保存 API Key，也不会直接修改 OpenClaw 配置。

## 5. OpenClaw 内验证

安装后先让 Agent 调用：

```text
jdy_openclaw_doctor
```

如果要预热西北公司表单和字段缓存：

```text
jdy_northwest_refresh_schema
```

查看缓存状态：

```text
jdy_northwest_schema_status
```

## 6. 示例提问

- 检查简道云 OpenClaw 插件状态
- 刷新西北公司表单字段缓存
- 找中卫工作日志表并列出字段
- 查中卫工作日志最近 20 条，只看工作内容、负责人、完成情况
- 在中卫工作日志新增一条：工作内容为完成站场巡检，负责人张三，完成情况已完成

## 7. 常见问题

- `Missing JIANDAOYUN_API_KEY`：OpenClaw MCP 配置没有传 API Key。
- `baseUrl` 不正确：应使用 `https://nocode.pipechina.com.cn`。
- 找不到表单：先调用 `jdy_northwest_get_form_context` 缩小 `app_query` 和 `form_query`。
- 字段名未解析：先调用 `jdy_northwest_refresh_schema` 或在查询时让工具实时拉取字段。

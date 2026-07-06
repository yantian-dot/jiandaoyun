# WeACT Identity Creator Resolution Design

## 背景

简道云创建记录接口使用 `data_creator` 决定提交人。`0.5.4` 已经用 `JIANDAOYUN_CREATOR_POLICY=locked` 阻止模型或用户手动指定提交人，但仍要求管理员预先维护 `SenderId/open_id -> 简道云 username` 映射。

用户希望结合 `weact-cli`，在 WeACT 会话发起写入时自动读取发起人的身份信息，减少人工维护成本。

## 设计

`0.5.5` 保持稳定 MCP 核心和现有 OpenClaw tools 不变，只新增提交人解析层：

1. 创建记录时继续要求真实 `sender_open_id` / `initiator_open_id`。
2. 优先读取 `JIANDAOYUN_USER_MAP_FILE` 中的直接 `open_id -> jdy_username` 映射。
3. 若直接映射缺失且 `JIANDAOYUN_WEACT_IDENTITY_LOOKUP=auto`，调用 `weact-cli contact +get-user --user-id <open_id> --as bot --format json`。
4. 从 WeACT 身份结果中提取唯一字段，例如 `open_id`、`user_id`、`employee_no`、`email`、`enterprise_email`，再去映射文件查询简道云 username。
5. 只有管理员显式设置 `JIANDAOYUN_WEACT_CREATOR_FIELD` 时，才允许把某个 WeACT 字段直接作为 `data_creator`。姓名字段默认不可信，重名场景不得默认启用。

## 错误处理

如果没有真实 open_id、`weact-cli` 查询失败、输出不可解析、或所有身份字段都无法映射，工具在写入前拒绝创建记录，并返回缺失映射的 open_id 与身份解析摘要。这样避免记录落成 `creator` 或被用户文本覆盖提交人。

## 验证

本地 smoke test 覆盖三类场景：

- locked 模式下缺少发起人时阻断写入。
- open_id 直接映射到 `data_creator`。
- open_id 未直接映射时，通过模拟 `weact-cli` 返回企业邮箱，再映射到 `data_creator`。

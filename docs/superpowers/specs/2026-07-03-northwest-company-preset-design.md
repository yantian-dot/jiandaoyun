# Northwest Company Preset Design

## Scope

Version 0.3.0 adds an OpenClaw-oriented business preset named `northwest_company`.

The preset covers the applications visible under the `西北公司` group on `https://nocode.pipechina.com.cn/dashboard#/` as confirmed by the user on 2026-07-03. The plugin stores app names and app IDs, then fetches forms dynamically through the Jiandaoyun API.

## Preset Data

The preset includes the following applications:

- 西北-1.0 战略规划到执行
- 西北-4.0 生产运维
- 西北-5.0 安全环保
- 西北-6.0 流程与IT
- 西北-8.0 管理供应链
- 西北-9.0 人力资源管理
- 西北-10.0 管理财经
- 西北-11.1 决策支持与综合服务
- 西北-11.2-11.5 管理综合监督
- 西北-11.6 管理党建
- 西北-甘陕
- 数字元人竞赛实操
- 西北-临时类应用
- 西北-基层应用
- 西北-中卫维抢修中心
- 承包商入场管理
- 数智员工
- 西北-评测类应用
- 西北-基层减负
- 西北-问卷类应用
- QHSE管理体系审核工具2.0_拷贝

## Tools

- `jdy_preset_list`: list available business presets.
- `jdy_preset_northwest_apps`: list the northwest-company app preset.
- `jdy_preset_northwest_forms`: fetch forms for all or matched northwest-company apps.
- `jdy_preset_northwest_find_form`: search forms across northwest-company apps by business keywords.

## Behavior

The preset tools do not add new Jiandaoyun API paths. They call existing app/form APIs and keep fields dynamic. Widgets are fetched only when `include_widgets` is true.

Dangerous-tool protection is intentionally out of scope for this version.

## Testing

Unit tests should verify preset app coverage, keyword matching, form pagination behavior, and optional widget fetching.

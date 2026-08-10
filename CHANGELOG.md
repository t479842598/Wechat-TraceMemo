# 更新日志

本文件记录 Wechat-TraceMemo（fork 自 [Wxw-Gu/WechatExplorer](https://github.com/Wxw-Gu/WechatExplorer)）相对原版的定制改动。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号沿用原版上游 tag，附加本仓库修订标记。

## [2.1.9-tracememo.1] - 2026-08-09

### 新增

- **群聊日报：开放"自定义日期"总结范围**
  - 在日报配置面板的"总结范围"中，启用原版被禁用的"自定义"按钮。
  - 点击"自定义"后展开两个日期输入框（开始日期 / 结束日期），可任意选择开始与结束日期，支持反选（系统自动校正为开始≤结束）。
  - 选择后日报时间窗按"开始日 00:00 至结束日 23:59"计算，并限制不超过当前时刻。
  - 日报标题（`rangeLabel`）与保存到历史记录的 `dateRange` 字段均同步显示"自定义 YYYY-MM-DD 至 YYYY-MM-DD"。

### 变更

- `SummaryDateRange` 类型由 `'today' | 'yesterday' | '7days'` 扩展为 `PresetSummaryDateRange | CustomSummaryDateRange`，新增 `isCustomRange` 类型守卫。
- `getSummaryDateRange` 增加 `custom` 分支，按本地时区解析 `YYYY-MM-DD` 字符串计算时间戳。
- `ReportRangeSelector` 自定义按钮去掉 `disabled` 与"即将支持"标记，改为可点击并在选中后渲染日期输入面板。
- main 进程 `agent-group-report-service` 不再把传入的 `range` 收敛为三种枚举，改为透传给 `getSummaryDateRange`。

### 修复

- 无（本轮为功能补全，非缺陷修复；原版"自定义"标记本就是"尚未支持"的占位，不算 bug）。

### 影响文件

- `src/renderer/src/utils/group-report.ts`
- `src/renderer/src/components/reports/ReportRangeSelector.tsx`
- `src/renderer/src/components/reports/AiReportWorkspace.tsx`
- `src/renderer/src/App.tsx`
- `src/main/services/agent-group-report-service.ts`
- `src/renderer/src/styles/reports-core.scss`

### 验证

- `npm run typecheck:web` / `npm run typecheck:node` 均通过。
- `electron-vite build` 成功，`out/main`、`out/preload`、`out/renderer` 产物正常生成并已替换到本地桌面端。
- 对编译产物 `out/main/index.js`、`out/renderer/assets/index-*.js`、`out/preload/index.js` 执行 `node --check` 全部通过。

### 回滚方式

如需回退本次日报自定义日期改动，在桌面端删除 `resources/app/` 目录即可恢复加载原 `app.asar`；源码层面可 `git revert` 本次提交。

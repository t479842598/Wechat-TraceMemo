# 更新日志

本文件记录 Wechat-TraceMemo（fork 自 [Wxw-Gu/WechatExplorer](https://github.com/Wxw-Gu/WechatExplorer)）相对原版的定制改动。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号沿用原版上游 tag，附加本仓库修订标记。

## [2.2.0] - 2026-08-12

### 新增

- **同步上游 TraceMemo v2.2.0（WechatExplorer 品牌升级为 TraceMemo（迹忆））**
  - 完成 WechatExplorer → TraceMemo 品牌迁移：应用名、关于页、安装包标识统一为 TraceMemo（迹忆）。
  - 支持旧版本设置、Knowledge、Token 和 AI 配置迁移，迁移不覆盖、不删除旧数据。
  - 支持全部聊天按会话分目录导出。
  - 群聊日报支持选择群成员、完善语音转写缓存。
  - 新增关闭窗口时退出或保留后台运行的选择。
  - 优化 Knowledge 管理、缓存清理和连接提示。
  - 修复群聊日报成员名称显示错误、高清图片覆盖缩略图、无 MD5 文件名视频导出、大体积 Knowledge 迁移无窗口等上游问题。
- **群管理面板**
  - 聊天头部（仅群聊）新增「群管理」按钮，打开面板可查看群成员列表、退群记录与发言排行。
  - 发言排行支持近 7 天 / 近 30 天 / 全部切换，前三名高亮 + 占比条，未发言成员单独列出。
  - 退群实时监控：基于数据库变更 + 群快照对比，检测到成员减少即在聊天流插入「XXX 退出了群聊」合成消息并记录事件。
  - 历史退群检测：读取该群全部聊天记录发送人，与当前成员快照对比，识别「曾发言但已不在群内」的成员（按最后发言时间倒序），与实时监控事件合并展示。
- **群聊日报自定义日期范围**（本仓库定制，v2.1.9-tracememo.1 引入，随 v2.2.0 保留）
  - 「总结范围」开放自定义开始/结束日期，支持任意日期区间生成日报。

### 变更

- 语音转写由逐条串行改为有界并发（3 路）转写，大量语音消息时界面不再长时间停留在「转写中」，进度动画持续刷新。
- 日报生成进入大消息量统计前先让出一帧，让「整理日报输入」加载动画先渲染，避免数万条消息同步统计造成界面无响应。
- 发布流水线移除 macOS x64 构建（上游 v2.2.0 起仅支持 Apple Silicon arm64）。

### 修复

- 修复日报生成、语音转写、AI 搜索等长任务期间界面「没有响应」的卡顿问题。

### 影响文件

- `src/renderer/src/components/group/GroupManagerPanel.tsx`、`src/renderer/src/styles/group-manager.scss`（新增，群管理面板）
- `src/renderer/src/App.tsx`、`src/renderer/src/components/ChatWindow.tsx`、`src/renderer/src/components/chat/ChatHeader.tsx`（群管理入口与退群监控）
- `src/main/index.ts`、`src/preload/index.ts`、`src/preload/index.d.ts`、`src/main/services/chat-service.ts`、`src/main/wechat-db.ts`、`src/main/wcdb4-client.ts`（发言排行统计链路）
- `src/renderer/src/utils/voice-message-reference.ts`、`src/renderer/src/utils/group-report-facts.ts`（卡顿修复）
- `electron-builder.yml`、`package.json`、`src/renderer/src/features/settings/pages/AboutPage.tsx`（品牌与仓库标识）
- `.github/workflows/release.yml`（移除 macOS x64 构建）

### 验证

- `tsc --noEmit`（node / web）均通过。
- 单元测试 42 文件 230/230、组件测试、集成测试全部通过。
- eslint 0 errors。

### 回滚方式

- 源码：`git reset --hard <上一提交>` 可整体回退；单文件可 `git checkout HEAD -- <file>`。
- 已安装应用：备份并还原 `resources/app/out` 目录。

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

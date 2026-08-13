# 标准发布流程（Release Process）

> 本文档是本项目（t479842598/Wechat-TraceMemo）每次发版的**唯一标准流程**。
> 每次发版按此顺序执行，不要跳过或改动步骤。

## 一、版本号规则

- 正式版一律递增 patch：`v2.2.2` → `v2.2.3` → `v2.2.4` …
- 仅在出现大功能/破坏性变更时由维护者决定是否升 minor（`v2.3.0`）。
- 修改位置：`package.json` 的 `version` 字段；tag 名与 version 保持一致（`vX.Y.Z`）。

## 二、标准流程（按顺序）

1. **验证**
   - `pnpm typecheck`（0 错误）
   - `pnpm test:unit`、`pnpm test:component`（全绿）
   - 构建：`npx electron-vite build`（成功即可）

2. **提交代码**
   - `git add <改动文件>`
   - `git commit -m "<feat|fix|chore>: 描述"`

3. **升级版本号**
   - 修改 `package.json` version 递增 patch
   - `git commit -m "chore: 版本升至 vX.Y.Z，发布正式版"`

4. **打 tag**
   - `git tag vX.Y.Z`

5. **推送并发布**（发布仓库：`t479842598/Wechat-TraceMemo`，即本地 origin）
   - `git push origin main`
   - `git push origin vX.Y.Z`
   - tag 推送后 GitHub Actions（release.yml）自动构建 Windows/macOS 安装包并发布到 Releases，
     即"发布正式版"。到 Actions 页面确认构建成功。

6. **部署本地安装目录**（如需本机生效）
   - 构建产物已生成：`out/{main,preload,renderer}`
   - 备份：`E:\AI\Wechatexplorer\electron\resources\app\out` → `out.bak-<yyyyMMdd-HHmm>`
   - 替换：将 `out/main`、`out/preload`、`out/renderer` 复制到安装目录同名位置
   - 若主进程新增了运行时 npm 依赖（如 qrcode），需同步补齐安装目录
     `resources/app/node_modules`（并更新 `resources/app/package.json` 的 dependencies）

## 三、注意事项

- 上游（Wxw-Gu/TraceMemo）更新时：先合并上游 main 并保留本地独有功能（群管理、时间范围、
  语音容错等），再走本流程发版。
- 本地安装目录部署模式（非安装包）不会自动带上新依赖，主进程新增依赖时必须手动补齐。
- 正式安装包（electron-builder setup.exe）会自动包含全部依赖，无此问题。
- 回滚：代码 `git reset --hard <上一提交>`；安装目录恢复对应 `out.bak-*`。

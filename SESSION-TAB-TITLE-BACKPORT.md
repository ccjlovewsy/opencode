# Backport 报告：浏览器标签页会话状态前缀（v2 dev → v1.19.0）

日期：2026-10-16
基线：官方 tag `v1.19.0`（commit `733b2c62`，已与 GitHub 官方 ref 核对一致）
功能来源：v2 dev 分支本地 commit `408d9dbc7 feat(app): session status prefix in browser tab title`（fork 分支 `session-tab-title`）

## 目标

把 v2 dev 上的「浏览器标签页标题显示会话状态」功能移植到 v1 正式版线，使日常使用的官方形态二进制（`opencode web` / TUI 连接的 server）无需切换到 v2 即可使用该功能，且**不破坏既有数据与配置**（session 记录、skill、MCP、provider）。

功能规格：

- 有会话等待用户（待批准权限且 auto-accept 不覆盖，或阻塞式 question）→ 标题加 `❗ ` 前缀
- 否则有会话在干活 → 加 `● ` 前缀
- 否则还原挂载时捕获的原始标题；pending 优先级高于 running
- 跨多 server 聚合（v1 本身有多 server registry，保留）

## 改动清单（4 文件，未含本报告）

| 文件 | 说明 |
|---|---|
| `packages/app/src/components/workspace-status.ts`（新增） | 纯函数 `workspaceStatus` / `composeDocumentTitle` + 类型 |
| `packages/app/src/components/document-title.tsx`（新增） | 无 UI Solid 组件 `DocumentTitle`，写 `document.title`，卸载还原 |
| `packages/app/src/components/workspace-status.test.ts`（新增） | 13 个纯函数测试 |
| `packages/app/src/app.tsx`（修改） | 在 `SharedProviders` 的 `CommandProvider` 内挂载 |

v2 → v1 状态来源映射：`ctx.data.session.permission/form` → v1 `permission`/`question` store；`settings.permissions.autoApproves` → v1 auto-accept 判定（session 谱系 + directory 级）；`sdk.connection.status` → v1 `servers.health` 轮询；重连 refetch 在 v1 由既有 `server-sync` bootstrap 覆盖，无需移植。

## 过程中发现并修复的三个关键问题

1. **构建错了包**。v1.19.0 仓库里 `packages/cli` 是另一条线（该 tag 恰好把二进制命名为 `lildax`，与 GitHub 官方 tag 内容核对确认是上游原样，非镜像篡改）。官方 `opencode` 二进制由 `packages/opencode` 产出（bin `opencode`，`web` 命令在 `src/cli/cmd/web.ts`，Web UI 经构建时生成的 `opencode-web-ui.gen.ts` 内嵌）。
2. **dev 频道分库导致"会话记录消失"**。浅克隆 checkout tag 是 detached HEAD，`git branch --show-current` 为空 → 构建频道为空字符串 → 数据库写成 `opencode-.db`，而正式版 412 条会话在 `opencode.db`（`packages/core/src/database/database.ts`：频道为 `latest/beta/prod` 或 `OPENCODE_DISABLE_CHANNEL_DB=1` 时才读写 `opencode.db`）。修复：以 `OPENCODE_VERSION=1.19.0 OPENCODE_CHANNEL=latest` 重建，版本号显示 `1.19.0`、无 DEV 徽章、读写 `opencode.db`。
3. **macOS `Killed: 9`**。`cp` 复制已签名二进制会附加 `com.apple.provenance` xattr，触发 Gatekeeper 查杀 ad-hoc 签名二进制。修复：删除该 xattr 并原地 `codesign --sign - --force` 重签。

## 验证记录（全部实测通过）

- `bun typecheck`（packages/app，tsgo）：通过
- 新增测试 13/13 通过；全量单测对比干净基线，失败集合完全一致，**零回归**
- 构建 smoke test 通过；二进制内嵌资产 grep 到 `composeDocumentTitle`/`permissionSessions`/`❗`（minify 后符号），web 服务返回的前端资产 hash 与含功能构建一致
- **session 记录**：`opencode session list` 列出全部历史（412 条）
- **MCP**：真实调用 codegraph_status 返回 905598 节点 / 2074139 边
- **skill**：技能列表完整注入
- **web search**：websearch 在新旧二进制上表现一致（均不可用，本环境只有 webfetch，非回归）
- **provider/工具**：火山网关 GLM 5.3 正常执行
- **功能端到端**：浏览器标签页 `●`/`❗` 前缀已在真实使用中验证（用户确认）

## 安装与回滚

- 安装位置：`~/.opencode/bin/opencode`（v1.19.0 + 本 backport）
- 回滚：同目录 `opencode.1.18.28.bak` 为旧版备份，覆盖回去即可
- 注意：不要运行 `opencode upgrade`（会覆盖自编译版；配置 `autoupdate: false`，自动更新不会动它）

## 遗留事项

- `~/.local/share/opencode/opencode-.db`：dev 频道残留库（仅一条测试会话），可删
- Desktop OpenCode.app（Electron，1.19.2）：不受影响也不含本功能，其自动更新会盖掉补丁，不动
- 上游 PR（sst/opencode）：暂缓，待 v2 线上既有工作收尾后规划

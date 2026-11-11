# ohmygame 代码评审（P0，2026-11-11）

> 对象：[WhiteTowerAI/ohmygame](https://github.com/WhiteTowerAI/ohmygame) `main` @ `74d392f`（v0.0.0-beta.5.5，2026-11-06），本地只读克隆在 `reference/ohmygame/`。
> 方法：只读静态评审，没有安装依赖，也没有运行任何代码。四个方向分别由子代理评审，关键结论由我对照源码复核（下文标「已复核」）。
> 目的：回答 [architecture.md](architecture.md) 第 7 节的 7 个问题，决定是否 fork 它的 daemon。
> 还没做：在 Linux 容器里实际跑起来、资源占用和冷启动实测、agent 成本实测（P0 的后半部分）。

> **决定（2026-11-11）：采用第 6 节的 B 路线——直接用 Pi SDK，移植 ohmygame 的部分模块。** 落地设计见 [architecture.md](architecture.md) 第 7 节。

## 0. 结论

**能 fork，但不建议整体 fork daemon。建议改为「直接用 Pi SDK 搭 agent，按需移植 ohmygame 的几个模块」。**

- daemon 确实能脱离 Electron，用 Node 独立运行，也有可用的 HTTP + SSE 接口；它内部用的 Pi agent 已经支持 Claude Opus 5.5。技术上没有拦路虎。
- 但 daemon 有约 6.4 万行，大部分服务于我们不做的东西：插件系统、外部 CLI agent（Claude Code / Codex）、互动故事、3D、视频、音频、桌面发布和社区。我们真正要用的是 Pi 会话装配、几件工具和画板数据模型。
- 我们必须重做的部分（无头试玩、多租户隔离、Key 网关、单 HTML 导出、素材版本）**不管选哪条路都要做**，fork 并不能省掉它们。
- 上游 30 天内有 1,113 次提交，我们要改的正好是最大的几个文件（`app.ts` 4,636 行、`agent.ts` 3,309 行），合并上游会非常痛，实际上只能当一次性的硬分叉。
- 官方明确说 daemon「为单个可信用户在自己电脑上设计」（`SECURITY.md:29`，已复核），安全边界全部要靠我们的容器提供。

## 1. architecture.md 第 7 节的 7 个问题

| # | 问题 | 结论 | 依据 |
|---|---|---|---|
| 1 | daemon 能否脱离 Electron，在 Linux 容器里无界面运行？ | **能**（试玩除外） | `package.json:28` 提供 `node dist/daemon/server.js`；`server.ts` 不引用 electron（已复核）；桌面端用子进程拉起 daemon（`desktop/daemon-process.ts:51-104`）；Linux 走通用 POSIX 分支，精简镜像要设好 `SHELL` 和 `PATH` |
| 2 | Pi 对 Claude 的支持是否完整？ | **基本完整** | 锁定 `@earendil-works/pi-*` 1.3.0（`package.json:57-58`，已复核），该版本含 `claude-opus-5-5` 和 `claude-sonnet-5-5`（已复核）；用官方 `@anthropic-ai/sdk` 流式调用；自适应 thinking；`PI_CACHE_RETENTION=long` 开 1 小时缓存（ohmygame 自己没开）；`refusal` 映射为错误，**应用层没有换模型重试**，要在我们的网关里补 |
| 3 | `game_use` 试玩能否用无头 Chromium 跑？ | **不能直接用** | 实现是隐藏的 Electron `BrowserWindow` 加 CDP（`desktop/playtest-driver.ts:110-139`，已复核）；daemon 单独运行时返回不可用（`daemon/app.ts:453-459`，已复核）。但工具通过 `GameRuntimeAdapter` 接口调用驱动，可以换成 Playwright 实现，工具定义和动作集（点击、按键、触摸、截图、控制台、`__OHMYGAME_PLAYTEST__` 的 reset / setSeed / step）可以沿用 |
| 4 | 每个实例的资源占用和启动时间？能否每会话一个实例？ | **每会话一个容器可行；资源未实测** | 默认端口 43110、数据目录、Pi 目录都能用环境变量改（`server.ts:21-24,96`，已复核）；没有单实例锁，写入协调是进程内 Map，**不能一个进程服务多个用户**；启动时会加载插件、检查更新、建文件监听，预览会 `npm install` 再起开发服务器，冷启动不会轻 |
| 5 | 有没有稳定的调用接口？ | **有，但不稳定** | HTTP：建项目、建对话、发消息、SSE 事件流（带断点重放）、构建取 ZIP（`app.ts` 2352、3515、3994、4479、4436 行）。路由没有版本号，上游不承诺兼容。MCP（`ohmygame-studio`）只有工具，没有建项目、发消息、构建，不能用来驱动整个会话 |
| 6 | 锁定版本后改动能否维持在少量补丁？ | **不能** | 30 天 1,113 次提交；我们要改的鉴权、provider、工具注册、试玩接线都在 `app.ts` 和 `agent.ts` 里；只能锁定 commit，当硬分叉维护 |
| 7 | 许可证义务 | **可商用，有署名义务** | Apache-2.0：附许可证、标注修改、保留版权声明；**OhMyGame 名称和 logo 不在授权内**（`README.md:352-355`）；插件图标另有 CC BY 4.0（Streamline，需署名）、CC0 品牌图标和一个 GPL 来源（Tiled）。我们不用插件，这些素材一并删掉即可 |

## 2. 安全：必须由我们的容器兜底

| 发现 | 依据 | 对我们的要求 |
|---|---|---|
| 「可信本地模式」是唯一模式：agent 的 read / write / bash 没有审批、没有命令白名单、没有系统级沙箱，工作目录不是安全边界 | `agent.ts:3154-3169`（已复核）；`docs/runtime.md:297-313` | 每个会话一个容器（gVisor / Firecracker），容器内只有该会话的工作区 |
| bash 子进程只过滤 `OHMYGAME_*` 和 `DAEMON_*`，**不过滤 `ANTHROPIC_*` 等其他变量** | `project-process.ts:6-13`（已复核） | 容器里绝不能有真实 Key；只放网关的会话级临时凭证 |
| 不设 token 时完全不鉴权；设了也只是一个全局 token，没有用户级权限 | `app.ts:1391`（已复核） | 每个容器注入随机 token，端口不对外，只由我们的后端访问 |
| 插件的原生代码以运行账号的完整权限运行，manifest 里的能力声明管不住它 | `docs/plugin-security.md:26-32`（已复核） | 关闭插件系统，只保留我们自己的工具 |
| 预览会执行项目里的 `npm install` 和开发服务器；预览 iframe 允许 `same-origin`，没有拦截外连 | `preview.ts:530-580`；`web-game-host.html:6-11` | 依赖只从我们的镜像或白名单装；玩家侧沿用我们自己的沙箱域名和 CSP |
| 文件浏览 API 有路径穿越和符号链接防护，但它不约束 agent 的 bash | `workspace.ts:133-153` | 同第一条，靠容器 |

## 3. 外联与遥测

都在桌面和界面层，或者要靠配置才会开启，生成流程不依赖它们，可以剥离：PostHog 使用统计、Sentry 错误上报、自动更新（`updates.ohmygame.ai`）、插件市场（`plugins.ohmygame.ai`）、模板素材（`assets.ohmygame.ai`）、Supabase 登录、`ohmygame-cloud` 的发布和社区接口。Pi 自己的启动检查用 `PI_OFFLINE=1` 关闭。`pi-telemetry` 包的实际上报内容没有核实（依赖没装），容器出口白名单会兜住它。

## 4. 代码质量

- 规模：daemon 约 6.4 万行（212 个文件），renderer 约 9.1 万行，desktop 约 5,500 行，shared 约 1.7 万行。
- 测试扎实：377 个测试文件，CI 在 Ubuntu、macOS、Windows 上跑类型检查、lint 和测试；有路径穿越回归测试和真实 Node daemon 冒烟。没有覆盖率门槛，也没有接真实模型的端到端测试。
- TypeScript strict，oxlint 不允许警告。
- 超过 1,500 行的大文件有 4 个：`app.ts` 4,636、`agent.ts` 3,309、`checkpoints.ts` 1,927、`projects.ts` 1,803。
- 后台任务有静默吞异常的地方，上线运维时要补日志和监控。

## 5. 值得移植的部分

| 模块 | 位置 | 我们怎么用 |
|---|---|---|
| Pi 会话装配 | `daemon/agent.ts` 的 `createPiSession`（约 3119-3194 行）、`conversations.ts` | 照着它用 Pi SDK 的 `createAgentSession`，但只注册我们的工具，固定模型和网关 |
| 试玩工具定义 | `daemon/playtest-tools.ts`、`GameRuntimeAdapter` 接口 | 沿用工具名、参数和返回格式，驱动换成 Playwright 无头 Chromium |
| 确定性试玩桥 | `__OHMYGAME_PLAYTEST__` 的 reset / setSeed / step | 和我们的 sim 层、回放自检对上 |
| 画板数据模型 | `shared/asset-canvas-schema.ts`、`shared/canvas-workspace.ts`、`docs/canvas-agent.md` | 创作画板的节点模型和「agent 与界面编辑同一批文件」；补上素材版本 |
| 检查点 | `daemon/checkpoints.ts` | 对话修改的回退 |
| 预览启动 | `daemon/preview.ts`、`preview-launch.ts` | 参考端口分配和进程管理 |
| 自定义 provider | `provider-model-settings.ts:430-451` | 证明 Pi 能把 Anthropic 请求指向自定义 baseUrl，直接接我们的网关 |

## 6. 三条路的比较

| | A. 整体 fork daemon（原决定） | B. Pi SDK + 移植模块（推荐） | C. Claude Agent SDK 自建 |
|---|---|---|---|
| agent 运行时 | Pi（ohmygame 的接法） | Pi（我们自己接） | Claude Agent SDK |
| 起步代码量 | 6.4 万行，先删再改 | 只引入需要的几个模块 | 从零写，工具设计照搬 ohmygame |
| 要删掉的 | 插件、外部 CLI agent、故事、3D / 视频 / 音频、桌面发布、遥测、多 provider 配置 | 几乎没有 | 没有 |
| 无头试玩、多租户、Key 网关、单 HTML 导出 | 要做 | 要做 | 要做 |
| 跟上游 | 很难合并，实际是硬分叉 | Pi 是独立的 npm 包（MIT），可以正常升级 | SDK 正常升级 |
| 和 ohmygame 方向的一致性 | 最高 | 高：同一个 agent 运行时、同一套工具和画板模型 | 中：思路一致，运行时不同 |
| 风险 | 带着大量不用的代码和它的安全假设上线 | Pi 的文档和社区比官方 SDK 小 | 和 ohmygame 的工具生态脱钩 |

推荐 B 的理由：它保留了 ohmygame 方向里真正有价值的部分（Pi agent、试玩工具、画板模型），又不用背着 6 万行为桌面单用户写的代码；而必须自己做的那几块，三条路都一样。

## 7. P0 剩下的事

1. ~~定路线~~ 已定：B。
2. **跑起来**：在 Linux 容器里用 Pi SDK 起一个最小生成服务，接 Claude Opus 5.5，用 Playwright 做无头试玩；测冷启动、内存、CPU。
3. **成本实测**：用一个粗糙的 Idle Clicker 模板生成几款游戏，记录 token、美元成本、耗时和成功率，回填 [architecture.md](architecture.md) 第 8 节和 [pricing.md](pricing.md)。这一步需要 Anthropic API Key。

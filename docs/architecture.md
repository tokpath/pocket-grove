# 生成架构：编码 agent + 题材模板（v1.2，2026-11-11）

> v1.2：**互动故事、3D、AI 视频、AI 音频首发默认接入**。互动故事是第五个模板；3D 包括 three.js 3D 游戏和 3D 素材；所有档位按 Seeds 计费；厂商见 [media-models.md](media-models.md)。
> v1.1：P0 代码评审后，agent 运行时从「整体 fork ohmygame daemon」改为「**直接用 Pi SDK，移植 ohmygame 的部分模块**」（第 7 节，评审见 [ohmygame-review.md](ohmygame-review.md)）。
>
> 状态：设计稿。标【待定】的需要产品决定，标【假设】的数字要在 P0 实测。
> 本文**取代**之前「B 题材引擎为主」的生成架构（[prd.md](prd.md) 旧第 3 节、[p1-contract.md](p1-contract.md) 第 3、8 节）。

## 0. 已定决定（2026-11-11）

| 项 | 决定 |
|---|---|
| 技术方向 | **全面采纳 ohmygame 的方向**：生成器是编码 agent，直接写游戏代码 |
| 题材模板 | **五个起手模板**：Idle Clicker、Idle RPG / Cultivation、Tycoon、Merge、**互动故事**。打磨好的模板代码，agent 在模板上改；也可以从 2D 或 3D 起步工程做任意玩法（第 3 节） |
| 排行榜防作弊 | **按游戏回放**：游戏规则放在确定性的 `sim` 模块里，服务端在隔离环境里用这款游戏自己的代码回放前 100 名；不符合结构的游戏不开放公开排行榜 |
| agent 运行时 | **直接用 Pi SDK**（`@earendil-works/pi-coding-agent`，MIT，ohmygame 用的同一个 agent 运行时），自己写一个精简的生成服务，放进服务端容器；只接 Claude。从 ohmygame 移植试玩工具、画板数据模型和检查点（第 7 节）。不整体 fork ohmygame 的 daemon（P0 评审后改定） |
| 2D / 3D | **首发 2D 和 3D 都做**：2D 用 Phaser，3D 用 three.js；3D 素材（模型、绑骨、动画）也首发接入（第 9 节） |
| 媒体 | **首发默认接入** AI 3D、AI 视频、AI 音频（音效、音乐、配音），走我们自己的媒体路由，厂商按海外首发选（[media-models.md](media-models.md)） |
| 档位 | 所有新能力对所有档位开放，按 Seeds 计费，开始前显示价格；单次很贵的操作设上限（[pricing.md](pricing.md)） |

**不变的**：用户不能自带模型或 Key；海外先行；订阅制；先玩再改；存档、离线收益、广告、排行榜都由平台页面处理，游戏拿不到凭证；CrazyGames 导出；创作画板的三条规则（PRD 4.3.1）。

## 1. 和旧方案相比变了什么

| | 旧：题材引擎 | 新：编码 agent + 模板 |
|---|---|---|
| AI 产出 | `game.json` 加美术 | 游戏源码（TypeScript + Phaser 或 three.js）加图片、3D、音频、视频素材 |
| 玩法范围 | 只限四个引擎 | 五个模板之外，也能做任意 2D 或 3D 玩法 |
| 小改 | 一个 JSON Patch | 能只改配置文件就只改配置；否则跑一段 agent 会话 |
| 质量下限 | 引擎保证 | 模板、共享运行时、发布前检查和 agent 试玩共同保证 |
| 玩家设备上运行的代码 | 只有我们的引擎 | **AI 写的代码**，靠沙箱、CSP 和发布检查约束（第 5 节） |
| 单次从零生成成本【假设】 | 约 $0.95 | 约 $2.5–4（第 8 节） |
| 排行榜回放 | 同一个引擎的代码 | 每款游戏自己的 sim 代码，在隔离环境里跑 |

## 2. 整体流程

```
用户（网页，手机优先）
  │  一句话 / 8 步引导 / 对话修改 / 画板操作
  ▼
平台 API（Next.js）──任务队列──► 生成 worker（每个会话一个隔离容器）
                                 ├ 生成服务（我们写）：Pi SDK 编码 agent
                                 │   工具：读写文件、构建、试玩（game_use，移植自 ohmygame）、
                                 │         图片 / 3D / 音频 / 视频生成（接我们的媒体路由）、
                                 │         画板节点、故事节点
                                 ├ 项目工作区：从模板复制的 git 仓库
                                 └ 无头 Chromium（试玩和截图）
          模型网关（容器外）：只有它持有 Claude 和图像、3D、音频、视频厂商的 Key，计量和限额
  ▼
发布管线：构建 → 静态检查 → 无头冒烟 → 回放自检 → 内容安全 → 审核
  ▼
游戏包放到 pocketgrove.games（沙箱域名）→ 平台页面用沙箱 iframe 运行
```

## 3. 项目结构（模板和起步工程都一样）

```
<project>/
  AGENTS.md            给 agent 的规则：目录约定、能改和不能改什么、怎么自测
  game.config.json     所有可调数值和文案；「升级快一倍」「改个名字」只改这里
  assets.json          素材位 → 素材文件（图片、GLB 模型、音频、视频；创作画板的「绑定到游戏位置」）
  src/sim/             游戏规则：确定性的纯逻辑（第 4 节）
  src/view/            Phaser 或 three.js 场景、DOM 界面、动画、音频和视频播放
  src/main.ts          启动：调用共享运行时，接上 SDK
  assets/              素材文件
  replays/             机器人录好的对局，回放自检用
  vendor/pocketgrove/  共享运行时（锁定，agent 不能改）
```

**共享运行时 `@pocketgrove/runtime`**（我们写、所有游戏共用，agent 只能调用）：
- 固定步长循环、带种子的随机数、`ipow` 等确定性数学工具、命令记录、状态哈希。
- 存档、服务器时间、离线收益（上限 8 小时）、激励广告、挑战局和赛季的接口。
- 平台适配器：Pocketgrove 接 pocketgrove-sdk，导出时接 CrazyGames SDK（协议沿用 [p1-contract.md](p1-contract.md) 第 6、7 节）。

**agent 的权限**：
- 可以改 `src/`、`game.config.json`、`assets.json`，可以生成和替换素材。
- 不能改 `vendor/`、构建配置、`AGENTS.md`；不能新增依赖（依赖白名单只有 Phaser、three.js、确定性物理库【候选 Rapier，待验证跨平台确定性】和我们的包，防止供应链攻击）。
- 发布管线会检查锁定文件的哈希，被改过就拒绝。

**模板**：每个题材一套，由我们手工打磨（可以用 studio 或 ohmygame 本身精修）。模板自带完整的存档、离线收益、转生、成就、挑战局和赛季逻辑，以及一份写给 agent 的「怎么扩展这个模板」说明。模板质量决定了生成质量的下限，是 P1 和 P6 的核心工作。

**互动故事模板**（第五个模板）：
- 分支剧情：场景节点、选项、变量和条件、多结局；每个场景可以带插图、背景音乐、配音和短视频过场。
- 故事节点模型和检查（所有节点可达、没有死路、每个结局都能走到）**移植 ohmygame 的互动故事运行时和 `playable_check`**，改接我们的共享运行时：存档走 pocketgrove-sdk，静音响应平台的 `mute` 事件。
- 没有分数，所以**不进挑战局榜和赛季榜**，也不需要 sim 层和回放；分享卡改为「我走到了结局 3 / 5」，挑战链接改为「看看你会走到哪个结局」。
- 文本和画面按全年龄标准审核（平台游玩不限年龄）。

**起步工程**（不是题材模板，用于模板之外的玩法）：
- **2D 起步工程**：Phaser + 共享运行时，已接好存档、广告、平台适配器和 sim 层骨架。
- **3D 起步工程**：three.js + 共享运行时，同上；另带设备分级、加载进度、GLB 加载和压缩设置（第 9 节）。
- 3D 游戏都从 3D 起步工程开始，所以**起步工程（原「空白项目」）首发对所有档位开放**，按 Seeds 计费，价格高于模板。

## 4. 确定性与回放

规则沿用 [p1-contract.md](p1-contract.md) 第 4 节，区别是**对象从「我们的引擎」变成「每款游戏的 `src/sim/`」**：

- `src/sim/` 只能用共享运行时提供的时间、随机数和数学工具；禁用 `Date`、`Math.random`、`Math.pow`、`exp`、`log` 等。由 lint 规则强制，构建时检查。
- `src/sim/` 不能引用 Phaser、three.js、DOM 和 `src/view/`。构建时把它单独打成一个小包（`sim.js`）。
- **3D 游戏**：three.js 只在 view 层。玩法如果需要物理（碰撞、刚体），物理必须放在 sim 层并用确定性的物理库，否则这款游戏不开放排行榜；只用物理做视觉效果的不受影响。
- 互动故事没有 sim 层，不参与回放。
- **回放自检**（发布管线的一步）：用机器人跑几局，分别在无头 Chromium 和服务端隔离环境里执行，状态哈希一致才给这款游戏开放排行榜。
- **服务端回放**：在 V8 隔离环境（如 `isolated-vm`）里运行这款游戏的 `sim.js`，限制 CPU 时间和内存，不给任何网络和文件访问。只回放会进入前 100 名的提交，其余做合理性检查。
- 不符合结构、或回放自检失败的游戏照常可以玩、可以分享，只是不进公开排行榜和赛季；挑战链接里的好友比分照常显示，但标明「未校验」。

## 5. 安全：AI 写的代码在玩家设备上运行

| 层 | 措施 |
|---|---|
| 生成时 | 每个会话一个隔离容器（候选 gVisor 或 Firecracker），只能访问模型网关；Key 不进容器；限 CPU、内存、时长 |
| 依赖 | 只允许白名单依赖；agent 不能联网装包 |
| 静态检查 | 禁止 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource`、`sendBeacon`、动态 `import()`、`eval`、`new Function`、访问 `window.top` / `parent`（SDK 除外）；检查外链 URL |
| 运行时 | 独立域名 pocketgrove.games；`sandbox="allow-scripts"`，不加 `allow-same-origin`；CSP `connect-src 'none'`，只允许加载同域资源。即使静态检查漏掉，游戏也发不出任何请求、拿不到任何凭证 |
| 发布前 | 无头冒烟：3 秒内 `ready`、无报错、SDK 握手、存档往返；内容安全和 IP 检查（视频抽帧，配音和音乐的文本、歌词也要过）；人工抽检 |
| 媒体 | 配音只用预置音色，**不做声音克隆**；视频和 3D 的参考图同样禁止真人照片（[media-models.md](media-models.md) 第 3 节） |
| 上线后 | 举报、下架、按作者封禁；同一份代码的所有改编可以一起下架 |

## 6. 生成和修改的几种路径

| 操作 | 怎么做 | 成本【假设】 |
|---|---|---|
| 设定卡 | 单次模型调用，不进容器 | 约 $0.07 |
| 小改（数值、文案） | 先判断能否只改 `game.config.json`；能就用短会话改配置、跑冒烟，不重新试玩 | 约 $0.15–0.4 |
| 重画或派生一张素材 | 美术路由，不需要 agent | 约 $0.02–0.04 |
| 改编（换主题和部分玩法） | 复制原作的仓库，agent 会话：改配置、换素材、按需改代码、试玩一轮 | 约 $1–2 |
| 从模板做新游戏 | agent 会话：8 步引导产出的设定 → 改模板 → 生成整套美术 → 试玩修复 | 约 $2.5–4 |
| 做一款互动故事 | 同上，素材以插图为主，配音、音乐、视频过场按用户选择另计 | 约 $2.5–4，不含配音和视频 |
| 从 2D 或 3D 起步工程做任意玩法（所有档位） | 同上，但没有模板打底，轮数和失败率都更高；3D 另加模型、绑骨和动画 | 2D 约 $4–8；3D 约 $6–12 |
| 单个媒体素材 | 媒体路由，不需要 agent：3D 模型、绑骨、动画、音效、音乐、配音、视频 | 见 [media-models.md](media-models.md)，定价见 [pricing.md](pricing.md) |

- 8 步引导（PRD 4.3）保留：第 2–4 步只产出设定和配置，便宜；第 5 步起才进容器跑 agent。
- 每次 agent 会话设轮数和花费上限，超出就停下并告诉用户进度，不让成本失控。
- 平台原因的失败（构建失败、冒烟不通过且修复两次仍失败）退还点数，与原规则一致。

## 7. agent 运行时：Pi SDK + 移植 ohmygame 模块【已定，2026-11-11】

P0 代码评审（[ohmygame-review.md](ohmygame-review.md)）的结论：ohmygame 的 daemon 能脱离 Electron 运行，但约 6.4 万行代码大多服务于我们不做的功能，AI 试玩只能在桌面端用，安全边界完全依赖外部容器，上游 30 天 1,000 多次提交没法合并。所以不整体 fork，改为直接用它底层的 Pi SDK，自己写一个精简的生成服务，只移植需要的模块。

**生成服务（容器内，我们写）**
- 用 Pi SDK 的 `createAgentSession` 建会话，参照 ohmygame 的 `createPiSession`（`src/daemon/agent.ts` 约 3119–3194 行）。
- 模型固定为 Claude Opus 5.5，provider 配成 Anthropic Messages 协议、baseUrl 指向我们的模型网关；容器里只放网关发的会话级临时凭证，不放真实 Key。
- 开 `PI_CACHE_RETENTION=long`（1 小时提示词缓存）和 `PI_OFFLINE=1`（关掉启动时的联网检查）。
- 只注册我们的工具，不加载 Pi 的扩展、技能和上层目录的上下文文件。
- 会话记录用 Pi 的 JSONL 格式，存到会话自己的目录。
- 对外只有一个简单的接口给平台后端：开始会话、发消息、事件流、取构建产物、结束会话。参照 ohmygame 的 HTTP + SSE 设计（事件流支持断点重放）。
- 每个会话随机 token，端口不出容器。

**工具**

| 工具 | 来源 | 说明 |
|---|---|---|
| read / write / edit / bash | Pi 自带 | bash 的子进程环境只保留白名单变量；写入限在工作区内的可改路径（第 3 节的 agent 权限） |
| `game_use` 试玩 | **移植** ohmygame `src/daemon/playtest-tools.ts` | 沿用工具名、参数、返回格式和 `GameRuntimeAdapter` 接口；驱动换成 Playwright 无头 Chromium，替代它基于 Electron 的实现 |
| 确定性试玩桥 | **移植** `__OHMYGAME_PLAYTEST__` 约定（reset / setSeed / step），改名 | 由共享运行时提供，和 sim 层、回放自检对接 |
| 美术生成、派生、重画 | 我们写 | 调用平台的美术路由（[image-models.md](image-models.md)），不用 ohmygame 接的那些图像厂商 |
| 3D 模型、绑骨、动画 | **移植**工具定义 `generate_3d_asset`、`animate_3d_asset` | 底层改接我们的媒体路由（Tripo 为主，[media-models.md](media-models.md)）；输出压缩过的 GLB |
| 音效、音乐、配音 | **移植**工具定义 `generate_sound_effect`、`generate_music`、`generate_speech` | 底层改接 ElevenLabs；配音只用预置音色 |
| 视频 | **移植**工具定义 `generate_video` | 底层改接 Veo 3.1 Lite；单次最长 10 秒 |
| 故事节点和检查 | **移植** `playable_add_node`、`playable_check` 和互动故事运行时 | 互动故事模板用（第 3 节） |
| 画板节点读写和检查 | **移植** `src/shared/asset-canvas-schema.ts`、`canvas-workspace.ts` 的节点模型 | 只保留 2D 图片相关的节点类型；补上素材版本（ohmygame 每次重画只换新 ID，没有版本号） |
| 构建、冒烟、回放自检 | 我们写 | 同发布管线的检查，agent 可以在会话里提前跑 |
| 检查点回退 | **移植** `src/daemon/checkpoints.ts` 的思路 | 对话修改出问题时回退到上一轮；也可以直接用工作区的 git |

**不接入的 ohmygame 功能**

| 功能 | 原因 | 我们的做法 |
|---|---|---|
| 插件系统 | 插件原生代码以运行账号的完整权限运行，manifest 管不住（ohmygame `docs/plugin-security.md`）；现有插件多是对接 Godot、Unity、Blender 等桌面工具 | 只用我们自己审核过的工具 |
| 外部 CLI agent（Claude Code / Codex / OpenCode） | 用用户自己的登录和订阅驱动，等于自带模型，和已定决定冲突 | 只用 Pi + Claude API，经过网关 |
| 多模型配置 | 为用户自带 Key 设计 | 模型只在网关配置，网关保留可替换层（国内版用） |
| 发布和社区（ohmygame-cloud） | 是 ohmygame 自己的平台，服务端代码未公开 | 我们的发布管线、信息流、CrazyGames 导出 |
| 遥测、自动更新 | 数据会上报到 ohmygame 的账号；更新是桌面端功能 | 自己做埋点和错误监控 |
| 它接的 3D、视频、音频厂商（火山引擎、MiniMax、Seedance 等） | 偏国内，海外商用授权和数据合规要逐个确认 | 能力本身首发接入，厂商按海外首发重新选（[media-models.md](media-models.md)） |

> 互动故事、3D、AI 视频、AI 音频原来列在「不接入」里，2026-11-11 改为**首发默认接入**：移植 ohmygame 的工具定义和互动故事运行时，底层厂商换成我们自己的路由。

**许可证**：Pi 是 MIT；移植的 ohmygame 代码是 Apache-2.0，要在文件里保留原版权声明、标注修改，仓库附带它的 LICENSE；不用 OhMyGame 的名称和 logo。

**以后要换成 Claude Agent SDK 时**：项目结构、共享运行时、工具定义和发布管线都不受影响，只需要换会话装配那一层。

## 8. 对成本和定价的影响【假设，P0 实测】

按 [pricing.md](pricing.md) 的 Opus 5.5 价格粗估：一次从模板做新游戏约 30 轮工具调用，上下文大部分走缓存，模型费约 $2–3，加美术约 $0.65，**合计约 $2.5–4**，是旧估算 $0.95 的 3–4 倍。

- 3D 游戏、配音、视频会让单款成本继续上升（第 6 节）；媒体操作单独按 Seeds 计费，不打包进「做一款游戏」的价格。
- 按现在的点数（1 Seed ≈ $0.02），从零生成要约 150 Seeds 才能打平，Plus 每月 200 Seeds 只够做一款多一点。
- 降本手段：模板打底（轮数少）、小改只改配置、缓存、会话上限；以后对比 Sonnet 5.5 是否够用。
- **结论**：定价表（点数单价、各档位点数）要在 P0 实测后重算；在此之前 [pricing.md](pricing.md) 里的生成成本作废，档位价格先不动。

## 9. 2D / 3D 技术栈与媒体

- **Phaser（2D）**：成熟的 2D 游戏框架，ohmygame 也支持；适合 Merge 的拖拽合成、Tycoon 的场景动画。放置类的大量列表和按钮仍建议用 DOM 叠在 Phaser 画布上，文字更清楚。
- **three.js（3D）**：ohmygame 的纯 3D 默认选项。不用 React Three Fiber，少一层依赖。
- **共享缓存**：Phaser 和 three.js 都放在沙箱域名上按固定哈希长期缓存，所有游戏共用，玩第二款时不用再下载。
- **3D 的设备分级**：启动时检测 WebGL2 和设备性能，低端机自动降低像素比、关阴影、用低精度模型；不支持 WebGL 的设备显示「这款游戏需要更新的浏览器」，并推荐同题材的 2D 游戏。
- **3D 的加载**：「3 秒可玩」对 3D 游戏改为「3 秒内出现可操作的首屏」（可以先用低精度模型），其余素材后台加载并显示进度。
- **体积预算【假设，P0 实测】**：

| 素材 | 单个上限 | 格式 |
|---|---|---|
| 3D 模型 | 3MB | GLB，Draco 或 meshopt 压缩，贴图 KTX2 |
| 背景音乐 | 1.5MB / 段 | 循环 OGG（Safari 用 AAC） |
| 音效 | 100KB / 条 | OGG / AAC |
| 视频 | 6MB / 段，最长 10 秒 | MP4（H.264），720p |
| 首次加载合计 | 2D 8MB，3D 15MB | 其余按需加载 |

- **音频和视频的播放规则**：手机浏览器要求用户点击后才能出声，游戏首次点击时再开始播放音乐；所有声音响应平台的 `mute` 事件（CrazyGames 的 `muteAudio` 同样适用）。视频默认静音自动播放，过场可以跳过。
- **模板自带的音效包仍然保留**，作为免费的默认声音；AI 音效和音乐是可选的付费升级。

## 10. 风险

1. **成本**：最大的风险。P0 实测如果远超估算，要考虑提高档位价格、减少免费额度，或把起步工程（尤其是 3D）限在付费档。
2. **等待时间**：agent 会话是分钟级，目标用户是休闲成年人。界面要流式展示进度（agent 在做什么、画好了哪几张），并允许离开后收到通知。
3. **AI 代码的质量**：同一个模板做出来的游戏可能各有 bug。靠模板、冒烟测试、agent 试玩、玩家举报兜底；自营约 50 款是第一轮真实检验。
4. **依赖 Pi**：Pi 的文档和社区比官方 SDK 小，版本也在快速迭代。锁定版本，只通过会话装配那一层使用它，必要时可以换成 Claude Agent SDK（第 7 节）。
5. **CrazyGames 换皮风险**：同一模板只换皮的改编仍可能被拒（PRD 4.6），这点不变。
6. **3D 的性能**：低端安卓机和 TikTok、Instagram 内置浏览器里，3D 游戏更容易卡顿、发热或白屏。靠设备分级、体积预算和冒烟测试里的低端机配置兜底；数据不好时，信息流对低端设备少推 3D。
7. **媒体成本**：视频按秒计费、3D 角色要生成加绑骨加动画，单款成本明显上升。所有媒体操作开始前显示价格，单次设上限，按 Seeds 扣费。
8. **媒体合规**：声音克隆、真人肖像、音乐版权的风险比图片更高。首发不做声音克隆，只用预置音色；各厂商的商用和再分发条款签约前逐家确认。

## 11. 对现有文档的影响

| 文档 | 改动 |
|---|---|
| [prd.md](prd.md) | 第 0、3 节改为本文的架构；4.3 第 4 步改为「AI 改模板的配置」；4.3.1 的画板对象从 `game.json` 改为项目文件；4.7 的回放改为按游戏回放 |
| [product-plan.md](product-plan.md) | 生成器技术要点、游戏包契约、架构、单位成本、路线图（P0 改为 ohmygame 代码评审加成本实测） |
| [p1-contract.md](p1-contract.md) | pocketgrove-sdk、适配器、存档、确定性规则、失败模式继续有效；`game.json` 规则和 Idle Clicker 的 JSON 设计作废 |
| [pricing.md](pricing.md) | 生成成本作废，P0 实测后重算 |
| [open-source-references.md](open-source-references.md) | ohmygame 从「内部工具候选」改为「移植部分模块的来源」；agent 运行时用 Pi SDK |

## 参考资料

- [WhiteTowerAI/ohmygame](https://github.com/WhiteTowerAI/ohmygame)（Apache-2.0；Pi 编码 agent `@earendil-works/pi-coding-agent`；游戏用 Three.js、React Three Fiber 或 Phaser）
- [earendil-works/pi](https://github.com/earendil-works/pi)（MIT；npm `@earendil-works/pi-coding-agent`、`@earendil-works/pi-ai`）
- [Phaser](https://phaser.io/)
- [isolated-vm](https://github.com/laverdet/isolated-vm)
- [gVisor](https://gvisor.dev/) / [Firecracker](https://firecracker-microvm.github.io/)

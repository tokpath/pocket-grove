# 开源参考项目评估（2026-11-11）

> 问题：哪个开源项目最适合作为 Pocketgrove 的基础？
> 结论：**没有一个适合直接当平台底座**；Pocketgrove 自建平台，按模块借鉴下列项目。
> **更新（2026-11-11）**：产品决定全面采纳 ohmygame 的技术方向，P0 代码评审后定为**直接用它底层的 Pi SDK，移植它的试玩工具、画板模型和检查点，不整体 fork daemon**（第 4.2 节、[ohmygame-review.md](ohmygame-review.md)、[architecture.md](architecture.md)）。第 3、4、4.1 节里以「题材引擎为主」为前提的判断保留作记录。

## 1. 我们需要的底座是什么

Pocketgrove 是**托管的多用户 Web 平台**：服务端调用平台托管的 Claude 生成游戏（用户不能自带 Key）、订阅收费、题材模板、游戏信息流、改编、排行榜、沙箱游玩。评估时重点看：形态是否一致、能否多用户托管、模型调用方式、许可证、成熟度。

## 2. 候选对比

| 项目 | 形态 | 模型调用 | 许可证 | 成熟度 | 与 Pocketgrove 的契合度 |
|---|---|---|---|---|---|
| [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) | Claude Code 配置，本地开发者使用 | 本机 Claude Code | MIT | 约 3.8 万 star，v1.3.0 | 低：不是平台；适合做流程/题材参考和内部精修 |
| [WhiteTowerAI/ohmygame](https://github.com/WhiteTowerAI/ohmygame) | Electron 桌面应用 + 本地 daemon，封装 Pi 编码 agent | 用户自带 Key，40+ 模型服务商 | Apache-2.0（名称和 logo 除外） | 约 2k star，1,738 commits，beta 5（2026-10） | 低：桌面端 + 自带 Key，与"托管 + 订阅"相反；更像竞品 |
| [AbdulHannan031/gamesmith-ai-game-generator](https://github.com/AbdulHannan031/gamesmith-ai-game-generator) | Next.js 15 Web 应用 + 公共 arcade | 服务端调用 OpenAI，工具调用循环 | MIT | 6 star，2 commits，个人项目 | **平台形态最接近**，但太早期，不能作为依赖 |
| [bolajiev/prompt-to-playable](https://github.com/bolajiev/prompt-to-playable) | Vite 前端 + Express 后端 | 服务端，兼容 OpenAI 接口 | MIT | 0 star，101 commits，黑客松项目 | **"题材引擎"技术方案最接近** |
| [leigest519/OpenGame](https://github.com/leigest519/OpenGame) | CLI agent 框架 + 评测基准（CUHK MMLab，arXiv 2604.18394） | 自研 GameCoder-27B 或兼容 OpenAI 接口 | Apache-2.0 | 约 3.1k star，16 commits，研究版 | 中：评测方法可直接借鉴 |
| [BeyondPlay-AI/game-prompt-engine](https://github.com/BeyondPlay-AI/game-prompt-engine) | CLI，生成单文件 HTML5 | 自带 Key | 未核实 | 未核实 | 低：其托管平台是竞品 |

## 3. 逐个说明

### ohmygame vs Claude-Code-Game-Studios
- **两者都不适合当底座**：都是"创作者在自己电脑上用"的工具，没有多用户、托管生成、订阅、信息流的服务端。
- **作为参考，ohmygame 更接近我们的生成流程**：描述 → 设计文档 → 美术 → 可玩核心循环 → agent 真实试玩实时 canvas/WebGL 游戏 → 修复 → 再玩；还有素材生成（图像、音频、3D）和发布链接。Claude-Code-Game-Studios 强在流程纪律和题材资料，但没有素材生成。
- **ohmygame 也是一个竞争信号**：免费、自带 Key、带社区。会动手的进阶用户可以零成本用它，所以我们的付费价值必须落在"小白不用装软件、不用配 Key、打开网页就能做"上。
- **内部精修工具**：二者都能用。ohmygame 可以作为 MCP server 接入 Claude Code，补上素材生成；但它是 beta，发行版默认发送遥测（可关闭）。

### GameSmith：平台骨架参考
可借鉴（MIT）：
- 游戏 iframe 沙箱不带 `allow-same-origin`，游戏拿不到 cookie 和平台 API；存档和分数通过 `GameSave`（get / set / submitScore）桥接——与我们的 pocketgrove-sdk 设计一致。
- 草稿与已发布快照分离。
- 每次写文件前校验（JS 语法、模块解析、未定义标识符、精灵图规格）。
- `playtest`（模拟一分钟操作、读取 `state()` 钩子）+ `look`（无头 Chrome 截图让 agent 自评美术）。
- 实时 token 成本显示。
- 不足：只支持 OpenAI、单节点、没有信息流/付费、只有 2 个 commit——借鉴设计，不 fork。

### prompt-to-playable：题材引擎参考
可借鉴（MIT）：
- **LLM 只输出 JSON 游戏文档，固定的 TypeScript 引擎解释运行，"生成的代码从不执行"**。
- Zod schema 既是类型也是运行时校验；失败最多修复两次，仍失败则拒绝。
- 修改用 RFC 6902 JSON Patch，不整份重生成——对应我们的"改编/小改几乎免费"。
- 每个 kit 有专属的可解性检查（例如赛车必须有 3 个有序检查点）。
- 评测：模拟语料 21/21 有效且可解；DeepSeek 跑 13/13 可用、1 次修复。
- 不足：它的 kit 是 3D 动作类，不是放置/经营；黑客松质量。

**这直接支持 PRD 里的"题材引擎"方案**：放置/经营/放置 RPG 的规则比动作游戏更固定，更适合"JSON 配置 + 固定引擎"。

### OpenGame：评测方法参考
- OpenGame-Bench 三个维度：Build Health（能否构建运行）、Visual Usability（画面可用）、Intent Alignment（是否符合描述）；无头浏览器 + 脚本交互 + 视觉模型打分。
- 可借鉴为我们生成器的质量评测集（加上"存档/离线收益/成长曲线是否正常"的题材专项检查）。
- 注意：它的演示用了大量知名 IP（漫威、哈利波特、星战等），我们不能照搬这类示例。

## 4. 如果"借鉴后修改"（fork 改造），选哪个起步

| 候选 | 改造成 Pocketgrove 要动什么 | 判断 |
|---|---|---|
| **GameSmith** | 把 OpenAI 换成 Claude；加题材引擎、信息流、改编、账号体系、订阅与额度；单节点改成"平台 + 生成 worker" | **推荐作为平台起点**：技术栈（Next.js + SQLite + 服务端 agent + 沙箱 iframe + 存档/排行榜桥接）与我们已选的一致；代码量小、MIT，fork 后完全归我们，不用跟上游 |
| **prompt-to-playable** | 3D 动作 kit 换成 2D 放置 / 经营 / 放置 RPG 引擎；保留 schema 校验、修复循环、JSON Patch 修改、可解性检查 | **推荐作为题材引擎的起点**：直接复用它的结构（schema / engine / render 分包），重写引擎内容 |
| **ohmygame** | 作为**平台**：桌面 Electron + 自带 Key 要改成多用户网页服务，界面要从进阶创作者改成移动端小白——几乎重写。作为**生成后端**：把本地 daemon（agent + 试玩 + 素材生成工具）放进服务端容器，每个生成任务一个隔离实例，注入平台的 Key | **不适合当平台起点；可能适合当生成后端**（待代码评审）。优势是真实的：活跃维护（1,700+ commits、约 2k star）、成熟的 agent 运行时、能真实试玩实时 canvas/WebGL 游戏、接好了图像/音频/3D 生成、Apache-2.0。也可替代 studio 作为内部工具，用来打磨题材引擎和旗舰游戏 |
| **OpenGame** | — | 不 fork；借鉴评测方法 |
| **Claude-Code-Game-Studios** | — | 不是代码库；借鉴流程和题材资料，内部精修用 |

**注意**：以上判断基于 README 和公开描述，**还没有读过代码**。正式选定前，需要把 GameSmith、prompt-to-playable、ohmygame clone 下来做一次只读代码评审：代码质量、安全（沙箱、写入校验）、改造工作量、测试情况。ohmygame 额外要回答：
- daemon 能否脱离 Electron 在 Linux 服务器上无界面运行？
- 能否多实例隔离运行（每个用户任务一个），资源占用多少？
- 能否只用服务端注入的 Key、关闭"自带 Key"入口和遥测？
- 有没有稳定的调用接口（HTTP / MCP），还是只能通过界面驱动？
- 上游发版节奏下，锁定版本后改动能否维持在少量补丁？

## 4.1 对"选 ohmygame 做平台"这一外部结论的评估（2026-11-11）

外部结论列出 7 项平台化改造：去掉 Electron 并用无头浏览器重做 AI 试玩、多租户账号与数据库、每个会话独立容器、预览独立域名、平台托管 Key 与计量配额、桌面界面改 Web 界面、自建发布服务替换私有的 `ohmygame-cloud`。

- **认同**：这 7 项都是必须补的；beta 期 fork 后合并上游会很痛、沙箱安全只能自己做，这两个风险判断也成立。
- **但这 7 项做完后，ohmygame 原有的界面、预览、发布、桌面运行时基本都被替换了**，真正留下来的是 agent 运行时、工具集（试玩、素材生成）和项目/会话模型——这与"把它当生成后端"的判断其实一致，分歧只在于叫"fork 平台"还是"借用后端"。
- **外部结论没覆盖的产品层问题**：ohmygame 是自由编码 agent，每次生成是一段多步编码会话（容器、无头浏览器、多轮修复、图像生成），单次成本和等待时间都远高于"题材引擎"方案；而我们已决定模型成本由平台承担、目标用户是 18–34 岁休闲玩家。这会直接决定订阅能否赚钱。
- "可信本地模式、没有沙箱""`ohmygame-cloud` 私有""CCGS 的 `one-shot-driver.js`"三点我尚未核实，放进代码评审。

**真正要拍板的是生成架构**：
| | A. 自由编码 agent（基于 ohmygame） | B. 题材引擎（借鉴 prompt-to-playable） |
|---|---|---|
| 每次生成 | 容器里跑一段编码会话 | 生成 JSON 配置 + 美术，固定引擎运行 |
| 成本 / 等待 | 高 / 分钟级 | 低 / 秒到数十秒 |
| 安全 | 执行 AI 写的代码，需容器 + 沙箱 | 生成的代码不执行，风险小 |
| 玩法范围 | 任意 | 限于已有引擎 |
| 改编成本 | 再跑一段会话 | 一个 JSON Patch |

建议采用 **B 为用户主路径 + A 为内部工具**：用户侧走题材引擎；内部用 ohmygame（或 studio）打磨引擎和旗舰游戏；"自由模式"以后作为高价档再评估，届时 A 的容器化方案可直接复用。

## 4.2 决定：采纳 ohmygame 的技术方向（2026-11-11）

上面第 4.1 节建议「B 题材引擎为主 + A 为内部工具」，产品决定改为**全面转向 A**：
- 生成器是编码 agent，只接 Claude。原定 fork ohmygame 的 daemon；**P0 代码评审后改为直接用 Pi SDK，移植 ohmygame 的部分模块**（[ohmygame-review.md](ohmygame-review.md)）。
- 四个题材降为起手模板；排行榜按游戏回放。（之后又定：互动故事为第五个模板，首发 2D 和 3D 都做，AI 3D、视频、音频默认接入，见 [media-models.md](media-models.md)。）
- 第 4.1 节列出的 7 项平台化改造和本节之前的评审问题仍然成立，并入 [architecture.md](architecture.md) 第 7 节，作为 P0 的代码评审清单。评审不通过时，备选是 Claude Agent SDK 自建。
- prompt-to-playable 的价值下降为「schema 校验、修复循环」的参考；GameSmith 仍是平台骨架参考。

下面第 5 节是转向前的建议，保留作记录。

## 5. 建议（转向前）

1. **自建平台**（Next.js + 服务端生成 + Claude），以 GameSmith 为平台起点、prompt-to-playable 为题材引擎起点 fork 改造；ohmygame 评估作为生成后端和内部工具（均待代码评审确认）。
2. **按模块借鉴**：
   - 沙箱与存档/分数桥接、发布快照、写入校验、自测 → GameSmith
   - 题材引擎（JSON 文档 + schema 校验 + JSON Patch 修改 + 可解性检查）→ prompt-to-playable
   - 生成质量评测 → OpenGame-Bench 的方法
   - 一次成型流程、题材资料、brief 模板 → Claude-Code-Game-Studios（已 clone 到 `studio/`，v1.3.0）
   - agent 真实试玩、素材生成管线 → ohmygame
3. 借鉴代码时保留原许可证声明（MIT / Apache-2.0）；ohmygame 的名称和 logo 不在许可范围内。
4. 内部精修工具：继续用已 clone 的 Claude-Code-Game-Studios；需要素材生成时再试 ohmygame 的 MCP 接入。

## 参考资料
- [WhiteTowerAI/ohmygame](https://github.com/WhiteTowerAI/ohmygame)
- [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios)
- [AbdulHannan031/gamesmith-ai-game-generator](https://github.com/AbdulHannan031/gamesmith-ai-game-generator)
- [bolajiev/prompt-to-playable](https://github.com/bolajiev/prompt-to-playable)
- [leigest519/OpenGame](https://github.com/leigest519/OpenGame)
- [BeyondPlay-AI/game-prompt-engine](https://github.com/BeyondPlay-AI/game-prompt-engine)
- [krittaphato3/infworld](https://github.com/krittaphato3/infworld)
- [sausi-7/promptplay](https://github.com/sausi-7/promptplay)
- [SubmitGame/awesome-ai-game-dev-tools](https://github.com/SubmitGame/awesome-ai-game-dev-tools)
- [lappemic/awesome-ai-built-games](https://github.com/lappemic/awesome-ai-built-games)

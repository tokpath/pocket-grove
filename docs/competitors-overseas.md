# 海外竞品调研（2026-11-11）

> 数据大多来自公司自报或第三方评测站，未经审计；价格以各官网为准，引用前需复核。

## 1. 竞品分四类

### A. "玩 + 做"一体的游戏信息流平台（正面竞争对手）
| 产品 | 形态 | 规模 | 商业模式 | 备注 |
|---|---|---|---|---|
| **Astrocade** | Web + 手机 App；无限下滑的短游戏信息流 + 零门槛 AI 生成器 | 2026-05 融资 $56M（A 轮 Sea 领投，B 轮 Sequoia 领投）；自报约 5M 月活、每月 1.4 亿次游玩、7.5 万款游戏 | 游戏被信息流选中付创作者 $100；$10M 创作者激励计划；订阅价格未查到 | 游戏不能导出；2026-09 被曝推荐使用他人 IP 的游戏（BEN 10、Blox Fruit） |
| **Roblox Build** | Roblox 内一句话生成 | Roblox 2025 年给创作者分成 $1.5B | 免费 | 发布限 16+、三个国家 |
| **Aippy** | 类 TikTok 的手机小游戏信息流 | 未知 | 未知 | — |

### B. 创作工具 + 分享（偏创作者）
| 产品 | 规模 | 价格（第三方整理，待复核） | 备注 |
|---|---|---|---|
| **Rosebud AI** | 自报 100 万创作者、250 万款游戏；YC 投资 | 免费档（每周少量额度、不可商用）；$15 / $30（商用权）/ $50（导出代码）/ $100 每月 | 有 Rosebud Play 信息流；游戏是标准网页，可导出、可上 Steam；不抽成 |
| **Websim** | — | 点数 + 订阅；2026-01 取消免费每日额度和创作者计划 | — |
| 其他 | SEELE、GDevelop AI（开源免费）、Upit、Bitmagic、Cinevva 等 | — | 工具众多，同质化严重 |

### C. H5 游戏门户（只分发，不生成）
| 产品 | 规模（自报） | 开发者分成 |
|---|---|---|
| **Poki** | 约 1 亿月活 | 开发者自带流量 100%，Poki 带来的流量 50%；要求网页端独占，否则改为固定费用 |
| **CrazyGames** | 6000 万+ 月活（开发者文档写 5000 万+） | 标准比例未公开；2026 GameMaker Jam 条款为广告 60%、内购 70% |

门户既是自营游戏的外部渠道，也在争夺同一批碎片时间玩家。

### D. 通用大模型（ChatGPT / Claude / Gemini）
免费就能生成一个游戏文件和链接，但**没有观众**——这正是平台型产品的价值所在。

### 其他渠道（未核实）
YouTube Playables、Discord Activities、Telegram Mini Apps 都支持 HTML5 小游戏，但这次只找到二手资料，接入条件和分成需查官方文档。

## 2. 行业信号

1. **"YouTube + 输入框"**：信息流和创作者收益比生成器本身更重要。玩家规模决定创作者是否留下。
2. **免费生成会被限量或收费**：Rec Room 因"每个玩家都在亏钱"限制生成工具，2026-06 关停；Websim 取消免费额度；国内 TapTap 也改为创作者付费。→ 验证了我们"订阅 + 平台托管 + 成本控制"的方向。
3. **IP 下架潮**：Astrocade 的侵权事件、Tetris 公司维权。→ 生成器必须拦截知名 IP，平台要有 DMCA 流程。
4. **重复游玩是机会**：带存档和成长线的游戏留存更好；Steam 玩家对标注 AI 的游戏评分更低。
5. **细分机会**：单一题材或单一人群（儿童、教师、品牌）的专用生成器，大平台覆盖不到。

## 3. 对 Pocketgrove 的影响

**正面对手是 Astrocade**：同样是"信息流 + 生成器 + Web/手机"，资金多两个数量级。做一个泛泛的"AI 小游戏信息流"很难赢，需要更窄的切入点。

**可选的差异化方向**（需要产品决定）
1. **题材专精：放置 / 模拟经营 / 修仙（cultivation）**——带存档和成长线，正好对应"重复游玩"的机会；修仙题材在海外网文读者中有基础，中文团队有内容优势。生成器围绕这几类题材做深（模板、数值、成长系统），质量可以明显高于通用生成器。
2. **社交对战与挑战**：排行榜、"挑战我的分数"链接、好友对比，主打在 Discord / WhatsApp 群里传播。
3. **质量下限**：自营精品 + 基于精品模板改编，避免信息流被低质 AI 游戏淹没。

建议以 1 为主、2 为传播手段、3 为供给保障。

**定价参考**：Rosebud 面向创作者是 $15–100/月；我们面向小白，入门档应明显更低（如 $5–10/月），但按粗估的单次从零生成成本（$0.4–0.6），$9.99 只够十几次生成——必须先实测成本，并把"改编 / 小改"做成主流用法。

**自营游戏可同时投放 Poki / CrazyGames**：既能赚广告分成，也能给 Pocketgrove 引流；注意 Poki 的网页独占条款。

## 参考资料
- [Trends.vc – AI Game Generators: Play Feeds, Creator Payouts, Genre Makers](https://trends.vc/ai-game-generators-play-feeds-creator-payouts-genre-makers/)
- [Taskade – Best AI Game Generators 2026](https://www.taskade.com/blog/ai-game-generators)
- [PocketGamer.biz – Astrocade raises $56m](https://www.pocketgamer.biz/astrocade-raises-56m-to-expand-ai-powered-games-creation-platform/)
- [FinSMEs – Astrocade Series A and B](https://www.finsmes.com/2026/05/astrocade-raises-56m-in-series-a-and-series-b-funding.html)
- [Rosebud AI](https://rosebud.ai/)
- [toolfi.ai – Rosebud AI Pricing](https://www.toolfi.ai/pricing/rosebud)
- [codaone.ai – WebSim Pricing & Review](https://www.codaone.ai/tools/websim/)
- [Tech Insider – CrazyGames vs Poki vs Coolmath](https://tech-insider.org/crazygames-vs-poki-vs-coolmath-games-2026/)
- [Cinevva – How to Get Your Game on Poki](https://app.cinevva.com/guides/publish-game-poki)
- [CrazyGames Docs – FAQ](https://docs.crazygames.com/faq/)
- [playables.in – YouTube Playables guide](https://playables.in/how-to-make-games-for-youtube-playables/)

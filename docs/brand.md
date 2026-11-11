# 品牌（v0.3，2026-11-11）

> 已确定：品牌名 **Pocketgrove**；口号 **Play in seconds. Make it yours in a sentence.**；点数单位 **Seeds**（原 Sparks）；视觉识别用 **A. Pocket Sprout 口袋嫩芽**，只做浅色界面（第 5 节）。
> **内外统一（2026-11-11）**：原内部代号 `sparkgame` 停用，文档、协议和接口名一律用 Pocketgrove（例如 `pocketgrove-sdk`、`PocketgroveAdapter`、`@pocketgrove/runtime`）。代码仓库是 [tokpath/pocket-grove](https://github.com/tokpath/pocket-grove)。本地目录名和代码包名在商标检索通过后、P0 写代码之前再改（见第 6 节）。

## 1. 名字

**Pocketgrove**：口袋里的一片小树林。

- **小**：手机上、碎片时间、打开链接就能玩。
- **会长**：放置和修仙的成长线、Merge 的「种子 → 大树」合成链、每周赛季，游戏能玩好几周。
- **自己种**：从 0 到 1 做游戏就是「种下一颗种子」；改编就是从别人的树上「分一枝」。
- 不绑定具体题材，以后加题材不用改名。

**为什么不用 sparkgame**
- sparkgame.com、sparkgames.com 都已被注册。
- 「Spark」在游戏类商标里很拥挤：Game Spark Pte. Ltd. 有约 21 件美国商标申请，另有 FirstSpark Games 的申请；同名或近名的产品有 PlaySpark、GameSparks，以及一款叫 Spark Creatures 的放置 RPG。辨识度低，商标风险也高。

## 2. 口号

**Play in seconds. Make it yours in a sentence.**

- 前半句对应「玩」：打开链接 3 秒内能玩，不用下载、不用注册。
- 后半句对应「做」：一句话改编或从零做出自己的游戏。
- 不提具体题材，Tycoon、Merge、自由画风都不会让它过时。
- 中文界面：「几秒就能玩，一句话变成你的。」（待母语文案润色）

## 3. 命名体系

| 用途 | 名称 | 说明 |
|---|---|---|
| 点数单位 | **Seeds** | 「花 50 Seeds 种一款新游戏」；1 Seed 对应约 $0.02 的平台成本（内部换算，见 [pricing.md](pricing.md)） |
| 改编按钮 | **Make my version** | 保持直白，不硬套园艺比喻 |
| 作品署名 / 水印 | **Made with Pocketgrove** | 免费档作品带水印；导出到 CrazyGames 的包只在加载页放文字署名（见 [prd.md](prd.md) 4.6 节） |
| 订阅档位 | Free / Plus / Pro | 暂不改名，用户最容易看懂 |

**用词原则**：园艺比喻只用在名字和点数上，按钮和说明保持普通英语。小白用户要一眼看懂「这要花多少」「点了会怎样」。

## 4. 域名

2026-11-11 用 DNS 查询的结果（NXDOMAIN 只说明没有解析记录，**不等于一定能注册**，要在注册商处确认）：

| 域名 | 状态 | 建议 |
|---|---|---|
| pocketgrove.com | 已被注册（Cloudflare 解析） | 以后可以询价收购；不作为首发依赖 |
| pocketgrove.gg | 无记录 | **首选主站**：游戏圈常用后缀 |
| pocketgrove.games | 无记录 | 建议一起注册，用作游戏沙箱的独立域名（见 [product-plan.md](product-plan.md) 第 4 节） |
| playpocketgrove.com / getpocketgrove.com | 无记录 | 建议注册一个 .com 兜底，用于邮件和防抢注 |
| pocketgrove.app / .io / .co | 无记录 | 视预算防御性注册 |

**注意**：在决定注册前不要把候选名四处传播，防止被抢注。

## 5. 视觉识别：Pocket Sprout 口袋嫩芽

2026-11-11 从三个方向中选定 A，不加夜间模式。三个方向的对比看板见 [visual-identity.html](visual-identity.html)（浏览器打开），logo 的 SVG 路径也以那里为准。

**核心想法**：口袋里冒出一棵嫩芽，小、装得进口袋、会长大。平台界面明亮、圆润、克制，把颜色留给游戏。

### 5.1 Logo

- **图形**：圆底口袋，口袋上方一道虚线缝线，口袋口冒出一根茎和两片叶子。
- **两种配色**：
  - 深色底上（app 图标、大图）：口袋 Mist、缝线 Grove、嫩芽 Sprout，底色 Grove。
  - 浅色底上（顶栏、横排 logo、分享卡署名）：口袋 Grove、缝线 Sprout、嫩芽 #5DB548（Sprout 在浅底上太淡，加深一档）。
- **单色版**：整个图形用 Grove 或白色，缝线做成镂空。用于水印、加载页署名、单色印刷。
- **横排 logo**：图形加字标「Pocketgrove」，字标用 Baloo 2 ExtraBold，颜色 Grove；图形高度约为字标字高的 1.4 倍。
- **最小尺寸**：图形 16px（分享卡署名、浏览器标签页），app 图标 24px。24px 已在看板里验证仍能认出口袋和嫩芽。
- **留白**：四周至少留出图形宽度的 1/4。
- **不要**：拉伸变形、改叶子颜色、加描边或渐变、把图形放在游戏截图等复杂背景上（需要时先垫一块 Mist 或 Grove 底）。

### 5.2 配色

| 名称 | 色值 | 用途 |
|---|---|---|
| Grove | `#1E6B47` | 主色：主按钮、logo、链接、选中的 Tab |
| Sprout | `#A6E06B` | 成长：进度条、升级提示 |
| Sun | `#FFD25E` | Seeds 点数、奖励、每日挑战 |
| Petal | `#FF9AAE` | 少量点缀：成就、点赞 |
| Mist | `#EEF7F1` | 页面背景 |
| Bark | `#1D2B24` | 正文 |

辅助色：卡片白 `#FFFFFF`；次要文字 `#4F6258`；卡片描边 `#D6E9DD`；卡片硬边投影 `#CFE5D7`。

**对比度**（WCAG AA 要求正文至少 4.5:1）：主按钮白字在 Grove 上 6.5:1；Bark 正文在 Mist 上 13.5:1。Sprout、Sun、Petal 在浅底上对比度不够，**只用作色块和图标填充，不用作文字颜色**；它们上面的文字用 Bark。

**用量**：界面以 Mist 和白为主，Grove 只给主操作和品牌位置；Petal 每屏最多一处。

### 5.3 字体

| 用途 | 字体 | 说明 |
|---|---|---|
| logo、标题、按钮 | Baloo 2（600 / 800） | 粗圆体，有品牌性格 |
| 正文、说明、数字 | Atkinson Hyperlegible（400 / 700） | 小字号可读性好 |
| 中文 | 苹方 / 思源黑体（系统回落） | Baloo 2 和 Atkinson 都没有中文 |

两款都是 Google Fonts 上的开源字体（SIL OFL），可以商用、可以自托管。上线时自托管字体文件，不在玩家页面上请求 Google 的服务器（隐私和加载速度）。

**防低龄**：Baloo 2 只用于 logo、页面标题、按钮和分数等大字；说明文字、设置、付费页一律用 Atkinson。目标用户是 18–34 岁，不用卡通贴纸、不用感叹号堆砌。

### 5.4 界面风格

- 卡片圆角 20px，按钮和余额标签用全圆角胶囊。
- 卡片用 1px 描边加向下 3px 的硬边投影（`0 3px 0 #CFE5D7`），不用模糊的灰色阴影。
- 游戏封面在卡片里占大面积，平台界面不随游戏画风变化（见 [prd.md](prd.md) 3.1 节）。
- 只做浅色界面，暂不做夜间模式；以后若有睡前使用的数据再评估。

### 5.5 分享卡

1200×630（Open Graph）：左侧游戏封面约占 42%，右侧依次是「Beat my score」、分数（Baloo 2，Grove）、游戏名、底部小 logo 加「Made with Pocketgrove」。底色 Mist，确保在白色和深色信息流里都醒目。

### 5.6 待办

1. 请设计师按本节精修 logo（光学校正、像素对齐的 16 / 24px 版本），出 SVG 源文件和 app 图标全套尺寸。
2. 界面组件规范（按钮状态、输入框、Tab、Toast、空状态）在 P2 平台 MVP 时随前端一起出。
3. 加载动画：嫩芽从口袋里长出来，一个动作，不超过 1 秒，尊重系统的「减少动态效果」设置。
4. 中文口号和中文界面字体的观感，待母语文案和设计师确认。

## 6. 风险与待办

1. **商标检索**：美国 USPTO、英国 UKIPO、加拿大 CIPO、澳大利亚 IP Australia，类别至少 9（软件）、41（在线游戏与娱乐）、42（SaaS / 生成工具）。网上搜索没找到名为 Pocketgrove 的游戏或应用，但这不能代替正式检索，**需要律师确认后再注册商标和公开使用**。
2. **相近产品**：App Store 上有一款主题相近的「Evergrove Idle: Grow Magic」（种魔法树林的放置游戏）。名字不同，但商标检索时要一起评估混淆风险。
3. **pocketgrove.com 不在我们手里**：用户可能直接输入 .com 访问到别人的网站。分享链接、广告和邮件统一用 .gg 主域。
4. **视觉识别**已定（第 5 节）；绿色在理财、健康类 app 里常见，要靠口袋造型和字体拉开差异，商标检索时 logo 图形也一起检索。
5. **本地目录和代码包名还叫 sparkgame**：等商标检索通过、P0 开始写代码之前一次改完。改目录名之前，要先把 Claude 的项目记忆迁到新路径，否则新会话读不到已定的决定。
6. **仓库是公开的**：tokpath/pocket-grove 为公开仓库（2026-11-11 产品决定直接公开推送），品牌名、定价和架构在商标检索之前已经公开，上面第 1 条的商标检索要尽快做。

## 参考资料
- [GAME SPARK PTE. LTD. – Trademark Portfolio](https://trademarkdir.com/owner/game-spark-pte-ltd)
- [FIRSTSPARK GAMES Trademark](https://gleanmark.com/trademark/uspto-99198509)
- [AppGoblin – Spark Creatures](https://appgoblin.info/apps/com.spark.creatures.gg)
- [Hunted.space – PlaySpark](https://www.hunted.space/dashboard/playspark)
- [App Developer Magazine – GameSparks Ltd](https://appdevelopermagazine.com/business/gamesparks-ltd/)
- [App Store – Evergrove Idle: Grow Magic](https://apps.apple.com/us/app/-/id6754113874)

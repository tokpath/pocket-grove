# P1 技术设计：游戏契约、spark-sdk 与首个引擎（v0.2，2026-11-11）

> **v0.2：生成架构已转向「编码 agent + 题材模板」，见 [architecture.md](architecture.md)。本文按下表部分作废，P1 范围以 architecture.md 和 product-plan.md 路线图为准。**
>
> | 章节 | 状态 |
> |---|---|
> | 1 分层 | 思路有效：sim / view / runtime / adapter 四层现在是**每款游戏的项目结构**，runtime 和 adapter 是共享运行时 |
> | 2 游戏包 | 版本号和排行榜分区思路有效，`balanceHash` 改为「sim 代码 + 配置」的哈希；单 HTML 与共享缓存的取舍仍有效（共享的是 Phaser 和运行时） |
> | 3 game.json 规则 | **作废**（文本长度、颜色对比度、错误格式等细则可沿用到 `game.config.json` 的校验） |
> | 4 确定性与回放 | **有效**，对象改为每款游戏的 `src/sim/` |
> | 5 存档 | **有效** |
> | 6 spark-sdk、7 适配器 | **有效** |
> | 8 Idle Clicker | 玩法循环、公式、素材位、挑战局和赛季、可解性检查可作为 **Idle Clicker 模板**的设计输入；8.2 的 JSON 结构、8.4 词汇表、8.9 与 8 步引导的对应**作废** |
> | 9 代码组织 | 部分有效：`sim-core`、`runtime`、`adapters`、`spark-sdk`、`replay` 保留；`engine-*`、`validator`、`bundler` 改为模板和发布管线 |
> | 10 失败模式、11 验收 | 第 21–24 条（UGC JSON）改为 AI 代码的静态检查和冒烟测试，其余有效 |
> | 12 待定 | 第 1 条（数值生成器）和第 2 条的引擎部分作废；第 5 条（音效包）被 AI 音频默认接入取代；第 3、4 条仍待定 |
>
> 状态：设计稿，还没写代码。标【待定】的地方需要你拍板，标【假设】的数字要在实现后实测。
> 依据：[prd.md](prd.md) 第 3、4.3、4.6–4.8 节，[product-plan.md](product-plan.md) 第 4、7 节，[pricing.md](pricing.md)。
> P1 的完成标志（来自路线图）：一个跑在引擎上、符合契约的样例游戏，浏览器与服务端回放结果一致。

## 0. 本文定下的事

| 主题 | 设计 | 章节 |
|---|---|---|
| 分层 | 纯逻辑的 **sim**（确定性，浏览器和 Node 共用）、负责画面的 **view**、负责循环和录制的 **runtime**、对接平台的 **adapter** 四层；AI 只碰 `game.json` 和素材 | 1 |
| game.json | 集合一律用「以 ID 为键的对象」而不是数组，方便 JSON Patch 按 ID 改；文本内联多语言；不允许出现任何 URL 或 HTML | 3 |
| 校验 | 四层：结构 → 引用和上限 → 引擎可解性 → 内容安全；错误统一成「JSON Pointer + 错误码」交给 AI 修复 | 3.4 |
| 确定性 | 固定 10 Hz tick；sim 里禁用系统时间、`Math.random` 和 `Math.pow` / `exp` / `log` 等不保证跨引擎一致的函数；用 lint、类型配置和三浏览器加 Node 的回放矩阵来强制 | 4 |
| 排行榜分区 | 按「gameId + 数值哈希 + simVersion」分区：只改文案和美术不重置排行榜，改数值或引擎逻辑才重置 | 2.2 |
| spark-sdk | 握手后改用 MessageChannel 专用通道；请求、响应、事件三种消息；首个响应里直接带上存档和服务器时间，省一次往返 | 6 |
| 适配器 | 一套接口，三个实现：sparkgame、CrazyGames、本地开发；读系统时间只允许在适配器里 | 7 |
| 首个引擎 | Idle Clicker：点击、生产建筑、升级、里程碑、转生、随机事件、成就；每款约 15 张图 | 8 |

**需要你拍板的五件事**（第 12 节有详细理由）：

1. **数值由公式生成器出，AI 只调旋钮**。PRD 4.3 第 4 步原文是「AI 生成数值曲线」，建议改掉。
2. **平台上共享引擎、按需加载；单个 HTML 只用于导出**。product-plan 第 4 节原文是「发布时打包成单个 HTML」，建议改掉。
3. **大数先用双精度浮点，加上限检查**；做 Idle RPG 之前再评估要不要换成自定义大数类型。
4. **Idle Clicker 的挑战局默认「限时比总产出」**。PRD 4.7 的举例是「最快达到第一次转生」，建议只作为第二种模式。
5. ~~**音效用引擎自带的音效包，MVP 不做 AI 生成音频**~~ 已被取代：AI 音频首发默认接入，模板自带的音效包保留为免费默认（[architecture.md](architecture.md) 第 9 节）。

## 1. 总体分层

```
┌──────────── 平台页面 pocketgrove.gg（宿主）────────────┐
│ 账号、存档、服务器时间、排行榜、广告抽象层、结果浮层    │
│            ▲  spark-sdk（MessageChannel）              │
│ ┌──────────┴──── 沙箱 iframe pocketgrove.games ──────┐ │
│ │ adapter   SparkAdapter / CrazyGamesAdapter / Local │ │
│ │ runtime   固定步长循环、命令录制、存档调度、后台处理│ │
│ │ view      DOM 渲染、动画、音效（不影响结果）       │ │
│ │ sim       纯函数：状态 + 命令 + tick → 新状态      │ │
│ │           （同一份代码在服务端 Node 里做回放）     │ │
│ │ game.json + 素材（AI 生成，只是数据）              │ │
│ └────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

- **sim** 不认识 DOM、时间、网络和平台，只认 `game.json`、种子和命令。它是回放校验的对象，规则最严（第 4 节）。
- **view** 读状态、发命令，可以随意用动画和 `requestAnimationFrame`，因为它不影响结果。
- **runtime** 决定什么时候跑多少个 tick，给每个命令打上 tick 编号并录下来，按时存档。
- **adapter** 是引擎接触外部世界的唯一出口（第 7 节）。

## 2. 游戏包

### 2.1 目录与 manifest

```
games/<gameId>/<gameVersion>/
  game.json        游戏文档（第 3、8 节）
  assets/          素材，文件名是内容哈希：a_3f9c2e…webp
  cover.png        封面（无头浏览器截图加标题，不由 AI 生成）
  manifest.json
```

`manifest.json` 字段：

| 字段 | 例子 | 说明 |
|---|---|---|
| `gameId` | `g_7Kp2mQ` | 平台分配，改编作品是新的 gameId |
| `gameVersion` | `3` | 每次发布加 1 |
| `engine` / `engineVersion` | `idle-clicker` / `1.2.0` | 精确锁定引擎版本 |
| `simVersion` | `1` | 该引擎版本的 sim 逻辑版本（见 2.2） |
| `contentHash` | `sha256-…` | game.json 加全部素材的哈希 |
| `balanceHash` | `sha256-…` | game.json 里影响 sim 的字段的哈希（不含文本、美术、配色） |
| `title` / `summary` | `{ "en": …, "zh": … }` | 商店展示用 |
| `orientation` | `portrait` | 首发引擎都是竖屏 |
| `scoreOrder` | `desc` | 挑战局分数方向 |
| `origin` | `{ "kind": "ugc", "projectId": …, "remixOf": { "gameId": …, "gameVersion": … } }` | 来历：UGC、自营或 studio 精修 |
| `aiGenerated` | `true` | AI 生成内容标识（导出包也带上，见 PRD 4.6 欧盟 AI 法案） |

素材的来历、提示词、厂商和历史版本**不放进游戏包**，放在平台数据库的素材库里（创作画板用）。游戏包只放当前绑定的那一版。

### 2.2 版本号体系

| 版本 | 谁来加 | 变了意味着什么 |
|---|---|---|
| `engineVersion` 补丁位（1.2.**x**） | 我们 | 只修画面和非逻辑问题；**sim 结果必须完全不变**，由回放矩阵保证（第 11 节） |
| `engineVersion` 次版本（1.**x**.0） | 我们 | 可以改 sim 逻辑，`simVersion` 加 1；game.json 结构只增不删 |
| `engineVersion` 主版本（**x**.0.0） | 我们 | game.json 结构有不兼容变化，附带迁移脚本 |
| `gameVersion` | 作者发布 | 任何内容变化 |
| `balanceHash` | 自动计算 | 数值变了 |

- **排行榜分区键 = gameId + balanceHash + simVersion**。PRD 4.7 要求「作者改数值后排行榜按版本分开」；按这个键分区，作者只改错别字或重画一张图，排行榜不会被清空。
- 服务端永久保留每个 `engineVersion` 的 sim 构建产物（按哈希存放，不可变），回放时用提交时的那一版。

### 2.3 两种交付形态【待定，见第 12 节第 2 条】

| | 平台模式（sparkgame 上游玩） | 单 HTML 模式（导出、存档备份） |
|---|---|---|
| 结构 | 一个很小的 `index.html`，加载 `engine-idle-clicker-<hash>.js`、`game.json`、素材，全部来自 pocketgrove.games | 引擎、game.json、素材（base64）全部内联进一个文件 |
| 缓存 | 引擎文件在所有同引擎游戏间共享，玩第二款时只下载 game.json 和素材 | 每款都要完整下载 |
| 体积预算【假设】 | 首次 ≤ 2MB，同引擎第二款 ≤ 1.5MB | ≤ 4MB（远低于 CrazyGames 50MB 首包限制） |
| 外部请求 | 只允许同一个沙箱域名（CSP `default-src 'self'`） | 一个都没有 |

两种形态用同一套源码、同一个打包脚本输出。

## 3. game.json 通用规则（所有引擎共用）

### 3.1 外壳结构

```jsonc
{
  "engine": "idle-clicker",
  "engineVersion": "1.0.0",
  "locale": { "default": "en", "available": ["en", "zh"] },
  "title": { "en": "Moon Garden", "zh": "月光花园" },
  "theme": { … },        // 配色、字体、音效包（3.2）
  "art": { "slots": { … } },   // 素材位 → 素材文件（3.3）
  // ……以下是引擎专属内容（第 8.2 节）
  "editor": { … }        // 只给编辑器用，sim 不读，也不计入 balanceHash
}
```

### 3.2 字段约定

- **ID**：`^[a-z][a-z0-9_]{1,31}$`，在所属集合内唯一。删除后的 ID **不能复用**，因为旧存档按 ID 引用（例如 `firefly_jar` 等级 12），复用会把旧进度错接到新东西上。
- **集合用对象，不用数组**：`"generators": { "firefly_jar": { "order": 1, … } }`，显示顺序由 `order` 决定。这样 AI 做小改时的 JSON Patch 路径是 `/generators/firefly_jar/baseCost`，不会因为数组下标变化改错对象。
- **文本**：内联多语言对象 `{ "en": "…", "zh": "…" }`，`en` 必填，缺 `zh` 时回落到英文。每类文本有长度上限（第 8.2 节）。文本在页面上一律按纯文本渲染（`textContent`），不解释 HTML 或 Markdown。
- **颜色**：只接受 `#RRGGBB`。校验时检查正文与背景的对比度 ≥ 4.5:1，不够时自动调深或调浅，并在报告里说明。
- **字体和音效**：从引擎提供的枚举里选（例如字体 `rounded` / `serif` / `pixel` / `brush`，音效包 `soft` / `bright` / `retro`），不允许外部字体或音频。
- **数字**：有限的双精度数，不允许 `NaN`、`Infinity` 或 `-0`；每个字段有取值范围（第 8.2 节）。
- **禁止出现**：URL、HTML、脚本、CSS 片段、任何代码。「少量自定义逻辑」只能用引擎提供的词汇表组合（第 8.4 节）。

### 3.3 素材位

- 每个引擎定义自己的素材位清单（Idle Clicker 见第 8.5 节），例如 `hero`、`background`、`gen.firefly_jar`。
- `art.slots` 把素材位映射到包内文件：`"gen.firefly_jar": "a_3f9c2e"`。创作画板里的「绑定到游戏位置」就是写这一行。
- 每个素材位规定用途、尺寸、是否透明背景、文件大小上限。打包时检查：必填位有图、尺寸和透明度对、单张不超限。
- 素材位缺图时，引擎用按配色生成的占位图兜底，游戏照常能玩。这让第 5 步美术之前的试玩也能进行。

### 3.4 四层校验

| 层 | 检查什么 | 花多少时间 | 失败时 |
|---|---|---|---|
| 1. 结构 | JSON Schema（类型、必填、枚举、范围、长度、数组和对象的大小上限、嵌套深度） | 毫秒级 | 交给 AI 修复 |
| 2. 引用与一致性 | ID 唯一且合法；条件里引用的建筑、升级都存在；素材位都有对应文件；对比度；总大小上限 | 毫秒级 | 交给 AI 修复 |
| 3. 引擎可解性 | 用机器人策略跑引擎自带的快速模拟，检查不卡死、节奏达标、数字不溢出（第 8.8 节） | 约 1–3 秒【假设】 | 先自动调旋钮，仍不行再交给 AI |
| 4. 内容安全 | 文本的内容安全和 IP 关键词（与生成器共用的服务） | 视服务而定 | 告知用户，不自动修复 |

**错误格式**（同时给 AI 修复和编辑器界面用）：

```json
{
  "layer": "reference",
  "path": "/upgrades/brighter_jars/requires/0/generator",
  "code": "unknown_id",
  "message": "Generator 'firefly_jars' does not exist.",
  "hint": "Existing generators: firefly_jar, moth_lantern, night_bloom"
}
```

- `path` 用 JSON Pointer，AI 可以直接据此写 JSON Patch 修复；编辑器可以据此定位到对应卡片。
- 错误码是固定枚举（`type`、`required`、`range`、`too_long`、`too_many`、`unknown_id`、`duplicate_id`、`low_contrast`、`missing_asset`、`stall`、`pacing`、`overflow` 等），方便统计哪类错误最常见、改进提示词。
- PRD 规定：修复最多两次，仍失败就拒绝并退还点数。

### 3.5 JSON Patch 规则

- 遵循 RFC 6902，允许 `add`、`remove`、`replace`、`test`。不允许 `move` 和 `copy`，因为它们会让 ID 语义变得难以追踪。
- **受保护路径**：`/engine`、`/engineVersion` 不能改；改 ID（删除后再新增）需要编辑器确认，因为会影响旧存档。
- 补丁先应用到副本，再跑完整的四层校验；任何一层失败，整份补丁作废。
- 单次补丁最多 200 个操作【假设】，超过就视为整款重做，按改编计价。

## 4. 确定性与回放

**目标**：同一份 `game.json`、同一个种子、同一串命令，在 Chrome、Safari、Firefox 和服务端 Node 上，算出的状态逐位相同。

### 4.1 sim 的规则

| 规则 | 原因 |
|---|---|
| 不读 `Date`、`performance`、计时器，也不用 `Intl` | 时间只能由 runtime 以 tick 的形式喂进来 |
| 不用 `Math.random`，只用带种子的随机数（如 sfc32，纯 32 位整数运算） | 结果要可复现 |
| **不用 `Math.pow`、`**`、`exp`、`log`、`sin` 等函数** | ECMAScript 规范把它们定为「实现近似」，V8（Chrome、Node）、JavaScriptCore（Safari）、SpiderMonkey（Firefox）可能在最后一位上不同，累积后排行榜回放就对不上 |
| 允许 `+ - * /`、`Math.sqrt`、`Math.floor`、`Math.ceil`、`Math.min`、`Math.max`、`Math.abs` | 这些 IEEE 754 要求结果正确舍入，各引擎一致 |
| 整数次幂用自带的 `ipow(base, n)`（平方求幂，只用乘法） | 价格公式 `baseCost × growth^n` 只需要整数次幂 |
| 遍历集合按预先排好的 ID 数组，不直接遍历对象 | 求和顺序不同，浮点结果就可能不同 |
| 随机数按用途分成独立的流（事件、掉落、暴击），由主种子派生 | 新增一处随机用途时，不会打乱其他用途的序列；随机事件的出现时刻也不受玩家操作影响，挑战局里所有人看到的事件时刻相同 |
| view 不能调用 sim 的随机数，也不能直接改状态 | 画面效果用自己的非确定随机数 |

### 4.2 时间模型

- **固定 10 Hz**：1 tick = 100 ms。放置类游戏的数值不需要更细；画面按 60 fps 插值显示。
- **前台**：runtime 根据真实时间决定要跑几个 tick，每帧最多补 50 个（避免卡顿后连环卡死）。
- **后台和离线**：
  - 页面进后台时立刻存档。
  - 回到前台时，离开不到 60 秒就补跑 tick；超过 60 秒就向平台要服务器时间，生成一条「离线收益」命令。
  - 离线收益按服务器时间计算，上限 8 小时（PRD 4.7）；sim 里按离线时刻的产出速率一次算完，不逐 tick 模拟，离线期间也不触发随机事件。
- **防加速**：挑战局和赛季的 tick 总数不能超过「服务器记录的开始到提交的真实时长 × 10」再加少量容差。超过的提交直接拒绝。
- **挑战局里切后台就暂停**，不补 tick，对所有人公平。

### 4.3 命令与操作记录

- 状态只能由命令改变：`tap`、`buy`、`upgrade`、`prestige`、`catch_event`、`choose`、`claim_offline` 等。
- runtime 收到 view 的命令时，给它打上「下一个 tick」的编号，在那个 tick 开始时统一执行。浏览器和服务器因此看到完全相同的执行时刻。
- **记录格式**：`[tick, 命令码, 参数…]` 的紧凑数组；点击按 tick 合并成次数（`[1203, "t", 2]` 表示第 1203 个 tick 点了 2 次）。5 分钟、每秒 10 次点击的挑战局压缩后约几 KB。
- `claim_offline` 记录的秒数由平台核对：必须和服务器保存的两次存档时间对得上。

### 4.4 状态哈希与检查点

- 状态哈希：对状态做规范序列化（键排序；数字按 IEEE 754 的 8 个字节写入，不经过字符串转换）后计算 SHA-256。
- 赛季存档每次上传都带「检查点 = tick 编号 + 状态哈希 + 这一段的命令」。服务端回放可以从最近一个已校验的检查点开始，不用每次从头跑。

### 4.5 服务端回放

- 输入：sim 构建产物（按 simVersion）、game.json（按 balanceHash）、种子、操作记录、起始检查点。
- 输出：最终状态哈希和分数，与客户端提交的结果比对。不一致就不上榜，并记录下来用于排查。
- 触发：只对会进入前 100 名的提交回放（PRD 4.7）；所有提交都做合理性检查（点击频率 ≤ 15 次/秒、增长不超过理论上限、tick 数不超过真实时长）。
- 开销【假设】：5 分钟挑战局 3,000 个 tick，回放在几十毫秒内完成；放在生成任务所用的 worker 上即可。

### 4.6 怎么保证规则不被破坏

1. sim 代码单独成包，TypeScript 配置里不包含 DOM 类型，用到 `window`、`document` 时直接编译失败。
2. ESLint 在 sim 包里禁用 `Date`、`performance`、`setTimeout`、`Math.random`、`Math.pow`、`Math.exp`、`Math.log*`、三角函数、`**` 运算符和 `Intl`。
3. **回放矩阵**（第 11 节）：每次改动引擎，都在 Chromium、WebKit、Firefox 和 Node 上跑同一批录好的对局，比对最终状态哈希。补丁版本要求和上一版逐位一致。

## 5. 存档

```json
{
  "format": 1,
  "engine": "idle-clicker",
  "simVersion": 1,
  "gameId": "g_7Kp2mQ",
  "gameVersion": 3,
  "tick": 182340,
  "savedAtServer": 1794357940000,
  "rng": [2851720381, 117, 3302101, 9],
  "state": { "currency": 1.82e9, "generators": { "firefly_jar": 42, "moth_lantern": 17 }, "…": "…" }
}
```

- runtime 每 10 秒自动存一次，页面进后台或关闭时再存一次（PRD 4.7）。
- 只存引擎状态，用稳定 ID 引用；上限 64KB（PRD 4.7）。引擎的状态结构本身有界（集合大小有上限），正常玩不会超。
- **跨版本读档**：
  - 作者改了数值：存档照常读，等级保留，价格和产出按新数值算。
  - 作者删了某个建筑或升级：读档时丢弃对应条目。
  - 作者新增了内容：按默认值补上。
  - 引擎 simVersion 升级：按迁移函数链逐级升级（v1 → v2 → v3），迁移函数也属于 sim，浏览器和服务端用同一份。
- 存档里不放任何个人信息、设备 ID 或账号信息；归属关系由平台在服务端记录。

## 6. spark-sdk 协议

### 6.1 建立通道

游戏在不带 `allow-same-origin` 的沙箱 iframe 里，origin 是 `null`，平台没法按 origin 识别它。所以握手之后改走专用通道：

1. 游戏加载后向父页面发 `{ "pg": "hello", "v": 1 }`，目标 origin 指定为平台域名（构建时写死允许列表：`https://pocketgrove.gg` 和本地开发地址）。
2. 平台检查 `event.source === iframe.contentWindow`，然后新建一个 `MessageChannel`，把其中一个端口通过 `{ "pg": "connect", "v": 1 }` 转交给游戏。
3. 游戏检查 `event.origin` 在允许列表里才接收这个端口。之后所有消息都只走这个端口，页面里的其他 iframe 和脚本既插不进来，也收不到。

### 6.2 消息格式

```jsonc
// 请求（游戏 → 平台）
{ "id": 17, "method": "save.write", "params": { … } }
// 响应（平台 → 游戏）
{ "re": 17, "ok": true, "result": { … } }
{ "re": 17, "ok": false, "error": { "code": "too_large", "message": "Save exceeds 65536 bytes." } }
// 事件（平台 → 游戏，不需要回复）
{ "event": "pause", "data": { "reason": "ad" } }
```

- 错误码是固定枚举：`timeout`、`offline`、`not_allowed`、`rate_limited`、`too_large`、`invalid`、`unavailable`。
- 每个请求都有超时（一般 10 秒，广告 120 秒），超时就按失败处理。
- 单条消息 ≤ 256KB。

### 6.3 方法

| 方法 | 方向 | 参数 → 结果 | 说明 |
|---|---|---|---|
| `session.start` | 游戏 → 平台 | `{ sdk, engine, engineVersion }` → 会话信息（见下） | 第一条请求。**结果里直接带上存档和服务器时间**，省一次往返，为「3 秒可玩」服务 |
| `ready` | 游戏 → 平台 | 无 | 第一帧画面已经画出；平台收起加载画面，并记录「打开到可玩」的耗时。10 秒内没收到就显示错误页 |
| `save.load` | 游戏 → 平台 | 无 → `{ save, serverTime }` | 重新读档时用 |
| `save.write` | 游戏 → 平台 | `{ save, writeSeq }` → `{ savedAtServer }` | 平台至少间隔 5 秒才接受下一次，页面进后台时的那次除外；`writeSeq` 用于识别重复和乱序 |
| `time.now` | 游戏 → 平台 | 无 → `{ serverTime }` | 平台用校准过的时钟偏差直接回答，不必每次请求服务器 |
| `run.checkpoint` | 游戏 → 平台 | `{ tick, stateHash, log }` | 赛季存档的增量操作记录，随存档一起上传 |
| `run.finish` | 游戏 → 平台 | `{ score, tick, stateHash, log }` → `{ accepted }` | 挑战局结束；平台接管，显示结果浮层（名次、登录领取、分享） |
| `ads.rewarded` | 游戏 → 平台 | `{ reason, nonce }` → `{ granted, source }` | `granted` 为真才给游戏内奖励；`source` 是 `paid` 或 `house`，游戏不用关心；同一个 `nonce` 只发一次奖励；挑战局和赛季里直接返回 `not_allowed` |
| `milestone` | 游戏 → 平台 | `{ name }` | 固定枚举：`first_purchase`、`first_upgrade`、`first_prestige` 等，用于 PRD 第 7 节的漏斗指标 |
| `share.score` | 游戏 → 平台 | `{ score }` | 平台弹出分享面板；游戏自己不碰链接 |
| `error.report` | 游戏 → 平台 | `{ message, stack }` | 自动上报未捕获的异常 |

`session.start` 的结果：

```jsonc
{
  "protocol": 1,
  "mode": "normal",            // normal | challenge | season | preview | selftest
  "locale": "en",
  "serverTime": 1794357940000,
  "save": { … },               // 没有存档时为 null
  "run": null,                 // 挑战局或赛季时：{ "runId", "seed", "kind", "timeLimitSec" }
  "caps": { "rewardedAds": true, "share": true },
  "muted": false
}
```

### 6.4 平台发给游戏的事件

| 事件 | 什么时候 | 游戏要做什么 |
|---|---|---|
| `pause` / `resume` | 播广告、打开浮层、切后台 | 暂停时 runtime 停止跑 tick，并静音 |
| `mute` | 用户或平台切换静音 | 开关音效 |
| `save.replaced` | 另一个设备或标签页的存档更新了，用户选择了采用那一份 | 用新存档重新加载 |
| `locale` | 用户切换了语言 | 重新渲染文本 |

### 6.5 运行模式

| 模式 | 用在哪 | 存档 | 广告 | 排行榜 |
|---|---|---|---|---|
| `normal` | 日常游玩 | 常规存档 | 可以 | 不上榜 |
| `challenge` | 每日挑战、挑战链接 | 不存档，开局状态固定 | 不可以 | 挑战局榜 |
| `season` | 每周赛季 | 独立的赛季存档 | 不可以 | 赛季榜 |
| `preview` | 创作者试玩 | 草稿存档，可随时重置 | 自家广告模拟 | 不上榜 |
| `selftest` | 发布前无头自测 | 不存档 | 立即模拟成功 | 不上榜 |

模式由平台根据入口决定（例如从「Play today's challenge」进入就是 `challenge`），游戏不能自己切换。

### 6.6 安全要点

- 游戏拿不到任何凭证、设备 ID 或用户信息；分数由平台带着用户会话提交。
- 平台把游戏发来的所有内容都当作不可信数据：校验大小和格式，不把其中任何内容当作 HTML 插入页面。
- 沙箱属性：`sandbox="allow-scripts"`，不加 `allow-same-origin`、`allow-top-navigation`、`allow-popups`、`allow-forms`。沙箱域名的 CSP 只允许加载同域资源，禁止任何外连。

## 7. 平台适配器

### 7.1 接口

```ts
interface PlatformAdapter {
  readonly caps: { cloudSave: boolean; serverTime: boolean; leaderboards: boolean; rewardedAds: boolean; share: boolean };
  start(info: EngineInfo): Promise<Session>;          // 含存档、模式、语言
  ready(): void;
  loadSave(): Promise<SaveBlob | null>;
  writeSave(save: SaveBlob): Promise<void>;
  now(): Promise<number>;                             // 引擎唯一的时间来源
  gameplay(active: boolean): void;                    // 映射到 CrazyGames 的 gameplayStart / Stop
  rewarded(reason: RewardReason): Promise<{ granted: boolean }>;
  finishRun?(result: RunResult): Promise<void>;       // 只有支持排行榜的平台才有
  checkpoint?(cp: Checkpoint): void;
  celebrate?(): void;                                 // CrazyGames happytime；首次转生时调用
  on(event: 'pause' | 'resume' | 'mute' | 'save.replaced' | 'locale', fn: (data: unknown) => void): void;
}
```

引擎根据 `caps` 决定显示什么：例如 `leaderboards` 为假时，不显示「本周赛季」按钮。

### 7.2 三个实现

| 能力 | SparkAdapter（sparkgame） | CrazyGamesAdapter（导出包） | LocalAdapter（开发和 E2E） |
|---|---|---|---|
| 初始化 | spark-sdk 握手（6.1） | `await CrazyGames.SDK.init()`；加载时调 `loadingStart` / `loadingStop` | 立即返回 |
| 存档 | `save.*`（云存档） | `SDK.data.getItem / setItem`（同步调用，SDK 后台合并写入；上限 1MB；必须提交时打开 Progress Save） | `localStorage` |
| 时间 | 服务器时间 | 本机时间（没有排行榜，离线收益仍然封顶 8 小时） | 本机时间，测试时可注入假时钟 |
| 激励广告 | 平台的广告抽象层 | `SDK.ad.requestAd("rewarded", …)`；`adStarted` 时暂停并静音，`adFinished` 和 `adError` 时恢复；`unfilled`、`adblock`、`adCooldown`、`adsDisabled` 都按「没拿到奖励」处理，按钮显示稍后再试 | 1 秒后返回成功 |
| 静音 | `mute` 事件 | `game.settings.muteAudio` 加设置变化监听（Full Launch 必需） | 页面开关 |
| 游戏开始 / 停止 | 统计用 | `gameplayStart` / `gameplayStop`（进入和离开可操作状态时） | 记录到日志 |
| 排行榜、挑战局、赛季、分享 | 有 | 没有（Basic Launch 不允许外部登录） | 可模拟 |
| 读系统时间 | 不读 | 只在适配器内部读 | 只在适配器内部读 |

- **测试替身要和真实服务守同样的规则**：LocalAdapter 同样执行 64KB 存档上限、5 秒写入间隔、固定错误码和超时，否则本地测试通过、上线后才出错。
- CrazyGamesAdapter 在 P5 实现，P1 只按上面的对照表把接口定下来，保证以后不用改引擎。

## 8. 首个引擎：Idle Clicker

### 8.1 玩法循环

点击主角得到货币 → 买生产建筑，自动产出 → 买升级，产出翻倍 → 同一种建筑攒到 10、25、50…… 个，触发里程碑加成 → 增长放缓时转生：清空进度，换取永久加成，重新开始会更快。偶尔出现随机事件（例如飘过一只发光的萤火虫，点到它就能拿到一大笔奖励），成就记录长期目标。

### 8.2 game.json 的引擎专属部分

以样例游戏 Moon Garden 为例（节选）：

```jsonc
{
  "currency": { "name": { "en": "Moonbeams", "zh": "月光" } },
  "tap": { "base": 1, "label": { "en": "Tap the moon flower", "zh": "点一下月光花" } },
  "generators": {
    "firefly_jar": {
      "order": 1,
      "name": { "en": "Firefly Jar", "zh": "萤火虫瓶" },
      "desc": { "en": "A little glow. It adds up.", "zh": "一点点光，攒起来就多了。" },
      "baseCost": 15, "costGrowth": 1.15, "baseRate": 0.1,
      "requires": []
    },
    "moth_lantern": {
      "order": 2,
      "name": { "en": "Moth Lantern", "zh": "飞蛾灯笼" },
      "desc": { "en": "Moths bring friends.", "zh": "飞蛾会带朋友来。" },
      "baseCost": 100, "costGrowth": 1.15, "baseRate": 1,
      "requires": [{ "type": "owned", "generator": "firefly_jar", "n": 1 }]
    }
  },
  "upgrades": {
    "brighter_jars": {
      "order": 1,
      "name": { "en": "Brighter Jars", "zh": "更亮的瓶子" },
      "desc": { "en": "Firefly Jars produce twice as much.", "zh": "萤火虫瓶产量翻倍。" },
      "cost": 100,
      "requires": [{ "type": "owned", "generator": "firefly_jar", "n": 10 }],
      "effect": { "type": "mult", "target": "firefly_jar", "factor": 2 }
    }
  },
  "milestones": { "at": [10, 25, 50, 100, 150, 200], "factor": 2 },
  "prestige": {
    "enabled": true,
    "currency": { "en": "Stardust", "zh": "星尘" },
    "divisor": 1e12,
    "bonusPerPoint": 0.02
  },
  "events": {
    "glowing_firefly": {
      "kind": "lucky_drop",
      "text": { "en": "A glowing firefly drifts by!", "zh": "一只发光的萤火虫飘过！" },
      "everySec": [120, 300],
      "visibleSec": 12,
      "reward": { "productionSec": 60 }
    }
  },
  "achievements": {
    "first_light": {
      "name": { "en": "First Light", "zh": "第一缕光" },
      "condition": { "type": "owned", "generator": "firefly_jar", "n": 1 }
    }
  },
  "offline": { "efficiency": 0.5 },
  "challenge": { "mode": "earn_in_time", "timeLimitSec": 240 },
  "season": { "metric": "season_lifetime" },
  "editor": { "pacing": "medium", "knobs": { "costRatio": 6.5, "rateRatio": 7.5 } }
}
```

**上限**（AI 输出和用户编辑都受约束；数量同时决定了美术张数）：

| 项 | 范围 |
|---|---|
| 生产建筑 | 4–12 个 |
| 升级 | 6–48 个 |
| 随机事件 | 0–5 个 |
| 成就 | 0–40 个 |
| 里程碑档位 | 3–12 档 |
| 名称 | ≤ 24 字符 |
| 说明 | ≤ 80 字符 |
| `costGrowth` | 1.05–1.25 |
| `offline.efficiency` | 0.25–1.0【假设，默认 0.5】 |
| `challenge.timeLimitSec` | 180–300（PRD 4.7 的 3–5 分钟） |
| 任何数值 | 有限，且 ≤ 1e300 |

### 8.3 数值公式

| 量 | 公式 |
|---|---|
| 买第 n+1 个的价格 | `ceil(baseCost × growth^n)`，`growth^n` 用 `ipow` |
| 一次买 q 个 | 等比数列求和 `baseCost × growth^n × (growth^q − 1) / (growth − 1)`，整数次幂 |
| 单个建筑的产出/秒 | `baseRate × 数量 × 升级倍率 × 里程碑倍率` |
| 总产出/秒 | 各建筑之和（按 order 顺序求和）× 全局升级倍率 ×（1 + bonusPerPoint × 星尘数）× 当前加成 |
| 每 tick 收入 | 总产出 × 0.1 |
| 点击收入 | `tap.base × 点击升级倍率 + 总产出 × 点击取产出比例`（后者来自升级效果 `tap_from_rate`） |
| 转生可得 | `floor(sqrt(累计总产出 / divisor)) − 已获得的星尘数`；用 `sqrt` 而不是任意次幂，因为 `sqrt` 在各浏览器里结果一致 |
| 离线收益 | `离线时的总产出（不含临时加成）× min(离线秒数, 28800) × offline.efficiency`；看广告翻倍 |

### 8.4 扩展点：词汇表

PRD 第 3 节的「少量自定义逻辑」在 Idle Clicker 里就是下面这几张词汇表。AI 只能组合它们，不能写代码。

| 类 | 可选项 |
|---|---|
| 条件（解锁、成就） | `owned`（某建筑数量 ≥ n）、`lifetime`（累计产出 ≥ n）、`taps`、`prestiges`、`upgrades_bought`、`events_caught` |
| 升级效果 | `mult`（对象：`tap`、`all` 或某个建筑）、`tap_from_rate`（点击额外获得总产出的百分比）、`offline`（提高离线效率） |
| 事件类型 | `lucky_drop`（点到就得 N 秒的产出）、`frenzy`（N 秒内点击 ×k）、`boost`（某建筑 N 秒内 ×k）、`choice`（二选一，每个选项是上面的某个效果） |
| 成就奖励 | 无，或全局产出 ×1.01–1.10 |

以后加新玩法，就是加新的词汇（引擎次版本升级），而不是让 AI 写代码。

### 8.5 素材位

| 素材位 | 数量 | 规格 | 说明 |
|---|---|---|---|
| `hero` | 1 | 512×512，透明背景 | 被点击的主角或主物件，画面中心 |
| `hero.tier2`、`hero.tier3` | 0–2（可选） | 同上 | 转生后的形态，从 `hero` 派生（PRD 4.3.1） |
| `background` | 1 | 1080×1920，竖屏 | 场景 |
| `currency`、`prestige` | 2 | 256×256，透明背景 | 货币图标 |
| `gen.<id>` | 4–12 | 256×256，透明背景 | 每个生产建筑一张 |
| `event.<id>` | 0–5 | 256×256，透明背景 | 每个随机事件一张 |

- **升级和成就不单独出图**：升级用目标建筑的图标加引擎画的角标；成就用引擎自带的徽章，按配色着色。
- 一款典型游戏（8 个建筑、3 个事件）约 **15 张图**，比 [pricing.md](pricing.md) 按 20–30 张估算的从零生成美术成本低。先不改定价，等 P2.5 比稿和 P4 实测再调。

### 8.6 界面

- 竖屏：顶部是货币和每秒产出；中间是主角，点击有粒子和数字飘出；底部是可上拉的面板，分「建筑 / 升级 / 转生 / 成就」四个标签。
- 界面由引擎用 DOM 和 CSS 实现（不是 AI 生成），按 `theme` 配色换肤；文字清晰、可缩放、可访问。粒子效果用一层 canvas。
- 大数显示由引擎负责：英文用 K、M、B、T 再往上 aa、ab……，中文用万、亿。
- 桌面端键盘可玩（空格点击、数字键购买），尊重系统的「减少动态效果」设置。
- 不引入 Phaser、Pixi、three.js 等游戏框架：放置类以列表和按钮为主，DOM 更轻、文字更清楚。Merge 引擎再评估是否需要 2D canvas 框架（候选 PixiJS）。
- ~~**不用 three.js**~~（已作废：2026-11-11 起首发支持 3D 游戏，用 three.js，见 [architecture.md](architecture.md) 第 9 节；下面是当时的理由）：ohmygame 的游戏用 Three.js、React Three Fiber 或 Phaser，因为它是自由编码 agent，要支持任意 2D 和 3D 玩法。我们首发的四个引擎都是 2D，素材也明确不做 3D（PRD 4.3.1）；three.js 压缩后仍有约 150KB，还要 WebGL，在低端手机和 TikTok 等内置浏览器里更容易出问题，不利于「3 秒可玩」。以后如果做「自由模式」（PRD 第 3 节，容器里跑编码 agent），three.js 和 Phaser 会是那里的标准选项，与题材引擎无关。

### 8.7 挑战局与赛季

| | 挑战局 | 赛季 |
|---|---|---|
| 开局 | 固定开局状态（可以送几个低级建筑，加快节奏），种子由平台下发 | 全新的赛季存档 |
| 默认玩法【待定】 | `earn_in_time`：限时 4 分钟，比总产出（`desc`）；所有人都能拿到分数，没有「没完成」的情况 | 比本周赛季存档的累计总产出 |
| 可选玩法 | `race_to_target`：最快达到目标产出（`asc`），超时算未完成 | — |
| 禁止 | 转生、广告、离线收益 | 广告；离线收益只用基础的 8 小时上限，不能翻倍 |
| 随机事件 | 出现时刻只由种子决定，所有人相同 | 同左 |

### 8.8 可解性检查

用引擎 sim 自带的「快速推进」接口跑机器人。快速推进在两次购买之间按产出速率直接算出时间，不逐 tick 模拟，所以模拟几十天的游玩也只要一两秒。

**机器人策略**：活跃时每秒点 3 次；有钱就买「回本最快」的那一项；按「每天 3 次、每次 5 分钟，其余时间离线」的作息模拟。

| 检查 | 快节奏 | 中节奏 | 慢节奏 |
|---|---|---|---|
| 第一次购买 | ≤ 10 秒 | ≤ 15 秒 | ≤ 20 秒 |
| 第一次升级（PRD：30 秒内看到第一次升级） | ≤ 30 秒 | ≤ 30 秒 | ≤ 30 秒 |
| 活跃时两次购买之间的最长等待（第一小时内） | ≤ 2 分钟 | ≤ 3 分钟 | ≤ 5 分钟 |
| 第一次转生 | 第 1 天 | 第 2–3 天 | 第 5–7 天 |
| 所有建筑和升级都买得到 | 是 | 是 | 是 |
| 按作息玩 30 天，数值不超过 1e250 | 是 | 是 | 是 |
| 8 小时离线收益 ≤ 一次活跃游玩收益的 N 倍 | 防止离线收益让上线变得没意义 | | |
| 挑战局：机器人分数落在合理区间 | 保证排行榜有区分度 | | |

上表的时间都是【假设】，等自营的 10 款 Idle Clicker 做出来后，用真实玩家数据校准。

检查结果同时生成一份报告（成长曲线、各项是否达标），在 8 步引导的第 4 步展示给用户，也作为第 3 层校验的错误来源（`stall`、`pacing`、`overflow`）。

### 8.9 和 8 步引导的对应

| 步骤（PRD 4.3） | 写入 game.json 的哪里 |
|---|---|
| 2. 设定卡 | `title`、`currency`、`tap.label`、`prestige.currency`、`theme` 的初始值 |
| 3. 玩法系统 | 建筑数量；转生、随机事件、成就三个开关；事件类型 |
| 4. 节奏与数值 | `editor.pacing` 和旋钮 → 数值生成器算出所有 `baseCost`、`baseRate`、升级价格 → 可解性检查 |
| 5. 美术 | `art.slots`（8.5 节的素材位清单就是这一步的待办列表） |
| 6. 内容 | 各种 `name`、`desc`、事件文案、成就 |
| 7. 试玩与修改 | JSON Patch（3.5 节） |
| 8. 发布 | 四层校验 → 打包 → 无头自测（`selftest` 模式）→ 审核 |

## 9. 代码组织与技术选型

```
packages/
  sim-core/              共享底座：tick、随机数、ipow、命令记录、状态哈希、存档迁移（无 DOM）
  engine-idle-clicker/
    schema/              game.json 的 schema（TypeBox 定义，同时导出 JSON Schema 和 TS 类型）
    sim/                 规则
    view/                DOM 界面
    balance/             数值生成器 + 机器人 + 可解性检查
  runtime/               浏览器外壳：固定步长循环、命令录制、存档调度、后台处理
  adapters/              spark / crazygames / local
  spark-sdk/             宿主端和游戏端的协议实现
  validator/             四层校验和错误格式（生成器、编辑器、发布管线共用）
  replay/                Node 回放器
  bundler/               两种交付形态的打包
fixtures/                录好的对局，供回放矩阵使用
```

- TypeScript（strict）、pnpm workspaces、Vite 打包、Ajv 做 JSON Schema 校验、Playwright 跑三个浏览器的 E2E、Node 22 跑回放。
- schema 只写一份（TypeBox），同时生成：给 AI 的 JSON Schema、给 Ajv 的校验器、给引擎的 TS 类型，避免三份定义不一致。
- 这是对 product-plan 第 5 节目录的细化：`sdk/` 并入 `packages/spark-sdk`，`platform/` 仍是 Next.js 平台，`games/` 和 `scripts/` 不变。

## 10. 失败模式清单（写代码之前先列出来）

按你的测试规则，先列出所有可能的失败方式，实现和 E2E 都要覆盖。

**确定性**
1. `Math.pow`、`exp`、`log` 在 Safari 和 Chrome 上最后一位不同，回放对不上。
2. sim 里不小心读了 `Date` 或 `performance`。
3. 遍历对象的顺序不同，浮点求和结果不同。
4. view 调用了 sim 的随机数，浏览器和服务端的随机序列错开。
5. 命令在不同的 tick 执行（例如在 tick 中途直接改状态）。
6. 后台标签页被浏览器限速，补 tick 的逻辑和录制不一致。
7. 离线收益按客户端时钟计算，可以改系统时间刷收益。
8. 引擎补丁版本悄悄改变了 sim 结果，旧对局的回放全部失败。
9. 对局进行中，作者发布了新数值。
10. 旧存档在浏览器和服务端用不同的迁移逻辑升级。
11. 状态里出现 `NaN`、`Infinity` 或 `-0`，序列化后与原值不一致。
12. 批量购买用循环累加，和等比求和公式结果不同。

**协议与存档**
13. 页面里的其他 iframe 冒充平台或游戏发消息。
14. 平台断网或不响应，游戏卡住。（游戏必须继续能玩，存档排队重试。）
15. 存档超过 64KB。
16. 关闭页面时最后一次存档丢失。（`visibilitychange` 和 `pagehide` 时立刻写，本机另留缓存。）
17. 同一款游戏开了两个标签页，存档互相覆盖。（平台用 `writeSeq` 做比较后写入，并用 BroadcastChannel 只让一个标签页存档。）
18. 广告回调始终不来。（超时按没拿到奖励处理，并恢复游戏。）
19. 游戏重复领取同一次广告奖励。（`nonce` 只认一次。）
20. 设备太慢，一帧跑不完要补的 tick，越补越卡。（每帧最多补 50 个。）

**UGC 内容**
21. game.json 里有超大数组、超深嵌套、超长文本。
22. 文本里夹带 HTML 或脚本，颜色字段里夹带 CSS。
23. 素材位引用了不存在的文件，或尺寸和透明度不对。
24. 补丁通过了结构校验，却让游戏卡死。（每次补丁都要重跑可解性检查。）

**CrazyGames 导出**
25. 用了 `localStorage` 而不是数据模块，被拒。
26. 广告期间没有暂停和静音，或者没有响应 `muteAudio`，被拒。
27. 没处理 `adCooldown`，奖励按钮点了没反应。

## 11. P1 验收：E2E 和产物

| 验收项 | 怎么验证 | 产物 |
|---|---|---|
| 样例游戏 | Moon Garden 通过四层校验，在三个浏览器里可玩，存档跨刷新保留 | 三个浏览器的截图 |
| 回放矩阵 | 一批录好的对局（挑战局、带离线和转生的 2 小时赛季、批量购买、随机事件、旧版本存档迁移），在 Chromium、WebKit、Firefox 和 Node 上跑，最终状态哈希全部相同 | `reports/p1/replay-matrix.json` |
| spark-sdk | 测试宿主页面和游戏放在两个不同的本地 origin 上，跑一遍：握手、读写存档、服务器时间、激励广告、挑战局提交、服务端回放通过；改过分数的提交被拒；冒充的消息被忽略 | `reports/p1/sdk-e2e.json` + 截图 |
| 校验器 | 一组故意写坏的 game.json（覆盖第 10 节第 21–24 条），每份都返回预期的错误路径和错误码 | `reports/p1/validator.json` |
| 性能【假设】 | 中端安卓机上每个 tick ≤ 0.2 ms；打开到可玩 ≤ 3 秒（4G 模拟） | 写进 `replay-matrix.json` |

所有报告都能用一条命令重新生成，结果可复现。

## 12. 待定：需要你拍板

1. **数值由公式生成器出，AI 只调旋钮。**
   - 建议：AI 只决定节奏档位和少量旋钮（例如建筑之间价格和产出的倍数），由我们的数值生成器算出每个具体数字，再跑可解性检查。
   - 理由：AI 直接写几十个数字，很容易出现卡关或数字爆炸，修复要来回调用模型，既慢又花钱；公式生成的数值天然能通过检查，「升级快一倍」这类小改也只是改一个旋钮。
   - 影响：PRD 4.3 第 4 步改为「AI 根据设定选节奏和旋钮，数值生成器出曲线」。
2. **平台上共享引擎，单个 HTML 只用于导出。**
   - 建议：在 sparkgame 上，引擎文件在同引擎的所有游戏间共享缓存，每款只下载自己的 game.json 和素材；单个 HTML 用于 CrazyGames 导出和归档。
   - 理由：信息流里连着玩几款时，第二款开始明显更快，有利于「3 秒可玩」；安全性不变，因为都在同一个沙箱域名下，CSP 禁止外连。
   - 影响：product-plan 第 4 节「发布时打包成单个 HTML」改为两种交付形态。
3. **大数先用双精度浮点。**
   - 建议：上限约 1e308，由可解性检查保证 30 天内不超过 1e250。
   - 理由：自己写确定性的大数类型成本不低，常见的现成库都依赖 `Math.pow` 和 `log`，跨浏览器结果不一致。
   - 代价：数字不会像 Cookie Clicker 后期那样涨到 1e1000。做 Idle RPG 之前再评估；存档用稳定 ID 和普通数字，以后迁移到自定义大数类型并不难。
4. **Idle Clicker 挑战局默认「限时比总产出」。**
   - 理由：所有人都有分数，规则一句话说得清；「最快第一次转生」很难压进 3–5 分钟，而且没完成的人没有分数。后者保留为可选玩法。
5. **音效用引擎自带的音效包。**
   - 建议：每个引擎带 3 套音效包，按画风推荐，MVP 不做 AI 生成音乐和音效。
   - 理由：成本和审核都更简单，点击和购买的手感也更可控。

## 参考资料

- [CrazyGames SDK – Data module](https://docs.crazygames.com/sdk/data/)
- [CrazyGames SDK – Game module](https://docs.crazygames.com/sdk/game/)
- [CrazyGames SDK – Video ads](https://docs.crazygames.com/sdk/video-ads/)
- [RFC 6902 – JSON Patch](https://www.rfc-editor.org/rfc/rfc6902)
- [RFC 6901 – JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901)
- [ECMAScript – Math object（implementation-approximated 函数）](https://tc39.es/ecma262/#sec-math-object)

# 3D、视频、音频模型调研（2026-11-11）

> 已确定（2026-11-11）：互动故事、3D、AI 视频、AI 音频**首发默认接入**；3D 包括 3D 游戏（three.js）和 3D 素材（模型、绑骨、动画）；所有档位都能用，按 Seeds 计费；厂商按海外首发重新选，不沿用 ohmygame 接的国内厂商。图像模型见 [image-models.md](image-models.md)。
>
> **价格全部来自第三方汇总，彼此有出入，不能直接用于定价。** 签约前必须以各家官方定价页和商用条款为准，并在 P2.5 媒体比稿里实测。

## 1. 我们要生成什么

| 类别 | 用在哪 | 典型数量（每款） |
|---|---|---|
| 3D 模型（带贴图） | 3D 游戏的角色、道具、场景件 | 3–10 个 |
| 绑骨 + 动画 | 3D 角色的待机、行走、攻击等 | 1–3 个角色 × 2–4 个动画 |
| 音效 | 点击、购买、升级、命中、转场 | 5–15 条 |
| 背景音乐 | 主循环、关卡或章节 | 1–3 段，每段 30–60 秒循环 |
| 配音 | 互动故事的台词、旁白 | 按字数，一款故事约 2,000–10,000 字符 |
| 视频 | 互动故事的过场、片头、动态背景；宣传短片 | 1–5 段，每段 5–10 秒 |

ohmygame 已经有这些工具的定义（`generate_3d_asset`、`animate_3d_asset`、`generate_video`、`generate_speech`、`generate_sound_effect`、`generate_music`），我们移植工具定义，底层改接我们自己的媒体路由（[architecture.md](architecture.md) 第 7 节）。

## 2. 候选与推荐

### 2.1 3D

| 提供方 | 能力 | 价格（约，待核实） | 备注 |
|---|---|---|---|
| **Tripo** | 文字 / 图片生成 3D、绑骨（多种骨架）、动画重定向 | 生成约 20 积分，绑骨约 25 积分，每个动画约 10 积分 | **API 内就能完成「生成 → 绑骨 → 动画」**，最符合需求 |
| **Meshy** | 文字 / 图片生成 3D、贴图、重拓扑、绑骨和动画 | API 需 Pro 订阅（约 $20/月起）加积分 | 付费档含商用权；免费档的授权说法不一 |
| **Rodin（Hyper3D）** | 高质量静态模型 | 订阅约 $30–120/月 | 是否支持绑骨说法不一；适合高质量道具 |

**推荐**：Tripo 为主（角色全流程），Meshy 为备选；Rodin 在比稿里只测道具质量。【假设】一个带贴图的模型约 $0.2–0.5，绑骨约 $0.25，每个动画约 $0.1。

### 2.2 视频

| 提供方 | 价格（约，待核实） | 备注 |
|---|---|---|
| **Google Veo 3.1 Lite** | 720p 约 $0.05/秒，1080p 约 $0.08/秒 | 和图像的 Gemini 同一家，账号和数据条款一起谈 |
| Veo 3.1 Fast / 标准 | 约 $0.15/秒 / 约 $0.75/秒 | 太贵，不默认用 |
| **Kling 3.0** | 约 $0.03–0.14/秒（视渠道和分辨率） | 备选；官方 API 或聚合平台（如 fal.ai）都要核实数据条款 |
| Runway Gen-4 Turbo | 约 $0.05/秒 | 备选 |
| OpenAI Sora 2 | 约 $0.10/秒起 | 有来源称 API 已于 2026-09 停止服务，**不选** |

**推荐**：Veo 3.1 Lite 720p 为主，Kling 或 Runway 为备选。【假设】一段 5 秒 720p 约 $0.25–0.55。

### 2.3 音频

| 用途 | 首选 | 价格（约，待核实） | 备选 |
|---|---|---|---|
| 音效 | ElevenLabs Sound Effects | 约 $0.02–0.12/条 | Stability（Stable Audio） |
| 音乐 | ElevenLabs Music | 约 $0.15–0.30/分钟 | Stable Audio |
| 配音 | ElevenLabs TTS（Flash / Multilingual） | 约 $0.05–0.10/千字符 | Google 或 OpenAI 的 TTS |

**推荐**：ElevenLabs 一家覆盖三类，管理简单；必须用付费档（免费档不能商用）。音乐的商用授权范围要单独确认。

## 3. 合规（签约前逐家确认）

1. **商用和再分发**：用户作品会公开发布、可能带广告收入，还可能导出到 CrazyGames；输出要允许商用、允许平台托管、允许用户在第三方平台再分发。
2. **不用于训练、数据保留期限**：和图像厂商同样的要求。
3. **配音不做声音克隆**：首发只提供预置音色，**不允许上传声音样本，不模仿真人或名人的声音**（深度伪造、肖像权风险）。
4. **视频和 3D 同样禁止真人**：参考图禁止真人照片的规则（[image-models.md](image-models.md) 第 4 节）扩展到视频和 3D。
5. **内容安全**：视频抽帧、配音和音乐的文本都要过内容安全；我们的平台游玩不限年龄，互动故事的文本和画面按全年龄标准审核。
6. **IP**：拦截「像某知名作品」的音乐、角色和画面描述。
7. **AI 生成标识**：导出包按欧盟 AI 法案第 50 条带标识（PRD 4.6），视频和音频同样适用。

## 4. 下一步

- 把 3D、视频、音频并入美术比稿，改为「媒体比稿」（P2.5）；比稿目前仍暂停，恢复时一起跑。
- 每类至少比 2 家，记录质量、一致性（同一角色多个动画、同一款游戏的音乐风格）、耗时、失败率和实际单价。
- 实测后回填 [pricing.md](pricing.md) 的媒体操作定价。

## 参考资料

- [Meshy Docs – Pricing and credits](https://docs.meshy.ai/en/webapp/pricing)
- [3D AI Studio – Best 3D Model Generation APIs in 2026](https://www.3daistudio.com/blog/best-3d-model-generation-apis-2026)
- [Tripo AI Review (2026)](https://pasqualepillitteri.it/en/news/7811/tripo-ai-review-3d-model-generator)
- [Costbench – Rodin vs Tripo AI](https://costbench.com/compare/rodin-hyper3d-vs-tripo-ai/)
- [APICostCalc – Meshy vs Tripo3D vs Rodin](https://apicostcalc.com/meshy-vs-tripo3d-vs-rodin-3d-model-cost-calculator.html)
- [invideo – AI Video Model Pricing (Aug 2026)](https://invideo.io/blog/ai-video-model-pricing)
- [magichour – Veo 3 Pricing](https://magichour.ai/blog/veo-3-pricing)
- [devtk – AI Video API Pricing 2026](https://devtk.ai/en/blog/ai-video-generation-pricing-2026/)
- [atlascloud – Cheapest AI Video APIs 2026](https://www.atlascloud.ai/blog/cheapest-ai-video-generation-api-2026)
- [activepieces – Sora 2 API pricing](https://www.activepieces.com/blog/sora-2-api-pricing-per-second-and-per-plan-in-2026.md)
- [ElevenLabs API pricing（官方）](https://elevenlabs.io/pricing/api)
- [Puter – ElevenLabs API Pricing (Jun 2026)](https://developer.puter.com/tutorials/elevenlabs-api-pricing/)

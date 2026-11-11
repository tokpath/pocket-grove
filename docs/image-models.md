# 图像模型调研（2026-11-11）

> 3D、视频、音频的调研见 [media-models.md](media-models.md)（2026-11-11 起首发默认接入）。

> 已确定：**按用途路由多家**（第 3 节）；改编**允许上传参考照片，但禁止真人照片**（自动检测人脸并拒绝，第 4 节第 3 条）。

> 价格大多来自第三方汇总站，彼此有出入，且图像模型更新很快（多个型号在 2026 年 10 月前后下线或换代）。**签约或定价前必须以各家官方定价页为准**，并用我们自己的素材清单实测。

## 1. 我们要生成什么

一款游戏约 20–30 张图，按用途分三类，需求差别很大：

| 类别 | 例子 | 数量 | 最看重 |
|---|---|---|---|
| 图标 / 物品 | 资源、升级、商品、**Merge 的合成链**（每条链 8–12 级） | 多（10–20） | 同一套风格高度一致、透明背景、小尺寸清晰 |
| 角色 | 主角、顾客、雇员、修仙角色 | 中（3–6） | 角色一致（同一角色多个状态）、透明背景 |
| 场景 / UI | 店铺、修炼场景、背景、按钮框 | 少（3–6） | 画面质量、构图 |

另有两个功能需求：
- **预置画风**：每套画风要能"锁定"，同一款游戏、同一套画风下的素材看起来出自一人之手。
- **自由画风 + 改编**："换成我家橘猫"这类需求要支持参考图和局部编辑。

## 2. 候选

| 提供方 | 型号（2026 年下半年） | 单张价格（约） | 强项 | 弱项 / 注意 |
|---|---|---|---|---|
| **Recraft** | V4.1 / V4.1 Flash / 矢量 | Flash ~$0.007；标准 ~$0.035；矢量 ~$0.08 | **自定义风格**（上传参考图得到 style ID，批量复用）、指定调色板（`rgb_colors`）、原生 SVG、去背景 | 风格"相似但不完全相同"；免费档出图无商用权 |
| **Google Gemini** | Nano Banana 2.1 / 2 Lite / Pro | 2.1 约 $0.034（1K），批量减半；Pro 约 $0.134 | **参考图与编辑**（Pro 最多 14 张参考图保持角色一致）、多轮修改、文字渲染 | 型号换代频繁（2.5 Flash Image、3.1 Flash Image 已/将下线） |
| **OpenAI** | gpt-image-2（及 2.x 变体） | 低质量约 $0.006，中等约 $0.05，高质量 $0.15–0.21 | 指令遵循好；**原生透明背景**（预览中） | 按 token 计费，价格难预估；gpt-image-1 已于 2026-10-23 下线 |
| **Black Forest Labs** | FLUX.2 Klein / pro / flex / max | Klein ~$0.014；pro ~$0.03 起 | 便宜、出图快，适合背景 | 风格锁定需要额外手段；各型号许可证不同，需逐一确认 |
| **Retro Diffusion** | 像素专用 | 约 $0.03/张起；动画 ~$0.14 | **像素画专精**：行走/待机动画、8 方向、精灵图 | 只做像素风；网站点数和 API 余额分开 |
| **Scenario** | 平台 + API | 订阅点数制（$15–75/月），API 单价未公开 | 用 10–50 张参考图**训练自有风格模型**、有 MCP server | 单价不透明，更适合我们内部打造预置画风 |

## 3. 推荐方案：按用途路由，不绑定单一厂商

建一层**美术路由**：每套画风 × 每类素材，指定用哪个提供方、哪个风格 ID。路由配置在服务端，可随时切换厂商。

| 用途 | 首选 | 备选 |
|---|---|---|
| 图标 / 物品 / Merge 合成链（预置画风） | Recraft 自定义风格 + 固定调色板 | gpt-image-2 |
| 角色、场景（预置画风） | Gemini Nano Banana 2.1，带画风参考图 | Recraft、FLUX.2 |
| 像素预置画风 | Retro Diffusion | PixelLab |
| 自由画风、改编、"参考我的照片" | Gemini Nano Banana（参考图 + 编辑），先出样张 | gpt-image-2 |
| 预置画风的打造（内部） | Scenario 训练风格模型，或在 Recraft 建风格 | — |

**一款新游戏的美术成本估算**【假设】：
- 15 个图标 × Recraft Flash ~$0.007 ≈ $0.10
- 5 个角色 × ~$0.05 ≈ $0.25
- 5 个场景 × Nano Banana 2.1 ~$0.034 ≈ $0.17
- 一致性重试 +30%
- **合计约 $0.65**。转向编码 agent 后，加上 agent 会话约 $2–3，单次从模板做新游戏约 $2.5–4（见 [architecture.md](architecture.md) 第 8 节）；美术不再是成本大头，但仍需比稿实测。

## 4. 合规与条款（签约前逐家确认）

1. **商用权与转授权**：用户的作品会公开发布、可能带广告收入；需要确认输出可以商用、可以由平台托管并让用户使用。Recraft 免费档不含商用权，必须用付费 API。
2. **内容安全**：各家都有过滤器，被拒时要能告诉用户原因并退还点数。
3. **参考照片**：首发只允许宠物、物品、风景类照片；**禁止上传真人照片**（深度伪造、肖像权、未成年人风险）。
4. **IP**：拦截"像某某游戏/动画"的风格描述（与生成器一致）。
5. **数据**：确认各家是否用我们的请求训练模型，以及数据保留期限。

## 5. 下一步：美术比稿（需要你批准预算）

- 素材清单：4 个题材模板 × 3 套预置画风 × 一套标准素材（约 25 张）。
- 每个用途至少比 2 家，记录：风格一致性、透明背景、指令遵循、单张成本、耗时、失败率。
- 预估花费：约 300–600 张图，按 $0.01–0.05/张，**约 $5–30**；外加评测时间。
- 产出：一份对比报告（含样图）+ 确定的路由配置 + 更新后的点数定价。

## 参考资料
- [OpenAI – GPT-Image-1 model page](https://developers.openai.com/api/docs/models/gpt-image-1)
- [MLQ.ai – GPT-Image-2 native transparent backgrounds](https://mlq.ai/news/openai-previews-native-transparent-backgrounds-for-gpt-image-2-api/)
- [OpenRouter – GPT Image 2](https://openrouter.ai/openai/gpt-image-2)
- [Developers Digest – Gemini API image pricing](https://www.developersdigest.tech/models/image-generation/google-gemini-api)
- [Activepieces – Nano Banana API pricing 2026](https://www.activepieces.com/blog/nano-banana-api-pricing-cost-per-image-in-2026)
- [Developers Digest – Black Forest Labs pricing](https://www.developersdigest.tech/models/image-generation/black-forest-labs)
- [techpilot – Recraft pricing](https://techpilot.ai/tools/recraft/)
- [apiframe – Recraft API guide](https://apiframe.ai/guides/recraft-api-guide)
- [Recraft V2 docs](https://www.recraft.ai/docs/recraft-models/recraft-V2)
- [Recraft blog – Best AI image generation API 2026](https://www.recraft.ai/blog/best-ai-image-generation-api)
- [Retro Diffusion](https://retrodiffusion.ai/)
- [respawnstack – PixelLab review](https://respawnstack.com/tools/pixellab)
- [DataStudios – Scenario custom-trained assets](https://www.datastudios.org/post/scenario-custom-trained-ai-game-asset-generation-style-consistency-and-pricing-explained)
- [Ludo.ai – Best AI tools for game assets 2026](https://ludo.ai/compare/best-ai-game-asset-generators)

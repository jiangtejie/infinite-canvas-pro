# 漫画角色一致性工程化设计

> 设计已确认；实施拆分见 `docs/superpowers/plans/2026-11-15-comic-character-consistency.md`。

## 目标

让漫画页格生成对角色身份、当前造型和参考图使用同一份结构化上下文，减少跨格/跨页的人物外观漂移；角色设定仍由用户确认，AI 只提供拆格和绑定建议。

## 当前边界

- 漫画工作台负责项目角色、场景、剧本页格、布局、审稿、页格生成与拼合；画布漫画册仍是贴字、页序与成品导出的唯一入口。
- 漫画项目及角色/场景库仍是本机数据。本设计不引入账号云同步、多用户角色权限或影视角色部位矩阵。
- 角色库导入仍是独立副本，不建立会随库内容变化的订阅关系。

## 领域模型

### 基础角色

基础角色只保存长期稳定的身份事实，模型分为明确的语义分区：

```ts
type ComicCharacter = {
  id: string;
  name: string;
  aliases: string[];
  role: string;
  visualIdentity: {
    description: string;
    ageRange: string;
    bodyProportions: string;
    face: string;
    hairstyle: string;
    skinTone: string;
    signatureFeatures: string;
  };
  defaultLook: { outfit: string; palette: string; fixedProps: string };
  behavior: { personality: string; speechStyle: string; expressionBaseline: string };
  constraints: { mustKeep: string[]; forbidden: string[] };
  notes: string;
  references: { primary?: ComicCharacterReference; face?: ComicCharacterReference; fullBody?: ComicCharacterReference };
  variants: ComicCharacterVariant[];
  sourceLibraryCharacterId?: string;
};

type ComicCharacterVariant = {
  id: string;
  name: string;
  description: string;
  identityOverrides?: Partial<ComicCharacter["visualIdentity"]>;
  outfitOverride?: string;
  paletteOverride?: string;
  propChanges?: string;
  stateDescription?: string;
  referenceImage?: ComicCharacterReference;
  createdAt: string;
  updatedAt: string;
};

type ComicImageRef = { url: string; storageKey?: string; width?: number; height?: number };
type ComicCharacterReference = ComicImageRef & { id: string; revision: number };

type ComicGenerationReference = {
  id: string;
  revision: string;
  role: "character-primary" | "character-face" | "character-full-body" | "character-variant" | "location" | "panel-anchor";
};

type ComicGenerationContext = {
  inputSignature: string;
  compilerVersion: string;
  prompt: string;
  references: ComicGenerationReference[];
  missingReferenceIds: string[];
  model?: string;
  size?: string;
  createdAt: string;
};

type ComicGeneratedPanelImage = ComicImageRef & { generationContext?: ComicGenerationContext };

type ComicPanel = {
  id: string;
  description: string;
  dialogue: string;
  caption: string;
  sfx: string;
  characterBindings: ComicPanelCharacterBinding[];
  characterSuggestions?: ComicPanelCharacterSuggestion[];
  image?: ComicGeneratedPanelImage;
  imageError?: string;
};

type ComicPage = {
  id: string;
  title: string;
  summary: string;
  panels: ComicPanel[];
  reviewStatus: ComicReviewStatus;
  reviewNotes: string;
  pageImage?: ComicImageRef;
  compositionContext?: {
    stalePanelIds: string[];
    unrecordedPanelIds: string[];
    incompletePanelIds: string[];
    confirmedAt?: string;
  };
};
```

现有字段一次性映射：`role` 保留；`appearance` → `visualIdentity.description`；`personality` → `behavior.personality`；`wardrobe` → `defaultLook.outfit`；`expressions` → `behavior.expressionBaseline`；`notes` 原文保留到 `notes`；单张 `image` → `references.primary`。新增别名、细化视觉锚点、说话方式、约束和其他参考图初始为空，不尝试用 AI 猜拆旧文本。原始文字不得因迁移被丢弃；迁移后只编辑新模型，不留一套平行旧字段。

### 角色变体

每个变体属于一个基础角色，字段包括稳定 ID、名称、适用说明、造型/状态变化描述、可选覆盖服装/道具、可选变体参考图及创建/更新时间。

变体只记录相对于基础角色的差异；未覆盖字段继承基础角色。常服、制服、战斗服、伪装、年龄变化、受伤/湿身/脏污等均可表示为具名变体，不另建平行角色。

### 页格绑定

页格保存显式出场绑定列表和未解析建议：

```ts
type ComicPanelCharacterBinding = {
  characterId: string;
  variantId?: string;
  source: "manual" | "ai";
  characterNameSnapshot: string;
  variantNameSnapshot?: string;
};
type ComicPanelCharacterSuggestion = { characterName: string; variantName?: string; reason: "unknown-character" | "ambiguous-character" | "unknown-variant" | "variant-owner-mismatch" };
```

绑定列表顺序稳定，用于多角色提示词与参考图排列。无绑定时不从自然语言隐式推断角色；未解析建议单独保存为待处理项，不伪装成有效 ID。角色与变体删除时，保留页格原始生成图和绑定记录中的可读快照，标记为未解析绑定，不静默移除作品内容。编辑变体不会修改基础角色或其他变体。

## AI 拆格与绑定

- 拆格提示词提供角色姓名、别名、身份摘要、可用变体名称/说明，并要求每格返回可选的 `characters: [{ name, variant }]` 建议；不要求模型创造未登记角色。缺少 `characters` 字段等价于没有建议，原有 `description/dialogue/caption/sfx` 结构不变。
- 解析器先对候选姓名做 Unicode NFKC 规范化与首尾空白裁剪，再按姓名/别名精确匹配，不做模糊匹配。唯一匹配才生成绑定；角色多义、同名冲突、变体不属于该角色、角色/变体不存在时写入待处理提示，不创建实体、不阻断整章导入。缺失 `characters` 建议字段视为无建议，不因模型漏字段而拒绝整章导入。
- 原有章节拆格确认仍是覆盖确认；确认后将有效绑定随页格一并落库。用户可以在剧本页格编辑区调整角色和变体，也可以清除错误绑定。
- 对已有项目提供一次性“从当前文字建议绑定”操作：按页格描述、对白和旁白分析并展示建议；用户确认后写显式绑定。默认不自动改写历史页格，也不自动生成角色或变体。

## 角色一致性编译器

页格生图统一调用纯逻辑编译器，输入项目画风、当前页/页格描述、显式角色绑定、角色/变体数据、参考图资产、现有场景上下文及可选首格锚点，输出：

本批只工程化角色一致性，不新增页格 `locationIds` 场景绑定模型；场景仍沿用当前项目中按已写名称匹配 `locations` 的输入方式，后续若要稳定化场景再单独建模。

1. 有序 prompt 分段：画风指南 → 页面/页格动作与构图 → 每个角色的稳定身份约束 → 对应变体差异 → 行为/表情约束 → 场景约束 → 无文字/贴字留白规则。
2. 有序参考图列表及其来源（身份、脸部、全身、变体、场景、页内锚点），便于测试和诊断。
3. 完整度/待处理警告：未解析绑定、无基础视觉锚点、无效变体引用、参考图读取失败等。
4. 同步的 `inputSignature`，用于识别已经生成的图是否仍匹配当前角色、变体、绑定、画面描述、场景、画风、选定参考图和生成参数。它是固定字段顺序 JSON 序列化的规范对象字符串，不使用加密哈希，不含图片字节或临时 URL。角色参考图版本键为稳定 ID/revision，location 参考版本键为 location ID + storageKey（缺失时标记 `unversioned`），页内锚点版本键为 panel ID + 其 `inputSignature`（缺失时标记 `unrecorded`）。生成上下文另存实际成功送入模型的参考图 ID/revision/role 与未能加载的 reference IDs；这让 UI 可区分当前输入签名与生成时参考图加载不完整。

稳定身份和变体变化明确分段，变体不得覆盖未声明变化的身份锚点。`expressions`、`personality`、固定道具、不可改变项和禁用元素都必须由编译器按语义纳入，不再出现“字段存在但生成链路未使用”。

## 参考图选择

- 页格显式绑定决定角色候选，不从文字命中角色名排序。
- 参考图总数最多 5 张，首格锚点也计入这 5 张。预算优先级为：每个已绑定角色的 primary 身份锚点 → 变体参考 → 单角色脸部/全身补充 → 场景 → 首格锚点。
- 按页格绑定顺序为每个角色先选 `references.primary`；没有 primary 时才用该角色脸部或全身图替代身份锚点。变体参考只作补充，不替换基础身份锚点。
- 当绑定角色超过 5 个时，按绑定顺序最多加载 5 张身份锚点，并逐一警告未获参考图的绑定角色；绑定列表不被更改，生成不阻断。
- 预算不足时不挤掉已选身份参考；未使用的变体/脸部/全身/场景图按优先级省略并提示。页内首个成功图片作为风格/构图锚点，预算不足时跳过并提示，不替代角色身份图。
- 基础角色没有任何可用视觉参考时明确提示，但不阻断生成。
- storageKey 解析失败时保留警告并继续使用其他可用图；不静默把失败图当作已提供参考。参考图选择器返回实际使用的图和被预算/读取失败排除的图，供 UI 展示完整度和生成诊断。

## 编辑与失效规则

- 角色基础资料、变体、页格绑定、画风、场景上下文或画面描述改变时，涉及的已有页格图保留，但标记为“与当前设定不一致/上下文过期”；原图可查看和手动替换。
- 已有生成图和其 `inputSignature` 不匹配时，页格图保留并显示过期状态，`pageImage` 失效并清空。stale/unrecorded 页格若要参加合成，先显示列表并要求明确确认；确认后可合成，`page.compositionContext` 记录确认纳入的 stale/unrecorded panel IDs 和时间，成品始终显示含旧上下文图的提示。重新生成后写入新上下文并清除该图的过期状态。
- 旧项目已有页格图但没有 `generationContext` 时标记为“上下文未记录”，不猜测其是否过期；原图继续保留和可查看，合成前需要同样确认。新生成图必须写入 `generationContext`。
- `incomplete` 表示签名仍匹配，但一张或多张所选参考图读取失败；显示警告但不要求额外合成确认，`compositionContext.incompletePanelIds` 记录此情况。
- 当前状态通过同步纯函数比较“当前选择的输入签名”与“生成时 inputSignature”计算，优先级固定：无 `generationContext` 为 `unrecorded`；签名不匹配为 `stale`；签名匹配但 `missingReferenceIds` 非空为 `incomplete`；其余为 `current`。状态不持久化为独立 stale boolean。
- `pageImage` 是页格图与布局的派生结果；任一页格绑定、角色/变体设定、页格图或布局变化都清空 pageImage 和 compositionContext，不为 `pageImage` 维护第二套输入签名。
- 用户明确重新生成页格后，以新编译上下文和新图更新签名；审稿状态沿用现有规则退回草稿。
- 角色主图、脸部图、全身图和变体图都属于项目/角色库的媒体引用；媒体清理必须扫描漫画项目与漫画角色库，删除素材前也要保护仍被这些引用使用的图片。Phase A 必须纳入该清理覆盖，不能仅在角色 UI 中展示图片却不纳入存储引用生命周期。清理验收覆盖：项目角色引用、角色库引用、同一图片同时被多个账号分区引用、删除角色/变体后再清理。

## 角色库

- 角色库支持按姓名/身份搜索、查看、编辑、删除；项目角色卡与库条目均使用同一编辑能力。编辑器显示基础身份、变体列表、参考图包和引用完整度，不把所有变体内容铺成一张超长表单。
- “从库导入”生成独立副本：角色、变体与参考图引用都分配新的稳定 ID，保留原图片 URL/storageKey 与尺寸；副本记录来源条目 ID 作为 provenance，不订阅库更新。
- 编辑库条目不会静默覆盖已导入的项目角色、页格绑定、变体选择或图片；项目需要新版本时由用户再次导入，作为独立新副本处理。
- 不增加多人协作、角色审批权限、影视角色部位包或角色云同步。

## 分期与验收

### Phase A：模型与数据安全

实现结构化基础角色、具名变体、轻量参考图包、页格绑定、未解析建议和生成上下文签名；实现旧项目/JSON 备份的一次性映射与往返测试，并补齐漫画项目/角色库媒体引用的清理保护。验收：原有字段/图片完整保留；旧页格不被自动猜绑；导入导出不丢变体、引用和签名；清理不会删除仍被漫画角色或项目引用的图片。

### Phase B：绑定编辑与角色库

页格编辑区支持角色/变体多选与校验提示；AI 拆格返回精确绑定建议并按姓名/别名匹配；旧项目可预览并确认一次性绑定建议；角色库支持搜索、编辑及明确的副本更新动作。验收：同名/别名歧义、无效变体和已删除角色均成为可见待处理项，不静默绑定或丢失。

### Phase C：生成编译与过期管理

统一编译 prompt、参考图和签名；页格生图使用显式绑定与优先级预算，首格锚点与身份图分开；上下文变化保留旧图并标过期，未经确认的旧图不参加整页合成。验收：纯函数测试覆盖角色/变体组合、继承、参考图顺序与 5 图上限、读取失败、签名变化、状态优先级与合成 allowlist；真实模型验证单角色、多角色、换装/受伤变体的跨格一致性。

未实测的真实模型与交互项目记录到 `docs/progress/pending-test.md`；用户确认验收前不将其写入正式功能说明。每个阶段完成后停在复核点，提交与推送由用户另行决定。

## 明确不做

- 不按画面描述自动猜测生成时的角色绑定。
- 不允许 AI 自动创建或修改正式角色、变体和基础视觉事实。
- 不复制影视角色部位矩阵，不加角色编辑权限门禁。
- 不新增角色库与项目角色的实时双向同步。
- 不因设定变化删除页格原图；仅标过期并使依赖它的合成结果失效。
- 不改漫画册贴字、页序、导出或工作台/画布既定职责边界。

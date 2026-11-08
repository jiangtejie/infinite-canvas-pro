/** 导演风格语法：把“风格”拆成可校验、可编译成 prompt 的结构化规则。 */

export type DirectorStyleRule =
    | { id: string; label: string; kind: "scene-coverage"; shotTypes: string[]; minCount?: number }
    | { id: string; label: string; kind: "shot-type-ratio"; shotTypes: string[]; minRatio?: number; maxRatio?: number }
    | { id: string; label: string; kind: "movement-ratio"; movements: string[]; minRatio?: number }
    | { id: string; label: string; kind: "pacing"; minSeconds?: number; maxSeconds?: number }
    | { id: string; label: string; kind: "visual-keywords"; keywords: string[]; minRatio?: number };

export type DirectorStyle = {
    id: string;
    name: string;
    tagline: string;
    description: string;
    /** 风格参考来源（仅作说明，避免直接宣称复制某导演）。 */
    reference?: string;
    narrative: { structure: string; pacing: string; beats: string };
    camera: { grammar: string; movement: string; transitions: string };
    visual: { palette: string; lighting: string; composition: string; texture: string; keywords: string[] };
    performance: string;
    sound: string;
    prompts: { imageSuffix: string; videoSuffix: string; negative: string };
    rules: DirectorStyleRule[];
};

const cinematicClassic: DirectorStyle = {
    id: "cinematic-classic",
    name: "电影感 · 中性",
    tagline: "自然光、浅景深、克制运镜",
    description: "默认的电影叙事语言：建立镜头 + 中近景表演 + 少量特写强调，适合大多数题材。",
    narrative: { structure: "三幕式，每场有明确目标、阻碍与转折", pacing: "常规节奏，每镜 3–6 秒", beats: "场景内先建立空间，再进入人物冲突，最后留一个钩子" },
    camera: { grammar: "建立镜头用全景/远景，表演用中景/中近景，情绪高点用特写", movement: "以固定和缓慢推进为主，避免无意义运镜", transitions: "切、淡入淡出；同场默认硬切" },
    visual: { palette: "自然低饱和", lighting: "自然光与柔光", composition: "三分法，人物视线留白", texture: "细腻颗粒", keywords: ["电影感", "自然光", "景深", "低饱和"] },
    performance: "克制、生活化，情绪通过动作与停顿表达",
    sound: "环境声铺底，关键动作给音效，台词不叠音乐",
    prompts: { imageSuffix: "电影感，自然光，浅景深，35mm 胶片质感，细腻颗粒", videoSuffix: "电影感运镜，自然光，稳定构图，浅景深", negative: "过度锐化，塑料质感，卡通感" },
    rules: [
        { id: "coverage", label: "每场至少一个建立镜头（大远景/远景/全景）", kind: "scene-coverage", shotTypes: ["ELS", "LS", "WS"] },
        { id: "cu-ratio", label: "特写占比不超过 30%", kind: "shot-type-ratio", shotTypes: ["CU", "ECU"], maxRatio: 0.3 },
        { id: "pacing", label: "平均镜头时长 3–6 秒", kind: "pacing", minSeconds: 3, maxSeconds: 6 },
    ],
};

const orientalGrand: DirectorStyle = {
    id: "oriental-grand",
    name: "东方浓烈 · 张艺谋风格参考",
    tagline: "红金大色块、对称构图、仪式感",
    description: "高饱和红金、强烈对称与空间纵深，适合历史、武侠、宿命感题材。",
    reference: "风格参考：张艺谋的视觉语言",
    narrative: { structure: "章回式推进，重仪式与命运转折", pacing: "舒缓蓄势，关键场面放大", beats: "先给环境与秩序，再让人物打破秩序，最后以色彩/构图收束" },
    camera: { grammar: "多用大远景、远景建立空间；对称正拍；特写克制但精准", movement: "缓慢推进、升降、环绕，强调仪式感", transitions: "硬切、叠化，避免花哨转场" },
    visual: { palette: "红、金、墨黑，高饱和", lighting: "强对比侧光、逆光轮廓", composition: "中心对称、纵深透视", texture: "绸缎、颗粒、烟尘", keywords: ["红", "金", "对称", "浓烈", "仪式感"] },
    performance: "克制、庄重，情绪压在动作与停顿里",
    sound: "鼓点、弦乐与大面积环境声",
    prompts: { imageSuffix: "东方浓烈，红金大色块，中心对称构图，强对比侧光，电影级质感", videoSuffix: "对称构图，缓慢推进，仪式感运镜，红金调色", negative: "低饱和，冷色调，随意手持" },
    rules: [
        { id: "coverage", label: "每场至少一个远景/全景建立空间", kind: "scene-coverage", shotTypes: ["ELS", "LS", "WS"] },
        { id: "cu-ratio", label: "特写占比不超过 22%", kind: "shot-type-ratio", shotTypes: ["CU", "ECU"], maxRatio: 0.22 },
        { id: "pacing", label: "平均镜头时长 3.5–6.5 秒", kind: "pacing", minSeconds: 3.5, maxSeconds: 6.5 },
        { id: "palette", label: "至少 35% 镜头带红金/对称关键词", kind: "visual-keywords", keywords: ["红", "金", "对称", "浓烈"], minRatio: 0.35 },
    ],
};

const youthAesthetic: DirectorStyle = {
    id: "youth-aesthetic",
    name: "青春唯美 · 郭敬明风格参考",
    tagline: "柔光浅色、特写情绪、慢镜",
    description: "柔和逆光、浅色系、人物特写与慢动作，适合青春、爱情、都市题材。",
    reference: "风格参考：郭敬明的视觉语言",
    narrative: { structure: "情绪段落式，重人物关系与内心转折", pacing: "偏慢，允许停顿与留白", beats: "用环境光与人物特写建立情绪，再给关系变化，最后留余韵" },
    camera: { grammar: "中近景/特写为主，浅景深，人物占画面中心", movement: "缓慢推进、轻微手持、慢镜", transitions: "叠化、柔切" },
    visual: { palette: "浅色、粉蓝、奶白", lighting: "柔光、逆光、窗光", composition: "人物居中，背景虚化", texture: "柔焦、轻颗粒", keywords: ["柔光", "浅色", "逆光", "唯美", "慢镜"] },
    performance: "细腻、外放的情绪，眼神与微表情特写",
    sound: "钢琴/弦乐铺底，环境声很轻",
    prompts: { imageSuffix: "青春唯美，柔光逆光，浅色低对比，浅景深，人物居中，柔焦质感", videoSuffix: "缓慢推进，浅景深，柔光，慢动作", negative: "强对比，硬光，粗糙颗粒" },
    rules: [
        { id: "close-ratio", label: "中近景/特写占比不低于 35%", kind: "shot-type-ratio", shotTypes: ["CU", "MCU", "ECU"], minRatio: 0.35 },
        { id: "pacing", label: "平均镜头时长 2.5–5 秒", kind: "pacing", minSeconds: 2.5, maxSeconds: 5 },
        { id: "palette", label: "至少 35% 镜头带柔光/浅色关键词", kind: "visual-keywords", keywords: ["柔光", "浅色", "逆光", "唯美"], minRatio: 0.35 },
    ],
};

const hkNeon: DirectorStyle = {
    id: "hk-neon",
    name: "港风霓虹 · 王家卫风格参考",
    tagline: "霓虹、雨夜、手持与抽帧",
    description: "霓虹绿红、雨夜反光、浅景深与手持，适合都市、悬疑、情绪题材。",
    reference: "风格参考：王家卫的视觉语言",
    narrative: { structure: "情绪碎片与时间错位，重氛围", pacing: "短镜与长镜交替，允许抽帧", beats: "先给空间与光线，再让人物在空间中错身，最后留一个未说出口的动作" },
    camera: { grammar: "中近景/特写、过肩；浅景深；前景遮挡", movement: "手持轻晃、跟拍、缓慢横移", transitions: "硬切、抽帧、叠化" },
    visual: { palette: "霓虹绿、洋红、暖黄", lighting: "夜景霓虹、湿面反光", composition: "前景遮挡、框中框", texture: "胶片颗粒、轻微拖影", keywords: ["霓虹", "雨夜", "绿", "红", "浅景深"] },
    performance: "内敛、欲言又止，动作比台词多",
    sound: "环境噪点、爵士/旧歌、雨声",
    prompts: { imageSuffix: "港风霓虹，雨夜湿面反光，绿红霓虹，浅景深，前景遮挡，胶片颗粒", videoSuffix: "手持轻晃，抽帧，霓虹雨夜，浅景深", negative: "干净棚拍，高亮白光，过度锐化" },
    rules: [
        { id: "movement", label: "至少 25% 镜头使用手持/跟拍", kind: "movement-ratio", movements: ["手持轻晃", "跟拍"], minRatio: 0.25 },
        { id: "palette", label: "至少 35% 镜头带霓虹/雨夜关键词", kind: "visual-keywords", keywords: ["霓虹", "雨夜", "绿", "红"], minRatio: 0.35 },
        { id: "pacing", label: "平均镜头时长 2–5 秒", kind: "pacing", minSeconds: 2, maxSeconds: 5 },
    ],
};

const industrialBlockbuster: DirectorStyle = {
    id: "industrial-blockbuster",
    name: "工业大片 · 诺兰风格参考",
    tagline: "大画幅、实景感、交叉剪辑",
    description: "大远景与实景质感、低频运镜、交叉剪辑，适合科幻、动作、灾难题材。",
    reference: "风格参考：克里斯托弗·诺兰的视觉语言",
    narrative: { structure: "多线交叉，节点式推进", pacing: "快速切换与长镜头蓄势结合", beats: "宏观建立 → 细节插入 → 交叉升级 → 冷处理后置" },
    camera: { grammar: "大远景/远景强调尺度，中景跟拍人物，特写少而准", movement: "跟拍、升降、航拍式横移", transitions: "硬切为主，声音先行" },
    visual: { palette: "冷灰、钢蓝、低饱和", lighting: "实景自然光、硬光", composition: "大景深、广角、尺度对比", texture: "写实、低颗粒", keywords: ["冷灰", "钢蓝", "大画幅", "写实"] },
    performance: "克制、行动导向",
    sound: "低频轰鸣、环境声与音乐渐进",
    prompts: { imageSuffix: "工业大片，冷灰钢蓝，大画幅，实景感，宽银幕构图，写实质感", videoSuffix: "大画幅实景，稳定跟拍，冷灰调色", negative: "卡通，柔光，粉色" },
    rules: [
        { id: "coverage", label: "每场至少一个远景/全景建立尺度", kind: "scene-coverage", shotTypes: ["ELS", "LS", "WS"] },
        { id: "movement", label: "至少 20% 镜头使用跟拍/升降", kind: "movement-ratio", movements: ["跟拍", "升降"], minRatio: 0.2 },
        { id: "pacing", label: "平均镜头时长 2.5–5 秒", kind: "pacing", minSeconds: 2.5, maxSeconds: 5 },
    ],
};

const symmetryFairy: DirectorStyle = {
    id: "symmetry-fairy",
    name: "对称童话 · 韦斯·安德森风格参考",
    tagline: "居中对称、粉彩、平面化",
    description: "严格对称、粉黄粉绿粉彩、正面构图与冷幽默节奏，适合奇幻、喜剧、品牌短片。",
    reference: "风格参考：韦斯·安德森的视觉语言",
    narrative: { structure: "章节体，冷幽默与反差", pacing: "轻快、固定机位、信息密集", beats: "先给规则化的空间，再让意外打破，最后回归秩序" },
    camera: { grammar: "正面全景/中景，严格居中；少量摇镜", movement: "固定为主，横移摇镜", transitions: "硬切、章节卡" },
    visual: { palette: "粉、黄、薄荷绿、奶油白", lighting: "均匀柔光、平面化", composition: "绝对对称、正面、居中", texture: "手工模型感、干净", keywords: ["对称", "居中", "粉", "黄", "平面"] },
    performance: "克制、冷面滑稽",
    sound: "轻快配乐、机械音效",
    prompts: { imageSuffix: "对称童话，居中构图，粉彩配色，正面机位，平面化柔光，手工模型质感", videoSuffix: "固定机位，严格对称，粉彩，横移摇镜", negative: "倾斜构图，强透视，暗黑" },
    rules: [
        { id: "symmetry-ratio", label: "全景/中景占比不低于 40%", kind: "shot-type-ratio", shotTypes: ["WS", "MS"], minRatio: 0.4 },
        { id: "pacing", label: "平均镜头时长 2–5 秒", kind: "pacing", minSeconds: 2, maxSeconds: 5 },
        { id: "palette", label: "至少 40% 镜头带对称/粉彩关键词", kind: "visual-keywords", keywords: ["对称", "居中", "粉", "黄", "平面"], minRatio: 0.4 },
    ],
};

const japaneseAnime: DirectorStyle = {
    id: "japanese-anime",
    name: "日系动画",
    tagline: "蓝天白云、柔光、青春情绪",
    description: "清新天空、柔光与情绪特写，适合青春、治愈、校园题材。",
    narrative: { structure: "日常段落 + 情绪转折", pacing: "舒缓，留白多", beats: "环境铺陈 → 人物互动 → 情绪特写 → 留白收尾" },
    camera: { grammar: "远景/全景建立环境，中近景/特写给情绪", movement: "缓慢横移、拉远、固定", transitions: "淡入淡出、叠化" },
    visual: { palette: "天空蓝、云白、青绿", lighting: "柔光、逆光、丁达尔", composition: "大天空、低地平线、留白", texture: "赛璐璐/动画质感", keywords: ["蓝天", "云", "柔光", "青春", "逆光"] },
    performance: "细腻、克制",
    sound: "钢琴/弦乐、蝉鸣与风声",
    prompts: { imageSuffix: "日系动画，蓝天白云，柔光逆光，清新配色，赛璐璐质感，青春氛围", videoSuffix: "缓慢横移，柔光，动画质感，天空与风", negative: "写实照片，暗黑，强噪点" },
    rules: [
        { id: "coverage", label: "每场至少一个远景/全景建立环境", kind: "scene-coverage", shotTypes: ["LS", "WS"] },
        { id: "close-ratio", label: "中近景/特写占比不低于 30%", kind: "shot-type-ratio", shotTypes: ["CU", "MCU", "ECU"], minRatio: 0.3 },
        { id: "palette", label: "至少 35% 镜头带蓝天/柔光关键词", kind: "visual-keywords", keywords: ["蓝天", "云", "柔光", "青春"], minRatio: 0.35 },
    ],
};

const documentaryHandheld: DirectorStyle = {
    id: "documentary-handheld",
    name: "纪实手持",
    tagline: "自然光、长镜、跟拍",
    description: "自然光、手持跟拍、长镜头与现场声，适合纪实、现实题材、品牌纪录。",
    narrative: { structure: "事件驱动，跟随人物", pacing: "偏慢，允许长镜与停顿", beats: "跟随人物进入事件 → 观察细节 → 让事件自然发生" },
    camera: { grammar: "中景/中近景跟拍，少量远景交代环境", movement: "手持轻晃、跟拍、长镜", transitions: "硬切、跳切" },
    visual: { palette: "自然色、低饱和", lighting: "自然光、现场光", composition: "不刻意构图，保留环境", texture: "真实颗粒、轻噪点", keywords: ["自然光", "纪实", "手持", "真实"] },
    performance: "自然、未设计感",
    sound: "现场声、环境声优先",
    prompts: { imageSuffix: "纪实摄影，自然光，手持感，真实环境，低饱和，胶片颗粒", videoSuffix: "手持跟拍，自然光，长镜头，现场感", negative: "棚拍，完美构图，过度调色" },
    rules: [
        { id: "movement", label: "至少 40% 镜头使用手持/跟拍", kind: "movement-ratio", movements: ["手持轻晃", "跟拍"], minRatio: 0.4 },
        { id: "pacing", label: "平均镜头时长 5–10 秒", kind: "pacing", minSeconds: 5, maxSeconds: 10 },
        { id: "palette", label: "至少 30% 镜头带自然光/纪实关键词", kind: "visual-keywords", keywords: ["自然光", "纪实", "手持", "真实"], minRatio: 0.3 },
    ],
};

export const DIRECTOR_STYLES: DirectorStyle[] = [
    cinematicClassic,
    orientalGrand,
    youthAesthetic,
    hkNeon,
    industrialBlockbuster,
    symmetryFairy,
    japaneseAnime,
    documentaryHandheld,
];

export const DEFAULT_DIRECTOR_STYLE_ID = cinematicClassic.id;

export function directorStyleFor(id?: string) {
    if (!id) return undefined;
    return DIRECTOR_STYLES.find((style) => style.id === id);
}

export function directorStyleLabel(id?: string) {
    return directorStyleFor(id)?.name || "";
}

/** 风格编译成可直接拼进图片 prompt 的文本。 */
export function directorStyleImageText(style?: DirectorStyle) {
    if (!style) return "";
    return [style.prompts.imageSuffix, style.visual.palette, style.visual.lighting].filter(Boolean).join("，");
}

/** 给已有镜头 prompt 补风格；已包含时原样返回。 */
export function appendDirectorStyleToPrompt(prompt: string, style?: DirectorStyle) {
    if (!style || !prompt.trim()) return prompt;
    const suffix = style.prompts.imageSuffix;
    if (!suffix) return prompt;
    return prompt.includes(suffix.slice(0, 8)) ? prompt : [prompt.trim(), suffix].filter(Boolean).join("，");
}

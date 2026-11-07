import { unzipSync, strFromU8 } from "fflate";
import { nanoid } from "nanoid";

import type { FilmEpisode, FilmScene, FilmScriptBlock, FilmScriptDocument, FilmScriptEpisode, FilmScriptScene, FilmShot } from "./types";

export type { FilmScriptBlock, FilmScriptDocument, FilmScriptEpisode, FilmScriptScene };

export const FILM_SCRIPT_PARSER_VERSION = "1.0.0";
export const FILM_SCRIPT_SCHEMA_VERSION = 1;

const EPISODE_RE = /^(?:第\s*[0-9零一二三四五六七八九十百]+\s*集|EP(?:ISODE)?\s*\d+|Episode\s+\d+)/i;
const SCENE_HEADING_RE = /^(?:第?\s*\d+(?:[.-]\d+)?\s*场[次]?|场次?\s*\d+|\d+[.-]\d+\s|(?:INT|EXT|I\/E)\.|[内外]景)/i;
const TRANSITION_RE = /^(?:切至|转场|淡入|淡出|叠化|FADE(?:\s+(?:IN|OUT|TO))?|CUT\s+TO|DISSOLVE\s+TO)/i;
const TIME_RE = /(清晨|早晨|早上|上午|中午|下午|傍晚|黄昏|夜晚|夜里|晚上|凌晨|深夜|白天|日|夜)/;
const ENGLISH_TIME_MAP: Record<string, string> = { NIGHT: "夜", DAY: "日", DUSK: "黄昏", DAWN: "凌晨", MORNING: "早晨", EVENING: "傍晚", AFTERNOON: "下午" };
const PARENTHETICAL_RE = /^[（(]([^）)]*)[）)]\s*$/;

/** 统一换行、去 BOM，作为解析与 hash 的输入。 */
export function normalizeScriptText(text: string) {
    return (text || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

export function scriptTextHash(text: string) {
    let hash = 0x811c9dc5;
    const normalized = normalizeScriptText(text);
    for (let index = 0; index < normalized.length; index += 1) {
        hash ^= normalized.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, "0");
}

/** 解析剧本文本，输出可预览、可复用的中间模型。 */
export function parseFilmScriptDocument(text: string, format: FilmScriptDocument["format"] = "plain"): FilmScriptDocument {
    const source = normalizeScriptText(text);
    const lines = source.split("\n").map((line) => line.trimEnd());
    const episodes: FilmScriptEpisode[] = [];
    let currentEpisode: FilmScriptEpisode | null = null;
    let currentScene: FilmScriptScene | null = null;

    const ensureEpisode = () => {
        if (!currentEpisode) {
            currentEpisode = { title: "第 1 集", scenes: [] };
            episodes.push(currentEpisode);
        }
        return currentEpisode;
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line) continue;
        const headingCandidate = format === "fountain" ? line.replace(/^\./, "") : line;

        if (EPISODE_RE.test(headingCandidate)) {
            currentEpisode = { title: line, scenes: [] };
            episodes.push(currentEpisode);
            currentScene = null;
            continue;
        }

        if (SCENE_HEADING_RE.test(headingCandidate)) {
            const parsed = parseSceneHeading(headingCandidate);
            const scene: FilmScriptScene = {
                heading: headingCandidate,
                interiorExterior: parsed.interiorExterior,
                location: parsed.location,
                timeOfDay: parsed.timeOfDay,
                characters: [],
                blocks: [],
                lineStart: index + 1,
                lineEnd: index + 1,
                hash: "",
            };
            currentScene = scene;
            ensureEpisode().scenes.push(scene);
            continue;
        }

        const episode = ensureEpisode();
        if (!currentScene) {
            currentScene = {
                heading: episode.scenes.length === 0 ? "场景 1" : `场景 ${episode.scenes.length + 1}`,
                interiorExterior: "",
                location: "",
                timeOfDay: "",
                characters: [],
                blocks: [],
                lineStart: index + 1,
                lineEnd: index + 1,
                hash: "",
            };
            episode.scenes.push(currentScene);
        }
        currentScene.lineEnd = index + 1;

        const dialogue = line.match(/^([^\s：:（）()]{1,16})(?:[（(]([^）)]*)[）)])?[：:]\s*(.+)$/);
        if (dialogue && !TRANSITION_RE.test(line)) {
            const character = dialogue[1].trim();
            currentScene.blocks.push({ type: "dialogue", character, parenthetical: (dialogue[2] || "").trim(), text: dialogue[3].trim(), line: index + 1 });
            if (!currentScene.characters.includes(character)) currentScene.characters.push(character);
            continue;
        }

        if (TRANSITION_RE.test(line)) {
            currentScene.blocks.push({ type: "transition", text: line, line: index + 1 });
            continue;
        }

        const parenthetical = line.match(PARENTHETICAL_RE);
        if (parenthetical) {
            currentScene.blocks.push({ type: "action", text: `（${parenthetical[1].trim()}）`, line: index + 1 });
            continue;
        }

        currentScene.blocks.push({ type: "action", text: line, line: index + 1 });
    }

    return {
        schemaVersion: FILM_SCRIPT_SCHEMA_VERSION,
        parserVersion: FILM_SCRIPT_PARSER_VERSION,
        scriptHash: scriptTextHash(source),
        format,
        episodes: finalizeScriptEpisodes(episodes.length ? episodes : [{ title: "第 1 集", scenes: [{ heading: "场景 1", interiorExterior: "", location: "", timeOfDay: "", characters: [], blocks: [], lineStart: 1, lineEnd: 1, hash: "" }] }]),
    };
}

function finalizeScriptEpisodes(episodes: FilmScriptEpisode[]): FilmScriptEpisode[] {
    return episodes.map((episode) => ({
        ...episode,
        scenes: episode.scenes.map((scene) => ({
            ...scene,
            hash: scriptTextHash(`${scene.heading}\n${scene.blocks.map((block) => block.type === "dialogue" ? `${block.character}：${block.text}` : block.text).join("\n")}`),
        })),
    }));
}

function parseSceneHeading(line: string): { interiorExterior: FilmScriptScene["interiorExterior"]; location: string; timeOfDay: string } {
    const interiorExterior = /内景|INT\.?/i.test(line) ? "内景" : /外景|EXT\.?/i.test(line) ? "外景" : "";
    let rest = line
        .replace(/^(?:第?\s*\d+(?:[.-]\d+)?\s*场[次]?|场次?\s*\d+|\d+[.-]\d+)\s*[、.：:·-]?\s*/i, "")
        .replace(/^(?:INT|EXT|I\/E)\.?\s*/i, "")
        .replace(/^#+\s*/, "")
        .replace(/内景|外景|INT\.?|EXT\.?|I\/E\.?/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    const time = rest.match(TIME_RE);
    const englishTime = rest.match(/\b(NIGHT|DAY|DUSK|DAWN|MORNING|EVENING|AFTERNOON)\b/i);
    const timeOfDay = time?.[1] || (englishTime ? ENGLISH_TIME_MAP[englishTime[1].toUpperCase()] : "");
    const location = rest
        .replace(TIME_RE, " ")
        .replace(/\b(NIGHT|DAY|DUSK|DAWN|MORNING|EVENING|AFTERNOON)\b/gi, " ")
        .replace(/[\s·,，/\\-]+/g, " ")
        .trim();
    return { interiorExterior, location, timeOfDay };
}

/** 从 docx 的 document.xml 提取纯文本段落。 */
export function scriptTextFromDocxXml(xml: string) {
    const paragraphs = xml.split(/<w:p[\s>]/).slice(1);
    return paragraphs
        .map((paragraph) => {
            const texts = [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1]));
            return texts.join("");
        })
        .filter((text) => text.trim())
        .join("\n");
}

/** 读取 docx / txt / md / fdX / fountain 文件为文本。 */
export async function readFilmScriptFile(file: File): Promise<{ text: string; format: FilmScriptDocument["format"] }> {
    const name = file.name.toLowerCase();
    if (name.endsWith(".docx")) {
        const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
        const documentXml = zip["word/document.xml"];
        if (!documentXml) throw new Error("docx 里没有找到正文，请另存为 .docx 或粘贴文本");
        return { text: scriptTextFromDocxXml(strFromU8(documentXml)), format: "docx" };
    }
    if (name.endsWith(".fountain")) return { text: fountainToPlainText(await file.text()), format: "fountain" };
    if (name.endsWith(".fdx")) return { text: fdxToPlainText(await file.text()), format: "fdx" };
    return { text: await file.text(), format: "plain" };
}

/** Fountain 对白是「角色行 + 台词」，转成统一的「角色（提示）：台词」。 */
function fountainToPlainText(text: string) {
    const lines = normalizeScriptText(text).split("\n");
    const output: string[] = [];
    let pendingCharacter = "";
    let pendingParenthetical = "";
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
            pendingCharacter = "";
            pendingParenthetical = "";
            continue;
        }
        if (pendingCharacter) {
            const parenthetical = line.match(/^[（(]([^）)]*)[）)]$/);
            if (parenthetical) {
                pendingParenthetical = parenthetical[1].trim();
                continue;
            }
            output.push(`${pendingCharacter}${pendingParenthetical ? `（${pendingParenthetical}）` : ""}：${line}`);
            pendingCharacter = "";
            pendingParenthetical = "";
            continue;
        }
        if (/^[A-Z][A-Z0-9 .'()/-]{1,32}$/.test(line) && !SCENE_HEADING_RE.test(line) && !TRANSITION_RE.test(line)) {
            pendingCharacter = line;
            continue;
        }
        output.push(line);
    }
    return output.join("\n");
}

/** FDX 是 XML；按段落类型拼回可读文本，对白统一成「角色：台词」。 */
function fdxToPlainText(text: string) {
    const paragraphs = [...text.matchAll(/<Paragraph[^>]*Type="([^"]+)"[^>]*>([\s\S]*?)<\/Paragraph>/g)];
    const lines: string[] = [];
    let character = "";
    let parenthetical = "";
    for (const paragraph of paragraphs) {
        const type = paragraph[1];
        const body = paragraph[2];
        const content = [...body.matchAll(/<Text[^>]*>([\s\S]*?)<\/Text>/g)].map((match) => decodeXml(match[1])).join("").trim();
        if (!content) continue;
        if (/Scene Heading/i.test(type)) {
            lines.push(content);
            character = "";
            parenthetical = "";
        } else if (/Character/i.test(type)) {
            character = content;
            parenthetical = "";
        } else if (/Parenthetical/i.test(type)) {
            parenthetical = content;
        } else if (/Dialogue/i.test(type)) {
            lines.push(`${character || "旁白"}${parenthetical ? `（${parenthetical}）` : ""}：${content}`);
            parenthetical = "";
        } else if (/Transition/i.test(type)) {
            lines.push(content);
            parenthetical = "";
        } else {
            lines.push(content);
            parenthetical = "";
        }
    }
    return lines.join("\n");
}

function decodeXml(value: string) {
    return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** 把规则解析结果转成项目里的剧集/场景/分镜（每个动作段落一镜）。 */
export function filmScriptDocumentToEpisodes(document: FilmScriptDocument): FilmEpisode[] {
    return document.episodes.map((episode) => ({
        id: nanoid(),
        title: episode.title,
        scenes: episode.scenes.map((scene, sceneIndex) => {
            const shots: FilmShot[] = [];
            let dialogueBuffer: string[] = [];
            const flushDialogue = () => {
                if (!dialogueBuffer.length) return;
                if (!shots.length) shots.push(createImportedShot("", sceneIndex, shots.length));
                shots[shots.length - 1].dialogue = [shots[shots.length - 1].dialogue, ...dialogueBuffer].filter(Boolean).join("\n");
                dialogueBuffer = [];
            };
            for (const block of scene.blocks) {
                if (block.type === "action") {
                    flushDialogue();
                    const shot = createImportedShot(block.text, sceneIndex, shots.length);
                    shots.push(shot);
                } else if (block.type === "dialogue") {
                    dialogueBuffer.push(`${block.character}${block.parenthetical ? `（${block.parenthetical}）` : ""}：${block.text}`);
                }
            }
            flushDialogue();
            if (!shots.length) {
                shots.push(createImportedShot(scene.heading, sceneIndex, 0));
            }
            return {
                id: nanoid(),
                name: scene.heading,
                location: scene.location,
                time: scene.timeOfDay,
                mood: "",
                shots,
            } satisfies FilmScene;
        }),
    }));
}

function createImportedShot(description: string, sceneIndex: number, shotIndex: number): FilmShot {
    return {
        id: nanoid(),
        shotNo: `${String(sceneIndex + 1).padStart(2, "0")}-${String(shotIndex + 1).padStart(2, "0")}`,
        shotType: "MS",
        cameraMovement: "",
        duration: 4,
        description,
        dialogue: "",
        audio: "",
        prompt: "",
    };
}

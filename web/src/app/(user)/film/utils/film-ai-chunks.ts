/** 长剧本按集/场标题切块，块内尽量保留完整场次。 */
export function splitFilmScriptIntoChunks(script: string, maxChars: number): string[] {
    const lines = (script || "").split(/\r?\n/).map((line) => line.trimEnd());
    const blocks: string[] = [];
    let current: string[] = [];
    for (const line of lines) {
        if (/^第\s*[0-9零一二三四五六七八九十百]+\s*[集场]|^EP(?:ISODE)?\s*\d+|^场景\s*\d+|^\d{1,2}[-－]\d{1,2}\s/.test(line.trim()) && current.length) {
            blocks.push(current.join("\n"));
            current = [line];
        } else {
            current.push(line);
        }
    }
    if (current.length) blocks.push(current.join("\n"));

    const chunks: string[] = [];
    let buffer = "";
    for (const block of blocks) {
        if (block.length > maxChars) {
            if (buffer) {
                chunks.push(buffer);
                buffer = "";
            }
            const subLines = block.split(/\r?\n/);
            let piece = "";
            for (const line of subLines) {
                if ((piece + "\n" + line).length > maxChars) {
                    if (piece) chunks.push(piece);
                    piece = line;
                } else {
                    piece = piece ? `${piece}\n${line}` : line;
                }
            }
            if (piece) chunks.push(piece);
            continue;
        }
        if ((buffer + "\n\n" + block).length > maxChars) {
            if (buffer) chunks.push(buffer);
            buffer = block;
        } else {
            buffer = buffer ? `${buffer}\n\n${block}` : block;
        }
    }
    if (buffer) chunks.push(buffer);
    return chunks.length ? chunks : [script];
}

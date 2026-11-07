"use client";

import { json } from "@codemirror/lang-json";
import { EditorView } from "@uiw/react-codemirror";
import dynamic from "next/dynamic";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });
const jsonEditorTheme = EditorView.theme({
    "&": { backgroundColor: "var(--ant-color-bg-container)", color: "var(--ant-color-text)" },
    ".cm-content": { caretColor: "var(--ant-color-text)", padding: "12px 0" },
    ".cm-line": { padding: "0 18px" },
    ".cm-gutters": { backgroundColor: "var(--ant-color-fill-quaternary)", borderRight: "1px solid var(--ant-color-border)", color: "var(--ant-color-text-tertiary)" },
    ".cm-activeLine": { backgroundColor: "var(--ant-color-fill-quaternary)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--ant-color-fill-quaternary)", color: "var(--ant-color-text)" },
    ".cm-cursor": { borderLeftColor: "var(--ant-color-text)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "var(--ant-control-item-bg-active)" },
    ".cm-foldPlaceholder": { backgroundColor: "var(--ant-color-fill-quaternary)", border: "1px solid var(--ant-color-border)", color: "var(--ant-color-text-tertiary)" },
    "&.cm-focused": { outline: "none" },
});

export function AdminSettingsJsonEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    return (
        <div style={{ overflow: "hidden", border: "1px solid var(--ant-color-border)", borderRadius: 6 }}>
            <CodeMirror
                value={value}
                height="520px"
                extensions={[json(), jsonEditorTheme]}
                basicSetup={{ foldGutter: true, lineNumbers: true, highlightActiveLine: true, highlightActiveLineGutter: true }}
                theme="none"
                onChange={onChange}
                style={{ fontSize: 13 }}
            />
        </div>
    );
}

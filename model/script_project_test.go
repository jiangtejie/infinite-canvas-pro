package model

import "testing"

func TestScriptDataHashMatchesCanonicalJSONVector(t *testing.T) {
	value := map[string]string{"z": "<>&\u2028😀", "a": "中文"}
	if got := ScriptDataHash(value); got != "223ee7fb" {
		t.Fatalf("hash=%s", got)
	}
}

func TestScriptTextHashMatchesUTF16TextHash(t *testing.T) {
	if got := ScriptTextHash("A😀\n"); got != "20558029" {
		t.Fatalf("hash=%s", got)
	}
	if ScriptTextHash("\ufeffA\r\nB\rC") != ScriptTextHash("A\nB\nC") {
		t.Fatal("BOM and newline normalization changed the hash contract")
	}
}

func TestScriptDataHashSortsKeysByUTF16CodeUnits(t *testing.T) {
	first := map[string]any{"\ue000": 1, "😀": 2}
	second := map[string]any{"😀": 2, "\ue000": 1}
	if ScriptDataHash(first) != ScriptDataHash(second) {
		t.Fatal("equivalent objects produced different hashes")
	}
	if ScriptDataHash(map[string]any{"value": -0.0}) != ScriptDataHash(map[string]any{"value": 0}) {
		t.Fatal("negative zero produced a different hash")
	}
}

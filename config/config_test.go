package config

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestNormalizeDockerSQLiteDSNUsesMountedDataDir(t *testing.T) {
	previous := Cfg
	t.Cleanup(func() { Cfg = previous })
	root := t.TempDir()
	appDataDir := filepath.Join(root, "data")
	if err := os.MkdirAll(appDataDir, 0755); err != nil {
		t.Fatal(err)
	}
	Cfg = Config{StorageDriver: "sqlite", DatabaseDSN: "data/infinite-canvas.db?_pragma=busy_timeout(5000)"}

	normalizeDockerSQLiteDSN(appDataDir)

	want := filepath.Join(root, "data", "infinite-canvas.db") + "?_pragma=busy_timeout(5000)"
	if Cfg.DatabaseDSN != want {
		t.Fatalf("DatabaseDSN = %q, want %q", Cfg.DatabaseDSN, want)
	}
}

func TestPaymentConfigHasNoHardcodedDefaults(t *testing.T) {
	configType := reflect.TypeOf(Config{})
	for _, name := range []string{"LXPayServerURL", "LXPayAppID", "LXPayAppSecret", "LXPayNotifyURL", "LXPayAPIV3Key"} {
		field, ok := configType.FieldByName(name)
		if !ok {
			t.Fatalf("config field %s is missing", name)
		}
		if value := field.Tag.Get("envDefault"); value != "" {
			t.Fatalf("payment field %s must not have a built-in default, got %q", name, value)
		}
	}
}

func TestNormalizeDockerSQLiteDSNLeavesLocalPathWithoutMountedDataDir(t *testing.T) {
	previous := Cfg
	t.Cleanup(func() { Cfg = previous })
	Cfg = Config{StorageDriver: "sqlite", DatabaseDSN: "data/infinite-canvas.db"}

	normalizeDockerSQLiteDSN(filepath.Join(t.TempDir(), "missing-data"))

	if Cfg.DatabaseDSN != "data/infinite-canvas.db" {
		t.Fatalf("DatabaseDSN = %q, want relative local path", Cfg.DatabaseDSN)
	}
}

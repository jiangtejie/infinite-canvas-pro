package config

import (
	"crypto/rand"
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
)

type Config struct {
	Port                  string `env:"PORT" envDefault:"8080"`
	AdminUsername         string `env:"ADMIN_USERNAME" envDefault:"admin"`
	AdminPassword         string `env:"ADMIN_PASSWORD" envDefault:"infinite-canvas"`
	JWTSecret             string `env:"JWT_SECRET" envDefault:"infinite-canvas"`
	JWTExpireHours        int    `env:"JWT_EXPIRE_HOURS" envDefault:"168"`
	StorageDriver         string `env:"STORAGE_DRIVER" envDefault:"sqlite"`
	DatabaseDSN           string `env:"DATABASE_DSN" envDefault:"data/infinite-canvas.db"`
	AILogDir              string `env:"AI_LOG_DIR" envDefault:"data/logs/ai-calls"`
	LXPayServerURL        string `env:"LX_PAY_SERVER_URL" envDefault:"http://127.0.0.1:8989"`
	LXPayAppID            string `env:"LX_PAY_APP_ID" envDefault:"app_a0479b08373c4ba3"`
	LXPayAppSecret        string `env:"LX_PAY_APP_SECRET" envDefault:"ae50619db16c419299de1c469f09e4b4dd8d52b77ab64807b4895f7148c86218"`
	LXPayNotifyURL        string `env:"LX_PAY_NOTIFY_URL" envDefault:"https://jl.lx.cq.cn/api/payment/notify"`
	LXPayAPIV3Key         string `env:"LX_PAY_API_V3_KEY" envDefault:"7f9d2b5e8c1a0s6k3h7g2j5m9q4r8t0y"`
	LXPayPlatformCertPath string `env:"LX_PAY_PLATFORM_CERT_PATH"`
	LXPayTimeoutMS        int    `env:"LX_PAY_TIMEOUT_MS" envDefault:"10000"`
	LXPayMaxRetries       int    `env:"LX_PAY_MAX_RETRIES" envDefault:"3"`
	RechargeOrderMinutes  int    `env:"RECHARGE_ORDER_MINUTES" envDefault:"15"`
}

var Cfg Config

func Load() error {
	_ = godotenv.Load()
	if err := env.Parse(&Cfg); err != nil {
		return err
	}
	normalizeDockerSQLiteDSN("/app/data")
	if strings.TrimSpace(Cfg.JWTSecret) == "" || Cfg.JWTSecret == "infinite-canvas" {
		secret, err := randomSecret()
		if err != nil {
			return err
		}
		Cfg.JWTSecret = secret
	}
	return nil
}

func normalizeDockerSQLiteDSN(appDataDir string) {
	driver := strings.ToLower(strings.TrimSpace(Cfg.StorageDriver))
	if driver != "" && driver != "sqlite" {
		return
	}
	dsn := strings.TrimSpace(Cfg.DatabaseDSN)
	if dsn == "" || dsn == ":memory:" || strings.HasPrefix(dsn, "file:") {
		return
	}
	pathPart, suffix := dsn, ""
	if index := strings.Index(dsn, "?"); index >= 0 {
		pathPart = dsn[:index]
		suffix = dsn[index:]
	}
	if filepath.IsAbs(pathPart) {
		return
	}
	slashPath := filepath.ToSlash(pathPart)
	if slashPath != "data" && !strings.HasPrefix(slashPath, "data/") {
		return
	}
	if _, err := os.Stat(appDataDir); err != nil {
		return
	}
	Cfg.DatabaseDSN = filepath.Join(filepath.Dir(appDataDir), filepath.FromSlash(slashPath)) + suffix
}

func randomSecret() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

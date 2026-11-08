package repository

import (
	"context"
	"database/sql"
	"errors"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	mysqldriver "github.com/go-sql-driver/mysql"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jiangtejie/infinite-canvas-pro/config"
	"github.com/jiangtejie/infinite-canvas-pro/model"
	"github.com/libtnb/sqlite"
	gormmysql "gorm.io/driver/mysql"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var promptCategories = []model.PromptCategory{
	{Category: "system", Name: "系统", Description: "系统提示词分类"},
	{Category: "gpt-image-2-prompts", Name: "GPT Image 2 Prompts", Description: "TigerOWO 的 GPT Image 2 案例提示词分类", GithubURL: "https://github.com/tigerowo/awesome-gpt-image-2-prompts", Remote: true},
	{Category: "awesome-gpt-image", Name: "Awesome GPT Image", Description: "ZeroLu 的中文 GPT Image 提示词分类", GithubURL: "https://github.com/ZeroLu/awesome-gpt-image", Remote: true},
	{Category: "awesome-gpt4o-image-prompts", Name: "Awesome GPT4o Image Prompts", Description: "ImgEdify 的 GPT-4o 图像提示词分类", GithubURL: "https://github.com/ImgEdify/Awesome-GPT4o-Image-Prompts", Remote: true},
	{Category: "xianyu-awesome-gptimage2", Name: "Xianyu Awesome GPT Image 2", Description: "xianyu110 的 GPT Image 2 提示词分类", GithubURL: "https://github.com/xianyu110/awesome-gptimage2", Remote: true},
	{Category: "youmind-gpt-image-2", Name: "YouMind GPT Image 2", Description: "YouMind OpenLab 的 GPT Image 2 中文提示词分类", GithubURL: "https://github.com/YouMind-OpenLab/awesome-gpt-image-2", Remote: true},
	{Category: "youmind-nano-banana-pro", Name: "YouMind Nano Banana Pro", Description: "YouMind OpenLab 的 Nano Banana Pro 中文提示词分类", GithubURL: "https://github.com/YouMind-OpenLab/awesome-nano-banana-pro-prompts", Remote: true},
	{Category: "davidwu-gpt-image2-prompts", Name: "awesome-gpt-image2-prompts", Description: "davidwuw0811-boop 整理的 GPT Image 2 提示词分类", GithubURL: "https://github.com/davidwuw0811-boop/awesome-gpt-image2-prompts", Remote: true},
	{Category: "banana-prompt-quicker", Name: "Banana Prompt Quicker", Description: "Glidea 的 Nano Banana 提示词合集", GithubURL: "https://glidea.github.io/banana-prompt-quicker/", Remote: true},
	{Category: "freestylefly-gpt-image-2", Name: "Freestylefly GPT Image 2", Description: "Freestylefly 的 GPT Image 2 提示词分类", GithubURL: "https://github.com/freestylefly/awesome-gpt-image-2", Remote: true},
	{Category: "transcendo-nano-banana", Name: "Transcendo Nano Banana", Description: "Transcendo 的 Nano Banana / Nano Banana Pro 提示词分类", GithubURL: "https://github.com/Transcendo/awesome-nanobanana-prompts", Remote: true},
}

var (
	db     *gorm.DB
	dbOnce sync.Once
	dbErr  error
)

// DB 初始化并返回全局数据库连接。
func DB() (*gorm.DB, error) {
	dbOnce.Do(func() {
		driver := strings.ToLower(strings.TrimSpace(config.Cfg.StorageDriver))
		if driver == "" {
			driver = "sqlite"
		}
		dsn := config.Cfg.DatabaseDSN
		if driver == "sqlite" && dsn != ":memory:" {
			_ = os.MkdirAll(filepath.Dir(dsn), 0755)
		}
		if driver == "sqlite" {
			path, query, _ := strings.Cut(dsn, "?")
			params, err := url.ParseQuery(query)
			if err != nil {
				dbErr = err
				return
			}
			params.Add("_pragma", "journal_mode(WAL)")
			params.Set("_txlock", "immediate")
			dsn = path + "?" + params.Encode()
		}
		if isPostgresDriver(driver) {
			dbErr = ensurePostgresDatabase(dsn)
			if dbErr != nil {
				return
			}
		}
		if driver == "mysql" {
			dsn, dbErr = normalizeMySQLDSN(dsn)
			if dbErr != nil {
				return
			}
			dbErr = ensureMySQLDatabase(dsn)
			if dbErr != nil {
				return
			}
		}
		db, dbErr = gorm.Open(dialector(driver, dsn), &gorm.Config{})
		if dbErr != nil {
			return
		}
		if driver == "mysql" {
			configureMySQLPool(db)
			warnMySQLCollation(db)
		}
		dbErr = db.AutoMigrate(
			&model.User{},
			&model.CreditLog{},
			&model.Prompt{},
			&model.AgentSkill{},
			&model.AgentSkillFile{},
			&model.Asset{},
			&model.Setting{},
			&model.CreativeWorkflow{},
			&model.UserConfig{},
			&model.AICallLog{},
			&model.StorageObject{},
			&model.VideoTask{},
			&model.VideoGenerationLog{},
			&model.ImageGenerationLog{},
			&model.CanvasImageTask{},
			&model.CanvasAudioTask{},
			&model.CanvasProject{},
			&model.ComfyBridge{},
			&model.ComfyBridgeRequest{},
			&model.RechargePackage{},
			&model.RechargeOrder{},
			&model.InvoiceRequest{},
		)
	})
	return db, dbErr
}

func dialector(driver string, dsn string) gorm.Dialector {
	switch driver {
	case "mysql":
		return gormmysql.Open(dsn)
	case "postgres", "postgresql":
		return postgres.Open(dsn)
	default:
		return sqlite.Open(dsn)
	}
}

func isPostgresDriver(driver string) bool {
	return driver == "postgres" || driver == "postgresql"
}

// normalizeMySQLDSN 补齐 GORM 读取 time.Time 所需的 parseTime，并默认使用本地时区。
func normalizeMySQLDSN(dsn string) (string, error) {
	cfg, err := mysqldriver.ParseDSN(dsn)
	if err != nil {
		return "", err
	}
	cfg.ParseTime = true
	if !mysqlDSNHasParam(dsn, "loc") {
		cfg.Loc = time.Local
	}
	return cfg.FormatDSN(), nil
}

// mysqlDSNHasParam 判断 DSN 查询参数里是否显式提供了某项配置。
func mysqlDSNHasParam(dsn string, name string) bool {
	index := strings.LastIndex(dsn, "?")
	if index < 0 {
		return false
	}
	values, err := url.ParseQuery(dsn[index+1:])
	if err != nil {
		return false
	}
	_, ok := values[name]
	return ok
}

// configureMySQLPool 设置 MySQL 连接池，避免 wait_timeout 回收陈旧连接。
func configureMySQLPool(db *gorm.DB) {
	sqlDB, err := db.DB()
	if err != nil {
		return
	}
	sqlDB.SetMaxOpenConns(50)
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetConnMaxLifetime(30 * time.Minute)
}

const mysqlDatabaseCollation = "utf8mb4_bin"

// warnMySQLCollation 在 MySQL 库排序规则与预期不一致时提示，避免大小写/重音语义悄悄偏离 SQLite。
func warnMySQLCollation(db *gorm.DB) {
	var collation string
	if err := db.Raw("SELECT DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()").Scan(&collation).Error; err != nil {
		return
	}
	if collation != "" && collation != mysqlDatabaseCollation {
		log.Printf("WARNING: MySQL 数据库排序规则为 %s，预期为 %s，大小写/重音比较行为可能与 SQLite 不一致", collation, mysqlDatabaseCollation)
	}
}

func ensureMySQLDatabase(dsn string) error {
	cfg, err := mysqldriver.ParseDSN(dsn)
	if err != nil {
		return err
	}
	target := strings.TrimSpace(cfg.DBName)
	if target == "" {
		return nil
	}
	ctx := context.Background()
	targetDB, err := sql.Open("mysql", dsn)
	if err != nil {
		return err
	}
	err = targetDB.PingContext(ctx)
	_ = targetDB.Close()
	if err == nil {
		return nil
	}
	if !isMySQLError(err, 1049) {
		return err
	}

	maintenance := cfg.Clone()
	maintenance.DBName = ""
	serverDB, err := sql.Open("mysql", maintenance.FormatDSN())
	if err != nil {
		return err
	}
	defer serverDB.Close()

	_, err = serverDB.ExecContext(ctx, "CREATE DATABASE "+quoteMySQLIdentifier(target)+" CHARACTER SET utf8mb4 COLLATE "+mysqlDatabaseCollation)
	if isMySQLError(err, 1007) {
		return nil
	}
	return err
}

func ensurePostgresDatabase(dsn string) error {
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return err
	}
	target := strings.TrimSpace(cfg.Database)
	if target == "" {
		return nil
	}
	ctx := context.Background()
	conn, err := pgx.ConnectConfig(ctx, cfg)
	if err == nil {
		_ = conn.Close(ctx)
		return nil
	}
	if !isPostgresError(err, "3D000") {
		return err
	}

	maintenance := cfg.Copy()
	maintenance.Database = "postgres"
	if strings.EqualFold(target, "postgres") {
		maintenance.Database = "template1"
	}
	conn, err = pgx.ConnectConfig(ctx, maintenance)
	if err != nil {
		return err
	}
	defer conn.Close(ctx)

	_, err = conn.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{target}.Sanitize(), pgx.QueryExecModeExec)
	if isPostgresError(err, "42P04") {
		return nil
	}
	return err
}

func isMySQLError(err error, number uint16) bool {
	var mysqlErr *mysqldriver.MySQLError
	return errors.As(err, &mysqlErr) && mysqlErr.Number == number
}

func isPostgresError(err error, code string) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == code
}

func quoteMySQLIdentifier(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

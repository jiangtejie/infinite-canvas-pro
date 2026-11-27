package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const defaultBodyLimit = 256 << 20

// BodyLimit 限制请求体大小，避免超大上传把进程内存打满。
func BodyLimit(limit int64) gin.HandlerFunc {
	if limit <= 0 {
		limit = defaultBodyLimit
	}
	return func(c *gin.Context) {
		if c.Request.Body != nil && c.Request.Body != http.NoBody {
			c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		}
		c.Next()
	}
}

package service

import (
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
)

var (
	outboundTransportOnce sync.Once
	outboundTransport     *http.Transport
)

// LogOutboundProxy 在进程启动时打印出网代理来源，排查 AI 渠道连不上时先确认有没有走代理。
func LogOutboundProxy() {
	log.Printf("outbound proxy: %s", OutboundProxyLabel())
}

// OutboundProxyLabel 返回当前出网代理的简短描述，不包含账号密码。
func OutboundProxyLabel() string {
	if value := envProxyValue(); value != "" {
		return "env " + sanitizeProxyValue(value)
	}
	if proxyURL, _ := systemProxyURL(&url.URL{Scheme: "https", Host: "example.com"}); proxyURL != nil {
		return "system " + sanitizeProxyValue(proxyURL.String())
	}
	return "none"
}

// outboundHTTPTransport 访问 AI 渠道共用：优先环境变量代理，其次系统代理（Windows）。
func outboundHTTPTransport() *http.Transport {
	outboundTransportOnce.Do(func() {
		base, ok := http.DefaultTransport.(*http.Transport)
		if !ok {
			base = &http.Transport{}
		}
		transport := base.Clone()
		transport.Proxy = resolveOutboundProxy
		outboundTransport = transport
	})
	return outboundTransport
}

func resolveOutboundProxy(request *http.Request) (*url.URL, error) {
	if proxyURL, err := http.ProxyFromEnvironment(request); proxyURL != nil || err != nil {
		return proxyURL, err
	}
	return systemProxyURL(request.URL)
}

func envProxyValue() string {
	for _, key := range []string{"HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"} {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}

func sanitizeProxyValue(value string) string {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" {
		return value
	}
	parsed.User = nil
	return parsed.String()
}

// parseSystemProxyServer 解析 Windows 的 ProxyServer 配置：
// 既支持 "127.0.0.1:7890"，也支持 "http=...;https=...;socks=..."。
func parseSystemProxyServer(server string, targetScheme string) *url.URL {
	entries := map[string]string{}
	for _, part := range strings.Split(server, ";") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		key, value, found := strings.Cut(part, "=")
		if found {
			entries[strings.ToLower(strings.TrimSpace(key))] = strings.TrimSpace(value)
		} else {
			entries["default"] = part
		}
	}
	value := ""
	if strings.HasPrefix(strings.ToLower(targetScheme), "https") {
		value = entries["https"]
	}
	for _, candidate := range []string{value, entries["http"], entries["default"], entries["socks"]} {
		if strings.TrimSpace(candidate) != "" {
			value = strings.TrimSpace(candidate)
			break
		}
	}
	if value == "" {
		return nil
	}
	lower := strings.ToLower(value)
	if !strings.Contains(lower, "://") {
		value = "http://" + value
		lower = strings.ToLower(value)
	}
	switch {
	case strings.HasPrefix(lower, "socks5h://"):
		value = "socks5://" + value[len("socks5h://"):]
	case strings.HasPrefix(lower, "socks://"):
		value = "socks5://" + value[len("socks://"):]
	case strings.HasPrefix(lower, "http://"), strings.HasPrefix(lower, "https://"), strings.HasPrefix(lower, "socks5://"):
	default:
		return nil
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" {
		return nil
	}
	return parsed
}

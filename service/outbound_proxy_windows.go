//go:build windows

package service

import (
	"net/url"
	"strings"

	"golang.org/x/sys/windows/registry"
)

// systemProxyURL 读取 Windows 系统代理（WinINET）；Go 默认不读系统设置，这里手动兜底。
func systemProxyURL(target *url.URL) (*url.URL, error) {
	if target == nil || isLoopbackHost(target.Hostname()) {
		return nil, nil
	}
	key, err := registry.OpenKey(registry.CURRENT_USER, `Software\Microsoft\Windows\CurrentVersion\Internet Settings`, registry.QUERY_VALUE)
	if err != nil {
		return nil, nil
	}
	defer key.Close()
	enabled, _, err := key.GetIntegerValue("ProxyEnable")
	if err != nil || enabled == 0 {
		return nil, nil
	}
	server, _, err := key.GetStringValue("ProxyServer")
	if err != nil || strings.TrimSpace(server) == "" {
		return nil, nil
	}
	return parseSystemProxyServer(server, target.Scheme), nil
}

func isLoopbackHost(host string) bool {
	host = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(host), "."))
	return host == "localhost" || host == "::1" || strings.HasPrefix(host, "127.")
}

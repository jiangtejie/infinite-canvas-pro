package service

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var safeProxyHTTPClient = newSafeProxyHTTPClient()

func SafeProxyHTTPClient() *http.Client {
	return safeProxyHTTPClient
}
func newSafeProxyHTTPClient() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = safeProxyDialContext
	return &http.Client{
		Transport: transport,
		Timeout:   5 * time.Minute,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			if len(via) > 5 {
				return errors.New("重定向次数过多")
			}
			scheme := strings.ToLower(req.URL.Scheme)
			if scheme != "http" && scheme != "https" {
				return errors.New("重定向地址无效")
			}
			return nil
		},
	}
}

func safeProxyDialContext(ctx context.Context, network, address string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return nil, err
	}
	ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil || len(ips) == 0 {
		return nil, errors.New("无法解析目标地址")
	}
	for _, item := range ips {
		if isBlockedProxyIP(item.IP) {
			return nil, errors.New("禁止访问本地或内网地址")
		}
	}
	dialer := net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
	}
	var lastErr error
	for _, item := range ips {
		conn, err := dialer.DialContext(
			ctx,
			network,
			net.JoinHostPort(item.String(), port),
		)
		if err == nil {
			return conn, nil
		}
		lastErr = err
	}
	return nil, fmt.Errorf("无法连接目标地址: %w", lastErr)
}

func isBlockedProxyIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() ||
		ip.IsPrivate() ||
		ip.IsLinkLocalUnicast() ||
		ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() ||
		ip.IsUnspecified() {
		return true
	}
	ip4 := ip.To4()
	if ip4 == nil {
		return false
	}
	// 100.64.0.0/10，包括部分云平台 metadata 地址。
	if ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
		return true
	}
	return ip4[0] == 0
}

// blockedChannelHosts 云平台元数据域名：用户自建渠道一律不允许指向这些地址。
var blockedChannelHosts = map[string]bool{
	"metadata.google.internal": true,
	"metadata.goog":            true,
	"instance-data":            true,
	"fd00:ec2::254":            true,
}

// ValidateUserChannelBaseURL 限制用户自建渠道指向链路本地与云平台元数据地址。
// 内网与回环地址仍允许：本地模型服务通常就部署在同一台机器或局域网内。
func ValidateUserChannelBaseURL(rawURL string) error {
	parsed, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return errors.New("本地渠道 Base URL 必须是 http/https 地址")
	}
	host := strings.ToLower(parsed.Hostname())
	if host == "" {
		return errors.New("本地渠道 Base URL 缺少域名")
	}
	if blockedChannelHosts[host] {
		return errors.New("本地渠道 Base URL 不能指向云平台元数据地址")
	}
	if ip := net.ParseIP(host); ip != nil && isBlockedChannelHostIP(ip) {
		return errors.New("本地渠道 Base URL 不能指向云平台元数据地址")
	}
	return nil
}

func isBlockedChannelHostIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
		return true
	}
	ip4 := ip.To4()
	if ip4 == nil {
		return false
	}
	// 100.64.0.0/10：包括部分云平台 metadata 与 CGNAT。
	return ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127
}

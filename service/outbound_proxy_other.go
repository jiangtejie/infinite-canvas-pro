//go:build !windows

package service

import "net/url"

func systemProxyURL(target *url.URL) (*url.URL, error) {
	return nil, nil
}

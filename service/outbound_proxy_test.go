package service

import (
	"net/url"
	"testing"
)

func TestOutboundProxyLabelReportsIgnoredSystemProxy(t *testing.T) {
	system, err := url.Parse("http://127.0.0.1:7890")
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		env  string
		want string
	}{
		{
			name: "stale environment proxy hides working system proxy",
			env:  "http://127.0.0.1:10911",
			want: "env http://127.0.0.1:10911; Windows system proxy ignored: http://127.0.0.1:7890",
		},
		{
			name: "same environment and system proxy",
			env:  "http://127.0.0.1:7890",
			want: "env http://127.0.0.1:7890",
		},
		{
			name: "proxy credentials are redacted",
			env:  "http://user:secret@127.0.0.1:10911",
			want: "env http://127.0.0.1:10911; Windows system proxy ignored: http://127.0.0.1:7890",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := outboundProxyLabel(test.env, system); got != test.want {
				t.Fatalf("outboundProxyLabel() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestOutboundProxyLabelWithoutEnvironmentProxy(t *testing.T) {
	system, err := url.Parse("http://127.0.0.1:7890")
	if err != nil {
		t.Fatal(err)
	}
	if got := outboundProxyLabel("", system); got != "system http://127.0.0.1:7890" {
		t.Fatalf("outboundProxyLabel() = %q", got)
	}
	if got := outboundProxyLabel("", nil); got != "none" {
		t.Fatalf("outboundProxyLabel() = %q", got)
	}
}

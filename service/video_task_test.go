package service

import (
	"testing"
	"time"
)

func TestVideoTaskExpired(t *testing.T) {
	now := time.Date(2026, 11, 18, 12, 0, 0, 0, time.UTC)
	cases := []struct {
		name      string
		createdAt string
		want      bool
	}{
		{"fresh task", now.Add(-30 * time.Minute).Format(time.RFC3339Nano), false},
		{"expired task", now.Add(-3 * time.Hour).Format(time.RFC3339Nano), true},
		{"just below timeout", now.Add(-videoTaskTimeout + time.Minute).Format(time.RFC3339Nano), false},
		{"exactly at timeout", now.Add(-videoTaskTimeout).Format(time.RFC3339Nano), false},
		{"invalid timestamp", "not-a-time", false},
		{"empty timestamp", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := videoTaskExpired(tc.createdAt, now); got != tc.want {
				t.Fatalf("videoTaskExpired(%q) = %v, want %v", tc.createdAt, got, tc.want)
			}
		})
	}
}

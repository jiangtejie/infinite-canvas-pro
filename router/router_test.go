package router

import (
	"net/http"
	"testing"
)

func TestScriptProjectRoutesAreRegistered(t *testing.T) {
	routes := New().Routes()
	expected := [][2]string{
		{http.MethodGet, "/api/v1/script/projects"},
		{http.MethodPost, "/api/v1/script/projects"},
		{http.MethodGet, "/api/v1/script/projects/:id"},
		{http.MethodPost, "/api/v1/script/projects/:id/changes"},
		{http.MethodDelete, "/api/v1/script/projects/:id"},
		{http.MethodGet, "/api/v1/script/projects/:id/versions"},
		{http.MethodPost, "/api/v1/script/projects/:id/versions"},
		{http.MethodGet, "/api/v1/script/projects/:id/versions/:versionId"},
		{http.MethodPost, "/api/v1/script/projects/:id/versions/:versionId/restore"},
		{http.MethodDelete, "/api/v1/script/projects/:id/versions/:versionId"},
	}
	registered := make(map[string]bool, len(routes))
	for _, route := range routes {
		registered[route.Method+" "+route.Path] = true
	}
	for _, route := range expected {
		if !registered[route[0]+" "+route[1]] {
			t.Errorf("missing route %s %s", route[0], route[1])
		}
	}
}

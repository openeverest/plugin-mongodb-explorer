package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestBuildMongoURIStripsDuplicatePort(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{
			name: "duplicate port on last replica set member",
			in:   "mongodb://user:pass@h1:27017,h2:27017,h3:27017:27017/admin?ssl=false",
			want: "mongodb://user:pass@h1:27017,h2:27017,h3:27017/admin?ssl=false",
		},
		{
			name: "no duplicate port — unchanged",
			in:   "mongodb://user:pass@h1:27017,h2:27017,h3:27017/admin?ssl=false",
			want: "mongodb://user:pass@h1:27017,h2:27017,h3:27017/admin?ssl=false",
		},
		{
			name: "single host no duplicate",
			in:   "mongodb://user:pass@h1:27017/admin",
			want: "mongodb://user:pass@h1:27017/admin",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := buildMongoURI(&Credentials{URI: tc.in})
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("\ngot:  %s\nwant: %s", got, tc.want)
			}
		})
	}
}

func TestDiscoverMongoInstances(t *testing.T) {
	var authorizationHeaders []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorizationHeaders = append(authorizationHeaders, r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.URL.Path == "/v1/clusters":
			_, _ = w.Write([]byte(`{"items":[{"name":"cluster-b"},{"name":"cluster-a"}]}`))
		case r.URL.Path == "/v1/clusters/cluster-a/namespaces":
			_, _ = w.Write([]byte(`["ns-z","ns-a"]`))
		case r.URL.Path == "/v1/clusters/cluster-b/namespaces":
			_, _ = w.Write([]byte(`["ns-b"]`))
		case r.URL.Path == "/v1/clusters/cluster-a/namespaces/ns-a/instances":
			_, _ = w.Write([]byte(`{"items":[{"metadata":{"name":"mongo-a"},"spec":{"providerRef":{"name":"percona-server-mongodb"}}},{"metadata":{"name":"postgres"},"spec":{"providerRef":{"name":"postgresql"}}},{"metadata":{"name":"mongo-a","labels":{"core.openeverest.io/provider":"percona-server-mongodb"}}}]}`))
		case r.URL.Path == "/v1/clusters/cluster-a/namespaces/ns-z/instances":
			_, _ = w.Write([]byte(`{"items":[{"metadata":{"name":"mongo-z"},"spec":{"provider":"percona-server-mongodb"}}]}`))
		case r.URL.Path == "/v1/clusters/cluster-b/namespaces/ns-b/instances":
			_, _ = w.Write([]byte(`{"items":[{"metadata":{"name":"mongo-b"},"spec":{"provider":"percona-server-mongodb"}}]}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	t.Setenv("EVEREST_API_URL", server.URL)

	instances, err := discoverMongoInstances(t.Context(), "jwt-token")
	if err != nil {
		t.Fatalf("discoverMongoInstances() error = %v", err)
	}
	want := []ExplorerInstance{
		{K8sCluster: "cluster-a", Namespace: "ns-a", Name: "mongo-a", Provider: "percona-server-mongodb"},
		{K8sCluster: "cluster-a", Namespace: "ns-z", Name: "mongo-z", Provider: "percona-server-mongodb"},
		{K8sCluster: "cluster-b", Namespace: "ns-b", Name: "mongo-b", Provider: "percona-server-mongodb"},
	}
	if !reflect.DeepEqual(instances, want) {
		t.Fatalf("instances = %#v, want %#v", instances, want)
	}
	if len(authorizationHeaders) == 0 {
		t.Fatal("expected discovery requests")
	}
	for _, header := range authorizationHeaders {
		if header != "Bearer jwt-token" {
			t.Errorf("authorization header = %q, want Bearer jwt-token", header)
		}
	}
}

func TestHandleListInstancesAuthAndSchema(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/v1/clusters" {
			_, _ = w.Write([]byte(`{"items":[]}`))
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()
	t.Setenv("EVEREST_API_URL", server.URL)

	unauthenticated := httptest.NewRecorder()
	newMux().ServeHTTP(unauthenticated, httptest.NewRequest(http.MethodGet, "/api/instances", nil))
	if unauthenticated.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated status = %d, want %d", unauthenticated.Code, http.StatusUnauthorized)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/instances", nil)
	request.Header.Set("Authorization", "Bearer jwt-token")
	recorder := httptest.NewRecorder()
	newMux().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("authenticated status = %d, body = %s", recorder.Code, recorder.Body.String())
	}
	var response struct {
		Instances []ExplorerInstance `json:"instances"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if response.Instances == nil {
		t.Fatal("instances response must be an array")
	}
}

func TestHandleListInstancesUpstreamError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "forbidden", http.StatusForbidden)
	}))
	defer server.Close()
	t.Setenv("EVEREST_API_URL", server.URL)

	request := httptest.NewRequest(http.MethodGet, "/api/instances", nil)
	request.Header.Set("X-Everest-User", "jwt-token")
	recorder := httptest.NewRecorder()
	newMux().ServeHTTP(recorder, request)
	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("upstream error status = %d, want %d", recorder.Code, http.StatusBadGateway)
	}
	if strings.Contains(recorder.Body.String(), "jwt-token") {
		t.Fatal("error response must not expose the JWT")
	}
}

package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// dist/main.js is copied from the frontend build during the Docker build.
//
//go:embed dist/main.js
var distFS embed.FS

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

func everestAPIURL() string {
	// Explicit override wins (useful for local dev or air-gapped setups).
	if v := os.Getenv("EVEREST_API_URL"); v != "" {
		return strings.TrimRight(v, "/")
	}
	// Kubernetes automatically injects <SVCNAME>_SERVICE_HOST / _SERVICE_PORT
	// for every Service in the same namespace, so we get this for free when
	// the plugin pod runs alongside the "everest" Service in everest-system.
	if host := os.Getenv("EVEREST_SERVICE_HOST"); host != "" {
		port := os.Getenv("EVEREST_SERVICE_PORT")
		if port == "" {
			port = "8080"
		}
		return "http://" + host + ":" + port
	}
	// Fallback: stable DNS name of the everest Service.
	return "http://everest.everest-system.svc.cluster.local:8080"
}

// ---------------------------------------------------------------------------
// Connection-details broker
// ---------------------------------------------------------------------------

// ConnectionDetails is the response from
// GET /v1/namespaces/{ns}/database-clusters/{name}/connection-details.
// The exact shape is defined by the OpenEverest core; we handle both a
// pre-built URI and individual credential fields.
type ConnectionDetails struct {
	// If the core returns a ready-to-use MongoDB URI, use it directly.
	ConnectionString string `json:"connectionString"`
	// Alternatively, individual fields are used to build a URI.
	Host       string `json:"host"`
	Port       int    `json:"port"`
	Username   string `json:"username"`
	Password   string `json:"password"`
	ReplicaSet string `json:"replicaSet"`
	TLS        bool   `json:"tls"`
}

func getConnectionDetails(ctx context.Context, jwt, namespace, cluster string) (*ConnectionDetails, error) {
	apiURL := fmt.Sprintf("%s/v1/namespaces/%s/database-clusters/%s/connection-details",
		everestAPIURL(),
		url.PathEscape(namespace),
		url.PathEscape(cluster),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+jwt)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("connection-details request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("connection-details returned %d: %s", resp.StatusCode, string(body))
	}

	var details ConnectionDetails
	if err := json.Unmarshal(body, &details); err != nil {
		return nil, fmt.Errorf("failed to decode connection-details: %w", err)
	}
	return &details, nil
}

func buildMongoURI(d *ConnectionDetails) string {
	if d.ConnectionString != "" {
		return d.ConnectionString
	}

	// Build from parts.
	host := d.Host
	if host == "" {
		host = "localhost"
	}
	if d.Port > 0 {
		host = fmt.Sprintf("%s:%d", host, d.Port)
	}

	var sb strings.Builder
	sb.WriteString("mongodb://")
	if d.Username != "" {
		sb.WriteString(url.QueryEscape(d.Username))
		sb.WriteByte(':')
		sb.WriteString(url.QueryEscape(d.Password))
		sb.WriteByte('@')
	}
	sb.WriteString(host)

	params := url.Values{}
	if d.ReplicaSet != "" {
		params.Set("replicaSet", d.ReplicaSet)
	}
	if d.TLS {
		params.Set("tls", "true")
	}
	if len(params) > 0 {
		sb.WriteByte('/')
		sb.WriteByte('?')
		sb.WriteString(params.Encode())
	}
	return sb.String()
}

// ---------------------------------------------------------------------------
// MongoDB client cache (keyed by namespace/cluster, TTL 10 min < credential TTL 15 min)
// ---------------------------------------------------------------------------

type cachedClient struct {
	client    *mongo.Client
	expiresAt time.Time
}

var (
	clientCacheMu sync.Mutex
	clientCache   = map[string]*cachedClient{}
)

func getMongoClient(ctx context.Context, details *ConnectionDetails, cacheKey string) (*mongo.Client, error) {
	clientCacheMu.Lock()
	defer clientCacheMu.Unlock()

	if cc, ok := clientCache[cacheKey]; ok && time.Now().Before(cc.expiresAt) {
		return cc.client, nil
	}
	// Evict stale entry.
	if cc, ok := clientCache[cacheKey]; ok {
		_ = cc.client.Disconnect(context.Background())
		delete(clientCache, cacheKey)
	}

	uri := buildMongoURI(details)
	clientOpts := options.Client().
		ApplyURI(uri).
		SetConnectTimeout(10 * time.Second).
		SetServerSelectionTimeout(10 * time.Second)

	client, err := mongo.Connect(ctx, clientOpts)
	if err != nil {
		return nil, fmt.Errorf("mongo connect: %w", err)
	}
	if err := client.Ping(ctx, nil); err != nil {
		_ = client.Disconnect(context.Background())
		return nil, fmt.Errorf("mongo ping: %w", err)
	}

	clientCache[cacheKey] = &cachedClient{
		client:    client,
		expiresAt: time.Now().Add(10 * time.Minute),
	}
	return client, nil
}

// ---------------------------------------------------------------------------
// Helper: extract the X-Everest-User JWT and required query params
// ---------------------------------------------------------------------------

// extractJWT returns the bearer token the backend should use when calling
// the Everest credential broker.
//
// Precedence:
//  1. X-Everest-User — set by the host proxy once that feature is live.
//  2. Authorization: Bearer <token> — forwarded by the proxy in the
//     meantime and usable directly against the Everest API.
func extractJWT(r *http.Request) (string, error) {
	if v := r.Header.Get("X-Everest-User"); v != "" {
		return v, nil
	}
	if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer "), nil
	}
	return "", fmt.Errorf("no auth token: expected X-Everest-User header or Authorization: Bearer")
}

func extractParams(r *http.Request) (jwt, cluster, namespace string, err error) {
	jwt, err = extractJWT(r)
	if err != nil {
		return "", "", "", err
	}
	cluster = r.URL.Query().Get("cluster")
	namespace = r.URL.Query().Get("namespace")
	if cluster == "" || namespace == "" {
		return "", "", "", fmt.Errorf("cluster and namespace query parameters are required")
	}
	return jwt, cluster, namespace, nil
}

func getClient(r *http.Request) (*mongo.Client, error) {
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	jwt, cluster, namespace, err := extractParams(r)
	if err != nil {
		return nil, err
	}

	details, err := getConnectionDetails(ctx, jwt, namespace, cluster)
	if err != nil {
		return nil, fmt.Errorf("failed to get connection details: %w", err)
	}

	cacheKey := namespace + "/" + cluster
	return getMongoClient(ctx, details, cacheKey)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("writeJSON error: %v", err)
	}
}

func apiError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

// GET /api/databases?cluster=X&namespace=Y
func handleListDatabases(w http.ResponseWriter, r *http.Request) {
	client, err := getClient(r)
	if err != nil {
		apiError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	names, err := client.ListDatabaseNames(ctx, bson.M{})
	if err != nil {
		apiError(w, http.StatusInternalServerError, fmt.Sprintf("list databases: %v", err))
		return
	}
	writeJSON(w, map[string]any{"databases": names})
}

// GET /api/databases/{db}/collections?cluster=X&namespace=Y
func handleListCollections(w http.ResponseWriter, r *http.Request) {
	db := r.PathValue("db")
	if db == "" {
		apiError(w, http.StatusBadRequest, "db path parameter is required")
		return
	}

	client, err := getClient(r)
	if err != nil {
		apiError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	names, err := client.Database(db).ListCollectionNames(ctx, bson.M{})
	if err != nil {
		apiError(w, http.StatusInternalServerError, fmt.Sprintf("list collections: %v", err))
		return
	}
	writeJSON(w, map[string]any{"collections": names})
}

// QueryRequest is the payload for POST /api/query.
type QueryRequest struct {
	Cluster    string         `json:"cluster"`
	Namespace  string         `json:"namespace"`
	DB         string         `json:"db"`
	Collection string         `json:"collection"`
	Filter     map[string]any `json:"filter"`
	Projection map[string]any `json:"projection,omitempty"`
	Sort       map[string]any `json:"sort,omitempty"`
	Limit      int64          `json:"limit"`
}

// POST /api/query
func handleQuery(w http.ResponseWriter, r *http.Request) {
	jwt, err := extractJWT(r)
	if err != nil {
		apiError(w, http.StatusBadRequest, err.Error())
		return
	}

	var req QueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		apiError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	if req.Cluster == "" || req.Namespace == "" || req.DB == "" || req.Collection == "" {
		apiError(w, http.StatusBadRequest, "cluster, namespace, db, and collection are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	details, err := getConnectionDetails(ctx, jwt, req.Namespace, req.Cluster)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "failed to get connection details: "+err.Error())
		return
	}

	cacheKey := req.Namespace + "/" + req.Cluster
	client, err := getMongoClient(ctx, details, cacheKey)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "mongo connect: "+err.Error())
		return
	}

	limit := req.Limit
	if limit <= 0 || limit > 1000 {
		limit = 20
	}

	filter := bson.M(req.Filter)
	if filter == nil {
		filter = bson.M{}
	}

	findOpts := options.Find().SetLimit(limit)
	if len(req.Projection) > 0 {
		findOpts.SetProjection(bson.M(req.Projection))
	}
	if len(req.Sort) > 0 {
		findOpts.SetSort(bson.M(req.Sort))
	}

	coll := client.Database(req.DB).Collection(req.Collection)
	cursor, err := coll.Find(ctx, filter, findOpts)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "find: "+err.Error())
		return
	}
	defer cursor.Close(ctx)

	var documents []map[string]any
	if err := cursor.All(ctx, &documents); err != nil {
		apiError(w, http.StatusInternalServerError, "cursor: "+err.Error())
		return
	}
	if documents == nil {
		documents = []map[string]any{}
	}

	writeJSON(w, map[string]any{"documents": documents})
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

func main() {
	mux := http.NewServeMux()

	// Serve the frontend bundle — the host fetches this to load the plugin UI.
	mux.HandleFunc("GET /main.js", func(w http.ResponseWriter, r *http.Request) {
		data, err := distFS.ReadFile("dist/main.js")
		if err != nil {
			http.Error(w, "bundle not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		_, _ = w.Write(data)
	})

	// Backend API — proxied by the host from /v1/plugins/mongo-explorer/api/*.
	mux.HandleFunc("GET /api/databases", handleListDatabases)
	mux.HandleFunc("GET /api/databases/{db}/collections", handleListCollections)
	mux.HandleFunc("POST /api/query", handleQuery)

	// Health check — used by the host for plugin liveness tracking.
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	addr := ":" + port
	log.Printf("mongo-explorer backend listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}

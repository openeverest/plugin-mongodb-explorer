package main

import (
	"context"
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
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

//go:embed dist/icon.png
var iconData []byte

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
// Credentials broker
// ---------------------------------------------------------------------------

// Credentials is the response from
// GET /v1/clusters/{k8sCluster}/namespaces/{ns}/instances/{name}/connection
type Credentials struct {
	URI      string `json:"uri"`
	Host     string `json:"host"`
	Port     string `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	Provider string `json:"provider"`
	Type     string `json:"type"`
}

// ExplorerInstance is the minimal instance metadata returned to the plugin
// frontend. Credentials are intentionally not part of this response.
type ExplorerInstance struct {
	K8sCluster string `json:"k8sCluster"`
	Namespace  string `json:"namespace"`
	Name       string `json:"name"`
	Provider   string `json:"provider"`
}

type explorerObjectMetadata struct {
	Name   string            `json:"name"`
	Labels map[string]string `json:"labels"`
}

type explorerClusterList struct {
	Items []struct {
		Name string `json:"name"`
	} `json:"items"`
}

type explorerInstanceList struct {
	Items []struct {
		Metadata explorerObjectMetadata `json:"metadata"`
		Spec     struct {
			Provider    string `json:"provider"`
			ProviderRef struct {
				Name string `json:"name"`
			} `json:"providerRef"`
		} `json:"spec"`
	} `json:"items"`
}

const maxEverestErrorBody = 64 * 1024

// everestHTTPClient is a package variable so tests can replace it with a
// client using a custom transport. The timeout also protects requests made
// outside a caller-supplied discovery deadline.
var everestHTTPClient = &http.Client{Timeout: 15 * time.Second}

// doEverestJSON performs an authenticated request against the OpenEverest API
// and decodes its JSON response into destination.
func doEverestJSON(ctx context.Context, jwt, path string, destination any) error {
	apiURL := strings.TrimRight(everestAPIURL(), "/") + "/" + strings.TrimLeft(path, "/")
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+jwt)
	req.Header.Set("Accept", "application/json")

	resp, err := everestHTTPClient.Do(req)
	if err != nil {
		return fmt.Errorf("Everest request %s failed: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, maxEverestErrorBody))
		message := strings.TrimSpace(string(body))
		if message == "" {
			message = http.StatusText(resp.StatusCode)
		}
		return fmt.Errorf("Everest request %s returned %d: %s", path, resp.StatusCode, message)
	}

	if err := json.NewDecoder(resp.Body).Decode(destination); err != nil {
		return fmt.Errorf("decode Everest response %s: %w", path, err)
	}
	return nil
}

func getCredentials(ctx context.Context, jwt, k8sCluster, namespace, instance string) (*Credentials, error) {
	apiURL := fmt.Sprintf("%s/v1/clusters/%s/namespaces/%s/instances/%s/connection",
		everestAPIURL(),
		url.PathEscape(k8sCluster),
		url.PathEscape(namespace),
		url.PathEscape(instance),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+jwt)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("credentials request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("credentials endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var creds Credentials
	if err := json.Unmarshal(body, &creds); err != nil {
		return nil, fmt.Errorf("failed to decode credentials: %w", err)
	}
	return &creds, nil
}

// duplicatePortRe matches a port that appears twice consecutively in a MongoDB
// URI host list, e.g. "host:27017:27017/" or "host:27017:27017,".
// This is a known quirk of the Everest connection endpoint where the port
// field is appended again after the last replica-set member's port.
var duplicatePortRe = regexp.MustCompile(`:([0-9]+):[0-9]+([,/?]|$)`)

func buildMongoURI(creds *Credentials) (string, error) {
	if creds.URI == "" {
		return "", fmt.Errorf("credentials response contained no uri field")
	}
	// Strip duplicate port (e.g. ":27017:27017/" → ":27017/").
	uri := duplicatePortRe.ReplaceAllString(creds.URI, ":$1$2")
	return uri, nil
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

func getMongoClient(ctx context.Context, creds *Credentials, cacheKey string) (*mongo.Client, error) {
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

	uri, err := buildMongoURI(creds)
	if err != nil {
		return nil, err
	}
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

func extractParams(r *http.Request) (jwt, k8sCluster, instance, namespace string, err error) {
	jwt, err = extractJWT(r)
	if err != nil {
		return "", "", "", "", err
	}
	k8sCluster = r.URL.Query().Get("k8sCluster")
	if k8sCluster == "" {
		k8sCluster = "main"
	}
	instance = r.URL.Query().Get("cluster")
	namespace = r.URL.Query().Get("namespace")
	if instance == "" || namespace == "" {
		return "", "", "", "", fmt.Errorf("cluster and namespace query parameters are required")
	}
	return jwt, k8sCluster, instance, namespace, nil
}

func getClient(r *http.Request) (*mongo.Client, error) {
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	jwt, k8sCluster, instance, namespace, err := extractParams(r)
	if err != nil {
		return nil, err
	}

	creds, err := getCredentials(ctx, jwt, k8sCluster, namespace, instance)
	if err != nil {
		return nil, fmt.Errorf("failed to get credentials: %w", err)
	}

	cacheKey := k8sCluster + "/" + namespace + "/" + instance
	return getMongoClient(ctx, creds, cacheKey)
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

func discoverMongoInstances(ctx context.Context, jwt string) ([]ExplorerInstance, error) {
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	var clusters explorerClusterList
	if err := doEverestJSON(ctx, jwt, "/v1/clusters", &clusters); err != nil {
		return nil, err
	}

	instancesByKey := make(map[string]ExplorerInstance)
	for _, cluster := range clusters.Items {
		clusterName := cluster.Name
		if clusterName == "" {
			continue
		}

		namespacePath := fmt.Sprintf("/v1/clusters/%s/namespaces", url.PathEscape(clusterName))
		var namespaces []string
		if err := doEverestJSON(ctx, jwt, namespacePath, &namespaces); err != nil {
			return nil, err
		}

		for _, namespaceName := range namespaces {
			if namespaceName == "" {
				continue
			}

			instancesPath := fmt.Sprintf("/v1/clusters/%s/namespaces/%s/instances",
				url.PathEscape(clusterName), url.PathEscape(namespaceName))
			var listed explorerInstanceList
			if err := doEverestJSON(ctx, jwt, instancesPath, &listed); err != nil {
				return nil, err
			}

			for _, instance := range listed.Items {
				provider := instance.Spec.Provider
				if provider == "" {
					provider = instance.Spec.ProviderRef.Name
				}
				if provider == "" {
					provider = instance.Metadata.Labels["core.openeverest.io/provider"]
				}
				if provider != "percona-server-mongodb" || instance.Metadata.Name == "" {
					continue
				}
				explorerInstance := ExplorerInstance{
					K8sCluster: clusterName,
					Namespace:  namespaceName,
					Name:       instance.Metadata.Name,
					Provider:   provider,
				}
				key := explorerInstance.K8sCluster + "/" + explorerInstance.Namespace + "/" + explorerInstance.Name
				instancesByKey[key] = explorerInstance
			}
		}
	}

	instances := make([]ExplorerInstance, 0, len(instancesByKey))
	for _, instance := range instancesByKey {
		instances = append(instances, instance)
	}
	sort.Slice(instances, func(i, j int) bool {
		left := instances[i].K8sCluster + "/" + instances[i].Namespace + "/" + instances[i].Name
		right := instances[j].K8sCluster + "/" + instances[j].Namespace + "/" + instances[j].Name
		return left < right
	})
	return instances, nil
}

// GET /api/instances
func handleListInstances(w http.ResponseWriter, r *http.Request) {
	jwt, err := extractJWT(r)
	if err != nil {
		apiError(w, http.StatusUnauthorized, err.Error())
		return
	}

	instances, err := discoverMongoInstances(r.Context(), jwt)
	if err != nil {
		apiError(w, http.StatusBadGateway, "instance discovery failed: "+err.Error())
		return
	}
	writeJSON(w, map[string]any{"instances": instances})
}

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
	K8sCluster string         `json:"k8sCluster"`
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
	if req.K8sCluster == "" {
		req.K8sCluster = "main"
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	creds, err := getCredentials(ctx, jwt, req.K8sCluster, req.Namespace, req.Cluster)
	if err != nil {
		apiError(w, http.StatusInternalServerError, "failed to get credentials: "+err.Error())
		return
	}

	cacheKey := req.K8sCluster + "/" + req.Namespace + "/" + req.Cluster
	client, err := getMongoClient(ctx, creds, cacheKey)
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

// bundleData and bundleETag are computed once: the frontend is embedded, so it
// never changes for the lifetime of the process (a new release ships a new
// image, hence a new process with a new ETag).
var (
	bundleData    []byte
	bundleDataErr error
	bundleETag    string
	bundleOnce    sync.Once
)

func loadBundle() {
	bundleData, bundleDataErr = distFS.ReadFile("dist/main.js")
	if bundleDataErr == nil {
		sum := sha256.Sum256(bundleData)
		bundleETag = `"` + hex.EncodeToString(sum[:]) + `"`
	}
}

// handleBundle serves the dynamically loaded plugin frontend.
//
// The URL is stable (`main.js`), so we can't rely on a hashed filename to bust
// the browser cache on release. Instead we serve a content-addressed ETag with
// `no-cache`: the browser revalidates on every load and gets a cheap 304 when
// the bundle is unchanged, but picks up a new release immediately.
func handleBundle(w http.ResponseWriter, r *http.Request) {
	bundleOnce.Do(loadBundle)
	if bundleDataErr != nil {
		http.Error(w, "bundle not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("ETag", bundleETag)
	if r.Header.Get("If-None-Match") == bundleETag {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	_, _ = w.Write(bundleData)
}

func newMux() *http.ServeMux {
	mux := http.NewServeMux()

	// Serve the frontend bundle — the host fetches this to load the plugin UI.
	mux.HandleFunc("GET /main.js", handleBundle)

	// Serve the plugin icon.
	mux.HandleFunc("GET /icon.png", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.Header().Set("Cache-Control", "public, max-age=86400")
		_, _ = w.Write(iconData)
	})

	// Backend API — proxied by the host from
	// /v1/clusters/{cluster}/plugins/{name}/api/*.
	mux.HandleFunc("GET /api/instances", handleListInstances)
	mux.HandleFunc("GET /api/databases", handleListDatabases)
	mux.HandleFunc("GET /api/databases/{db}/collections", handleListCollections)
	mux.HandleFunc("POST /api/query", handleQuery)

	// Health check — used by the host for plugin liveness tracking.
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	return mux
}

func main() {
	mux := newMux()

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

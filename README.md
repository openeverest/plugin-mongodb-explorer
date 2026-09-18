# OpenEverest MongoDB Explorer Plugin

A generic plugin for [OpenEverest](https://github.com/openeverest/openeverest) that adds a
**MongoDB Explorer** tab to PSMDB cluster detail pages, allowing users to:

- Discover available OpenEverest-managed MongoDB instances from the sidebar
- Browse databases and collections in the cluster
- Run `find` queries with filter, projection, limit, and sort
- View results as a table or raw JSON

## Install with Helm

```bash
helm upgrade mongo-explorer oci://ghcr.io/openeverest/charts/plugin-mongodb-explorer \
   --version 0.1.14 \
   -n everest-system --install
```

## Uninstall

```bash
helm uninstall mongo-explorer -n everest-system
```

## Architecture

```
plugin-mongodb-explorer/
├── src/
│   └── main.tsx              # Frontend — TypeScript/React plugin bundle
├── backend/
│   ├── main.go               # Backend — Go HTTP server
│   └── go.mod
├── charts/
│   └── plugin-mongodb-explorer/  # Helm chart
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
│           ├── _helpers.tpl
│           ├── deployment.yaml
│           ├── plugin-cr.yaml
│           └── service.yaml
├── Dockerfile
├── package.json
├── tsconfig.json
└── vite.config.ts
```

**Request flow:**

```
Browser → GET /v1/clusters/{cluster}/plugins/{name}/api/instances
         ↓ (host validates session, adds X-Everest-User JWT)
Backend → GET /v1/clusters
          GET /v1/clusters/{cluster}/namespaces
          GET /v1/clusters/{cluster}/namespaces/{namespace}/instances
         ↓ (selected PSMDB instance)
Backend → GET /v1/clusters/{cluster}/namespaces/{namespace}/instances/{name}/connection
         ↓ (short-lived credentials)
MongoDB → list databases / run query
         ↓
Browser ← JSON results
```

The backend also serves the frontend bundle at `GET /main.js`, which the OpenEverest
shell fetches at startup to dynamically load the plugin UI.

The sidebar lists only OpenEverest instances whose provider is
`percona-server-mongodb`. Users can select an instance from the selector to
navigate to its existing MongoDB Explorer tab. External MongoDB endpoints are
not supported yet.

## Prerequisites

- An OpenEverest cluster with the Plugin CRD installed (Everest v2+)
- Node.js 20+, Go 1.25+, Docker, Helm 3

## Local Development

### Build the frontend bundle

The `@openeverest/plugin-sdk` package is installed from npm (see `package.json`).

```bash
npm install
npm run build        # outputs dist/main.js
```

### Run the backend locally

```bash
# Generate go.sum and download dependencies
cd backend && go mod tidy

# Set the Everest API URL (defaults to the in-cluster address)
export EVEREST_API_URL=http://localhost:8080

# The backend expects dist/main.js to exist (built above)
go run . 
# Listening on :8080
```

### Dev server (frontend hot-reload)

```bash
npm run dev          # Vite dev server on http://localhost:3001
```

Point the Everest dev environment to `http://localhost:3001/main.js` for
hot-reload during development.

## Build Docker Image

The frontend must be pre-built before building the Docker image:

```bash
npm run build                                   # produces dist/main.js
cd backend && go mod tidy && cd ..              # generates go.sum
docker build -t plugin-mongodb-explorer:dev .
```

## Configuration (`values.yaml`)

| Key | Description | Default |
|-----|-------------|---------|
| `image.repository` | Container image | `ghcr.io/openeverest/plugin-mongodb-explorer` |
| `image.tag` | Image tag | chart `appVersion` |
| `replicaCount` | Replicas | `1` |
| `service.port` | Service port | `8080` |
| `plugin.displayName` | Display name in the UI | `MongoDB Explorer` |
| `plugin.enabled` | Enable/disable the plugin | `true` |
| `everestAPIURL` | OpenEverest API server URL (in-cluster) | `http://everest-server.everest-system.svc.cluster.local:8080` |

## Backend API

The plugin backend exposes `GET /api/instances` for sidebar discovery. It returns
instance identity and provider metadata only; MongoDB credentials are never sent
to the browser. Discovery follows the OpenEverest cluster → namespace → instance
hierarchy and uses the forwarded user's JWT, so OpenEverest RBAC restrictions are
preserved.

When the user selects an instance, the backend calls the OpenEverest connection
endpoint to obtain short-lived credentials and uses them to query MongoDB:

```text
GET /v1/clusters/{cluster}/namespaces/{namespace}/instances/{name}/connection
```

The selected OpenEverest version must provide the v2 cluster/namespace/instance
API and connection endpoint.

## License

Apache-2.0

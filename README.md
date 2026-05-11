# OpenEverest MongoDB Explorer Plugin

A generic plugin for [OpenEverest](https://github.com/openeverest/openeverest) that adds a
**MongoDB Explorer** tab to PSMDB cluster detail pages, allowing users to:

- Browse databases and collections in the cluster
- Run `find` queries with filter, projection, limit, and sort
- View results as a table or raw JSON

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
Browser → GET /v1/plugins/mongo-explorer/api/databases
         ↓ (host validates session, adds X-Everest-User JWT)
Backend → GET /v1/namespaces/{ns}/database-clusters/{name}/connection-details
         ↓ (uses credentials)
MongoDB → list databases / run query
         ↓
Browser ← JSON results
```

The backend also serves the frontend bundle at `GET /main.js`, which the OpenEverest
shell fetches at startup to dynamically load the plugin UI.

## Prerequisites

- An OpenEverest cluster with the Plugin CRD installed (Everest v2+)
- The OpenEverest monorepo checked out at `../openeverest` (for the local SDK reference)
- Node.js 20+, Go 1.22+, Docker, Helm 3

## Local Development

### Build the frontend bundle

The `@openeverest/plugin-sdk` package is referenced as a local file path from
the OpenEverest monorepo. Ensure `../openeverest/ui/packages/plugin-sdk` exists,
then:

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

## Install with Helm

```bash
helm install mongo-explorer charts/plugin-mongodb-explorer/ \
  -n everest-system \
  --set image.repository=<your-registry>/plugin-mongodb-explorer \
  --set image.tag=<tag>
```

## Uninstall

```bash
helm uninstall mongo-explorer -n everest-system
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

## Known Prerequisite

The backend relies on `GET /v1/namespaces/{ns}/database-clusters/{name}/connection-details`
to fetch short-lived MongoDB credentials. This endpoint must be implemented in the
OpenEverest core before the plugin can connect to real clusters. During local
development, you can mock it to return a static connection string.

## License

Apache-2.0

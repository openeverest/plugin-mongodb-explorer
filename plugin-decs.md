What to give to an engineer
They need a new repo (yes, separate from this one — call it plugin-mongo-explorer or similar). The inputs:

1. Plugin manifest sketch

2. Backend contract — the backend receives proxied requests from /v1/plugins/mongo-explorer/*. It must:

Read X-Everest-User JWT (contains sub, namespaces, pluginName)
Use that JWT as Authorization: Bearer when calling GET /v1/namespaces/{ns}/database-clusters/{name}/connection-details to fetch MongoDB credentials
Connect to MongoDB using those credentials, run the query, return results
Credentials have a 15-min TTL so don't cache them
3. Frontend contract — a TypeScript component that:

Gets { cluster, namespace } as props (from the clusterDetailTab extension point)
Calls POST /v1/plugins/mongo-explorer/query (via useEverestApi() from the SDK) with { clusterId, query }
Renders results in a table / JSON viewer
4. Repo structure to tell them to create:

The one thing that isn't implemented yet
GET /v1/namespaces/{ns}/database-clusters/{name}/connection-details — the credential broker endpoint. The design references it throughout but checking the codebase it's likely not fully wired. That's a prerequisite in the OpenEverest core before the plugin backend can actually get DB credentials. Worth flagging to the engineer up front so they can mock it locally while waiting.

Summary for the engineer brief
Build a plugin with a Go backend + TypeScript frontend tab. The tab appears only on MongoDB clusters (providers: ["psmdb"]). The frontend sends queries to the backend via the plugin proxy. The backend fetches MongoDB credentials from OpenEverest's credential broker endpoint using the forwarded user JWT, executes the query, and returns results. Distribute via Helm chart, same pattern as plugin-hello.
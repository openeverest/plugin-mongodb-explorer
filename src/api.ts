import type { PluginApi } from '@openeverest/plugin-sdk';

// The host provides fetch (cluster-scoped, auth-attached) and the CSP nonce at
// register() time; both are captured here so the rest of the plugin stays
// framework-agnostic.
let pluginFetch: PluginApi['fetch'];
let cssNonce = '';

export function configurePlugin(api: PluginApi): void {
  pluginFetch = api.fetch.bind(api);
  cssNonce = api.cssNonce;
}

export function getCssNonce(): string {
  return cssNonce;
}

// Unwraps the backend's nested error envelopes (`{"error":"…"}` possibly
// wrapping a downstream `{"message":"…"}`) into a single human-readable
// sentence, so the UI never shows raw JSON.
function extractErrorMessage(raw: string): string {
  let msg = (raw ?? '').trim();
  if (!msg) return '';

  const unwrap = (s: string): string => {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === 'object') {
        const inner =
          (parsed as Record<string, unknown>).message ??
          (parsed as Record<string, unknown>).error;
        if (typeof inner === 'string') return inner.trim();
      }
    } catch {
      // Not JSON — fall through.
    }
    return s;
  };

  for (let i = 0; i < 3; i++) {
    const next = unwrap(msg);
    if (next === msg) break;
    msg = next;
  }
  const embedded = msg.match(/\{[^{}]*"message"\s*:\s*"([^"]+)"[^{}]*\}/);
  if (embedded) return embedded[1].trim();

  return msg;
}

// Uses the host proxy so the backend receives a valid session and the
// X-Everest-User JWT.
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await pluginFetch(`/api${path}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(extractErrorMessage(text) || `HTTP ${res.status}`);
  }
  return res.json();
}

export interface MongoInstanceTarget {
  k8sCluster: string;
  namespace: string;
  name: string;
  provider: string;
}

export interface OverviewMember {
  name: string;
  stateStr: string;
  health: number;
  uptimeSeconds: number;
  lagSeconds: number;
}

export interface ClusterOverview {
  sharded: boolean;
  version?: string;
  replicaSet?: { set: string; members: OverviewMember[] };
  connections?: { current?: number; available?: number };
  opcounters?: Record<string, number>;
  shards?: unknown[];
  balancer?: { mode?: string; inBalancerRound?: boolean };
}

export function instanceKey(instance: MongoInstanceTarget): string {
  return `${instance.k8sCluster}/${instance.namespace}/${instance.name}`;
}

export async function fetchMongoInstances(): Promise<MongoInstanceTarget[]> {
  const data = await apiFetch('/instances');
  return Array.isArray(data.instances) ? data.instances : [];
}

export async function fetchDatabases(
  k8sCluster: string,
  instance: string,
  namespace: string
): Promise<string[]> {
  const data = await apiFetch(
    `/databases?k8sCluster=${encodeURIComponent(k8sCluster)}&cluster=${encodeURIComponent(instance)}&namespace=${encodeURIComponent(namespace)}`
  );
  return data.databases ?? [];
}

export async function fetchCollections(
  k8sCluster: string,
  instance: string,
  namespace: string,
  db: string
): Promise<string[]> {
  const data = await apiFetch(
    `/databases/${encodeURIComponent(db)}/collections?k8sCluster=${encodeURIComponent(k8sCluster)}&cluster=${encodeURIComponent(instance)}&namespace=${encodeURIComponent(namespace)}`
  );
  return data.collections ?? [];
}

export async function runQuery(
  k8sCluster: string,
  cluster: string,
  namespace: string,
  db: string,
  collection: string,
  filterStr: string,
  projectionStr: string,
  limit: number
): Promise<Record<string, unknown>[]> {
  let filter: unknown;
  try {
    filter = JSON.parse(filterStr || '{}');
  } catch {
    throw new Error('Filter is not valid JSON.');
  }

  let projection: unknown = undefined;
  if (projectionStr.trim()) {
    try {
      projection = JSON.parse(projectionStr);
    } catch {
      throw new Error('Projection is not valid JSON.');
    }
  }

  const data = await apiFetch('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      k8sCluster,
      cluster,
      namespace,
      db,
      collection,
      filter,
      projection,
      limit,
    }),
  });
  return data.documents ?? [];
}

export async function fetchOverview(
  k8sCluster: string,
  cluster: string,
  namespace: string
): Promise<ClusterOverview> {
  return apiFetch(
    `/overview?k8sCluster=${encodeURIComponent(k8sCluster)}&cluster=${encodeURIComponent(cluster)}&namespace=${encodeURIComponent(namespace)}`
  );
}

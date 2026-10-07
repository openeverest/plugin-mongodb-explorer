import { extractErrorMessage } from 'utils/error-message';
import { pluginFetch } from './plugin-runtime';
import type { ClusterOverview, MongoDocument, MongoInstanceTarget } from './explorer.types';

// Goes through api.fetch() so the host proxy attaches the session and forwards
// the X-Everest-User JWT to the backend.
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await pluginFetch(`/api${path}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(extractErrorMessage(text) || `HTTP ${res.status}`);
  }
  return res.json();
}

function targetQuery(k8sCluster: string, cluster: string, namespace: string): string {
  return `k8sCluster=${encodeURIComponent(k8sCluster)}&cluster=${encodeURIComponent(cluster)}&namespace=${encodeURIComponent(namespace)}`;
}

export function instanceKey(instance: MongoInstanceTarget): string {
  return `${instance.k8sCluster}/${instance.namespace}/${instance.name}`;
}

export async function fetchMongoInstances(): Promise<MongoInstanceTarget[]> {
  const data = await apiFetch('/instances');
  return Array.isArray(data.instances) ? data.instances : [];
}

export async function fetchDatabases(k8sCluster: string, cluster: string, namespace: string): Promise<string[]> {
  const data = await apiFetch(`/databases?${targetQuery(k8sCluster, cluster, namespace)}`);
  return data.databases ?? [];
}

export async function fetchCollections(
  k8sCluster: string,
  cluster: string,
  namespace: string,
  db: string
): Promise<string[]> {
  const data = await apiFetch(
    `/databases/${encodeURIComponent(db)}/collections?${targetQuery(k8sCluster, cluster, namespace)}`
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
): Promise<MongoDocument[]> {
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
    body: JSON.stringify({ k8sCluster, cluster, namespace, db, collection, filter, projection, limit }),
  });
  return data.documents ?? [];
}

export async function fetchOverview(k8sCluster: string, cluster: string, namespace: string): Promise<ClusterOverview> {
  return apiFetch(`/overview?${targetQuery(k8sCluster, cluster, namespace)}`);
}

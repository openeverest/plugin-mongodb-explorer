import type { ClusterDetailTabProps } from '@openeverest/plugin-sdk';
import type { MongoInstanceTarget } from 'api/explorer.types';

const DEFAULT_K8S_CLUSTER = 'main';
const MONGODB_PROVIDER = 'percona-server-mongodb';
const SUPPORTED_PROVIDERS = ['psmdb', MONGODB_PROVIDER];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const stringField = (value: unknown, key: string): string | undefined => {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
};

// The Instance resource arrives untyped; read only the fields the explorer needs.
export function targetFromClusterDetailProps(props: ClusterDetailTabProps): MongoInstanceTarget {
  const spec = isRecord(props.cluster) ? props.cluster.spec : undefined;
  return {
    k8sCluster: stringField(props.cluster, 'clusterName') ?? stringField(spec, 'clusterName') ?? DEFAULT_K8S_CLUSTER,
    namespace: props.namespace,
    name: props.instanceName,
    provider: stringField(spec, 'provider') ?? MONGODB_PROVIDER,
  };
}

// Unknown provider means the host didn't tell us; the tab is already filtered by provider.
export function isSupportedInstance(cluster: unknown): boolean {
  const spec = isRecord(cluster) ? cluster.spec : undefined;
  const provider = stringField(spec, 'provider') ?? stringField(cluster, 'engine');
  return !provider || SUPPORTED_PROVIDERS.includes(provider);
}

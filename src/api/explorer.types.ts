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

export type MongoDocument = Record<string, unknown>;

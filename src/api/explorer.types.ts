export interface MongoInstanceTarget {
  k8sCluster: string;
  namespace: string;
  name: string;
  provider: string;
}

// Members read via replSetGetStatus carry lag/uptime; members of a sharded
// cluster are reported by mongos's replica-set monitor and carry ping instead.
// health is absent when mongos is not monitoring the host.
export interface OverviewMember {
  name: string;
  stateStr: string;
  health?: number;
  lagSeconds?: number;
  uptimeSeconds?: number;
  pingMs?: number;
}

export interface ReplicaSetSummary {
  set: string;
  members: OverviewMember[];
}

export interface ShardSummary extends ReplicaSetSummary {
  id: string;
  draining: boolean;
}

export interface RouterSummary {
  name: string;
  version: string;
  uptimeSeconds: number;
  lastPingSecondsAgo: number;
}

export interface ShardedTopology {
  shards: ShardSummary[];
  configServers?: ReplicaSetSummary;
  routers: RouterSummary[];
}

export interface ClusterOverview {
  sharded: boolean;
  version?: string;
  replicaSet?: ReplicaSetSummary;
  topology?: ShardedTopology;
  connections?: { current?: number; available?: number };
  opcounters?: Record<string, number>;
  balancer?: { mode?: string; inBalancerRound?: boolean };
}

export type MongoDocument = Record<string, unknown>;

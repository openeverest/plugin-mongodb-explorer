import type { ClusterOverview, OverviewMember, ReplicaSetSummary } from 'api/explorer.types';
import { Messages } from './cluster-overview.messages';

const PRIMARY = 'PRIMARY';
const PENDING_ERROR = /not yet available/i;
const OPCOUNTER_KEYS = ['insert', 'query', 'update', 'delete'];
const SECONDS_PER_HOUR = 3600;

export type MemberHealth = 'up' | 'down' | 'unknown';

export const isPrimary = (stateStr: string) => stateStr === PRIMARY;

// The backend reports missing connection details while the instance is still provisioning.
export const isPendingError = (error: string) => PENDING_ERROR.test(error);

export function memberHealth(member: OverviewMember): MemberHealth {
  if (member.health === undefined) return 'unknown';
  return member.health === 1 ? 'up' : 'down';
}

// Lag/uptime come from replSetGetStatus; sharded members only carry mongos ping times.
export const hasReplicationStats = (members: OverviewMember[]) =>
  members.some((member) => member.lagSeconds !== undefined);

export const formatUptime = (seconds: number) => `${Math.floor(seconds / SECONDS_PER_HOUR)}h`;

function replicaSetsOf(overview: ClusterOverview): ReplicaSetSummary[] {
  if (overview.topology) {
    const { shards, configServers } = overview.topology;
    return configServers ? [...shards, configServers] : shards;
  }
  return overview.replicaSet ? [overview.replicaSet] : [];
}

const isReplicaSetHealthy = (rs: ReplicaSetSummary) =>
  rs.members.some((m) => isPrimary(m.stateStr)) && rs.members.every((m) => memberHealth(m) !== 'down');

export function isHealthy(overview: ClusterOverview): boolean {
  return replicaSetsOf(overview).every(isReplicaSetHealthy);
}

export function overviewSummary(overview: ClusterOverview): string {
  if (overview.topology) {
    const { shards, routers } = overview.topology;
    return [Messages.sharded, Messages.shards(shards.length), Messages.routers(routers.length)].join(' · ');
  }

  const rs = overview.replicaSet;
  if (!rs) return overview.sharded ? Messages.sharded : Messages.standalone;

  const primary = rs.members.find((m) => isPrimary(m.stateStr));
  const maxLag = Math.max(0, ...rs.members.map((m) => m.lagSeconds ?? 0));
  return `${rs.set} · ${primary?.stateStr ?? Messages.noPrimary} · ${rs.members.length} members · lag ${maxLag.toFixed(1)}s`;
}

export function opcountersSummary(opcounters: Record<string, number>): string {
  return OPCOUNTER_KEYS.map((key) => `${key[0]}${opcounters[key] ?? 0}`).join(' ');
}

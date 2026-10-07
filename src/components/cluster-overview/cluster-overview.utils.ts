import type { ClusterOverview } from 'api/explorer.types';
import { Messages } from './cluster-overview.messages';

const PRIMARY = 'PRIMARY';
const PENDING_ERROR = /not yet available/i;
const OPCOUNTER_KEYS = ['insert', 'query', 'update', 'delete'];

export const isPrimary = (stateStr: string) => stateStr === PRIMARY;

// The backend reports missing connection details while the instance is still provisioning.
export const isPendingError = (error: string) => PENDING_ERROR.test(error);

export function isHealthy(overview: ClusterOverview): boolean {
  return overview.replicaSet ? overview.replicaSet.members.every((m) => m.health === 1) : true;
}

export function overviewSummary(overview: ClusterOverview): string {
  const rs = overview.replicaSet;
  if (!rs) return overview.sharded ? Messages.sharded : Messages.standalone;

  const primary = rs.members.find((m) => isPrimary(m.stateStr));
  const maxLag = Math.max(0, ...rs.members.map((m) => m.lagSeconds));
  return `${rs.set} · ${primary?.stateStr ?? Messages.noPrimary} · ${rs.members.length} members · lag ${maxLag.toFixed(1)}s`;
}

export function opcountersSummary(opcounters: Record<string, number>): string {
  return OPCOUNTER_KEYS.map((key) => `${key[0]}${opcounters[key] ?? 0}`).join(' ');
}

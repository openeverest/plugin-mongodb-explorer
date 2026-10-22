import { Chip, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import type { OverviewMember } from 'api/explorer.types';
import { MONOSPACE_SX } from 'components/surface.constants';
import { Messages } from '../cluster-overview.messages';
import { formatUptime, hasReplicationStats, isPrimary, memberHealth } from '../cluster-overview.utils';

const HEALTH_COLOR = { up: 'success', down: 'error', unknown: 'default' } as const;
const NO_VALUE = '—';

interface MemberTableProps {
  members: OverviewMember[];
}

export const MemberTable = ({ members }: MemberTableProps) => {
  const replication = hasReplicationStats(members);
  const columns = replication ? Messages.replicaSetColumns : Messages.monitoredColumns;

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          {columns.map((column) => (
            <TableCell key={column}>{column}</TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {members.map((member) => {
          const primary = isPrimary(member.stateStr);
          const health = memberHealth(member);
          return (
            <TableRow key={member.name}>
              <TableCell sx={MONOSPACE_SX}>{member.name}</TableCell>
              <TableCell sx={{ fontWeight: primary ? 700 : 400 }}>{member.stateStr}</TableCell>
              <TableCell>
                <Chip size="small" variant="outlined" color={HEALTH_COLOR[health]} label={Messages[health]} />
              </TableCell>
              {replication ? (
                <>
                  <TableCell>
                    {primary || member.lagSeconds === undefined ? NO_VALUE : `${member.lagSeconds.toFixed(1)}s`}
                  </TableCell>
                  <TableCell>
                    {member.uptimeSeconds === undefined ? NO_VALUE : formatUptime(member.uptimeSeconds)}
                  </TableCell>
                </>
              ) : (
                <TableCell>{member.pingMs === undefined ? NO_VALUE : `${member.pingMs.toFixed(1)}ms`}</TableCell>
              )}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

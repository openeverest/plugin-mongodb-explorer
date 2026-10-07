import { Chip, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import type { OverviewMember } from 'api/explorer.types';
import { MONOSPACE_SX } from 'components/surface.constants';
import { Messages } from '../cluster-overview.messages';
import { isPrimary } from '../cluster-overview.utils';

const SECONDS_PER_HOUR = 3600;

interface MemberTableProps {
  members: OverviewMember[];
}

export const MemberTable = ({ members }: MemberTableProps) => (
  <Table size="small">
    <TableHead>
      <TableRow>
        {Messages.columns.map((column) => (
          <TableCell key={column}>{column}</TableCell>
        ))}
      </TableRow>
    </TableHead>
    <TableBody>
      {members.map((member) => {
        const primary = isPrimary(member.stateStr);
        const up = member.health === 1;
        return (
          <TableRow key={member.name}>
            <TableCell sx={MONOSPACE_SX}>{member.name}</TableCell>
            <TableCell sx={{ fontWeight: primary ? 700 : 400 }}>{member.stateStr}</TableCell>
            <TableCell>
              <Chip
                size="small"
                variant="outlined"
                color={up ? 'success' : 'error'}
                label={up ? Messages.up : Messages.down}
              />
            </TableCell>
            <TableCell>{primary ? '—' : `${member.lagSeconds.toFixed(1)}s`}</TableCell>
            <TableCell>{`${Math.floor(member.uptimeSeconds / SECONDS_PER_HOUR)}h`}</TableCell>
          </TableRow>
        );
      })}
    </TableBody>
  </Table>
);

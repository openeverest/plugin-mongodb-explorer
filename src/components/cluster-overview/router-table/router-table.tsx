import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import type { RouterSummary } from 'api/explorer.types';
import { MONOSPACE_SX } from 'components/surface.constants';
import { Messages } from '../cluster-overview.messages';
import { formatUptime } from '../cluster-overview.utils';

interface RouterTableProps {
  routers: RouterSummary[];
}

export const RouterTable = ({ routers }: RouterTableProps) => (
  <Table size="small">
    <TableHead>
      <TableRow>
        {Messages.routerColumns.map((column) => (
          <TableCell key={column}>{column}</TableCell>
        ))}
      </TableRow>
    </TableHead>
    <TableBody>
      {routers.map((router) => (
        <TableRow key={router.name}>
          <TableCell sx={MONOSPACE_SX}>{router.name}</TableCell>
          <TableCell>{router.version}</TableCell>
          <TableCell>{formatUptime(router.uptimeSeconds)}</TableCell>
          <TableCell>{Messages.secondsAgo(router.lastPingSecondsAgo)}</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

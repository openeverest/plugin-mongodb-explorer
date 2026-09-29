import { useEffect, useState } from 'react';
import { Alert, Box, ButtonBase, Chip, Collapse, Paper, Stack, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { fetchOverview } from 'api/explorer';
import type { ClusterOverview as ClusterOverviewData } from 'api/explorer.types';
import { errorText } from 'utils/error-message';
import { Messages } from './cluster-overview.messages';
import { isHealthy, isPendingError, opcountersSummary, overviewSummary } from './cluster-overview.utils';
import { MemberTable } from './member-table/member-table';

interface ClusterOverviewProps {
  k8sCluster: string;
  cluster: string;
  namespace: string;
}

export const ClusterOverview = ({ k8sCluster, cluster, namespace }: ClusterOverviewProps) => {
  const [data, setData] = useState<ClusterOverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    fetchOverview(k8sCluster, cluster, namespace)
      .then((overview) => active && setData(overview))
      .catch((e: unknown) => active && setError(errorText(e)));
    return () => {
      active = false;
    };
  }, [k8sCluster, cluster, namespace]);

  if (error) {
    return isPendingError(error) ? (
      <Alert severity="info">{Messages.pending}</Alert>
    ) : (
      <Alert severity="warning">{Messages.unavailable(error)}</Alert>
    );
  }
  if (!data) {
    return (
      <Typography variant="body2" color="text.secondary">
        {Messages.loading}
      </Typography>
    );
  }

  const healthy = isHealthy(data);
  const connections = data.connections?.current;

  return (
    <Paper variant="outlined">
      <ButtonBase
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        sx={{ width: '100%', justifyContent: 'flex-start', gap: 1, px: 1.5, py: 1, textAlign: 'left' }}
      >
        <Chip size="small" color={healthy ? 'success' : 'warning'} label={healthy ? Messages.healthy : Messages.degraded} />
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {overviewSummary(data)}
        </Typography>
        {typeof connections === 'number' && (
          <Typography variant="body2" color="text.secondary">
            · {Messages.connections(connections)}
          </Typography>
        )}
        {data.sharded && (
          <Typography variant="body2" color="text.secondary">
            · {Messages.shards(data.shards?.length ?? 0)}
          </Typography>
        )}
        <Box sx={{ ml: 'auto', display: 'flex', color: 'text.secondary' }}>
          {open ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
        </Box>
      </ButtonBase>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ borderTop: 1, borderColor: 'divider', px: 1, pb: 1 }}>
          {data.replicaSet ? (
            <MemberTable members={data.replicaSet.members} />
          ) : (
            <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
              {Messages.noReplicaSet}
            </Typography>
          )}
          {(data.version || data.opcounters) && (
            <Stack direction="row" spacing={2} sx={{ px: 1, pt: 1, flexWrap: 'wrap' }}>
              {data.version && (
                <Typography variant="caption" color="text.secondary">
                  {Messages.version(data.version)}
                </Typography>
              )}
              {data.opcounters && (
                <Typography variant="caption" color="text.secondary">
                  {Messages.opcounters(opcountersSummary(data.opcounters))}
                </Typography>
              )}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

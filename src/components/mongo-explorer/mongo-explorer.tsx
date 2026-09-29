import { useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import type { MongoInstanceTarget } from 'api/explorer.types';
import { DatabaseTree, type CollectionRef } from 'components/database-tree/database-tree';
import { QueryPanel } from 'components/query-panel/query-panel';
import { ClusterOverview } from 'components/cluster-overview/cluster-overview';
import { Messages } from './mongo-explorer.messages';

const SECTION_TITLE_SX = { color: 'text.secondary', display: 'block', mb: 1 };

interface MongoExplorerProps {
  target: MongoInstanceTarget;
}

export const MongoExplorer = ({ target }: MongoExplorerProps) => {
  const [selected, setSelected] = useState<CollectionRef | null>(null);
  const instance = { k8sCluster: target.k8sCluster, cluster: target.name, namespace: target.namespace };

  return (
    <Box sx={{ display: 'flex', minHeight: 520 }}>
      <Box sx={{ width: 240, flexShrink: 0, borderRight: 1, borderColor: 'divider', p: 2, pl: 1, overflowY: 'auto' }}>
        <Typography variant="overline" sx={{ ...SECTION_TITLE_SX, pl: 1 }}>
          {Messages.databases}
        </Typography>
        <DatabaseTree {...instance} selected={selected} onSelectCollection={setSelected} />
      </Box>
      <Stack spacing={2} sx={{ flex: 1, minWidth: 0, p: 2, overflowY: 'auto' }}>
        <ClusterOverview {...instance} />
        <Box>
          <Typography variant="overline" sx={SECTION_TITLE_SX}>
            {Messages.query}
          </Typography>
          <QueryPanel
            {...instance}
            initialDb={selected?.db ?? null}
            initialCollection={selected?.collection ?? null}
          />
        </Box>
      </Stack>
    </Box>
  );
};

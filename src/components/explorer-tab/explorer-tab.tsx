import { Typography } from '@mui/material';
import type { ClusterDetailTabProps } from '@openeverest/plugin-sdk';
import { instanceKey } from 'api/explorer';
import { PluginRoot } from 'components/plugin-root/plugin-root';
import { MongoExplorer } from 'components/mongo-explorer/mongo-explorer';
import { Messages } from './explorer-tab.messages';
import { isSupportedInstance, targetFromClusterDetailProps } from './explorer-tab.utils';

export const ExplorerTab = (props: ClusterDetailTabProps) => {
  const target = targetFromClusterDetailProps(props);

  return (
    <PluginRoot>
      {isSupportedInstance(props.cluster) ? (
        <MongoExplorer key={instanceKey(target)} target={target} />
      ) : (
        <Typography color="text.secondary" sx={{ p: 4 }}>
          {Messages.unsupportedProvider}
        </Typography>
      )}
    </PluginRoot>
  );
};

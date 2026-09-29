import { Box, Typography } from '@mui/material';
import { PluginRoot } from 'components/plugin-root/plugin-root';
import { Messages } from './explorer-page.messages';
import { InstanceList } from './instance-list/instance-list';

export const ExplorerPage = () => (
  <PluginRoot>
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        {Messages.title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 900 }}>
        {Messages.description}
      </Typography>
      <InstanceList />
    </Box>
  </PluginRoot>
);

import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';

interface TopologySectionProps {
  title: string;
  badge?: ReactNode;
  emptyText: string;
  isEmpty: boolean;
  children?: ReactNode;
}

export const TopologySection = ({ title, badge, emptyText, isEmpty, children }: TopologySectionProps) => (
  <Box sx={{ pt: 1.5 }}>
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1, pb: 0.5 }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {badge}
    </Stack>
    {isEmpty ? (
      <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
        {emptyText}
      </Typography>
    ) : (
      children
    )}
  </Box>
);

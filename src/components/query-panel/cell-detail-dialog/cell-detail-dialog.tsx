import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { CODE_BLOCK_SX, MONOSPACE_SX } from 'components/surface.constants';
import { Messages } from '../query-panel.messages';
import { formatDetailValue } from '../query-panel.utils';

export interface CellDetail {
  column: string;
  value: unknown;
}

interface CellDetailDialogProps {
  detail: CellDetail | null;
  onClose: () => void;
}

export const CellDetailDialog = ({ detail, onClose }: CellDetailDialogProps) => (
  <Dialog open={detail !== null} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle sx={MONOSPACE_SX}>{detail?.column}</DialogTitle>
    <DialogContent>
      <Box component="pre" sx={{ ...CODE_BLOCK_SX, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {formatDetailValue(detail?.value)}
      </Box>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>{Messages.close}</Button>
    </DialogActions>
  </Dialog>
);

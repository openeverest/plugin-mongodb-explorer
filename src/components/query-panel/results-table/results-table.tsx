import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import type { MongoDocument } from 'api/explorer.types';
import { MONOSPACE_SX } from 'components/surface.constants';
import { Messages } from '../query-panel.messages';
import { formatCellValue, resultColumns } from '../query-panel.utils';
import type { CellDetail } from '../cell-detail-dialog/cell-detail-dialog';

const CELL_SX = {
  ...MONOSPACE_SX,
  maxWidth: 220,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
} as const;

interface ResultsTableProps {
  documents: MongoDocument[];
  onCellClick: (detail: CellDetail) => void;
}

export const ResultsTable = ({ documents, onCellClick }: ResultsTableProps) => {
  const columns = resultColumns(documents);

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column} sx={{ ...MONOSPACE_SX, whiteSpace: 'nowrap' }}>
                {column}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {documents.map((doc, i) => (
            <TableRow key={i} hover>
              {columns.map((column) => (
                <TableCell
                  key={column}
                  title={Messages.viewFullValue}
                  onClick={() => onCellClick({ column, value: doc[column] })}
                  sx={CELL_SX}
                >
                  {formatCellValue(doc[column])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { runQuery } from 'api/explorer';
import type { MongoDocument } from 'api/explorer.types';
import { errorText } from 'utils/error-message';
import { CODE_BLOCK_SX, MONOSPACE_SX } from 'components/surface.constants';
import { Messages } from './query-panel.messages';
import { CellDetailDialog, type CellDetail } from './cell-detail-dialog/cell-detail-dialog';
import { ResultsTable } from './results-table/results-table';

type ViewMode = 'table' | 'json';

const DEFAULT_LIMIT = 20;
const MONOSPACE_INPUT = { input: { sx: { ...MONOSPACE_SX, fontSize: '0.875rem' } } };

interface QueryPanelProps {
  k8sCluster: string;
  cluster: string;
  namespace: string;
  initialDb: string | null;
  initialCollection: string | null;
}

export const QueryPanel = ({ k8sCluster, cluster, namespace, initialDb, initialCollection }: QueryPanelProps) => {
  const [db, setDb] = useState(initialDb ?? '');
  const [collection, setCollection] = useState(initialCollection ?? '');
  const [filter, setFilter] = useState('{}');
  const [projection, setProjection] = useState('');
  const [limit, setLimit] = useState(String(DEFAULT_LIMIT));
  const [results, setResults] = useState<MongoDocument[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [cellDetail, setCellDetail] = useState<CellDetail | null>(null);

  // Picking a collection in the tree fills the query target.
  useEffect(() => {
    if (initialDb) setDb(initialDb);
  }, [initialDb]);
  useEffect(() => {
    if (initialCollection) setCollection(initialCollection);
  }, [initialCollection]);

  const handleRun = () => {
    if (!db.trim() || !collection.trim()) {
      setError(Messages.missingTarget);
      return;
    }
    setLoading(true);
    setError(null);
    runQuery(k8sCluster, cluster, namespace, db, collection, filter, projection, parseInt(limit, 10) || DEFAULT_LIMIT)
      .then(setResults)
      .catch((e: unknown) => {
        setError(errorText(e));
        setResults(null);
      })
      .finally(() => setLoading(false));
  };

  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <TextField
          label={Messages.database}
          size="small"
          value={db}
          placeholder="mydb"
          onChange={(e) => setDb(e.target.value)}
          slotProps={MONOSPACE_INPUT}
        />
        <TextField
          label={Messages.collection}
          size="small"
          value={collection}
          placeholder="users"
          onChange={(e) => setCollection(e.target.value)}
          slotProps={MONOSPACE_INPUT}
        />
      </Box>
      <TextField
        label={Messages.filter}
        size="small"
        multiline
        minRows={2}
        value={filter}
        placeholder='{ "status": "active" }'
        onChange={(e) => setFilter(e.target.value)}
        slotProps={MONOSPACE_INPUT}
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 96px auto', gap: 2, alignItems: 'center' }}>
        <TextField
          label={Messages.projection}
          size="small"
          value={projection}
          placeholder='{ "name": 1, "_id": 0 }'
          onChange={(e) => setProjection(e.target.value)}
          slotProps={MONOSPACE_INPUT}
        />
        <TextField
          label={Messages.limit}
          size="small"
          type="number"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          slotProps={{ htmlInput: { min: 1, max: 1000 } }}
        />
        <Button variant="contained" onClick={handleRun} disabled={loading}>
          {loading ? Messages.running : Messages.run}
        </Button>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {results !== null && (
        <Box>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {Messages.documentsReturned(results.length)}
            </Typography>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={viewMode}
              onChange={(_, mode: ViewMode | null) => mode && setViewMode(mode)}
            >
              <ToggleButton value="table">{Messages.table}</ToggleButton>
              <ToggleButton value="json">{Messages.json}</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          {viewMode === 'json' ? (
            <Box component="pre" sx={{ ...CODE_BLOCK_SX, maxHeight: 420 }}>
              {JSON.stringify(results, null, 2)}
            </Box>
          ) : results.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {Messages.noDocuments}
            </Typography>
          ) : (
            <ResultsTable documents={results} onCellClick={setCellDetail} />
          )}
        </Box>
      )}

      <CellDetailDialog detail={cellDetail} onClose={() => setCellDetail(null)} />
    </Stack>
  );
};

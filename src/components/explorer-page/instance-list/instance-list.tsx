import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { fetchMongoInstances, instanceKey } from 'api/explorer';
import type { MongoInstanceTarget } from 'api/explorer.types';
import { errorText } from 'utils/error-message';
import { Messages } from '../explorer-page.messages';

const MONGODB_PROVIDER = 'percona-server-mongodb';

function openInstance(instance: MongoInstanceTarget) {
  window.location.assign(
    `/databases/${encodeURIComponent(instance.namespace)}/${encodeURIComponent(instance.name)}/mongodb-explorer`
  );
}

export const InstanceList = () => {
  const [instances, setInstances] = useState<MongoInstanceTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInstances = () => {
    setLoading(true);
    setError(null);
    fetchMongoInstances()
      .then((found) =>
        setInstances(
          found
            .filter((instance) => instance.provider === MONGODB_PROVIDER)
            .sort((a, b) => instanceKey(a).localeCompare(instanceKey(b)))
        )
      )
      .catch((e: unknown) => setError(errorText(e)))
      .finally(() => setLoading(false));
  };

  useEffect(loadInstances, []);

  if (loading) {
    return <CircularProgress size={24} aria-label={Messages.loading} />;
  }
  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={loadInstances}>
            {Messages.retry}
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }
  if (instances.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {Messages.empty}
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined" sx={{ maxWidth: 900 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{Messages.columns.name}</TableCell>
            <TableCell>{Messages.columns.namespace}</TableCell>
            <TableCell>{Messages.columns.k8sCluster}</TableCell>
            <TableCell align="right">{Messages.columns.action}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {instances.map((instance) => (
            <TableRow key={instanceKey(instance)} hover onClick={() => openInstance(instance)} sx={{ cursor: 'pointer' }}>
              <TableCell sx={{ fontWeight: 600, color: 'primary.main' }}>{instance.name}</TableCell>
              <TableCell>{instance.namespace}</TableCell>
              <TableCell>{instance.k8sCluster}</TableCell>
              <TableCell align="right">
                <Button
                  size="small"
                  variant="contained"
                  onClick={(e) => {
                    e.stopPropagation();
                    openInstance(instance);
                  }}
                >
                  {Messages.explore}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

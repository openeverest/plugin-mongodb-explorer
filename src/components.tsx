import { useEffect, useMemo, useState } from 'react';
import type {
  ClusterDetailTabProps,
  PluginRouteProps,
} from '@openeverest/plugin-sdk';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Link,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@openeverest/ui-lib';
import {
  ClusterOverview,
  MongoInstanceTarget,
  fetchCollections,
  fetchDatabases,
  fetchMongoInstances,
  fetchOverview,
  instanceKey,
  runQuery,
} from './api';

const MONO = "'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// ---------------------------------------------------------------------------
// DatabaseTree — left-panel collection browser
// ---------------------------------------------------------------------------

interface DatabaseTreeProps {
  k8sCluster: string;
  cluster: string;
  namespace: string;
  onSelectCollection: (db: string, collection: string) => void;
}

const DatabaseTree = ({
  k8sCluster,
  cluster,
  namespace,
  onSelectCollection,
}: DatabaseTreeProps) => {
  const [databases, setDatabases] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collections, setCollections] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [colLoading, setColLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDatabases(k8sCluster, cluster, namespace)
      .then(setDatabases)
      .catch((e: unknown) => setError(errText(e)))
      .finally(() => setLoading(false));
  }, [k8sCluster, cluster, namespace]);

  const toggleDb = (db: string) => {
    const next = new Set(expanded);
    if (next.has(db)) {
      next.delete(db);
      setExpanded(next);
      return;
    }
    next.add(db);
    setExpanded(next);
    if (!collections[db]) {
      setColLoading((prev) => ({ ...prev, [db]: true }));
      fetchCollections(k8sCluster, cluster, namespace, db)
        .then((cols) => setCollections((prev) => ({ ...prev, [db]: cols })))
        .catch((e: unknown) => setError(errText(e)))
        .finally(() => setColLoading((prev) => ({ ...prev, [db]: false })));
    }
  };

  if (loading) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ p: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="text.secondary">
          Loading databases…
        </Typography>
      </Stack>
    );
  }
  if (error) {
    return (
      <Alert severity="error" sx={{ m: 1 }}>
        {error}
      </Alert>
    );
  }
  if (databases.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
        No databases found.
      </Typography>
    );
  }

  return (
    <List dense disablePadding>
      {databases.map((db) => {
        const isOpen = expanded.has(db);
        const cols = collections[db];
        return (
          <Box key={db}>
            <ListItemButton onClick={() => toggleDb(db)} sx={{ borderRadius: 1 }}>
              <Typography
                variant="body2"
                sx={{ fontFamily: MONO, fontWeight: 600 }}
              >
                {isOpen ? '▾' : '▸'} {db}
              </Typography>
            </ListItemButton>
            <Collapse in={isOpen} unmountOnExit>
              {colLoading[db] ? (
                <Box sx={{ pl: 4, py: 0.5 }}>
                  <CircularProgress size={14} />
                </Box>
              ) : (cols ?? []).length === 0 ? (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ pl: 4, py: 0.5, fontStyle: 'italic' }}
                >
                  (empty)
                </Typography>
              ) : (
                (cols ?? []).map((coll) => (
                  <ListItemButton
                    key={coll}
                    onClick={() => onSelectCollection(db, coll)}
                    sx={{ pl: 4, borderRadius: 1 }}
                  >
                    <ListItemText
                      primaryTypographyProps={{
                        variant: 'body2',
                        color: 'primary.main',
                        noWrap: true,
                        sx: { fontFamily: MONO },
                      }}
                      primary={`⊡ ${coll}`}
                    />
                  </ListItemButton>
                ))
              )}
            </Collapse>
          </Box>
        );
      })}
    </List>
  );
};

// ---------------------------------------------------------------------------
// QueryPanel — query editor + results viewer
// ---------------------------------------------------------------------------

interface QueryPanelProps {
  k8sCluster: string;
  cluster: string;
  namespace: string;
  initialDb: string | null;
  initialCollection: string | null;
}

const QueryPanel = ({
  k8sCluster,
  cluster,
  namespace,
  initialDb,
  initialCollection,
}: QueryPanelProps) => {
  const [db, setDb] = useState(initialDb ?? '');
  const [collection, setCollection] = useState(initialCollection ?? '');
  const [filter, setFilter] = useState('{}');
  const [projection, setProjection] = useState('');
  const [limit, setLimit] = useState('20');
  const [results, setResults] = useState<Record<string, unknown>[] | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'json'>('table');
  const [cellDetail, setCellDetail] = useState<{
    column: string;
    value: unknown;
  } | null>(null);

  useEffect(() => {
    if (initialDb) setDb(initialDb);
  }, [initialDb]);
  useEffect(() => {
    if (initialCollection) setCollection(initialCollection);
  }, [initialCollection]);

  const handleRun = () => {
    if (!db.trim() || !collection.trim()) {
      setError('Enter a database and collection name.');
      return;
    }
    setLoading(true);
    setError(null);
    runQuery(
      k8sCluster,
      cluster,
      namespace,
      db,
      collection,
      filter,
      projection,
      parseInt(limit, 10) || 20
    )
      .then((docs) => setResults(docs))
      .catch((e: unknown) => {
        setError(errText(e));
        setResults(null);
      })
      .finally(() => setLoading(false));
  };

  const columns = useMemo(
    () =>
      results && results.length > 0
        ? Array.from(
            new Set(results.flatMap((doc) => Object.keys(doc)))
          ).slice(0, 12)
        : [],
    [results]
  );

  return (
    <Box>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 1.5,
          mb: 1.5,
        }}
      >
        <TextField
          label="Database"
          size="small"
          fullWidth
          value={db}
          placeholder="mydb"
          onChange={(e) => setDb(e.target.value)}
        />
        <TextField
          label="Collection"
          size="small"
          fullWidth
          value={collection}
          placeholder="users"
          onChange={(e) => setCollection(e.target.value)}
        />
      </Box>
      <TextField
        label="Filter (JSON)"
        size="small"
        fullWidth
        multiline
        minRows={2}
        value={filter}
        placeholder='{ "status": "active" }'
        onChange={(e) => setFilter(e.target.value)}
        sx={{ mb: 1.5, '& textarea': { fontFamily: MONO } }}
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '1fr 100px auto',
          gap: 1.5,
          alignItems: 'flex-start',
          mb: 2,
        }}
      >
        <TextField
          label="Projection (optional)"
          size="small"
          fullWidth
          value={projection}
          placeholder='{ "name": 1, "_id": 0 }'
          onChange={(e) => setProjection(e.target.value)}
          sx={{ '& input': { fontFamily: MONO } }}
        />
        <TextField
          label="Limit"
          size="small"
          type="number"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          inputProps={{ min: 1, max: 1000 }}
        />
        <Button
          variant="contained"
          onClick={handleRun}
          disabled={loading}
          startIcon={
            loading ? <CircularProgress size={16} color="inherit" /> : undefined
          }
          sx={{ height: 40 }}
        >
          {loading ? 'Running…' : 'Run Query'}
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {error}
        </Alert>
      )}

      {results !== null && (
        <Box>
          <Stack
            direction="row"
            spacing={2}
            alignItems="center"
            sx={{ mb: 1 }}
          >
            <Typography variant="body2" color="text.secondary">
              {results.length} document(s) returned
            </Typography>
            <Tabs
              value={viewMode}
              onChange={(_e, v) => setViewMode(v)}
              sx={{ minHeight: 0 }}
            >
              <Tab
                value="table"
                label="Table"
                sx={{ minHeight: 0, py: 0.5 }}
              />
              <Tab value="json" label="JSON" sx={{ minHeight: 0, py: 0.5 }} />
            </Tabs>
          </Stack>

          {viewMode === 'json' ? (
            <Box
              component="pre"
              sx={{
                bgcolor: 'action.hover',
                p: 1.5,
                borderRadius: 1,
                fontSize: '0.8rem',
                fontFamily: MONO,
                maxHeight: 420,
                overflow: 'auto',
                m: 0,
              }}
            >
              {JSON.stringify(results, null, 2)}
            </Box>
          ) : results.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No documents found.
            </Typography>
          ) : (
            <TableContainer
              component={Paper}
              variant="outlined"
              sx={{ maxHeight: 420 }}
            >
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    {columns.map((col) => (
                      <TableCell key={col} sx={{ fontFamily: MONO }}>
                        {col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.map((doc, i) => (
                    <TableRow key={i} hover>
                      {columns.map((col) => (
                        <Tooltip key={col} title="Click to view full value">
                          <TableCell
                            onClick={() =>
                              setCellDetail({ column: col, value: doc[col] })
                            }
                            sx={{
                              fontFamily: MONO,
                              maxWidth: 220,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              cursor: 'pointer',
                            }}
                          >
                            {formatCellValue(doc[col])}
                          </TableCell>
                        </Tooltip>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      )}

      <Dialog
        open={cellDetail !== null}
        onClose={() => setCellDetail(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontFamily: MONO, fontSize: '0.9rem' }}>
          {cellDetail?.column}
        </DialogTitle>
        <DialogContent>
          <Box
            component="pre"
            sx={{
              bgcolor: 'action.hover',
              p: 1.5,
              borderRadius: 1,
              fontSize: '0.8rem',
              fontFamily: MONO,
              overflow: 'auto',
              m: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {cellDetail &&
            typeof cellDetail.value === 'object' &&
            cellDetail.value !== null
              ? JSON.stringify(cellDetail.value, null, 2)
              : formatCellValue(cellDetail?.value)}
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
};

// ---------------------------------------------------------------------------
// ClusterOverviewStrip — collapsible instance health summary
// ---------------------------------------------------------------------------

interface ClusterOverviewStripProps {
  k8sCluster: string;
  cluster: string;
  namespace: string;
}

const ClusterOverviewStrip = ({
  k8sCluster,
  cluster,
  namespace,
}: ClusterOverviewStripProps) => {
  const [data, setData] = useState<ClusterOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    fetchOverview(k8sCluster, cluster, namespace)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e: unknown) => {
        if (active) setError(errText(e));
      });
    return () => {
      active = false;
    };
  }, [k8sCluster, cluster, namespace]);

  if (error) {
    const pending = /connection details are not yet available|not yet available/i.test(
      error
    );
    return (
      <Alert severity={pending ? 'info' : 'warning'} sx={{ mb: 1.5 }}>
        {pending
          ? 'Cluster status will appear once the instance finishes provisioning.'
          : `Cluster status unavailable: ${error}`}
      </Alert>
    );
  }
  if (!data) {
    return (
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
        <CircularProgress size={14} />
        <Typography variant="body2" color="text.secondary">
          Loading cluster status…
        </Typography>
      </Stack>
    );
  }

  const rs = data.replicaSet;
  const primary = rs?.members.find((m) => m.stateStr === 'PRIMARY');
  const maxLag =
    rs && rs.members.length > 0
      ? Math.max(0, ...rs.members.map((m) => m.lagSeconds))
      : 0;
  const allHealthy = rs ? rs.members.every((m) => m.health === 1) : true;

  const summaryLine = rs
    ? `${rs.set} · ${primary?.stateStr ?? 'no primary'} · ${rs.members.length} members · lag ${maxLag.toFixed(1)}s`
    : data.sharded
    ? 'sharded cluster'
    : 'standalone';

  return (
    <Paper variant="outlined" sx={{ mb: 1.5 }}>
      <Stack
        direction="row"
        alignItems="center"
        spacing={1}
        sx={{ px: 1.5, py: 1, cursor: 'pointer' }}
        onClick={() => setOpen((v) => !v)}
      >
        <Chip
          size="small"
          color={allHealthy ? 'success' : 'warning'}
          label={summaryLine}
        />
        {typeof data.connections?.current === 'number' && (
          <Typography variant="caption" color="text.secondary">
            · {data.connections.current} conns
          </Typography>
        )}
        {data.sharded && (
          <Typography variant="caption" color="text.secondary">
            · {Array.isArray(data.shards) ? data.shards.length : 0} shards
          </Typography>
        )}
        <Box sx={{ ml: 'auto' }}>
          <IconButton size="small">
            <Typography variant="body2" color="text.secondary">
              {open ? '▾' : '▸'}
            </Typography>
          </IconButton>
        </Box>
      </Stack>
      <Collapse in={open} unmountOnExit>
        <Divider />
        <Box sx={{ p: 1 }}>
          {rs ? (
            <Table size="small">
              <TableHead>
                <TableRow>
                  {['Member', 'State', 'Health', 'Lag', 'Uptime'].map((h) => (
                    <TableCell key={h}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rs.members.map((m) => (
                  <TableRow key={m.name}>
                    <TableCell sx={{ fontFamily: MONO }}>{m.name}</TableCell>
                    <TableCell
                      sx={{
                        fontWeight: m.stateStr === 'PRIMARY' ? 700 : 400,
                      }}
                    >
                      {m.stateStr}
                    </TableCell>
                    <TableCell
                      sx={{
                        color:
                          m.health === 1 ? 'success.main' : 'error.main',
                      }}
                    >
                      {m.health === 1 ? 'up' : 'down'}
                    </TableCell>
                    <TableCell>
                      {m.stateStr === 'PRIMARY'
                        ? '—'
                        : `${m.lagSeconds.toFixed(1)}s`}
                    </TableCell>
                    <TableCell>{`${Math.floor(m.uptimeSeconds / 3600)}h`}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No replica set information available.
            </Typography>
          )}
          {(data.opcounters || data.version) && (
            <Stack
              direction="row"
              spacing={2}
              sx={{ mt: 1, flexWrap: 'wrap' }}
            >
              {data.version && (
                <Typography variant="caption" color="text.secondary">
                  MongoDB {data.version}
                </Typography>
              )}
              {data.opcounters && (
                <Typography variant="caption" color="text.secondary">
                  ops:{' '}
                  {['insert', 'query', 'update', 'delete']
                    .map((k) => `${k[0]}${data.opcounters?.[k] ?? 0}`)
                    .join(' ')}
                </Typography>
              )}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Paper>
  );
};

// ---------------------------------------------------------------------------
// MongoExplorer — reusable database/collection explorer
// ---------------------------------------------------------------------------

interface MongoExplorerProps {
  target: MongoInstanceTarget;
}

const MongoExplorer = ({ target }: MongoExplorerProps) => {
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(
    null
  );

  return (
    <Box sx={{ display: 'flex', height: '100%', minHeight: 520 }}>
      <Paper
        variant="outlined"
        square
        sx={{
          width: 240,
          flexShrink: 0,
          overflowY: 'auto',
          borderTop: 0,
          borderBottom: 0,
          borderLeft: 0,
          bgcolor: 'action.hover',
        }}
      >
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ display: 'block', px: 1.5, pt: 1.5 }}
        >
          Databases
        </Typography>
        <DatabaseTree
          k8sCluster={target.k8sCluster}
          cluster={target.name}
          namespace={target.namespace}
          onSelectCollection={(db, coll) => {
            setSelectedDb(db);
            setSelectedCollection(coll);
          }}
        />
      </Paper>
      <Box sx={{ flex: 1, p: 2, overflowY: 'auto' }}>
        <ClusterOverviewStrip
          k8sCluster={target.k8sCluster}
          cluster={target.name}
          namespace={target.namespace}
        />
        <Typography variant="overline" color="text.secondary" sx={{ mb: 1 }}>
          Query
        </Typography>
        <QueryPanel
          k8sCluster={target.k8sCluster}
          cluster={target.name}
          namespace={target.namespace}
          initialDb={selectedDb}
          initialCollection={selectedCollection}
        />
      </Box>
    </Box>
  );
};

function targetFromClusterDetailProps(
  props: ClusterDetailTabProps
): MongoInstanceTarget {
  const clusterObj = props.cluster as {
    engine?: string;
    clusterName?: string;
    spec?: { provider?: string; clusterName?: string };
    [k: string]: unknown;
  };
  return {
    k8sCluster: clusterObj.clusterName ?? clusterObj.spec?.clusterName ?? 'main',
    namespace: props.namespace,
    name: props.instanceName,
    provider: clusterObj.spec?.provider ?? 'percona-server-mongodb',
  };
}

// ---------------------------------------------------------------------------
// MongoExplorerTab — clusterDetailTab entry point
// ---------------------------------------------------------------------------

export const MongoExplorerTab = (props: ClusterDetailTabProps) => {
  const target = targetFromClusterDetailProps(props);
  const clusterObj = props.cluster as {
    engine?: string;
    spec?: { provider?: string };
    [k: string]: unknown;
  };
  const provider = clusterObj.spec?.provider ?? clusterObj.engine;
  if (provider && provider !== 'psmdb' && provider !== 'percona-server-mongodb') {
    return (
      <Alert severity="info" sx={{ m: 2 }}>
        MongoDB Explorer is only available for PSMDB (MongoDB) clusters.
      </Alert>
    );
  }
  return <MongoExplorer key={instanceKey(target)} target={target} />;
};

// ---------------------------------------------------------------------------
// MongoExplorerPage — standalone route page
// ---------------------------------------------------------------------------

export const MongoExplorerPage = (_props: PluginRouteProps) => {
  const [instances, setInstances] = useState<MongoInstanceTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInstances = () => {
    setLoading(true);
    setError(null);
    fetchMongoInstances()
      .then((found) => {
        const mongoInstances = found
          .filter((i) => i.provider === 'percona-server-mongodb')
          .sort((a, b) => instanceKey(a).localeCompare(instanceKey(b)));
        setInstances(mongoInstances);
      })
      .catch((e: unknown) => setError(errText(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInstances();
  }, []);

  const navigateToInstance = (instance: MongoInstanceTarget) => {
    window.location.assign(
      `/databases/${encodeURIComponent(instance.namespace)}/${encodeURIComponent(instance.name)}/mongodb-explorer`
    );
  };

  return (
    <Box sx={{ p: 3, height: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
      <Typography variant="h4" sx={{ mb: 1 }}>
        MongoDB Explorer
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 720 }}>
        Discover and query OpenEverest-managed MongoDB instances. Select an
        instance below to browse databases, view collections, and run find
        queries.
      </Typography>

      {loading ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={16} />
          <Typography variant="body2" color="text.secondary">
            Loading MongoDB instances…
          </Typography>
        </Stack>
      ) : error ? (
        <Stack spacing={1} alignItems="flex-start">
          <Alert severity="error">{error}</Alert>
          <Button variant="contained" onClick={loadInstances}>
            Retry
          </Button>
        </Stack>
      ) : instances.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No OpenEverest MongoDB instances are available. Deploy a MongoDB
          instance or ask your administrator for access.
        </Typography>
      ) : (
        <TableContainer component={Paper} variant="outlined" sx={{ maxWidth: 900 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Namespace</TableCell>
                <TableCell>K8s Cluster</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {instances.map((instance) => (
                <TableRow
                  key={instanceKey(instance)}
                  hover
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigateToInstance(instance)}
                >
                  <TableCell>
                    <Link
                      component="button"
                      underline="hover"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToInstance(instance);
                      }}
                    >
                      {instance.name}
                    </Link>
                  </TableCell>
                  <TableCell>{instance.namespace}</TableCell>
                  <TableCell>{instance.k8sCluster}</TableCell>
                  <TableCell align="right">
                    <Button
                      variant="contained"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateToInstance(instance);
                      }}
                    >
                      Explore
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

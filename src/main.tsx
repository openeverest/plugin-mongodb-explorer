import type {
  PluginRegisterFn,
  PluginApi,
  PluginRouteProps,
  ClusterDetailTabProps,
} from '@openeverest/plugin-sdk';

// React and fetch are provided by the host at runtime.
let React: PluginApi['React'];
let pluginFetch: PluginApi['fetch'];

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

// Uses api.fetch() so the host proxy receives a valid session, generates the
// X-Everest-User JWT, and forwards it to the backend.
async function apiFetch(path: string, opts?: RequestInit) {
  const res = await pluginFetch(`/api${path}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchDatabases(k8sCluster: string, instance: string, namespace: string): Promise<string[]> {
  const data = await apiFetch(
    `/databases?k8sCluster=${encodeURIComponent(k8sCluster)}&cluster=${encodeURIComponent(instance)}&namespace=${encodeURIComponent(namespace)}`
  );
  return data.databases ?? [];
}

async function fetchCollections(k8sCluster: string, instance: string, namespace: string, db: string): Promise<string[]> {
  const data = await apiFetch(
    `/databases/${encodeURIComponent(db)}/collections?k8sCluster=${encodeURIComponent(k8sCluster)}&cluster=${encodeURIComponent(instance)}&namespace=${encodeURIComponent(namespace)}`
  );
  return data.collections ?? [];
}

async function runQuery(
  k8sCluster: string,
  cluster: string,
  namespace: string,
  db: string,
  collection: string,
  filterStr: string,
  projectionStr: string,
  limit: number
): Promise<Record<string, unknown>[]> {
  let filter: unknown;
  try {
    filter = JSON.parse(filterStr || '{}');
  } catch {
    throw new Error('Filter is not valid JSON.');
  }

  let projection: unknown = undefined;
  if (projectionStr.trim()) {
    try {
      projection = JSON.parse(projectionStr);
    } catch {
      throw new Error('Projection is not valid JSON.');
    }
  }

  const data = await apiFetch('/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ k8sCluster, cluster, namespace, db, collection, filter, projection, limit }),
  });
  return data.documents ?? [];
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  panel: { padding: '1rem' } as React.CSSProperties,
  label: { fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem', display: 'block' } as React.CSSProperties,
  input: {
    padding: '0.4rem 0.5rem',
    border: '1px solid #ccc',
    borderRadius: '4px',
    fontFamily: 'monospace',
    fontSize: '0.875rem',
    width: '100%',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  btn: (primary: boolean, disabled?: boolean): React.CSSProperties => ({
    padding: '0.4rem 1rem',
    background: disabled ? '#ccc' : primary ? '#1565c0' : '#e3e8f0',
    color: disabled ? '#888' : primary ? '#fff' : '#333',
    border: 'none',
    borderRadius: '4px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight: 'bold',
    fontSize: '0.875rem',
  }),
  treeItem: (depth: number, clickable: boolean): React.CSSProperties => ({
    padding: `0.2rem 0.25rem 0.2rem ${0.5 + depth * 1}rem`,
    cursor: clickable ? 'pointer' : 'default',
    fontSize: '0.875rem',
    fontFamily: 'monospace',
    borderRadius: '3px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
  error: { color: '#c62828', fontSize: '0.875rem', margin: '0.5rem 0' } as React.CSSProperties,
  muted: { color: '#888', fontSize: '0.875rem', fontStyle: 'italic' } as React.CSSProperties,
};

// ---------------------------------------------------------------------------
// DatabaseTree — left-panel collection browser
// ---------------------------------------------------------------------------

interface DatabaseTreeProps {
  k8sCluster: string;
  cluster: string;
  namespace: string;
  onSelectCollection: (db: string, collection: string) => void;
}

const DatabaseTree = ({ k8sCluster, cluster, namespace, onSelectCollection }: DatabaseTreeProps) => {
  const [databases, setDatabases] = React.useState<string[]>([]);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  const [collections, setCollections] = React.useState<Record<string, string[]>>({});
  const [loading, setLoading] = React.useState(true);
  const [colLoading, setColLoading] = React.useState<Record<string, boolean>>({});
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDatabases(k8sCluster, cluster, namespace)
      .then(setDatabases)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
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
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => setColLoading((prev) => ({ ...prev, [db]: false })));
    }
  };

  if (loading) {
    return React.createElement('p', { style: styles.muted }, 'Loading databases…');
  }
  if (error) {
    return React.createElement('p', { style: styles.error }, error);
  }
  if (databases.length === 0) {
    return React.createElement('p', { style: styles.muted }, 'No databases found.');
  }

  return React.createElement(
    'div',
    null,
    ...databases.map((db) => {
      const isOpen = expanded.has(db);
      const cols = collections[db];
      return React.createElement(
        'div',
        { key: db },
        React.createElement(
          'div',
          {
            style: { ...styles.treeItem(0, true), fontWeight: '600', color: '#333' },
            onClick: () => toggleDb(db),
          },
          `${isOpen ? '▾' : '▸'} ${db}`
        ),
        isOpen &&
          React.createElement(
            'div',
            null,
            colLoading[db]
              ? React.createElement('div', { style: styles.treeItem(1, false) }, '…')
              : (cols ?? []).length === 0
              ? React.createElement('div', { style: { ...styles.treeItem(1, false), ...styles.muted } }, '(empty)')
              : (cols ?? []).map((coll) =>
                  React.createElement(
                    'div',
                    {
                      key: coll,
                      style: { ...styles.treeItem(1, true), color: '#1565c0' },
                      onClick: () => onSelectCollection(db, coll),
                      title: coll,
                    },
                    `⊡ ${coll}`
                  )
                )
          )
      );
    })
  );
};

// ---------------------------------------------------------------------------
// QueryPanel — query editor + results viewer
// ---------------------------------------------------------------------------

function formatCellValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

interface QueryPanelProps {
  k8sCluster: string;
  cluster: string;
  namespace: string;
  initialDb: string | null;
  initialCollection: string | null;
}

const QueryPanel = ({ k8sCluster, cluster, namespace, initialDb, initialCollection }: QueryPanelProps) => {
  const [db, setDb] = React.useState(initialDb ?? '');
  const [collection, setCollection] = React.useState(initialCollection ?? '');
  const [filter, setFilter] = React.useState('{}');
  const [projection, setProjection] = React.useState('');
  const [limit, setLimit] = React.useState('20');
  const [results, setResults] = React.useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<'table' | 'json'>('table');

  // Sync selection from the tree.
  React.useEffect(() => { if (initialDb) setDb(initialDb); }, [initialDb]);
  React.useEffect(() => { if (initialCollection) setCollection(initialCollection); }, [initialCollection]);

  const handleRun = () => {
    if (!db.trim() || !collection.trim()) {
      setError('Enter a database and collection name.');
      return;
    }
    setLoading(true);
    setError(null);
    runQuery(k8sCluster, cluster, namespace, db, collection, filter, projection, parseInt(limit, 10) || 20)
      .then((docs) => {
        setResults(docs);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        setResults(null);
      })
      .finally(() => setLoading(false));
  };

  // Derive columns from first 12 distinct keys across results.
  const columns =
    results && results.length > 0
      ? Array.from(new Set(results.flatMap((doc) => Object.keys(doc)))).slice(0, 12)
      : [];

  return React.createElement(
    'div',
    null,
    // ── Inputs row 1: db + collection ──────────────────────────────────────
    React.createElement(
      'div',
      { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' } },
      React.createElement(
        'div',
        null,
        React.createElement('label', { style: styles.label }, 'Database'),
        React.createElement('input', {
          value: db,
          placeholder: 'mydb',
          style: styles.input,
          onChange: (e: { target: { value: string } }) => setDb(e.target.value),
        })
      ),
      React.createElement(
        'div',
        null,
        React.createElement('label', { style: styles.label }, 'Collection'),
        React.createElement('input', {
          value: collection,
          placeholder: 'users',
          style: styles.input,
          onChange: (e: { target: { value: string } }) => setCollection(e.target.value),
        })
      )
    ),
    // ── Filter ────────────────────────────────────────────────────────────
    React.createElement(
      'div',
      { style: { marginBottom: '0.75rem' } },
      React.createElement('label', { style: styles.label }, 'Filter (JSON)'),
      React.createElement('textarea', {
        value: filter,
        placeholder: '{ "status": "active" }',
        style: { ...styles.input, height: '64px', resize: 'vertical' },
        onChange: (e: { target: { value: string } }) => setFilter(e.target.value),
      })
    ),
    // ── Projection + Limit + Run ──────────────────────────────────────────
    React.createElement(
      'div',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr 80px auto',
          gap: '0.75rem',
          alignItems: 'end',
          marginBottom: '1rem',
        },
      },
      React.createElement(
        'div',
        null,
        React.createElement('label', { style: styles.label }, 'Projection (optional)'),
        React.createElement('input', {
          value: projection,
          placeholder: '{ "name": 1, "_id": 0 }',
          style: styles.input,
          onChange: (e: { target: { value: string } }) => setProjection(e.target.value),
        })
      ),
      React.createElement(
        'div',
        null,
        React.createElement('label', { style: styles.label }, 'Limit'),
        React.createElement('input', {
          value: limit,
          type: 'number',
          min: '1',
          max: '1000',
          style: { ...styles.input, width: '80px' },
          onChange: (e: { target: { value: string } }) => setLimit(e.target.value),
        })
      ),
      React.createElement(
        'button',
        { onClick: handleRun, disabled: loading, style: styles.btn(true, loading) },
        loading ? 'Running…' : 'Run Query'
      )
    ),
    // ── Error ─────────────────────────────────────────────────────────────
    error && React.createElement('p', { style: styles.error }, error),
    // ── Results ───────────────────────────────────────────────────────────
    results !== null &&
      React.createElement(
        'div',
        null,
        React.createElement(
          'div',
          { style: { display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' } },
          React.createElement(
            'span',
            { style: { ...styles.muted, fontStyle: 'normal' } },
            `${results.length} document(s) returned`
          ),
          React.createElement(
            'button',
            {
              onClick: () => setViewMode('table'),
              style: { ...styles.btn(viewMode === 'table'), padding: '0.2rem 0.6rem' },
            },
            'Table'
          ),
          React.createElement(
            'button',
            {
              onClick: () => setViewMode('json'),
              style: { ...styles.btn(viewMode === 'json'), padding: '0.2rem 0.6rem' },
            },
            'JSON'
          )
        ),
        viewMode === 'json'
          ? React.createElement(
              'pre',
              {
                style: {
                  background: '#f5f5f5',
                  padding: '0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  maxHeight: '420px',
                  overflow: 'auto',
                  margin: 0,
                },
              },
              JSON.stringify(results, null, 2)
            )
          : results.length === 0
          ? React.createElement('p', { style: styles.muted }, 'No documents found.')
          : React.createElement(
              'div',
              { style: { overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' } },
              React.createElement(
                'table',
                { style: { width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' } },
                React.createElement(
                  'thead',
                  null,
                  React.createElement(
                    'tr',
                    null,
                    ...columns.map((col) =>
                      React.createElement(
                        'th',
                        {
                          key: col,
                          style: {
                            padding: '0.4rem 0.6rem',
                            background: '#f0f4fb',
                            borderBottom: '2px solid #c5d0e0',
                            textAlign: 'left',
                            fontFamily: 'monospace',
                            whiteSpace: 'nowrap',
                            position: 'sticky',
                            top: 0,
                          },
                        },
                        col
                      )
                    )
                  )
                ),
                React.createElement(
                  'tbody',
                  null,
                  ...results.map((doc, i) =>
                    React.createElement(
                      'tr',
                      {
                        key: i,
                        style: { borderBottom: '1px solid #eee', background: i % 2 === 0 ? '#fff' : '#fafafa' },
                      },
                      ...columns.map((col) =>
                        React.createElement(
                          'td',
                          {
                            key: col,
                            title: JSON.stringify(doc[col]),
                            style: {
                              padding: '0.35rem 0.6rem',
                              fontFamily: 'monospace',
                              maxWidth: '220px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            },
                          },
                          formatCellValue(doc[col])
                        )
                      )
                    )
                  )
                )
              )
            )
      )
  );
};

// ---------------------------------------------------------------------------
// MongoExplorerTab — clusterDetailTab entry point
// ---------------------------------------------------------------------------

const MongoExplorerTab = (props: ClusterDetailTabProps) => {
  const [selectedDb, setSelectedDb] = React.useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = React.useState<string | null>(null);

  const clusterObj = props.cluster as { engine?: string; clusterName?: string; [k: string]: unknown };

  // The Everest-registered cluster name is needed to build API URLs.
  // It lives on the cluster resource object; fall back to "main" (the default
  // cluster name in single-cluster Everest deployments).
  const k8sCluster = (clusterObj?.clusterName as string) ?? 'main';

  // Only render content for PSMDB (MongoDB) clusters.
  if (clusterObj.engine && clusterObj.engine !== 'psmdb') {
    return React.createElement(
      'div',
      { style: { padding: '2rem', color: '#666' } },
      'MongoDB Explorer is only available for PSMDB (MongoDB) clusters.'
    );
  }

  const handleSelectCollection = (db: string, coll: string) => {
    setSelectedDb(db);
    setSelectedCollection(coll);
  };

  return React.createElement(
    'div',
    {
      style: {
        display: 'flex',
        height: '100%',
        minHeight: '520px',
        gap: 0,
      },
    },
    // Left: database/collection tree
    React.createElement(
      'div',
      {
        style: {
          width: '220px',
          flexShrink: 0,
          borderRight: '1px solid #e0e0e0',
          padding: '1rem 0.75rem 1rem 1rem',
          overflowY: 'auto',
          background: '#fafafa',
        },
      },
      React.createElement(
        'div',
        {
          style: {
            fontSize: '0.7rem',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#888',
            marginBottom: '0.5rem',
          },
        },
        'Databases'
      ),
      React.createElement(DatabaseTree, {
        k8sCluster,
        cluster: props.instanceName,
        namespace: props.namespace,
        onSelectCollection: handleSelectCollection,
      })
    ),
    // Right: query panel
    React.createElement(
      'div',
      { style: { flex: 1, padding: '1rem', overflowY: 'auto' } },
      React.createElement(
        'div',
        {
          style: {
            fontSize: '0.7rem',
            fontWeight: '700',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#888',
            marginBottom: '0.75rem',
          },
        },
        'Query'
      ),
      React.createElement(QueryPanel, {
        k8sCluster,
        cluster: props.instanceName,
        namespace: props.namespace,
        initialDb: selectedDb,
        initialCollection: selectedCollection,
      })
    )
  );
};

// ---------------------------------------------------------------------------
// MongoExplorerPage — standalone route page
// ---------------------------------------------------------------------------

const MongoExplorerPage = (_props: PluginRouteProps) => {
  return React.createElement(
    'div',
    { style: { padding: '2rem' } },
    React.createElement('h1', { style: { marginBottom: '0.5rem' } }, 'MongoDB Explorer'),
    React.createElement(
      'p',
      { style: { color: '#555' } },
      'Open a MongoDB (PSMDB) cluster and use the ',
      React.createElement('strong', null, 'MongoDB Explorer'),
      ' tab to browse its databases and run queries.'
    )
  );
};

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

const register: PluginRegisterFn = (api: PluginApi) => {
  React = api.React;
  pluginFetch = api.fetch.bind(api);

  api.registerExtension({
    type: 'sidebarItem',
    label: 'MongoDB Explorer',
    icon: 'storage',
  });

  api.registerExtension({
    type: 'route',
    label: 'MongoDB Explorer',
    component: MongoExplorerPage,
  });

  api.registerExtension({
    type: 'clusterDetailTab',
    label: 'MongoDB Explorer',
    path: 'mongodb-explorer',
    component: MongoExplorerTab,
  });
};

export default register;

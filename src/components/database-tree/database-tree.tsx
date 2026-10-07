import { useEffect, useState } from 'react';
import {
  Alert,
  CircularProgress,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import StorageOutlinedIcon from '@mui/icons-material/StorageOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import { fetchCollections, fetchDatabases } from 'api/explorer';
import { errorText } from 'utils/error-message';
import { MONOSPACE_SX } from 'components/surface.constants';
import { Messages } from './database-tree.messages';

export interface CollectionRef {
  db: string;
  collection: string;
}

interface DatabaseTreeProps {
  k8sCluster: string;
  cluster: string;
  namespace: string;
  selected: CollectionRef | null;
  onSelectCollection: (selection: CollectionRef) => void;
}

const ICON_SX = { minWidth: 28 };

export const DatabaseTree = ({ k8sCluster, cluster, namespace, selected, onSelectCollection }: DatabaseTreeProps) => {
  const [databases, setDatabases] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collections, setCollections] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [collectionsLoading, setCollectionsLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchDatabases(k8sCluster, cluster, namespace)
      .then(setDatabases)
      .catch((e: unknown) => setError(errorText(e)))
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
    if (collections[db]) return;

    setCollectionsLoading((prev) => ({ ...prev, [db]: true }));
    fetchCollections(k8sCluster, cluster, namespace, db)
      .then((cols) => setCollections((prev) => ({ ...prev, [db]: cols })))
      .catch((e: unknown) => setError(errorText(e)))
      .finally(() => setCollectionsLoading((prev) => ({ ...prev, [db]: false })));
  };

  if (loading) {
    return <CircularProgress size={20} sx={{ m: 1 }} aria-label={Messages.loadingDatabases} />;
  }
  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }
  if (databases.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
        {Messages.noDatabases}
      </Typography>
    );
  }

  return (
    <List dense disablePadding>
      {databases.map((db) => {
        const isOpen = expanded.has(db);
        const cols = collections[db] ?? [];
        return (
          <li key={db}>
            <ListItemButton onClick={() => toggleDb(db)} sx={{ px: 1, borderRadius: 1 }}>
              <ListItemIcon sx={ICON_SX}>
                {isOpen ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
              </ListItemIcon>
              <ListItemIcon sx={ICON_SX}>
                <StorageOutlinedIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={db}
                slotProps={{ primary: { variant: 'body2', noWrap: true, sx: { ...MONOSPACE_SX, fontWeight: 600 } } }}
              />
            </ListItemButton>
            <Collapse in={isOpen} unmountOnExit>
              {collectionsLoading[db] ? (
                <CircularProgress size={16} sx={{ ml: 5, my: 0.5 }} aria-label={Messages.loadingCollections} />
              ) : cols.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ pl: 8, py: 0.5 }}>
                  {Messages.empty}
                </Typography>
              ) : (
                <List dense disablePadding>
                  {cols.map((collection) => (
                    <ListItemButton
                      key={collection}
                      title={collection}
                      selected={selected?.db === db && selected.collection === collection}
                      onClick={() => onSelectCollection({ db, collection })}
                      sx={{ pl: 5, pr: 1, borderRadius: 1 }}
                    >
                      <ListItemIcon sx={ICON_SX}>
                        <TableChartOutlinedIcon fontSize="small" color="primary" />
                      </ListItemIcon>
                      <ListItemText
                        primary={collection}
                        slotProps={{ primary: { variant: 'body2', noWrap: true, sx: MONOSPACE_SX } }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Collapse>
          </li>
        );
      })}
    </List>
  );
};

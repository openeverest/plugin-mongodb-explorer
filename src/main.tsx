import type {
  PluginRegisterFn,
  PluginApi,
  PluginRouteProps,
  ClusterDetailTabProps,
} from '@openeverest/plugin-sdk';
import { PluginThemeProvider } from '@openeverest/ui-lib';
import { configurePlugin, getCssNonce } from './api';
import { MongoExplorerPage, MongoExplorerTab } from './components';

// Every host-rendered entry point is wrapped so its MUI subtree inherits the
// host design tokens (palette, typography, dark mode) through a namespaced
// Emotion cache — see @openeverest/ui-lib PluginThemeProvider.
const ThemedPage = (props: PluginRouteProps) => (
  <PluginThemeProvider cacheKey="mongodb-explorer" nonce={getCssNonce()}>
    <MongoExplorerPage {...props} />
  </PluginThemeProvider>
);

const ThemedTab = (props: ClusterDetailTabProps) => (
  <PluginThemeProvider cacheKey="mongodb-explorer" nonce={getCssNonce()}>
    <MongoExplorerTab {...props} />
  </PluginThemeProvider>
);

const register: PluginRegisterFn = (api: PluginApi) => {
  configurePlugin(api);

  api.registerExtension({
    type: 'sidebarItem',
    label: 'MongoDB Explorer',
  });

  api.registerExtension({
    type: 'route',
    label: 'MongoDB Explorer',
    component: ThemedPage,
  });

  api.registerExtension({
    type: 'clusterDetailTab',
    label: 'MongoDB Explorer',
    path: 'mongodb-explorer',
    providers: ['percona-server-mongodb'],
    component: ThemedTab,
  });
};

export default register;

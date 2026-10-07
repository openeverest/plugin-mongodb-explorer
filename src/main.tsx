import type { PluginApi, PluginRegisterFn } from '@openeverest/plugin-sdk';
import { initPluginRuntime } from 'api/plugin-runtime';
import { ExplorerPage } from 'components/explorer-page/explorer-page';
import { ExplorerTab } from 'components/explorer-tab/explorer-tab';

const LABEL = 'MongoDB Explorer';

const register: PluginRegisterFn = (api: PluginApi) => {
  initPluginRuntime(api);

  api.registerExtension({
    type: 'sidebarItem',
    label: LABEL,
  });

  api.registerExtension({
    type: 'route',
    label: LABEL,
    component: ExplorerPage,
  });

  api.registerExtension({
    type: 'clusterDetailTab',
    label: LABEL,
    path: 'mongodb-explorer',
    providers: ['percona-server-mongodb'],
    component: ExplorerTab,
  });
};

export default register;

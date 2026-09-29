// Host-provided values, captured once in register(api) so plain modules can use them.
import type { PluginApi } from '@openeverest/plugin-sdk';

export let pluginFetch: PluginApi['fetch'];
export let cssNonce: PluginApi['cssNonce'];

export function initPluginRuntime(api: PluginApi): void {
  pluginFetch = api.fetch.bind(api);
  cssNonce = api.cssNonce;
}

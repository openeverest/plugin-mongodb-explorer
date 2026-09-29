import type { ReactNode } from 'react';
import { PluginThemeProvider } from '@openeverest/plugin-theme';
import { cssNonce } from 'api/plugin-runtime';

// Must be unique across plugins so Emotion caches never collide.
const EMOTION_CACHE_KEY = 'mongodb-explorer';

interface PluginRootProps {
  children: ReactNode;
}

export const PluginRoot = ({ children }: PluginRootProps) => (
  <PluginThemeProvider cacheKey={EMOTION_CACHE_KEY} nonce={cssNonce}>
    {children}
  </PluginThemeProvider>
);

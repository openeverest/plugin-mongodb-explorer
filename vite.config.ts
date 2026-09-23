import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  // Vite lib mode (unlike app builds) does not substitute this, but the bundled
  // MUI/Emotion/React read it at init — leaving it unreplaced throws
  // "process is not defined" in the browser and the plugin fails to load.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    lib: {
      entry: 'src/main.tsx',
      formats: ['es'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      // React (incl. the automatic JSX runtime) is the host's shared singleton,
      // resolved at runtime via the host import map. MUI/Emotion ship inside
      // @openeverest/ui-lib and stay bundled so the plugin owns its design-system
      // version (Model B).
      external: [/^react($|\/)/, /^react-dom($|\/)/],
    },
  },
  server: {
    port: 3001,
    cors: true,
  },
});

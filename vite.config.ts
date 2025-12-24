import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const envDir = __dirname;
    const env = loadEnv(mode, envDir, '');
    return {
      envDir,
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        {
          // Avoid noisy "Failed to load resource: 404 (Not Found)" for /favicon.ico in dev/preview.
          // We set an explicit favicon in index.html, but some browsers still probe /favicon.ico.
          name: 'flowmail-favicon-no-404',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              if (req.url === '/favicon.ico') {
                res.statusCode = 204;
                res.end();
                return;
              }
              next();
            });
          },
          configurePreviewServer(server) {
            server.middlewares.use((req, res, next) => {
              if (req.url === '/favicon.ico') {
                res.statusCode = 204;
                res.end();
                return;
              }
              next();
            });
          },
        },
        react(),
      ],
      define: {
        // Make these available even if import.meta.env isn't populated as expected.
        'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL ?? ''),
        'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY ?? ''),
        'process.env.VITE_WORKSPACE_ID': JSON.stringify(env.VITE_WORKSPACE_ID ?? ''),
        'process.env.VITE_GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY ?? env.GEMINI_API_KEY ?? ''),

        // Backward compatible Gemini shims (legacy code may read these)
        'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY ?? env.GEMINI_API_KEY ?? ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY ?? env.GEMINI_API_KEY ?? ''),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

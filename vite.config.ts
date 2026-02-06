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
        // Some dependencies still probe NODE_ENV via process.env in browser builds.
        // Replace it at build-time so Netlify doesn't need a Node `process` global.
        'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

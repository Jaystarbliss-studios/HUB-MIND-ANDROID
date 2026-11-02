import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv, createLogger } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const customLogger = createLogger();
const origLoggerError = customLogger.error.bind(customLogger);
const origLoggerWarn = customLogger.warn.bind(customLogger);
const origLoggerInfo = customLogger.info.bind(customLogger);

const isBenignViteNotice = (msg: unknown) => {
  const l = String(msg || '').toLowerCase();
  return l.includes('websocket') || l.includes('ws') || l.includes('hmr') || l.includes('[vite]');
};

customLogger.error = (msg, options) => {
  if (isBenignViteNotice(msg)) return;
  origLoggerError(msg, options);
};
customLogger.warn = (msg, options) => {
  if (isBenignViteNotice(msg)) return;
  origLoggerWarn(msg, options);
};
customLogger.info = (msg, options) => {
  if (isBenignViteNotice(msg)) return;
  origLoggerInfo(msg, options);
};

export default defineConfig(() => {
  return {
    customLogger,
    plugins: [
      {
        name: 'disable-vite-client-ws',
        enforce: 'pre',
        transform(code, id) {
          if (id.includes('vite/dist/client/client.mjs') || code.includes('WebSocket closed without opened.')) {
            return {
              code: code
                .replace(
                  /const createWebSocketModuleRunnerTransport = \(options\) => \{[\s\S]*?(?=function createHMRHandler)/,
                  'const createWebSocketModuleRunnerTransport = () => ({ async connect({ onMessage } = {}) { try { onMessage?.({ type: "connected" }); } catch {} }, disconnect() {}, send() {} });\n'
                )
                .replace(
                  /async function waitForSuccessfulPing\([^)]*\)\s*\{/,
                  'async function waitForSuccessfulPing() { return true;'
                ),
              map: null,
            };
          }
        },
      },
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        devOptions: {
          enabled: false
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024,
          runtimeCaching: [
            {
              urlPattern: /\/api\/tasks/i,
              handler: 'NetworkOnly',
              method: 'POST',
              options: {
                backgroundSync: {
                  name: 'task-sync-queue',
                  options: { maxRetentionTime: 24 * 60 }
                }
              }
            },
            {
              urlPattern: /\/api\/documents/i,
              handler: 'NetworkOnly',
              method: 'POST',
              options: {
                backgroundSync: {
                  name: 'document-sync-queue',
                  options: { maxRetentionTime: 24 * 60 }
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: { statuses: [0, 200] }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                },
                cacheableResponse: { statuses: [0, 200] }
              }
            }
          ]
        },
        manifest: {
          name: 'Hub-Mind',
          short_name: 'Hub-Mind',
          description: 'AI-Powered Business Workspace',
          theme_color: '#020617',
          background_color: '#020617',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/login',
          icons: [
            { src: '/hub-mind%20logo.png', sizes: 'any', type: 'image/png', purpose: 'any' }
          ],
          share_target: {
            action: '/share-target',
            method: 'POST',
            enctype: 'multipart/form-data',
            params: {
              title: 'title',
              text: 'text',
              url: 'url',
              files: [
                {
                  name: 'file',
                  accept: ['image/*', 'text/plain', 'application/pdf', '.docx', '.doc']
                }
              ]
            }
          }
        }
      }),
      {
        name: 'mirror-build-dir',
        closeBundle() {
          try {
            const distDir = path.resolve(__dirname, 'dist');
            const buildDir = path.resolve(__dirname, 'build');
            if (fs.existsSync(distDir)) {
              fs.cpSync(distDir, buildDir, { recursive: true });
            }
          } catch (e) {
            console.warn('Could not mirror build directory:', e);
          }
        }
      }
    ],
    resolve: {
      alias: { '@': path.resolve(__dirname, '.') },
    },
    build: {
      outDir: 'dist',
      // Never retain chunks from previous builds. Keeping stale bundles in dist
      // can make PWA deployments appear to randomly mix old/new application code.
      emptyOutDir: true,
      chunkSizeWarningLimit: 3500,
    },
    server: {
      hmr: false,
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

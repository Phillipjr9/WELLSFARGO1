import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";
import { demoApi } from "./server/api.mjs";
import { publicPageApi } from "./server/public-pages.mjs";

export default mergeConfig(
  base,
  defineConfig({
    // The preview runs behind a proxied host, so dev and preview servers must
    // accept the workspace origin instead of only localhost.
    server: {
      host: "0.0.0.0",
      allowedHosts: true,
    },
    preview: {
      host: "0.0.0.0",
      allowedHosts: true,
    },
    plugins: [
      {
        name: "isolated-demo-workspaces",
        configureServer(server) {
          server.middlewares.use(publicPageApi);
          server.middlewares.use(demoApi);
        },
        configurePreviewServer(server) {
          server.middlewares.use(publicPageApi);
          server.middlewares.use(demoApi);
        },
      },
    ],
  }),
);

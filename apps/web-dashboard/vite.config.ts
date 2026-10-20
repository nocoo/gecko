import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import vinext from "vinext";
import { defineConfig } from "vite";
import { localPersistPath } from "./scripts/db-local";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
      remoteBindings: false,
      inspectorPort: false,
      persistState: { path: process.env.GECKO_TEST_STATE || localPersistPath(rootDir) },
    }),
  ],
  resolve: {
    alias: {
      "@": path.join(rootDir, "src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 7018,
    strictPort: true,
    allowedHosts: ["gecko.dev.hexly.ai"],
  },
});

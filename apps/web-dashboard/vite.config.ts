import vinext from "vinext";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vinext()],
  server: {
    allowedHosts: true,
  },
  // @vercel/oidc (transitive via next-auth → @auth/core) ships an esbuild
  // CJS bundle whose `auth-config.js` and `token-util.js` form a require()
  // cycle. Under vite 8's cjs-module-runner-transform (introduced in
  // @vitejs/plugin-rsc 0.5.x), the cycle becomes `await import()` which
  // returns undefined for one side, crashing the request at module load
  // with `Cannot read properties of undefined (reading
  // '__cjs_module_runner_transform')`. Letting Node externalize the package
  // keeps native CJS semantics (where partial cyclic exports are fine).
  ssr: {
    external: ["@vercel/oidc"],
  },
});

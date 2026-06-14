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
  //
  // `better-sqlite3` (and its `bindings` helper) loads a native addon by
  // walking the V8 stack to discover the caller's file path. When Vite
  // SSR-transforms `database.js`, the frame for `require('bindings')` lacks
  // a fileName and `bindings` crashes with `Cannot read properties of
  // undefined (reading 'indexOf')`. Externalizing keeps native CJS require
  // semantics so the stack walk finds a real path.
  ssr: {
    external: ["@vercel/oidc", "better-sqlite3", "bindings"],
  },
});

declare module "vinext/server/app-router-entry" {
  const app: {
    fetch: (request: Request, env?: unknown, ctx?: unknown) => Promise<Response> | Response;
  };
  export default app;
}

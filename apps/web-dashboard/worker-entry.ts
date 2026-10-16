import app from "vinext/server/app-router-entry";
import { runAutoAnalyzeTick } from "./src/lib/auto-analyze";

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  async scheduled(controller, env) {
    await runAutoAnalyzeTick(env, controller.scheduledTime);
  },
} satisfies ExportedHandler<Cloudflare.Env>;

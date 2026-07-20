import { handlers } from "@/auth";
import { exposeOwnAccessors } from "@/lib/vinext-request-shim";

export const GET = async (req: Request) => handlers.GET(await exposeOwnAccessors(req));
export const POST = async (req: Request) => handlers.POST(await exposeOwnAccessors(req));

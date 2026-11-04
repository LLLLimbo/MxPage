import { cloneOzonProject } from "@/lib/ozon/runtime";
import { handleRouteError, ok } from "@/lib/utils/route";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try { return ok(await cloneOzonProject(params.id), { status: 201 }); }
  catch (error) { return handleRouteError(error); }
}

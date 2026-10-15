import { hub } from "@/lib/hub";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(hub().snapshot());
}

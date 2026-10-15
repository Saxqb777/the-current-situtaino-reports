import { hub } from "@/lib/hub";
import type { WatchEvent } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Server-sent events: a fresh snapshot after every poll, plus a heartbeat. */
export function GET(req: Request) {
  const h = hub();
  const enc = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const onSnapshot = (fresh: WatchEvent[]) => send("snapshot", { snapshot: h.snapshot(), fresh: fresh.map((e) => e.id) });
      const onVessels = () => send("vessels", { at: new Date().toISOString() });
      const beat = setInterval(() => controller.enqueue(enc.encode(": keep-alive\n\n")), 25_000);
      h.on("snapshot", onSnapshot);
      h.on("vessels", onVessels);
      send("snapshot", { snapshot: h.snapshot(), fresh: [] });
      cleanup = () => {
        clearInterval(beat);
        h.off("snapshot", onSnapshot);
        h.off("vessels", onVessels);
      };
      req.signal.addEventListener("abort", () => { cleanup(); try { controller.close(); } catch {} });
    },
    cancel() { cleanup(); },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}

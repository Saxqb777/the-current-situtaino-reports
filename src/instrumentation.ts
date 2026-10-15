// Starts the news poller and ship feed when the server boots, before the first visitor.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { hub } = await import("./lib/hub");
    hub();
  }
}

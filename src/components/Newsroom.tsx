"use client";

import { useState } from "react";
import { LIVE_CHANNELS } from "@/lib/sources";

/** Live TV from news channels, loaded only when opened. */
export default function Newsroom() {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState(LIVE_CHANNELS[0]);

  if (!open) {
    return (
      <button className="tool newsroom__launch" onClick={() => setOpen(true)}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 2 L12 7 L3 12 Z" fill="currentColor" /></svg>
        Live TV
      </button>
    );
  }
  return (
    <section className="newsroom" aria-label="Live news TV">
      <div className="newsroom__bar">
        <h3><i aria-hidden="true" />Live · {channel.name}</h3>
        <button onClick={() => setOpen(false)}>Close</button>
      </div>
      <div className="newsroom__tabs" role="group" aria-label="Channel">
        {LIVE_CHANNELS.map((c) => (
          <button key={c.id} aria-pressed={c.id === channel.id} onClick={() => setChannel(c)}>{c.name}</button>
        ))}
      </div>
      <div className="newsroom__screen">
        <iframe
          key={channel.id}
          src={`https://www.youtube.com/embed/live_stream?channel=${channel.channel}&autoplay=1&mute=1`}
          title={`${channel.name} live`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
    </section>
  );
}

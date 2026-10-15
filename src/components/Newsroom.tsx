"use client";

import { useState } from "react";
import { LIVE_CHANNELS } from "@/lib/sources";

interface Props {
  /** Phone sheet: always open inside the bottom sheet, which handles closing. */
  inline?: boolean;
  /** On a page: show the screen, but load the stream only when someone presses play. */
  deferred?: boolean;
}

/** Live TV from news channels, loaded only when opened. */
export default function Newsroom({ inline = false, deferred = false }: Props) {
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(!deferred);
  const [channel, setChannel] = useState(LIVE_CHANNELS[0]);

  if (!open && !inline && !deferred) {
    return (
      <button className="tool newsroom__launch" data-tour="tv" onClick={() => setOpen(true)}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 2 L12 7 L3 12 Z" fill="currentColor" /></svg>
        Live TV
      </button>
    );
  }
  return (
    <section className={inline ? "newsroom newsroom--inline" : deferred ? "newsroom newsroom--page" : "newsroom"} aria-label="Live news TV" data-tour={deferred ? "tv" : undefined}>
      <div className="newsroom__bar" data-sheet-head="" data-sheet-drag="">
        <h3><i aria-hidden="true" />Live · {channel.name}</h3>
        {!inline && !deferred && <button onClick={() => setOpen(false)}>Close</button>}
      </div>
      <div className="newsroom__tabs" role="group" aria-label="Channel">
        {LIVE_CHANNELS.map((c) => (
          <button key={c.id} aria-pressed={c.id === channel.id} onClick={() => { setChannel(c); setPlaying(true); }}>{c.name}</button>
        ))}
      </div>
      <div className="newsroom__screen">
        {playing ? (
          <iframe
            key={channel.id}
            src={`https://www.youtube.com/embed/live_stream?channel=${channel.channel}&autoplay=1&mute=1&playsinline=1`}
            title={`${channel.name} live`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button className="newsroom__poster" onClick={() => setPlaying(true)}>
            <span className="newsroom__play" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 14 14"><path d="M3.5 2 L12 7 L3.5 12 Z" fill="currentColor" /></svg></span>
            <b>Watch {channel.name} live</b>
            <small>Starts muted. Pick another channel above.</small>
          </button>
        )}
      </div>
    </section>
  );
}

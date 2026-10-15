"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeVessels, type VesselLite } from "./client";
import type { Snapshot, WatchEvent } from "./types";

export const EMPTY_SNAPSHOT: Snapshot = {
  generatedAt: new Date(0).toISOString(),
  sample: false,
  lastRefresh: null,
  ais: { connected: false, configured: false, vessels: 0, lastMessage: null },
  zones: [],
  events: [],
  sources: [],
};

const SNAP_MS = 30_000;
/** Faster while the server is still reading sources, so the first reports appear soon. */
const SNAP_SETTLING_MS = 10_000;
const SETTLED_MS = 6 * 60_000;
const VESSELS_MS = 120_000;

/**
 * GET that lets the browser revalidate its copy. The server answers 304 when
 * nothing changed, the browser hands back its cached body, and the matching
 * ETag tells us to skip parsing it again. Returns null when unchanged.
 */
async function getIfChanged<T>(url: string, etag: string | null): Promise<{ data: T; etag: string | null } | null> {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const tag = res.headers.get("etag");
  if (tag && tag === etag) return null;
  return { data: (await res.json()) as T, etag: tag };
}

/**
 * Keeps the snapshot and ship positions current. Polls only while the page is
 * visible, which matters on phones, and catches up the moment it comes back.
 */
export function useLiveData() {
  const [snap, setSnap] = useState<Snapshot>(EMPTY_SNAPSHOT);
  const [vessels, setVessels] = useState<VesselLite[]>([]);
  const [live, setLive] = useState(true);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<WatchEvent | null>(null);
  const known = useRef<Set<string> | null>(null);
  const tags = useRef<{ snap: string | null; vessels: string | null }>({ snap: null, vessels: null });
  const lastAis = useRef<string | null | undefined>(undefined);
  const latest = useRef<Snapshot>(EMPTY_SNAPSHOT);

  const pollVessels = useCallback(async () => {
    try {
      const r = await getIfChanged<{ rows: Parameters<typeof decodeVessels>[0] }>("/api/vessels", tags.current.vessels);
      if (!r) return;
      tags.current.vessels = r.etag;
      setVessels(decodeVessels(r.data.rows));
    } catch { /* keep the last positions */ }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    let stopped = false;

    const pollSnap = async () => {
      if (busy || stopped) return;
      busy = true;
      clearTimeout(timer);
      let next = SNAP_MS;
      try {
        const r = await getIfChanged<Snapshot>("/api/snapshot", tags.current.snap);
        setLive(true);
        if (r) {
          tags.current.snap = r.etag;
          const s = r.data;
          latest.current = s;
          setSnap(s);
          // Anything not seen before this visit flashes in the Log; a new High or Critical also gets the banner.
          if (known.current) {
            const news = s.events.filter((e) => !known.current!.has(e.id));
            if (news.length) {
              setFresh(new Set(news.map((e) => e.id)));
              const loud = news.find((e) => e.severity === "critical" || e.severity === "high");
              if (loud) setFlash(loud);
            }
          }
          known.current = new Set(s.events.map((e) => e.id));
          if (s.ais.lastMessage !== lastAis.current) {
            lastAis.current = s.ais.lastMessage;
            void pollVessels();
          }
        }
        const s = latest.current;
        if (!s.sample && (!s.lastRefresh || Date.now() - Date.parse(s.lastRefresh) > SETTLED_MS)) next = SNAP_SETTLING_MS;
      } catch {
        setLive(false);
        next = SNAP_SETTLING_MS;
      } finally {
        busy = false;
      }
      if (!stopped && document.visibilityState === "visible") timer = setTimeout(pollSnap, next);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void pollSnap();
      else clearTimeout(timer);
    };

    void pollSnap();
    document.addEventListener("visibilitychange", onVisibility);
    const shipTimer = setInterval(() => { if (document.visibilityState === "visible") void pollVessels(); }, VESSELS_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(shipTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pollVessels]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 12_000);
    return () => clearTimeout(t);
  }, [flash]);

  return { snap, vessels, live, fresh, flash, dismissFlash: () => setFlash(null) };
}

/** The recent track of the selected ship, fetched on demand. */
export function useTrack(mmsi: number | null, vessels: VesselLite[]): [number, number][] | null {
  const [track, setTrack] = useState<[number, number][] | null>(null);
  const seen = mmsi === null ? null : vessels.find((v) => v.mmsi === mmsi)?.lastSeen ?? null;
  useEffect(() => {
    setTrack(null);
    if (mmsi === null) return;
    const ctl = new AbortController();
    fetch(`/api/vessel/${mmsi}`, { signal: ctl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { track?: [number, number][] } | null) => setTrack(d?.track ?? null))
      .catch(() => { /* no track, the ship still shows */ });
    return () => ctl.abort();
  }, [mmsi, seen]);
  return track;
}

/** A saved display preference mirrored onto <html data-*> so CSS can use it. */
export function usePref(key: string, attr: "theme" | "text", fallback: string) {
  const [value, setValue] = useState(fallback);
  useEffect(() => {
    try { setValue(localStorage.getItem(key) ?? fallback); } catch { /* storage blocked */ }
  }, [key, fallback]);
  const set = useCallback((v: string) => {
    setValue(v);
    document.documentElement.dataset[attr] = v;
    try { localStorage.setItem(key, v); } catch { /* storage blocked */ }
  }, [key, attr]);
  return [value, set] as const;
}

/** Matches a media query on the client; null until mounted so the server and first render agree. */
export function useMedia(query: string): boolean | null {
  const [match, setMatch] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return match;
}

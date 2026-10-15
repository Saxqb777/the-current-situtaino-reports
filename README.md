# Sea Lanes Watch

A live situation report for shipping around the GCC: every major port in the Arabian Gulf, the Strait of Hormuz, the Red Sea and Suez, Bab el-Mandeb and the Gulf of Aden, and the Somali coast.

It reads news and official maritime security notices every few minutes, merges reports of the same event, grades each one, and puts them on a live sea chart next to the ships in the area. It is built for phones first, and works the same on a laptop.

## What it does

- **Watch strip.** Each zone's level (Normal, Elevated, High, Critical), reports in the last 24 hours, ships in the zone and ships whose signal was lost.
- **Live chart.** Drawn like an Admiralty chart, with a degree border, depth shading and danger-area outlines. It shows reports, ports and live ships. Click any of them for detail.
- **Log.** Every report, newest first. Filter by zone, level, official reports or text. Hover an entry and it lights up on the chart.
- **Time scrubber.** Drag back up to seven days to see the picture as it stood then.
- **Live TV.** Al Jazeera English and Arabic, Sky News, France 24, DW and TRT World.
- **PDF briefing.** Tick reports in the Log, then use **Export briefing** to get a designed PDF. It has a cover, the chart, a zone status table, and each report with its sources linked.
- **Day chart and Night chart**, plus three text sizes.
- **Guided tour** on the first visit, with "your turn" steps. **Tour** plays it again.

On a phone the chart fills the screen, the zones swipe across the top, and the Log, details, briefing and TV slide up in one bottom sheet. Tabs at the bottom switch between Chart, Log, Briefing and Live TV.

## Sources

Defined in `src/lib/sources.ts`:

- Al Jazeera, BBC Middle East, Arab News and The National.
- Shipping press: gCaptain, Splash247, Maritime Executive and Seatrade Maritime.
- Google News searches for the chokepoints, UKMTO and JMIC notices, GCC ports, carriers (Maersk, MSC, Hapag-Lloyd, CMA CGM, Unifeeder) and the Somali coast. These pull in Reuters, AP and Lloyd's List.
- GDELT, which covers thousands of outlets in many languages, Arabic included.

Ships come from [aisstream.io](https://aisstream.io) (free key).

## Run it

```bash
npm install
cp .env.example .env.local     # add AISSTREAM_API_KEY for live ships
npm run build && npm start      # http://localhost:3000
```

Without `DATABASE_URL` everything is kept in memory, which is fine on your own machine.

`SAMPLE_DATA=1 npm run dev` loads made-up reports and ships for design review. The page shows a "Sample data" banner while it is on.

## Hosting

It runs on Vercel's free plan with a free Neon Postgres database.

- **Refresh on visit.** When someone loads or polls the page and the data is more than 5 minutes old, the server reads every source and listens to the ship feed for 30 seconds, after the response has gone out. A lock in the database makes sure only one refresh runs at a time.
- **Refresh when nobody is looking.** `.github/workflows/refresh.yml` calls `/api/refresh` every 10 minutes. Set the repository variable `SITE_URL` if the site is not at `https://sea-lanes-watch.vercel.app`. `vercel.json` adds a daily Vercel cron as a backstop.
- **Light on phones.** The page polls every 30 seconds while it is on screen and stops when it is not. Unchanged data comes back as a 304 with no body. Ship tracks load only for the ship you open.

Environment variables on Vercel: `DATABASE_URL`, `AISSTREAM_API_KEY`, and optionally `UNIFEEDER_MMSI` or `UNIFEEDER_NAMES`.

## How it fits together

| Part | File |
| --- | --- |
| Feed fetching (RSS, Atom, GDELT) | `src/lib/feeds.ts` |
| Place, port and severity matching | `src/lib/classify.ts` |
| Merging one event across outlets | `src/lib/cluster.ts` |
| Ship feed, transits and ships gone dark | `src/lib/ais.ts` |
| Refresh (news and ships), storage | `src/lib/refresh.ts`, `src/lib/store.ts` |
| Snapshot, zone levels, API | `src/lib/snapshot.ts`, `src/lib/levels.ts`, `src/app/api/*` |
| Polling, preferences | `src/lib/hooks.ts` |
| Phone layout | `src/components/phone/*` |
| Desktop layout | `src/components/DesktopApp.tsx` |
| Guided tour | `src/components/Tour.tsx` |
| Ports, zones and chokepoints | `src/lib/geo.ts` |
| Chart | `src/components/ChartMap.tsx` |
| PDF briefing | `src/components/pdf/Briefing.tsx` |

`npm test` runs the pipeline and backend tests. `npm run geo` rebuilds the basemap from Natural Earth.

## Notes

- Grades come from keywords. They are a reading aid, not an assessment.
- AIS does not say who operates a ship. Unifeeder vessels are matched by name, or by MMSI through `UNIFEEDER_MMSI`.
- "Signal lost" means a ship at sea in a watch zone that has stopped reporting for 2 hours. Its transponder may be switched off, or it may be out of receiver range.
- Coastline and depths: Natural Earth (public domain). Fonts: Archivo, Atkinson Hyperlegible Next and Spline Sans Mono (SIL Open Font License).

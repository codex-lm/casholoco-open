# Casholoco Solo — contributor instructions

- Keep the original economic rules and deterministic engine in `packages/core`.
  Use its seeded RNG; no browser time or random calls inside the engine.
- The browser owns one local match against bots. All game actions still pass
  through `applyAction`; the interface uses `getPlayerView`.
- French is the default language. Every added player-facing string also has an
  English version. A language change must not change simulation results.
- The solo LOB7 edition has no backend or peer transport. Do not add external
  asset requests, WebSockets, workers, dynamic imports in the built output or
  browser downloads. Local assets and text-based save export/import are supported.
- The separate Direct experimental build uses only manual WebRTC data channels
  with `iceServers: []`: no signalling service, STUN or TURN. Keep it excluded
  from the solo bundle. Passing a static check does not establish LOB7 admission.
- Run `npm run typecheck`, `npm test`, `npm run sim`, `npm run build`,
  `npm run export:lob7` and `npm run validate:lob7` before publishing.
- `source` holds editable source and tests; `main` holds only a built static export.
  Record the matching source commit when preparing a published edition.
- Do not publish missing/unconfirmed rights as established permissions. Preserve
  `LICENSE`, `ASSETS-LICENSE.md`, `THIRD_PARTY_NOTICES.md` and attribution files.

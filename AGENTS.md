# Repository Guidelines

## Project Structure & Module Organization
- `src/index.ts` – Hono entry for the Cloudflare Worker.
- `src/routes/index.tsx` – SSR page layout and UI shell (Tailwind 4 utilities).
- `src/routes/api/config.ts` – Exchanges `ANAM_API_KEY`/`ANAM_AVATAR_ID`/`ELEVENLABS_AGENT_ID` for an Anam session token.
- `src/client.ts` – Browser orchestrator connecting UI, Anam client, and ElevenLabs.
- `src/elevenlabs.ts` – WebSocket + microphone capture (16 kHz PCM).
- `src/renderer.tsx` – HTML scaffold, fonts, script/style injection.
- `src/style.css` – Tailwind theme tokens and animations. `public/` for static assets.
- Config: `wrangler.jsonc` (Cloudflare), `tsconfig.json` (strict TS), `vite.config.ts` (Vite + Cloudflare plugin + SSR).

## Build, Test, and Development Commands
- Install: `bun install`
- Develop: `bun run dev` (Vite dev server at http://localhost:5173).
- Typegen: `bun run cf-typegen` regenerates Cloudflare bindings.
- Build: `bun run build` (production bundle).
- Preview: `bun run preview` (serves the bundle).
- Deploy: `bun run deploy` (build + `wrangler deploy`; set secrets first).

## Coding Style & Naming Conventions
- Language: TypeScript (ESNext, strict). JSX via `hono/jsx`.
- Formatting: 2-space indent, semicolons, double quotes; mirror existing files.
- Naming: camelCase for vars/functions, PascalCase for components, UPPER_SNAKE for env keys.
- UI: Prefer Tailwind utilities; extend theme in `@theme` inside `src/style.css`.
- Logging: Keep `console.log` concise; never log secrets.

## Testing Guidelines
- No automated suite yet. Before pushing, run `bun run build` and sanity-check `bun run dev` with a real ElevenLabs agent and Anam avatar.
- Manual check: `curl http://localhost:5173/api/config` should return a token when `.dev.vars` is set.
- If adding tests, favor Vitest and keep specs under `src/__tests__` or `src/*.test.ts`.

## Commit & Pull Request Guidelines
- Commits follow short, imperative summaries (e.g., `Add Anam example`). Keep scope tight; include relevant files only.
- PRs: describe intent, list manual test steps, link issues, and attach screenshots/GIFs for UI changes.
- Update docs (`README.md`, `AGENTS.md`) when altering flows, env vars, or commands.
- Ensure secrets stay out of git. Use `.dev.vars` locally and `wrangler secret put` in Cloudflare.

## Security & Configuration Tips
- Required env vars: `ANAM_API_KEY`, `ANAM_AVATAR_ID`, `ELEVENLABS_AGENT_ID` (set in `.dev.vars` for local, via Wrangler secrets for deploys).
- Audio handling expects 16 kHz mono PCM; keep settings in sync with ElevenLabs agent configuration.
- Avoid committing generated tokens or session IDs; prefer fetching them at runtime through `/api/config`.

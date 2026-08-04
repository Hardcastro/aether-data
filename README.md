# AEther Data — portfolio hub

**Resumo em português:** este é o site de portfólio — um painel de vidro que mostra uma peça por vez, com um seletor no canto para trocar entre elas. O painel inclina sob o cursor, o fundo muda de cor conforme a peça aberta, e um campo de partículas reage ao ponteiro atrás de tudo. Por baixo dessa camada visual existe uma lista de texto simples com todas as peças, sempre presente no HTML — é o que garante que o site funcione sem JavaScript, para leitor de tela e para quem só quer abrir o código-fonte. Publicar uma peça nova é um commit em `lib/manifesto.ts`, mais nada.

*(Este README descrevia até 02/08 um canvas espacial com pan/zoom que foi construído, saiu ilegível — o cálculo de enquadramento tratava cada cartão como ponto quando ele é uma caixa 240×170, travando o zoom em 0,72 e o texto em 9px — e foi substituído pelo hero abaixo, não consertado. `components/Plano.tsx` não existe mais.)*

## What this is

A single-route portfolio: `/` renders one piece at a time (`components/Hero.tsx`) inside a glass panel that tilts toward the cursor, with a radial background that morphs to that piece's color and a field of drifting particles behind everything. A selector in the right column lists every piece from `lib/manifesto.ts`, grouped by the competency it demonstrates (pull data / deliver to someone / make it queryable) — clicking one, or the ← / → arrows, swaps the panel. `/?peca=<slug>` opens a specific piece server-rendered, so cold links and social previews land directly on it instead of the default.

## Running it

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

```bash
npm run build   # production build
npx tsc --noEmit  # typecheck
```

## Why one piece at a time, not a grid

The panel shows a single piece full-size — name, capacity, stack, links — instead of a grid of small cards, because the object being sold here isn't a product photo, it's a paragraph explaining what the piece proves. A grid would force that text small; the single panel gives it room. The selector on the right keeps the other pieces one click away without competing for the same space.

## The no-JS / screen-reader fallback

`Hero.tsx` always renders a second copy of the portfolio at the bottom of the page — `.lista-sem-js`, a plain list of real `<a href>` links, one per piece, with its full name, capacity and `oQueProva` text in reading order. The glass panel is a `"use client"` component, so its interactivity (the tilt, the swap animation, the particle field) needs JavaScript, but Next.js still server-renders its initial markup — the panel shows whatever piece the URL asks for even before hydration, and the flat list underneath means nothing is ever JS-only. View-source shows every piece's name and text, not an empty container.

## Who owns `transform`

Two different elements, two different rules — worth keeping straight before touching either:

- **The panel's tilt** (`rotateY`/`rotateX` in response to the cursor) is written exclusively by the `requestAnimationFrame` loop in `Hero.tsx`. GSAP never touches that `transform`: during a piece swap it only tweens a plain number (`giro.val`, the spin angle) and writes `.style.filter` (the blur) directly — the rAF loop reads `giroRef.current` every frame and folds it into the same `rotateY(...) rotateX(...)` string it already owns.
- **The background nodes' position** (the drifting dots in `campo-fg`/`campo-bg`) is owned by the rAF loop *only when no swap is in progress* (`trocandoRef.current === false`). The moment a swap starts, the loop stops writing their `transform` and GSAP takes exclusive control for the implosion → hold → explosion sequence. On `onComplete`, the new position is captured into `dataset.baseX`/`baseY` (the loop's own persistent state) and `gsap.set(no, { clearProps: "transform,opacity" })` wipes GSAP's inline style before handing control back — skip that step and the next frame's write from the loop would fight the leftover GSAP transform.

If you add a new continuously-animated property, decide which of these two patterns it follows — a single always-on writer, or a coordinated handoff — before wiring it up. Two writers touching the same `transform` in the same frame is the bug this split exists to avoid.

GSAP is dynamically imported only when `prefers-reduced-motion` is off (`import("gsap")` inside a `useEffect`) — it is never downloaded for a visitor who asked for less motion, and the loop itself no-ops (`reduzidoRef.current` guard) in that case too.

## How URL state feeds the preview

Opening a piece calls `router.push('/?peca=<slug>')`. The page component (`app/page.tsx`) reads `searchParams` on the server and resolves the piece before rendering, so:

- a cold link opens straight into the right panel, no flash of the default piece first;
- the browser's back button closes back to the previous piece, matching user expectations;
- link previews (WhatsApp, LinkedIn) need per-piece OG images, which `opengraph-image.tsx` cannot generate (it doesn't receive `searchParams`) — so `/og/peca?slug=...` is a plain route handler instead, and `generateMetadata` in `app/page.tsx` points there whenever a piece is open.
- `<link rel="canonical">` and `<meta property="og:url">` are hand-rendered in `page.tsx`'s JSX rather than through the `metadata` API's `alternates.canonical` — a known Next 15 bug (vercel/next.js#72810) drops the query string when that field is resolved against `metadataBase`. This covers the bare `/` too (falls back to `MARCA.url`), not just `/?peca=` — before 03/08 the bare URL, the one most likely to actually get shared, emitted neither tag.

`metadataBase` and every OG URL are built from `site.config.ts`'s `MARCA.url`, which reads `VERCEL_PROJECT_PRODUCTION_URL` (the stable production domain), never `VERCEL_URL` (the per-deploy URL, which changes on every push and would leave `canonical`/`og:url` pointing at a dead address the next day — this already happened once, on an earlier piece in this same portfolio).

`MARCA` is never imported by a client component, directly or transitively — `VERCEL_PROJECT_PRODUCTION_URL` doesn't exist in the client bundle, so if it leaked into `Hero.tsx`'s import chain, `url` would silently become `localhost:3000` in production with no build error.

## Adding a new piece

Add one entry to the `PECAS` array in `lib/manifesto.ts` — `slug`, `nome`, `capacidade`, `grupo`, `cor` (the three-stop radial gradient the background morphs to), `url`, optional `repo`, `stack`, `oQueProva`, and `imagem` (a 1440×900 screenshot in `public/prints/`, or `null` to show a placeholder). Nothing else changes: no new route, no CMS, no database. A group with zero pieces is simply never rendered — see `GRUPOS_COM_PECAS` — and every piece count shown on the page (`MARCA.descricao`, the hero's "N peças no ar" badge, the OG image) reads `PECAS.length` rather than a written-out number, so adding a piece can't leave stale copy behind the way an earlier version of this file did.

## Stack

Next.js 15 (App Router), TypeScript (strict), Tailwind CSS v4 (CSS-first config, no `tailwind.config.js`), GSAP core only (no plugins), Inter + Instrument Serif via `next/font/google`. No canvas element, no third-party pan/zoom/physics library. Screenshots in `public/prints/` are the only static images; everything else — the panel, the particle field, the OG images — is drawn.

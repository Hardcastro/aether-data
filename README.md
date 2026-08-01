# AEther Data — portfolio hub

**Resumo em português:** este é o site de portfólio — um plano navegável (pan/zoom/pinça) onde as peças já publicadas ficam posicionadas e agrupadas pela competência que carregam, não pelo ramo do cliente. O HTML nasce como uma lista semântica agrupada, que funciona inteiramente sem JavaScript; o plano espacial é uma camada de aprimoramento aplicada por cima, só em telas largas com ponteiro fino. Publicar uma peça nova é um commit em `lib/manifesto.ts`, mais nada.

## What this is

A single-route portfolio: `/` renders a spatial canvas where the pieces already shipped (`lib/manifesto.ts`) sit at hand-authored coordinates, grouped by the competency they demonstrate (pull data / deliver to someone / make it queryable). `/?peca=<slug>` opens a server-rendered detail panel for one piece, so cold links and social previews land directly on it.

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

## Why the list comes before the plane

The spatial canvas only makes sense with a fine pointer and a wide viewport — on a 360px phone, opened from a WhatsApp link or a proposal, pan-and-zoom fights the native scroll and becomes a maze instead of a portfolio. So the actual DOM is always the same: a grouped, in-flow list of real `<a>` cards under real `<h2>` group headings, written in reading order. That list is complete and functional with JavaScript disabled — view-source shows every piece's name and text, not an empty container.

The plane is a client-side upgrade on top of that same DOM (`components/Plano.tsx`), switched on only when `matchMedia('(max-width: 900px), (pointer: coarse)')` does *not* match. If you built the plane first and tried to derive the list from it, the semantics would come out backwards and the no-JS requirement would never hold — so the order in the codebase mirrors the order it was built: grouped list working → plane navigating with hard cuts → motion on top (see commit history).

## How the camera follows focus

`Tab` walks the cards in group order (their natural DOM order). Each card's `onFocus` calls `focarCartao(slug)`, which points the camera at that card's **manifest position** — never a measured `getBoundingClientRect()`. That distinction matters: the magnetism effect (section 8.2 of the build brief) displaces cards on screen by a few pixels toward the cursor, and if the camera chased the *displaced* position instead of the authored one, moving the camera would change the card's distance to the cursor, which would change the displacement, which would move the camera again — a feedback loop that oscillates the moment your mouse is anywhere near a focused card. Reading from the manifest instead of the DOM breaks that loop by construction.

## Why GSAP never writes the DOM directly for `transform`

One property, one owner:

```
GSAP  →  { câmera, foco, canvas }  →  rAF  →  transform / style
```

`requestAnimationFrame` (inside `Plano.tsx`) is the only code that writes `transform` on the world container and on cards. GSAP never touches `transform`: it tweens plain JavaScript objects instead — the camera's `{x, y, k}`, and per-card `{ scaleRecuo, scaleEntrada }` numbers — and the rAF loop reads those objects every frame to compute the actual translate/rotate/scale it writes. Continuous per-frame effects (floating, magnetism, the controls-bar counter-parallax) are computed directly inside the rAF loop and never touch GSAP at all.

GSAP *is* allowed to animate `opacity` and `boxShadow` directly, since the rAF loop never touches those two properties on cards — no two engines ever fight over the same property. If GSAP and rAF both wrote `transform`, the conflict would be intermittent and framerate-dependent, which is exactly the bug this split exists to avoid.

GSAP is dynamically imported only inside the plane-mode branch (`import("gsap")`), and only when `prefers-reduced-motion` is off — it is never downloaded in list mode or under reduced motion.

## How URL state feeds the preview

Opening a card navigates to `/?peca=<slug>` (a real `next/link`, so it works with JavaScript off too — the close button falls back to a normal link when no animated close handler is wired up). The page component reads `searchParams` on the server and resolves the piece before rendering, so:

- a cold link opens straight into the panel, no flash of the empty canvas first;
- the browser's back button closes the panel, matching user expectations;
- link previews (WhatsApp, LinkedIn) need per-piece OG images, which `opengraph-image.tsx` cannot generate (it doesn't receive `searchParams`) — so `/og/peca?slug=...` is a plain route handler instead, and `generateMetadata` in `app/page.tsx` points there whenever a piece is open.

`metadataBase` and every OG URL are built from `site.config.ts`'s `MARCA.url`, which reads `VERCEL_PROJECT_PRODUCTION_URL` (the stable production domain), never `VERCEL_URL` (the per-deploy URL, which changes on every push and would leave `canonical`/`og:url` pointing at a dead address the next day — this already happened once, on an earlier piece in this same portfolio).

`MARCA` is never imported by a client component, directly or transitively — `VERCEL_PROJECT_PRODUCTION_URL` doesn't exist in the client bundle, so if it leaked into `Plano.tsx`'s import chain, `url` would silently become `localhost:3000` in production with no build error.

## Adding a new piece

Add one entry to the `PECAS` array in `lib/manifesto.ts` — `slug`, `nome`, `capacidade`, `grupo`, a hand-picked `posicao`, `url`, optional `repo`, `stack`, `oQueProva`. Nothing else changes: no new route, no CMS, no database. A group with zero pieces is simply never rendered, in either mode.

## Stack

Next.js 15 (App Router), TypeScript (strict), Tailwind CSS v4 (CSS-first config, no `tailwind.config.js`), GSAP core only (no plugins), Inter via `next/font/google`. No canvas element, no photos, no third-party pan/zoom/physics library.

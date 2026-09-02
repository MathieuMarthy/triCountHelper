# SplitTicket

A progressive web application (PWA) to photograph receipts, extract items and amounts via vision AI, assign each item to one or more people, and accurately compute what everyone owes.

No accounts, no central backend, no sync. All data stays in the device's browser. **Two explicit exceptions only**: the receipt image sent to Google Gemini when scanning a receipt, and the summary dispatched to Tricount if you explicitly enable that integration.

---

## Prerequisites

- **Node.js**: version 18+ or 20+ (LTS recommended) and `npm`
- **Google Gemini API Key** (optional, required for automatic receipt OCR): you can generate one for free in a few seconds on [Google AI Studio](https://aistudio.google.com/).

---

## Getting Started

1. **Clone the repository and install dependencies**:
   ```bash
   git clone https://github.com/MathieuMarthy/triCountHelper.git
   cd triCountHelper
   npm install
   ```

2. **Configuration (optional)**:
   If you want to enable the experimental Tricount integration in your development UI:
   ```bash
   cp .env.example .env.local
   ```
   Set `VITE_TRICOUNT_ENABLED=true` in `.env.local`.

3. **Start the development server**:
   ```bash
   npm run dev
   ```
   Open the printed URL (typically `http://localhost:5173`) in your browser.

4. **Configure your Gemini API key**:
   Enter your API key in **Settings** (gear icon). It is stored securely on your device inside IndexedDB.
   Without a key, everything else still works: manual item entry, Canadian tax calculation, tip splitting, and text export.

| Command | Description |
|---|---|
| `npm run dev` | Local development server with Hot Module Replacement |
| `npm run build` | Optimized production build in `dist/` |
| `npm run preview` | Serves `dist/` locally with active service worker |
| `npm test` | Run unit test suite (Vitest) |
| `npm run typecheck` | Run TypeScript type checking |

The resulting `dist/` folder is under 300 KB: pure static files. Any static host (Cloudflare Pages, Netlify, GitHub Pages, Vercel) works. For sub-path deployments (e.g. GitHub Pages), configure `base` in `vite.config.ts`.

---

## Docker

The Docker image builds the app with Node and serves it via nginx; the final image (~49 MB) contains neither Node nor build dependencies.

```bash
docker build -t splitticket .
docker run -d -p 8080:80 splitticket
```

Two optional build arguments:

| `--build-arg` | Effect |
|---|---|
| `VITE_TRICOUNT_ENABLED` | `true` makes the Tricount integration appear in UI. Default: `false`. |
| `VITE_TRICOUNT_RELAY_URL` | Default relay endpoint URL. Default: `/api/tricount`. |

```bash
docker build -t splitticket \
  --build-arg VITE_TRICOUNT_ENABLED=true \
  --build-arg VITE_TRICOUNT_RELAY_URL=https://relay.example.com/api/tricount .
```

These values are baked into the client bundle and are public: **never pass secrets here**. The relay authentication token is entered in the in-app Settings on each device.

`docker/nginx.conf` serves the app at root: immutable cache for hashed `/assets/`, `no-cache` for `index.html`, `sw.js`, and the manifest (the three controlling updates), with fallback to `index.html` for client routing. The container listens on HTTP; terminate TLS at your reverse proxy (required for PWA installation and service worker).

---

## User Flow

```
Home ─→ Capture ─→ Processing ─→ Verification ─→ Assignment ─→ Results
  ↑                                                               │
  └───────────────────────────────────────────────────────────────┘
```

Every step is auto-saved: closing and reopening the app restores your progress. A **fully manual entry mode** is accessible from Home; useful for testing the calculation pipeline without relying on the vision model.

**Offline support**: only photo OCR requires internet access. Everything else (manual entry, adjustments, tax assignment, calculations, export) works completely offline.

---

## Precision Financial Arithmetic

All monetary values are **integer cents**. Floating point numbers are never used to represent money. Currency: Canadian Dollar (CAD).

Splitting a line item between multiple people uses the **Largest Remainder Method** (`src/lib/split.ts`): each participant receives the integer floor of their share, and remainder cents are awarded to the highest decimal fractions (broken ties broken by participant order, never at random, ensuring deterministic recalculations).

**Core Invariant**:
> Sum of amounts owed === Assigned subtotal + Distributed taxes + Adjustments + Tip

Tested against randomly generated receipts with mixed tax bases, discounts, and tips.

### Canadian Sales Taxes

Unlike French/European receipts where displayed prices are tax-inclusive (TTC), **Canadian item prices are pre-tax (HT)**. GST/TPS, PST/TVQ, or HST/TVH are added at the bottom of the receipt.

Crucially, **the taxable base is not simply each person's subtotal**: basic groceries are zero-rated / exempt. Each tax is distributed across *its own base*—the sum of assigned items subject to that specific tax. Someone who only bought milk and bread does not pay sales tax on someone else's beer or soap.

Each item line has `taxCodes`: `null` for "all receipt taxes apply", `[]` for tax-exempt, or a list of applicable tax codes (e.g. books in Quebec: GST applies, QST zero-rated at register). The vision model suggests tax codes, and a per-item checkbox allows manual corrections.

**The printed tax amount is authoritative.** The app never recomputes taxes from percentages; register rounding varies, and the physical receipt is the source of truth. Rates are stored only as hints.

### Tips

Tips are not printed on the merchant receipt, so they do not enter the `subtotal + taxes = total` validation check, but they do enter the total split.

Tips are configured on the Results screen: percentage presets, custom amounts, and calculation base (default: **pre-tax subtotal**, with an option for tax-inclusive). Tips are distributed pro-rata based on individual consumption via the largest remainder method.

---

## Receipt Vision OCR

A vision model (Gemini) extracts structured JSON: line items, quantities, pre-tax prices, taxable indicators, bottom-of-receipt tax breakdown, merchant, date, subtotal, and total.

```
src/capture/image.ts       Image crop, rotation, compression
src/extraction/gemini.ts   Model invocation, output schema, errors
src/extraction/normalize.ts Output sanitization & validation (everything passes here)
src/extraction/types.ts    Downstream consumption contract
```

### Strict Guardrails

- **Amounts are requested as strings, not numbers**: The model outputs `"12.90"`, and `parseAmountToCents` parses it. No LLM float ever touches money.
- **Strict normalization (`normalize.ts`)**: LLM outputs are plausible by design, hence unverified by default. Lines without readable amounts are discarded rather than coerced to zero, aberrant quantities default to 1, hallucinated dates become `null`, taxes without amounts are rejected, and `GST`/`TPS` are normalized to identical codes to prevent double-counting.
- **Verification Screen**: The validation banner `subtotal + taxes = printed total` detects hallucinations immediately. The model also tags uncertain lines (`uncertain: true`), displaying visual indicators on those rows.

### Latency Optimization

- **Image downscaling before upload**: (≤ 1.6 Mpx, max width 1400 px) avoids uploading large 8 Mpx photos over mobile connections.
- **Thinking budget disabled**: (`thinkingConfig.thinkingBudget: 0`) cuts inference latency.

---

## Design System

Minimalist tokens (`src/styles/tokens.css`): five shades of gray, amber reserved strictly for discrepancy alerts, and six desaturated hues for participant badges. No unnecessary validation greens or decorative gradients: **a correct state is signaled by the absence of alerts**. Tabular figures for all currency numbers.

---

## Tricount Integration (Experimental)

> [!CAUTION]
> Tricount (owned by bunq) **does not offer an official public API**. The module in `src/integrations/tricount/` communicates with an unofficial reverse-engineered Android client.
> - Upstream endpoints can break at any time without notice.
> - Usage falls outside official Terms of Service.
> - Browser apps cannot call Tricount directly (CORS and signature restrictions), requiring a standalone relay service.

The relay delegates the protocol to [`tricount-api`](https://github.com/elrandar/tricount-api). **No Tricount app API key is needed**: the client generates an Android device keypair on its first run and joins tricounts via their public share code.

The relay runs as an independent service (see the companion project [`tricountApi`](https://github.com/Ziroles/tricountApi)), accessed via its URL and static bearer token.

Participants are matched automatically: they share the same names as members in the Tricount.

### Connecting to the Relay

Configured in the in-app **Settings** screen and persisted locally in IndexedDB:

| Setting | Description |
|---|---|
| **Relay URL** | Full URL (`https://...` or `http://localhost:8787`) or same-origin path (`/api/tricount`). |
| **Relay Token** | 32-character secret key sent via `Authorization: Bearer ...`. |

The feature is guarded by a compile-time build flag (`VITE_TRICOUNT_ENABLED`, defaults to `false`). See `.env.example`.

### Plain Text Fallback (Always Reliable)

The "Copy summary" button generates:

```
Chez Victoire — 2026-03-14
Subtotal: $50.00 · Taxes: $7.49
Tip: $9.00
Total: $66.49

Mathieu: $39.89
Lea: $26.60
```

Individual amount copy buttons let you paste each person's exact share directly into Tricount or any payment app. Works offline and will never break.

---

## Project Structure

```
src/
  lib/          Financial math, split logic, taxes, tip, export
  capture/      Camera, image cropping, rotation, compression
  extraction/   Gemini model calls, validation, normalization schema
  db/           IndexedDB schema (receipts, images, participants, settings)
  store/        Zustand application state and debounced writes
  ui/           UI primitives: screen, buttons, bottom sheets, badges, amount inputs
  screens/      The six screens of the user journey
  integrations/ Tricount integration (isolated & toggleable)
  styles/       Design tokens and single CSS sheet
docker/         nginx configuration for production container
```

---

## License

Open source project.

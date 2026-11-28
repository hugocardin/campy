# Campy

Online campground booking and management (Next.js + Supabase).

## Prerequisites

- Node.js **24** (see `.nvmrc`) and npm **11**
- A Supabase project (URL + anon key; service role for admin/cron paths)

Copy your keys into `.env.local` (not committed):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Optional: `NEXT_PUBLIC_SITE_URL`, `PHOTON_API_URL`, `CRON_SECRET` (see `supabase/README.md` for schema/Storage notes).

```bash
npm ci
```

## Run locally

**Day-to-day development** (hot reload — use this most of the time):

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Production mode** locally (`next start` serves a prior build; it does **not** compile):

```bash
npm run build
npm run start
```

If you see `Could not find a production build in the '.next' directory`, run `npm run build` first, then `npm run start` again.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build into `.next/` |
| `npm run start` | Serve the existing production build |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (`tsx --test`) |

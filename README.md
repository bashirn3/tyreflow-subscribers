# TyreFlow Subscribers

Small Vercel-ready admin frontend for adding and managing TyreFlow subscriber rows.

The app writes to the existing Supabase table:

```sql
tyreflow_subscribers (
  id,
  name,
  phone,
  postcode,
  miles,
  lat,
  lon,
  active,
  created_at
)
```

Postcodes are geocoded through `postcodes.io` before saving, so n8n can match jobs quickly without geocoding every subscriber on every job.

## Getting Started

Create `.env.local`:

```bash
SUPABASE_URL=https://pzhahidkjxihhxzzxevz.supabase.co
SUPABASE_ANON_KEY=your-supabase-publishable-key
```

Install and run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Vercel

Set these environment variables in Vercel:

```bash
SUPABASE_URL=https://pzhahidkjxihhxzzxevz.supabase.co
SUPABASE_ANON_KEY=your-supabase-publishable-key
```

Optional later:

```bash
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Only use the service role key server-side. Never expose it with `NEXT_PUBLIC_`.

## Supabase migrations

Run the existing subscriber schema first, then run:

```text
supabase/tyreflow-subscriber-coverages-schema.sql
supabase/tyreflow-subscriber-payment-notes-schema.sql
```

The coverage table enables multiple city, area, and radius coverages per
subscriber. Until it exists, the workflow falls back to the legacy
`postcode/miles` columns.

The payment/notes migration adds `paid_status` and editable notes to each
subscriber. New rows default to `trial` with `Agreed £50`.

## Notes

- Phone numbers are normalized to digits only.
- Saving a subscriber with the same phone updates the existing row.
- Coverage entries like `LA`, `L1`, and `Manchester` are saved as city or area
  matches.
- Paid status is admin-only for now. Matching still uses active state and
  coverage.
- Delete removes the row from Supabase.
- Pause flips `active` to false without deleting the row.

Design guidance is installed at `.agents/skills/design-taste-frontend`.

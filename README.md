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

## Notes

- Phone numbers are normalized to digits only.
- Saving a subscriber with the same phone updates the existing row.
- Delete removes the row from Supabase.
- Pause flips `active` to false without deleting the row.

Design guidance is installed at `.agents/skills/design-taste-frontend`.

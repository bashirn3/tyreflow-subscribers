# TyreFlow Dashboard

Small Vercel-ready admin frontend for TyreFlow subscriber matching and the
TyreFlow lead dialer.

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

The lead dialer is available at [http://localhost:3000/dialer](http://localhost:3000/dialer).

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
supabase/tyreflow-dialer-schema.sql
supabase/tyreflow-inbound-leads-schema.sql
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

## TyreFlow dialer

The `/dialer` route opens with a caller picker for Saalah, Arslan, and Ayaz. It
then loads that caller's own queue so they can claim 25 unassigned leads, record
the call from the browser microphone, save notes, and create follow-up tasks.

The admin dashboard lives separately at `/dialer/admin` and requires
`DIALER_ADMIN_PIN`. If the env var is not set, the default PIN is `9448`.

Initial lead import:

```bash
npm run import:dialer-leads
```

By default this imports `tyres_deduped_priority_2.csv` from the project root.
The import upserts by `Phone Number` into `tyreflow_dialer_leads`.

Dialer exclusions:

- Leads in the `Tyres Anywhere Live` group are marked `excluded`.
- Leads with `M25`, `logistics`, or `Tyres` in their contact name are marked
  `excluded`.
- Excluded leads stay in Supabase for audit/recovery, but they are hidden from
  dialer queues and are never claimed by the 25-lead assignment RPC.

Recording notes:

- Browser recording uses the caller's microphone, so the phone should be on
  speaker like the MOT reference app.
- Audio files are uploaded by the server route to the private Supabase Storage
  bucket `tyreflow-dialer-recordings`.
- `SUPABASE_SERVICE_ROLE_KEY` is recommended on Vercel for recording upload and
  playback because the bucket is private.
- WhatsApp and voice-note outcomes are tasks only in V1. Nothing is sent.

## TyreFlow inbound leads

Wasup1 inbound messages that are not valid `Send location` requests should not
go to the old Crawl4AI/dental flow. They are logged through
`tyreflow_log_inbound_lead` into `tyreflow_inbound_leads` and forwarded as an
internal lead alert to the configured TyreFlow admins.

Design guidance is installed at `.agents/skills/design-taste-frontend`.

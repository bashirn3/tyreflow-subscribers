import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SubscriberPayload = {
  id?: number;
  name?: string;
  phone?: string;
  postcode?: string;
  miles?: number | string;
  active?: boolean;
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function requireConfig() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY env vars.");
  }
}

function normalizePhone(value: unknown) {
  return String(value || "").replace(/[^0-9]/g, "");
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  requireConfig();

  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: supabaseKey!,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = data?.message || data?.error || response.statusText;
    throw new Error(detail);
  }

  return data;
}

async function geocodePostcode(postcode: string) {
  const compact = postcode.replace(/\s+/g, "");
  const postcodeResponse = await fetch(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`,
    { cache: "no-store" },
  );
  let geo = await postcodeResponse.json();

  if (!geo.result) {
    const outcodeResponse = await fetch(
      `https://api.postcodes.io/outcodes/${encodeURIComponent(compact)}`,
      { cache: "no-store" },
    );
    geo = await outcodeResponse.json();
  }

  if (!geo.result || typeof geo.result.latitude !== "number") {
    throw new Error("Could not geocode that postcode.");
  }

  return {
    lat: geo.result.latitude,
    lon: geo.result.longitude,
  };
}

export async function GET() {
  try {
    const data = await supabaseFetch(
      "/rest/v1/tyreflow_subscribers?select=id,name,phone,postcode,miles,lat,lon,active,created_at&order=created_at.desc",
    );
    return NextResponse.json({ subscribers: data || [] });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Fetch failed", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubscriberPayload;
    const name = String(body.name || "").trim();
    const phone = normalizePhone(body.phone);
    const postcode = String(body.postcode || "").trim().toUpperCase();
    const miles = Number(body.miles);

    if (!name) return jsonError("Name is required.");
    if (!phone) return jsonError("Phone number is required.");
    if (!postcode) return jsonError("Postcode is required.");
    if (!Number.isFinite(miles) || miles <= 0) {
      return jsonError("Miles must be a positive number.");
    }

    const { lat, lon } = await geocodePostcode(postcode);
    const row = {
      name,
      phone,
      postcode,
      miles,
      lat,
      lon,
      active: body.active ?? true,
    };

    const data = await supabaseFetch(
      "/rest/v1/tyreflow_subscribers?on_conflict=phone",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(row),
      },
    );

    return NextResponse.json({ subscriber: data?.[0] || row });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Save failed", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as SubscriberPayload;
    if (!body.id) return jsonError("Subscriber id is required.");

    const patch: Partial<SubscriberPayload> = {};
    if (typeof body.active === "boolean") patch.active = body.active;
    if (!Object.keys(patch).length) return jsonError("Nothing to update.");

    const data = await supabaseFetch(
      `/rest/v1/tyreflow_subscribers?id=eq.${body.id}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch),
      },
    );

    return NextResponse.json({ subscriber: data?.[0] || null });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Update failed", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as SubscriberPayload;
    if (!body.id) return jsonError("Subscriber id is required.");

    await supabaseFetch(`/rest/v1/tyreflow_subscribers?id=eq.${body.id}`, {
      method: "DELETE",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Delete failed", 500);
  }
}

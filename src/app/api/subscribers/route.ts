import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type SubscriberPayload = {
  id?: number;
  name?: string;
  phone?: string;
  postcode?: string;
  miles?: number | string;
  active?: boolean;
  coverages?: CoveragePayload[];
};

type CoveragePayload = {
  id?: number;
  coverage_type?: "radius" | "prefix";
  type?: "radius" | "prefix";
  code?: string;
  value?: string;
  label?: string | null;
  postcode?: string | null;
  miles?: number | string | null;
};

const cityCoverageLabels: Record<string, string> = {
  LA: "Lancaster",
  L1: "Liverpool",
  M1: "Manchester",
  WA: "Warrington",
  CH: "Cheshire",
  PR: "Preston",
  CW: "Crewe",
  LS: "Leeds",
  BD: "Bradford",
  HD: "Huddersfield",
  HX: "Halifax",
  OL: "Rochdale",
  SK: "Stockport",
  FY: "Blackpool",
  DN: "Doncaster",
  WN: "Wigan",
  BL: "Bolton",
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

function normalizeCode(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
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

function isMissingTableError(error: unknown) {
  return error instanceof Error && error.message.includes("Could not find the table");
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

async function fetchCoverageRows() {
  try {
    return await supabaseFetch(
      "/rest/v1/tyreflow_subscriber_coverages?select=id,subscriber_id,coverage_type,code,label,postcode,miles,lat,lon,active,created_at&order=created_at.asc",
    );
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

async function normalizeCoverage(input: CoveragePayload) {
  const code = normalizeCode(input.code || input.value || input.postcode);
  if (!code) throw new Error("Coverage code is required.");

  const requestedType = input.coverage_type || input.type;
  const knownLabel = cityCoverageLabels[code];
  const coverageType = requestedType || (knownLabel ? "prefix" : "radius");
  const label = normalizeCode(input.label) || knownLabel || null;

  if (coverageType === "prefix") {
    return {
      coverage_type: "prefix",
      code,
      label,
      postcode: null,
      miles: null,
      lat: null,
      lon: null,
      active: true,
    };
  }

  const miles = Number(input.miles);
  if (!Number.isFinite(miles) || miles <= 0) {
    throw new Error(`Miles must be set for ${code}.`);
  }

  const { lat, lon } = await geocodePostcode(code);
  return {
    coverage_type: "radius",
    code,
    label,
    postcode: code,
    miles,
    lat,
    lon,
    active: true,
  };
}

export async function GET() {
  try {
    const subscribers = await supabaseFetch(
      "/rest/v1/tyreflow_subscribers?select=id,name,phone,postcode,miles,lat,lon,active,created_at&order=created_at.desc",
    );
    const coverages = await fetchCoverageRows();
    const coverageBySubscriber = new Map<number, unknown[]>();

    for (const coverage of coverages || []) {
      const id = Number(coverage.subscriber_id);
      coverageBySubscriber.set(id, [
        ...(coverageBySubscriber.get(id) || []),
        coverage,
      ]);
    }

    const rows = (subscribers || []).map((subscriber: SubscriberPayload & { id: number }) => {
      const explicitCoverages = coverageBySubscriber.get(subscriber.id) || [];
      const legacyCoverage =
        subscriber.postcode && subscriber.miles
          ? [
              {
                id: null,
                subscriber_id: subscriber.id,
                coverage_type: "radius",
                code: subscriber.postcode,
                label: null,
                postcode: subscriber.postcode,
                miles: subscriber.miles,
                lat: (subscriber as { lat?: number | null }).lat ?? null,
                lon: (subscriber as { lon?: number | null }).lon ?? null,
                active: subscriber.active,
                legacy: true,
              },
            ]
          : [];

      return {
        ...subscriber,
        coverages: explicitCoverages.length ? explicitCoverages : legacyCoverage,
      };
    });

    return NextResponse.json({ subscribers: rows });
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
    const coverageInputs =
      body.coverages && body.coverages.length
        ? body.coverages
        : [{ coverage_type: "radius" as const, code: postcode, miles }];

    if (!name) return jsonError("Name is required.");
    if (!phone) return jsonError("Phone number is required.");
    if (!postcode) return jsonError("Postcode is required.");
    if (!Number.isFinite(miles) || miles <= 0) {
      return jsonError("Miles must be a positive number.");
    }

    const { lat, lon } = await geocodePostcode(postcode);
    const normalizedCoverages = [];
    for (const coverage of coverageInputs) {
      normalizedCoverages.push(await normalizeCoverage(coverage));
    }

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

    const savedSubscriber = data?.[0] || row;
    const subscriberId = savedSubscriber.id;

    let coverageWarning: string | null = null;

    if (subscriberId) {
      try {
        await supabaseFetch(
          `/rest/v1/tyreflow_subscriber_coverages?subscriber_id=eq.${subscriberId}`,
          { method: "DELETE" },
        );

        if (normalizedCoverages.length) {
          await supabaseFetch("/rest/v1/tyreflow_subscriber_coverages", {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(
              normalizedCoverages.map((coverage) => ({
                ...coverage,
                subscriber_id: subscriberId,
              })),
            ),
          });
        }
      } catch (error) {
        if (!isMissingTableError(error)) throw error;
        coverageWarning =
          "Subscriber saved, but coverage rows were not saved because the coverage table migration has not been run.";
      }
    }

    return NextResponse.json({
      subscriber: { ...savedSubscriber, coverages: normalizedCoverages },
      coverageWarning,
    });
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

import { NextResponse } from "next/server";
import { normalizeCaller } from "@/lib/dialer";
import { normalizeUkSubscriberPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

type SubscriberPayload = {
  id?: number;
  name?: string;
  phone?: string;
  postcode?: string;
  miles?: number | string;
  active?: boolean;
  paid_status?: "paid" | "trial";
  notes?: string;
  coverages?: CoveragePayload[];
  created_by_caller_id?: string | null;
  created_by_caller_name?: string | null;
  created_from?: string | null;
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

const manualSubscriberOwners = [
  { id: "arslan", name: "Arslan" },
  { id: "umer", name: "Umer" },
  { id: "saleh", name: "Saalah" },
  { id: "ayaz", name: "Ayaz" },
] as const;

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function requireConfig() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY env vars.");
  }
}

function normalizeCode(value: unknown) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeSubscriberOwner(body: SubscriberPayload) {
  const rawId = String(body.created_by_caller_id || "").trim();
  const rawName = String(body.created_by_caller_name || "").trim();

  if (rawId) {
    const key = rawId.toLowerCase().replace(/[^a-z0-9]+/g, "");
    const manualOwner = manualSubscriberOwners.find((owner) => owner.id === key);
    const callerOwner = normalizeCaller(rawId);
    const owner = manualOwner || callerOwner;
    if (owner) return { id: owner.id, name: owner.name };
    if (!rawName) throw new Error("Unknown subscriber owner.");
  }

  if (rawName) {
    const manualOwner = manualSubscriberOwners.find(
      (owner) => owner.name.toLowerCase() === rawName.toLowerCase(),
    );
    if (manualOwner) return { id: manualOwner.id, name: manualOwner.name };
    return { id: null, name: rawName };
  }

  throw new Error("Added by is required.");
}

function normalizeCreatedFrom(value: unknown, hasExplicitSource: boolean) {
  const source = String(value || "").trim();
  if (source) return source.slice(0, 64);
  return hasExplicitSource ? "subscriber_dashboard" : "dialer";
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

function isMissingColumnError(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes("Could not find") || error.message.includes("does not exist"))
  );
}

async function fetchSubscriberRows(ownerCallerId?: string) {
  const ownershipFilter = ownerCallerId
    ? `&created_by_caller_id=eq.${encodeURIComponent(ownerCallerId)}`
    : "";

  try {
    const rows = await supabaseFetch(
      `/rest/v1/tyreflow_subscribers?select=id,name,phone,postcode,miles,lat,lon,active,paid_status,notes,created_at,created_by_caller_id,created_by_caller_name,created_from${ownershipFilter}&order=created_at.desc`,
    );
    return { rows, ownershipWarning: null };
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;
    const missingDetail = error instanceof Error ? error.message : "";

    if (ownerCallerId) {
      return {
        rows: [],
        ownershipWarning:
          "Subscriber ownership columns are missing. Run supabase/tyreflow-subscriber-ownership-schema.sql.",
      };
    }

    if (missingDetail.includes("created_by_caller")) {
      const rows = await supabaseFetch(
        "/rest/v1/tyreflow_subscribers?select=id,name,phone,postcode,miles,lat,lon,active,paid_status,notes,created_at&order=created_at.desc",
      );
      return {
        rows: (rows || []).map((row: SubscriberPayload) => ({
          ...row,
          created_by_caller_id: null,
          created_by_caller_name: null,
          created_from: null,
        })),
        ownershipWarning: null,
      };
    }

    const rows = await supabaseFetch(
      "/rest/v1/tyreflow_subscribers?select=id,name,phone,postcode,miles,lat,lon,active,created_at&order=created_at.desc",
    );
    return {
      rows: (rows || []).map((row: SubscriberPayload) => ({
        ...row,
        paid_status: "trial",
        notes: "Agreed £50",
        created_by_caller_id: null,
        created_by_caller_name: null,
        created_from: null,
      })),
      ownershipWarning: null,
    };
  }
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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ownerParam =
      url.searchParams.get("created_by_caller_id") || url.searchParams.get("caller_id");
    const ownerCaller = ownerParam ? normalizeCaller(ownerParam) : null;
    if (ownerParam && !ownerCaller) return jsonError("Unknown subscriber owner.");

    const { rows: subscribers, ownershipWarning } = await fetchSubscriberRows(ownerCaller?.id);
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

    return NextResponse.json({ subscribers: rows, ownershipWarning });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Fetch failed", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubscriberPayload;
    const name = String(body.name || "").trim();
    let phone = "";
    try {
      phone = normalizeUkSubscriberPhone(body.phone);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Invalid phone number.");
    }
    const postcode = String(body.postcode || "").trim().toUpperCase();
    const miles = Number(body.miles);
    const paidStatus = body.paid_status === "paid" ? "paid" : "trial";
    const notes = String(body.notes || "Agreed £50").trim() || "Agreed £50";
    let owner;
    try {
      owner = normalizeSubscriberOwner(body);
    } catch (error) {
      return jsonError(error instanceof Error ? error.message : "Added by is required.");
    }
    const createdFrom = normalizeCreatedFrom(
      body.created_from,
      Boolean(body.created_by_caller_name),
    );
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
      paid_status: paidStatus,
      notes,
      created_by_caller_id: owner.id,
      created_by_caller_name: owner.name,
      created_from: createdFrom,
    };

    let data;
    try {
      data = body.id
        ? await supabaseFetch(
            `/rest/v1/tyreflow_subscribers?id=eq.${body.id}`,
            {
              method: "PATCH",
              headers: { Prefer: "return=representation" },
              body: JSON.stringify(row),
            },
          )
        : await supabaseFetch(
            "/rest/v1/tyreflow_subscribers?on_conflict=phone",
            {
              method: "POST",
              headers: { Prefer: "resolution=merge-duplicates,return=representation" },
              body: JSON.stringify(row),
            },
          );
    } catch (error) {
      if (!isMissingColumnError(error)) throw error;
      const missingDetail = error instanceof Error ? error.message : "";
      if (missingDetail.includes("created_by_caller")) {
        throw new Error(
          "Subscriber ownership columns are missing. Run supabase/tyreflow-subscriber-ownership-schema.sql.",
        );
      }

      const legacyRow: Record<string, unknown> = { ...row };
      delete legacyRow.paid_status;
      delete legacyRow.notes;
      delete legacyRow.created_by_caller_id;
      delete legacyRow.created_by_caller_name;
      delete legacyRow.created_from;
      data = body.id
        ? await supabaseFetch(
            `/rest/v1/tyreflow_subscribers?id=eq.${body.id}`,
            {
              method: "PATCH",
              headers: { Prefer: "return=representation" },
              body: JSON.stringify(legacyRow),
            },
          )
        : await supabaseFetch(
            "/rest/v1/tyreflow_subscribers?on_conflict=phone",
            {
              method: "POST",
              headers: { Prefer: "resolution=merge-duplicates,return=representation" },
              body: JSON.stringify(legacyRow),
            },
          );
    }

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

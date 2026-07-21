import {
  DIALER_OUTCOME_LABELS,
  fetchDialerRecordings,
  jsonError,
  normalizeCaller,
  RECORDINGS_BUCKET,
  supabaseFetch,
  supabaseStorageFetch,
  type DialerOutcome,
  type DialerRecording,
} from "@/lib/dialer";

export const dynamic = "force-dynamic";

function extFromMime(mime: string) {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mpeg")) return "mp3";
  return "audio";
}

function normalizeOutcome(value: FormDataEntryValue | null): DialerOutcome | null {
  const raw = String(value || "");
  return raw in DIALER_OUTCOME_LABELS ? (raw as DialerOutcome) : null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const leadId = Number(url.searchParams.get("lead_id") || 0);
    const recordings = await fetchDialerRecordings(Number.isFinite(leadId) && leadId > 0 ? leadId : undefined);
    return Response.json({ recordings });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load recordings.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("audio");
    if (!(file instanceof Blob)) return jsonError("Audio file is required.");

    const leadId = Number(form.get("lead_id"));
    if (!Number.isFinite(leadId) || leadId <= 0) return jsonError("lead_id is required.");

    const caller = normalizeCaller(form.get("caller_id"));
    if (!caller) return jsonError("Choose Umer, Arslan, or Ayaz.");

    const mime = file.type || String(form.get("mime_type") || "audio/webm");
    const ext = String(form.get("ext") || extFromMime(mime));
    const id = String(form.get("id") || crypto.randomUUID());
    const storagePath = `${leadId}/${id}.${ext}`;
    const arrayBuffer = await file.arrayBuffer();
    const outcome = normalizeOutcome(form.get("outcome"));

    await supabaseStorageFetch(
      `/storage/v1/object/${RECORDINGS_BUCKET}/${storagePath}`,
      {
        method: "POST",
        headers: {
          "Content-Type": mime,
          "x-upsert": "false",
        },
        body: arrayBuffer,
      },
    );

    const inserted = await supabaseFetch<DialerRecording[]>(
      "/rest/v1/tyreflow_dialer_recordings",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          id,
          lead_id: leadId,
          caller_id: caller.id,
          caller_name: caller.name,
          outcome,
          storage_bucket: RECORDINGS_BUCKET,
          storage_path: storagePath,
          mime_type: mime,
          ext,
          duration_ms: Number(form.get("duration_ms") || 0) || null,
          size: arrayBuffer.byteLength,
          created_at: String(form.get("created_at") || new Date().toISOString()),
        }),
      },
    );

    return Response.json({ ok: true, recording: inserted?.[0] || null });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Recording upload failed.", 500);
  }
}

import {
  jsonError,
  RECORDINGS_BUCKET,
  supabaseFetch,
  supabaseStorageFetch,
  type DialerRecording,
} from "@/lib/dialer";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function getRecording(id: string) {
  const rows = await supabaseFetch<DialerRecording[]>(
    `/rest/v1/tyreflow_dialer_recordings?id=eq.${encodeURIComponent(id)}&select=*&limit=1`,
  );

  return rows?.[0] || null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const recording = await getRecording(id);
    if (!recording) return jsonError("Recording not found.", 404);

    const response = await supabaseStorageFetch(
      `/storage/v1/object/${recording.storage_bucket || RECORDINGS_BUCKET}/${recording.storage_path}`,
    );

    const audio = await response.arrayBuffer();
    return new Response(audio, {
      headers: {
        "Content-Type": recording.mime_type || "audio/webm",
        "Content-Length": String(audio.byteLength),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not stream recording.", 500);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const recording = await getRecording(id);
    if (!recording) return jsonError("Recording not found.", 404);

    await supabaseStorageFetch(
      `/storage/v1/object/${recording.storage_bucket || RECORDINGS_BUCKET}/${recording.storage_path}`,
      { method: "DELETE" },
    );

    await supabaseFetch(`/rest/v1/tyreflow_dialer_recordings?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
    });

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not delete recording.", 500);
  }
}

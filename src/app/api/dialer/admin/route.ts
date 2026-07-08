import {
  buildDialerStats,
  fetchDialerEvents,
  fetchDialerLeads,
  fetchDialerRecordings,
  fetchDialerTasks,
  jsonError,
} from "@/lib/dialer";

export const dynamic = "force-dynamic";

function adminPin() {
  return process.env.DIALER_ADMIN_PIN || "9448";
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { pin?: string };
    if (String(body.pin || "").trim() !== adminPin()) {
      return jsonError("Invalid admin PIN.", 403);
    }

    const [leads, tasks, events, recordings] = await Promise.all([
      fetchDialerLeads(undefined, { includeSubscriberPhones: true }),
      fetchDialerTasks(),
      fetchDialerEvents(),
      fetchDialerRecordings(),
    ]);

    return Response.json({
      leads,
      tasks,
      events,
      recordings,
      stats: buildDialerStats({ leads, tasks, events, recordings }),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load admin.", 500);
  }
}

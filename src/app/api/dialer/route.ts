import {
  buildDialerStats,
  claimDialerLeads,
  completeDialerTask,
  DIALER_OUTCOME_LABELS,
  fetchDialerEvents,
  fetchDialerLeads,
  fetchDialerRecordings,
  fetchDialerTasks,
  jsonError,
  normalizeCaller,
  recordDialerOutcome,
  type DialerOutcome,
} from "@/lib/dialer";

export const dynamic = "force-dynamic";

type DialerPostBody = {
  action?: string;
  caller_id?: string;
  lead_id?: number;
  task_id?: number;
  outcome?: DialerOutcome;
  notes?: string;
  call_seconds?: number;
  due_at?: string | null;
  limit?: number;
};

function isDialerOutcome(value: unknown): value is DialerOutcome {
  return typeof value === "string" && value in DIALER_OUTCOME_LABELS;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const caller = normalizeCaller(url.searchParams.get("caller_id"));
    const all = url.searchParams.get("view") === "admin";
    const callerId = all ? undefined : caller?.id;

    const [leads, statsLeads, tasks, events, recordings] = await Promise.all([
      fetchDialerLeads(callerId),
      fetchDialerLeads(callerId, { includeSubscriberPhones: true }),
      fetchDialerTasks(callerId),
      fetchDialerEvents(callerId),
      fetchDialerRecordings(),
    ]);

    return Response.json({
      leads,
      tasks,
      events,
      recordings,
      stats: buildDialerStats({ leads: statsLeads, tasks, events, recordings }),
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Could not load dialer.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as DialerPostBody;
    const action = body.action || "";

    if (action === "claim") {
      const caller = normalizeCaller(body.caller_id);
      if (!caller) return jsonError("Choose Saalah, Arslan, or Ayaz.");

      const claimed = await claimDialerLeads(
        caller,
        Math.max(1, Math.min(100, Number(body.limit) || 25)),
      );

      return Response.json({ ok: true, claimed: claimed.length, leads: claimed });
    }

    if (action === "outcome") {
      const caller = normalizeCaller(body.caller_id);
      if (!caller) return jsonError("Choose Saalah, Arslan, or Ayaz.");
      if (!body.lead_id) return jsonError("lead_id is required.");
      if (!isDialerOutcome(body.outcome)) return jsonError("Valid outcome is required.");

      const event = await recordDialerOutcome({
        leadId: Number(body.lead_id),
        caller,
        outcome: body.outcome,
        notes: body.notes,
        callSeconds: body.call_seconds,
        dueAt: body.due_at,
      });

      return Response.json({ ok: true, event });
    }

    if (action === "complete_task") {
      if (!body.task_id) return jsonError("task_id is required.");
      const task = await completeDialerTask(Number(body.task_id));
      return Response.json({ ok: true, task: task?.[0] || null });
    }

    return jsonError("Unknown dialer action.");
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Dialer action failed.", 500);
  }
}

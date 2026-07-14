export type DialerCaller = {
  id: string;
  name: string;
};

export type DialerOutcome =
  | "not_interested"
  | "no_answer"
  | "callback"
  | "send_whatsapp"
  | "send_voice_note"
  | "closed";

export type DialerTaskType = "callback" | "send_whatsapp" | "send_voice_note";

export type DialerLead = {
  id: number;
  phone: string;
  display_name: string;
  public_display_name: string | null;
  saved_name: string | null;
  country_code: string | null;
  country: string | null;
  assigned_group: string | null;
  groups_count: number;
  all_groups: string | null;
  is_my_contact: boolean;
  is_business: boolean;
  status: "unassigned" | "assigned" | "called" | "closed" | "excluded";
  assigned_to: string | null;
  assigned_name: string | null;
  assigned_at: string | null;
  last_outcome: DialerOutcome | null;
  last_note: string | null;
  last_called_at: string | null;
  excluded_reason: string | null;
  excluded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DialerTask = {
  id: number;
  lead_id: number;
  caller_id: string;
  caller_name: string;
  task_type: DialerTaskType;
  due_at: string | null;
  notes: string | null;
  status: "open" | "done";
  created_at: string;
  completed_at: string | null;
};

export type DialerCallEvent = {
  id: number;
  lead_id: number;
  caller_id: string;
  caller_name: string;
  outcome: DialerOutcome;
  notes: string | null;
  call_seconds: number;
  created_at: string;
};

export type DialerRecording = {
  id: string;
  lead_id: number;
  caller_id: string;
  caller_name: string;
  outcome: DialerOutcome | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  ext: string | null;
  duration_ms: number | null;
  size: number | null;
  created_at: string;
};

export const DIALER_CALLERS: DialerCaller[] = [
  { id: "saleh", name: "Saalah" },
  { id: "arslan", name: "Arslan" },
  { id: "ayaz", name: "Ayaz" },
];

export const PUBLIC_DIALER_CALLERS = DIALER_CALLERS.filter(
  (caller) => caller.id !== "ayaz",
);

export const DIALER_OUTCOME_LABELS: Record<DialerOutcome, string> = {
  not_interested: "Not interested",
  no_answer: "No answer",
  callback: "Callback",
  send_whatsapp: "Send WhatsApp message",
  send_voice_note: "Send Voice Note",
  closed: "Closed",
};

export const TASK_OUTCOMES: DialerOutcome[] = [
  "callback",
  "send_whatsapp",
  "send_voice_note",
];

export const RECORDINGS_BUCKET = "tyreflow-dialer-recordings";
export const DIALER_HARD_BLOCKED_PHONES = new Set([
  "447354247247",
  "447476190546",
]);
const NATIONAL_MOBILE_TYRES_24HR_RE = /national\s+mobile\s+tyres\s*24\s*hr/i;
const BREAKDOWN_RECOVERY_RE = /\b(break\s*down|breakdown|recovery|road\s*side\s+assistance|roadside\s+assistance)\b/i;

export function phoneDigits(value: unknown) {
  return String(value || "").replace(/[^0-9]/g, "");
}

export function dialerLeadSuppressionReason(lead: Pick<
  DialerLead,
  "assigned_group" | "all_groups" | "display_name" | "saved_name" | "public_display_name"
>) {
  const groupText = [lead.assigned_group, lead.all_groups].join(" ");
  if (NATIONAL_MOBILE_TYRES_24HR_RE.test(groupText)) {
    return "National Mobile Tyres 24HR group";
  }

  const leadText = [
    lead.display_name,
    lead.saved_name,
    lead.public_display_name,
    lead.assigned_group,
    lead.all_groups,
  ].join(" ");
  if (BREAKDOWN_RECOVERY_RE.test(leadText)) {
    return "Breakdown/recovery contact";
  }

  return null;
}

export function taskTypeForOutcome(outcome: DialerOutcome): DialerTaskType | null {
  if (outcome === "callback") return "callback";
  if (outcome === "send_whatsapp") return "send_whatsapp";
  if (outcome === "send_voice_note") return "send_voice_note";
  return null;
}

export function normalizeCaller(raw: unknown): DialerCaller | null {
  const key = String(raw || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return DIALER_CALLERS.find((caller) => caller.id === key) || null;
}

export function normalizePhone(value: unknown) {
  const digits = phoneDigits(value);
  if (!digits) return "";
  if (digits.startsWith("44")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 10) return `+44${digits.slice(1)}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export function requireSupabaseConfig() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY env vars.");
  }

  return { supabaseUrl, supabaseKey };
}

function errorDetail(data: unknown, fallback: string) {
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    return String(record.message || record.error || fallback);
  }

  return fallback;
}

export async function supabaseFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { supabaseUrl, supabaseKey } = requireSupabaseConfig();
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(errorDetail(data, response.statusText));
  }

  return data as T;
}

export async function supabaseStorageFetch(path: string, init: RequestInit = {}) {
  const { supabaseUrl, supabaseKey } = requireSupabaseConfig();
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    let detail = response.statusText;
    try {
      detail = errorDetail(text ? JSON.parse(text) : null, response.statusText);
    } catch {
      detail = text || response.statusText;
    }
    throw new Error(detail);
  }

  return response;
}

export async function fetchDialerLeads(
  callerId?: string,
  options: { includeSubscriberPhones?: boolean } = {},
) {
  const filters = [
    "select=*",
    "status=neq.excluded",
    "order=id.asc",
    "limit=2500",
  ];

  if (callerId) filters.push(`assigned_to=eq.${encodeURIComponent(callerId)}`);

  const leads = await supabaseFetch<DialerLead[]>(
    `/rest/v1/tyreflow_dialer_leads?${filters.join("&")}`,
  );
  const subscriberPhones = options.includeSubscriberPhones
    ? new Set<string>()
    : await fetchTyreFlowSubscriberPhones();

  return leads.filter((lead) => {
    const digits = phoneDigits(lead.phone);
    return (
      !DIALER_HARD_BLOCKED_PHONES.has(digits) &&
      !subscriberPhones.has(digits) &&
      !dialerLeadSuppressionReason(lead)
    );
  });
}

export async function fetchTyreFlowSubscriberPhones() {
  try {
    const rows = await supabaseFetch<{ phone: string }[]>(
      "/rest/v1/tyreflow_subscribers?select=phone&limit=20000",
    );

    return new Set(rows.map((row) => phoneDigits(row.phone)).filter(Boolean));
  } catch {
    return new Set<string>();
  }
}

export async function fetchDialerTasks(callerId?: string) {
  const filters = [
    "select=*",
    "order=created_at.desc",
    "limit=2500",
  ];

  if (callerId) filters.push(`caller_id=eq.${encodeURIComponent(callerId)}`);

  return supabaseFetch<DialerTask[]>(
    `/rest/v1/tyreflow_dialer_tasks?${filters.join("&")}`,
  );
}

export async function fetchDialerEvents(callerId?: string) {
  const filters = [
    "select=*",
    "order=created_at.desc",
    "limit=5000",
  ];

  if (callerId) filters.push(`caller_id=eq.${encodeURIComponent(callerId)}`);

  return supabaseFetch<DialerCallEvent[]>(
    `/rest/v1/tyreflow_dialer_call_events?${filters.join("&")}`,
  );
}

export async function fetchDialerRecordings(leadId?: number) {
  const filters = [
    "select=*",
    "order=created_at.desc",
    "limit=2500",
  ];

  if (leadId) filters.push(`lead_id=eq.${leadId}`);

  return supabaseFetch<DialerRecording[]>(
    `/rest/v1/tyreflow_dialer_recordings?${filters.join("&")}`,
  );
}

export async function claimDialerLeads(caller: DialerCaller, limit = 25) {
  return supabaseFetch<DialerLead[]>("/rest/v1/rpc/tyreflow_claim_dialer_leads", {
    method: "POST",
    body: JSON.stringify({
      p_caller_id: caller.id,
      p_caller_name: caller.name,
      p_limit: limit,
    }),
  });
}

export async function recordDialerOutcome(input: {
  leadId: number;
  caller: DialerCaller;
  outcome: DialerOutcome;
  notes?: string;
  callSeconds?: number;
  dueAt?: string | null;
}) {
  const taskType = taskTypeForOutcome(input.outcome);
  const now = new Date().toISOString();
  const status = input.outcome === "closed" ? "closed" : "called";
  const notes = String(input.notes || "").trim();

  const event = await supabaseFetch<DialerCallEvent[]>(
    "/rest/v1/tyreflow_dialer_call_events",
    {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        lead_id: input.leadId,
        caller_id: input.caller.id,
        caller_name: input.caller.name,
        outcome: input.outcome,
        notes,
        call_seconds: Math.max(0, Math.round(Number(input.callSeconds) || 0)),
        created_at: now,
      }),
    },
  );

  await supabaseFetch<DialerLead[]>(
    `/rest/v1/tyreflow_dialer_leads?id=eq.${input.leadId}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status,
        assigned_to: input.caller.id,
        assigned_name: input.caller.name,
        assigned_at: now,
        last_outcome: input.outcome,
        last_note: notes,
        last_called_at: now,
        updated_at: now,
      }),
    },
  );

  if (taskType) {
    await supabaseFetch<DialerTask[]>("/rest/v1/tyreflow_dialer_tasks", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        lead_id: input.leadId,
        caller_id: input.caller.id,
        caller_name: input.caller.name,
        task_type: taskType,
        due_at: input.dueAt || null,
        notes,
        status: "open",
        created_at: now,
      }),
    });
  } else {
    await supabaseFetch<DialerTask[]>(
      `/rest/v1/tyreflow_dialer_tasks?lead_id=eq.${input.leadId}&status=eq.open`,
      {
        method: "PATCH",
        body: JSON.stringify({
          status: "done",
          completed_at: now,
        }),
      },
    );
  }

  return event?.[0] || null;
}

export async function completeDialerTask(taskId: number) {
  return supabaseFetch<DialerTask[]>(
    `/rest/v1/tyreflow_dialer_tasks?id=eq.${taskId}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        status: "done",
        completed_at: new Date().toISOString(),
      }),
    },
  );
}

export function buildDialerStats(input: {
  leads: DialerLead[];
  tasks: DialerTask[];
  events: DialerCallEvent[];
  recordings: DialerRecording[];
}) {
  const byCaller = DIALER_CALLERS.map((caller) => {
    const callerLeads = input.leads.filter((lead) => lead.assigned_to === caller.id);
    const callerEvents = input.events.filter((event) => event.caller_id === caller.id);
    const outcomes = callerEvents.reduce<Record<string, number>>((acc, event) => {
      acc[event.outcome] = (acc[event.outcome] || 0) + 1;
      return acc;
    }, {});

    return {
      ...caller,
      assigned: callerLeads.length,
      called: callerLeads.filter((lead) => lead.status === "called").length,
      closed: callerLeads.filter((lead) => lead.status === "closed").length,
      openTasks: input.tasks.filter(
        (task) => task.caller_id === caller.id && task.status === "open",
      ).length,
      calls: callerEvents.length,
      outcomes,
    };
  });

  return {
    total: input.leads.length,
    unassigned: input.leads.filter((lead) => lead.status === "unassigned").length,
    assigned: input.leads.filter((lead) => lead.status === "assigned").length,
    called: input.leads.filter((lead) => lead.status === "called").length,
    closed: input.leads.filter((lead) => lead.status === "closed").length,
    openTasks: input.tasks.filter((task) => task.status === "open").length,
    calls: input.events.length,
    recordings: input.recordings.length,
    byCaller,
  };
}

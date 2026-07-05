"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  DIALER_CALLERS,
  DIALER_OUTCOME_LABELS,
  TASK_OUTCOMES,
  taskTypeForOutcome,
  type DialerCaller,
  type DialerCallEvent,
  type DialerLead,
  type DialerOutcome,
  type DialerTask,
} from "@/lib/dialer";
import type { DialerInitialData } from "./page";

type DialerConsoleProps = {
  initialData: DialerInitialData;
};

type DialerData = Omit<DialerInitialData, "error">;

type RecorderState = {
  media: MediaRecorder | null;
  stream: MediaStream | null;
  chunks: Blob[];
  lead: DialerLead | null;
  startedAt: number;
  mime: string;
};

const outcomeColors: Record<DialerOutcome, string> = {
  not_interested: "bg-rose-100 text-rose-800",
  no_answer: "bg-slate-100 text-slate-700",
  callback: "bg-amber-100 text-amber-800",
  send_whatsapp: "bg-sky-100 text-sky-800",
  send_voice_note: "bg-violet-100 text-violet-800",
  closed: "bg-[#dff1a0] text-[#34420d]",
};

function formatPhone(phone: string) {
  return phone || "No phone";
}

function humanDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function defaultDueAt(outcome: DialerOutcome) {
  const date = new Date();
  if (outcome === "callback") {
    date.setDate(date.getDate() + 1);
    date.setHours(10, 0, 0, 0);
  } else {
    date.setHours(date.getHours() + 2, 0, 0, 0);
  }

  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function extFromMime(mime: string) {
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("ogg")) return "ogg";
  return "audio";
}

export function DialerConsole({ initialData }: DialerConsoleProps) {
  const [data, setData] = useState<DialerData>({
    leads: initialData.leads,
    tasks: initialData.tasks,
    events: initialData.events,
    recordings: initialData.recordings,
    stats: initialData.stats,
  });
  const [activeCaller, setActiveCaller] = useState<DialerCaller | null>(null);
  const [view, setView] = useState<"caller" | "admin">("caller");
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(
    initialData.leads[0]?.id || null,
  );
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialData.error);
  const [selectedOutcome, setSelectedOutcome] = useState<DialerOutcome>("no_answer");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [dueAt, setDueAt] = useState<Record<number, string>>({});
  const [activeCallLeadId, setActiveCallLeadId] = useState<number | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<string | null>(null);
  const recorder = useRef<RecorderState>({
    media: null,
    stream: null,
    chunks: [],
    lead: null,
    startedAt: 0,
    mime: "",
  });

  const callerLeads = useMemo(() => {
    if (!activeCaller) return [];
    const search = query.trim().toLowerCase();
    return data.leads
      .filter((lead) => lead.assigned_to === activeCaller.id)
      .filter((lead) => {
        if (!search) return true;
        return [
          lead.display_name,
          lead.phone,
          lead.assigned_group,
          lead.all_groups,
          lead.last_note,
          lead.last_outcome ? DIALER_OUTCOME_LABELS[lead.last_outcome] : "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(search);
      });
  }, [activeCaller, data.leads, query]);

  const selectedLead =
    data.leads.find((lead) => lead.id === selectedLeadId) ||
    callerLeads[0] ||
    data.leads[0] ||
    null;

  const selectedLeadTasks = selectedLead
    ? data.tasks.filter((task) => task.lead_id === selectedLead.id && task.status === "open")
    : [];

  const selectedLeadRecordings = selectedLead
    ? data.recordings.filter((recording) => recording.lead_id === selectedLead.id)
    : [];

  const openTasks = data.tasks
    .filter((task) => task.status === "open")
    .filter((task) => !activeCaller || task.caller_id === activeCaller.id)
    .sort((a, b) => String(a.due_at || a.created_at).localeCompare(String(b.due_at || b.created_at)));

  async function reload(nextView = view) {
    setLoading(true);
    setError(null);
    try {
      const params = nextView === "admin" ? "?view=admin" : "";
      const response = await fetch(`/api/dialer${params}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load dialer.");
      setData(payload);
      if (!selectedLeadId && payload.leads?.[0]) setSelectedLeadId(payload.leads[0].id);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load dialer.");
    } finally {
      setLoading(false);
    }
  }

  async function claimLeads() {
    if (!activeCaller) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/dialer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "claim",
          caller_id: activeCaller.id,
          limit: 25,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not claim leads.");
      setMessage(payload.claimed ? `Claimed ${payload.claimed} lead(s).` : "No unassigned leads left.");
      await reload("admin");
      const firstClaimed = payload.leads?.[0];
      if (firstClaimed) setSelectedLeadId(firstClaimed.id);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "Could not claim leads.");
    } finally {
      setSaving(false);
    }
  }

  async function startCall(lead: DialerLead) {
    setActiveCallLeadId(lead.id);
    setCallStartedAt(Date.now());
    await startRecording(lead);
  }

  function stopCall() {
    stopRecording();
    setActiveCallLeadId(null);
  }

  async function startRecording(lead: DialerLead) {
    if (!navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      setRecordingStatus("Recording is not supported in this browser.");
      return;
    }

    if (recorder.current.media && recorder.current.media.state !== "inactive") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const media = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder.current = {
        media,
        stream,
        chunks: [],
        lead,
        startedAt: Date.now(),
        mime: media.mimeType || mime || "audio/webm",
      };
      media.ondataavailable = (event) => {
        if (event.data && event.data.size) recorder.current.chunks.push(event.data);
      };
      media.onstop = () => finalizeRecording();
      media.start();
      setRecordingStatus("Recording...");
    } catch {
      setRecordingStatus("Mic permission was denied or unavailable.");
    }
  }

  function stopRecording() {
    const current = recorder.current.media;
    if (current && current.state !== "inactive") current.stop();
  }

  async function finalizeRecording() {
    const current = recorder.current;
    const lead = current.lead;
    const chunks = current.chunks.slice();
    const mime = current.mime || "audio/webm";
    const durationMs = Date.now() - current.startedAt;

    current.stream?.getTracks().forEach((track) => track.stop());
    recorder.current = {
      media: null,
      stream: null,
      chunks: [],
      lead: null,
      startedAt: 0,
      mime: "",
    };

    if (!lead || !activeCaller || !chunks.length) {
      setRecordingStatus(null);
      return;
    }

    const blob = new Blob(chunks, { type: mime });
    const form = new FormData();
    form.append("lead_id", String(lead.id));
    form.append("caller_id", activeCaller.id);
    form.append("outcome", selectedOutcome);
    form.append("mime_type", mime);
    form.append("ext", extFromMime(mime));
    form.append("duration_ms", String(durationMs));
    form.append("created_at", new Date().toISOString());
    form.append("audio", blob, `${lead.id}-${Date.now()}.${extFromMime(mime)}`);

    try {
      setRecordingStatus("Uploading recording...");
      const response = await fetch("/api/dialer/recordings", {
        method: "POST",
        body: form,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Upload failed.");
      setRecordingStatus("Recording saved.");
      await reload("admin");
    } catch (uploadError) {
      setRecordingStatus(
        uploadError instanceof Error ? uploadError.message : "Recording upload failed.",
      );
    }
  }

  async function saveOutcome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeCaller || !selectedLead) return;

    setSaving(true);
    setMessage(null);
    setError(null);
    const leadNotes = notes[selectedLead.id] || "";
    const taskType = taskTypeForOutcome(selectedOutcome);
    const selectedDueAt = dueAt[selectedLead.id] || (taskType ? defaultDueAt(selectedOutcome) : null);
    const callSeconds =
      activeCallLeadId === selectedLead.id && callStartedAt
        ? Math.round((Date.now() - callStartedAt) / 1000)
        : 0;

    try {
      stopRecording();
      const response = await fetch("/api/dialer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "outcome",
          caller_id: activeCaller.id,
          lead_id: selectedLead.id,
          outcome: selectedOutcome,
          notes: leadNotes,
          call_seconds: callSeconds,
          due_at: selectedDueAt,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not save outcome.");
      setMessage(`Saved ${DIALER_OUTCOME_LABELS[selectedOutcome]} for ${selectedLead.display_name}.`);
      setActiveCallLeadId(null);
      setCallStartedAt(null);
      setNotes((current) => ({ ...current, [selectedLead.id]: "" }));
      await reload("admin");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save outcome.");
    } finally {
      setSaving(false);
    }
  }

  async function completeTask(task: DialerTask) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/dialer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete_task", task_id: task.id }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not complete task.");
      setMessage("Task marked done.");
      await reload("admin");
    } catch (taskError) {
      setError(taskError instanceof Error ? taskError.message : "Could not complete task.");
    } finally {
      setSaving(false);
    }
  }

  function leadEventCount(leadId: number) {
    return data.events.filter((event) => event.lead_id === leadId).length;
  }

  function pickCaller(caller: DialerCaller) {
    setActiveCaller(caller);
    setView("caller");
    const firstLead = data.leads.find((lead) => lead.assigned_to === caller.id);
    setSelectedLeadId(firstLead?.id || null);
  }

  return (
    <main className="min-h-[100dvh] bg-[#f6f7f3] px-4 py-6 text-[#151713] sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-6">
        <section className="rounded-[30px] bg-[#11140f] p-6 text-white shadow-[0_24px_80px_rgba(28,34,20,0.18)] sm:p-8">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#b8d45f]">
                  TyreFlow Dialer
                </p>
                <Link
                  href="/"
                  className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
                >
                  Subscribers
                </Link>
              </div>
              <h1 className="mt-8 max-w-3xl text-5xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
                Lead calling workspace
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-white/68">
                Pick a caller, claim 25 leads, record calls, save notes, and track
                callbacks or WhatsApp follow-ups without touching live messaging.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[460px]">
              {[
                ["Total", data.stats.total],
                ["Unassigned", data.stats.unassigned],
                ["Open tasks", data.stats.openTasks],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="font-mono text-3xl font-semibold text-white">{value}</p>
                  <p className="mt-1 text-sm text-white/62">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="grid gap-6 lg:sticky lg:top-6 lg:self-start">
            <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_18px_60px_rgba(33,41,24,0.08)]">
              <p className="text-sm font-medium text-[#60721f]">Caller session</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
                Who is calling?
              </h2>

              <div className="mt-5 grid gap-2">
                {DIALER_CALLERS.map((caller) => (
                  <button
                    key={caller.id}
                    type="button"
                    onClick={() => pickCaller(caller)}
                    className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                      activeCaller?.id === caller.id
                        ? "bg-[#151713] text-white"
                        : "border border-black/8 bg-[#fafbf7] text-black/72 hover:border-black/15 hover:bg-white"
                    }`}
                  >
                    {caller.name}
                  </button>
                ))}
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={() => setView("caller")}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    view === "caller" ? "bg-[#dff1a0] text-[#34420d]" : "border border-black/10"
                  }`}
                >
                  Caller
                </button>
                <button
                  type="button"
                  onClick={() => setView("admin")}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                    view === "admin" ? "bg-[#dff1a0] text-[#34420d]" : "border border-black/10"
                  }`}
                >
                  Admin
                </button>
              </div>

              <button
                type="button"
                disabled={!activeCaller || saving}
                onClick={claimLeads}
                className="mt-5 w-full rounded-full bg-[#151713] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#2a2e24] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? "Working..." : "Get 25 leads"}
              </button>
            </div>

            <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_18px_60px_rgba(33,41,24,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#60721f]">Follow-ups</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em]">
                    Open tasks
                  </h2>
                </div>
                <span className="rounded-full bg-[#edf6ca] px-3 py-1 text-sm font-semibold text-[#35470b]">
                  {openTasks.length}
                </span>
              </div>

              <div className="mt-4 grid gap-3">
                {openTasks.length === 0 && (
                  <p className="rounded-2xl bg-[#fafbf7] p-4 text-sm text-black/55">
                    No open tasks for this view.
                  </p>
                )}
                {openTasks.slice(0, 8).map((task) => {
                  const lead = data.leads.find((item) => item.id === task.lead_id);
                  return (
                    <article key={task.id} className="rounded-2xl border border-black/8 bg-[#fafbf7] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">
                            {DIALER_OUTCOME_LABELS[task.task_type]}
                          </p>
                          <p className="mt-1 text-sm text-black/55">
                            {lead?.display_name || "Unknown lead"}
                          </p>
                          {task.due_at && (
                            <p className="mt-2 font-mono text-xs text-black/45">
                              {humanDate(task.due_at)}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => completeTask(task)}
                          className="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white"
                        >
                          Done
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </aside>

          {view === "admin" ? (
            <AdminView
              data={data}
              loading={loading}
              reload={() => reload("admin")}
              onPickLead={(leadId) => {
                setSelectedLeadId(leadId);
                setView("caller");
              }}
            />
          ) : (
            <section className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1fr)]">
              <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_18px_60px_rgba(33,41,24,0.08)] sm:p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <p className="text-sm font-medium text-[#60721f]">
                      {activeCaller ? `${activeCaller.name}'s leads` : "Choose a caller"}
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
                      Call queue
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => reload("admin")}
                    className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-medium transition hover:bg-black/[0.03]"
                  >
                    {loading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, phone, group, notes"
                  className="mt-5 w-full rounded-full border border-black/10 bg-[#fafbf7] px-4 py-3 text-sm outline-none transition focus:border-[#9fbd38] focus:bg-white"
                />

                <div className="mt-5 grid max-h-[720px] gap-3 overflow-auto pr-1">
                  {!activeCaller && (
                    <p className="rounded-2xl bg-[#fafbf7] p-4 text-sm text-black/58">
                      Pick Saleh, Arslan, or Ayaz to see assigned leads.
                    </p>
                  )}
                  {activeCaller && callerLeads.length === 0 && (
                    <p className="rounded-2xl bg-[#fafbf7] p-4 text-sm text-black/58">
                      No leads assigned yet. Click Get 25 leads.
                    </p>
                  )}
                  {callerLeads.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => setSelectedLeadId(lead.id)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selectedLead?.id === lead.id
                          ? "border-[#9fbd38] bg-[#f8fbeb]"
                          : "border-black/8 bg-[#fafbf7] hover:border-black/15 hover:bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold tracking-[-0.02em]">{lead.display_name}</p>
                          <p className="mt-1 font-mono text-sm text-black/58">{formatPhone(lead.phone)}</p>
                        </div>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs text-black/55">
                          {lead.status}
                        </span>
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm text-black/50">
                        {lead.assigned_group || "No group"} · {lead.groups_count} group(s)
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        {lead.is_business && <span className="rounded-full bg-[#dff1a0] px-2.5 py-1 text-[#34420d]">Business</span>}
                        {lead.last_outcome && (
                          <span className={`rounded-full px-2.5 py-1 ${outcomeColors[lead.last_outcome]}`}>
                            {DIALER_OUTCOME_LABELS[lead.last_outcome]}
                          </span>
                        )}
                        <span className="rounded-full bg-white px-2.5 py-1 text-black/52">
                          {leadEventCount(lead.id)} call(s)
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_18px_60px_rgba(33,41,24,0.08)] sm:p-6">
                {!selectedLead ? (
                  <div className="rounded-2xl bg-[#fafbf7] p-6 text-sm text-black/58">
                    Select a lead to start calling.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div>
                        <p className="text-sm font-medium text-[#60721f]">Lead details</p>
                        <h2 className="mt-1 text-3xl font-semibold tracking-[-0.045em]">
                          {selectedLead.display_name}
                        </h2>
                        <p className="mt-2 font-mono text-lg text-black/62">
                          {formatPhone(selectedLead.phone)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startCall(selectedLead)}
                          disabled={!activeCaller || activeCallLeadId === selectedLead.id}
                          className="rounded-full bg-[#151713] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#2a2e24] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {activeCallLeadId === selectedLead.id ? "Call active" : "Start call + record"}
                        </button>
                        {activeCallLeadId === selectedLead.id && (
                          <button
                            type="button"
                            onClick={stopCall}
                            className="rounded-full border border-black/10 px-5 py-3 text-sm font-medium transition hover:bg-black/[0.03]"
                          >
                            End call
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 rounded-3xl border border-black/8 bg-[#fafbf7] p-4 text-sm text-black/62">
                      <p>
                        <span className="font-semibold text-black">Group:</span>{" "}
                        {selectedLead.assigned_group || "Not set"}
                      </p>
                      <p>
                        <span className="font-semibold text-black">All groups:</span>{" "}
                        {selectedLead.all_groups || "Not set"}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs">
                          {selectedLead.groups_count} group(s)
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs">
                          {selectedLead.is_business ? "Business" : "Not marked business"}
                        </span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-xs">
                          {selectedLead.is_my_contact ? "My contact" : "Not my contact"}
                        </span>
                      </div>
                    </div>

                    {(message || error || recordingStatus) && (
                      <div
                        className={`mt-5 rounded-2xl px-4 py-3 text-sm ${
                          error
                            ? "bg-red-50 text-red-700"
                            : "bg-[#edf6ca] text-[#35470b]"
                        }`}
                      >
                        {error || message || recordingStatus}
                      </div>
                    )}

                    <form onSubmit={saveOutcome} className="mt-6 grid gap-5">
                      <div>
                        <p className="text-sm font-semibold">Outcome / task</p>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          {(Object.keys(DIALER_OUTCOME_LABELS) as DialerOutcome[]).map((outcome) => (
                            <button
                              key={outcome}
                              type="button"
                              onClick={() => {
                                setSelectedOutcome(outcome);
                                if (TASK_OUTCOMES.includes(outcome) && !dueAt[selectedLead.id]) {
                                  setDueAt((current) => ({
                                    ...current,
                                    [selectedLead.id]: defaultDueAt(outcome),
                                  }));
                                }
                              }}
                              className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                                selectedOutcome === outcome
                                  ? "bg-[#151713] text-white"
                                  : `${outcomeColors[outcome]} hover:brightness-[0.98]`
                              }`}
                            >
                              {DIALER_OUTCOME_LABELS[outcome]}
                            </button>
                          ))}
                        </div>
                      </div>

                      {taskTypeForOutcome(selectedOutcome) && (
                        <label className="grid gap-2 text-sm font-medium">
                          Task due date / time
                          <input
                            type="datetime-local"
                            value={dueAt[selectedLead.id] || defaultDueAt(selectedOutcome)}
                            onChange={(event) =>
                              setDueAt((current) => ({
                                ...current,
                                [selectedLead.id]: event.target.value,
                              }))
                            }
                            className="rounded-2xl border border-black/10 bg-[#fafbf7] px-4 py-3 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                          />
                        </label>
                      )}

                      <label className="grid gap-2 text-sm font-medium">
                        Notes
                        <textarea
                          value={notes[selectedLead.id] || ""}
                          onChange={(event) =>
                            setNotes((current) => ({
                              ...current,
                              [selectedLead.id]: event.target.value,
                            }))
                          }
                          rows={5}
                          placeholder="What happened on the call? Next step?"
                          className="resize-none rounded-2xl border border-black/10 bg-[#fafbf7] px-4 py-3 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                        />
                      </label>

                      <button
                        type="submit"
                        disabled={!activeCaller || saving}
                        className="rounded-full bg-[#151713] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#2a2e24] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {saving ? "Saving..." : "Save outcome"}
                      </button>
                    </form>

                    <div className="mt-6 grid gap-4">
                      <div>
                        <p className="text-sm font-semibold">Open tasks for this lead</p>
                        <div className="mt-3 grid gap-2">
                          {selectedLeadTasks.length === 0 && (
                            <p className="rounded-2xl bg-[#fafbf7] p-4 text-sm text-black/55">
                              No open task.
                            </p>
                          )}
                          {selectedLeadTasks.map((task) => (
                            <div key={task.id} className="flex items-center justify-between gap-3 rounded-2xl bg-[#fafbf7] p-4">
                              <div>
                                <p className="text-sm font-semibold">
                                  {DIALER_OUTCOME_LABELS[task.task_type]}
                                </p>
                                <p className="mt-1 font-mono text-xs text-black/45">
                                  {humanDate(task.due_at)}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => completeTask(task)}
                                className="rounded-full border border-black/10 px-3 py-2 text-xs font-medium transition hover:bg-white"
                              >
                                Done
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-semibold">Recordings</p>
                        <div className="mt-3 grid gap-3">
                          {selectedLeadRecordings.length === 0 && (
                            <p className="rounded-2xl bg-[#fafbf7] p-4 text-sm text-black/55">
                              No recordings saved yet.
                            </p>
                          )}
                          {selectedLeadRecordings.map((recording) => (
                            <div key={recording.id} className="rounded-2xl bg-[#fafbf7] p-4">
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-black/48">
                                <span>{humanDate(recording.created_at)}</span>
                                <span>{recording.duration_ms ? `${Math.round(recording.duration_ms / 1000)}s` : ""}</span>
                              </div>
                              <audio controls className="w-full" src={`/api/dialer/recordings/${recording.id}`} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function AdminView({
  data,
  loading,
  reload,
  onPickLead,
}: {
  data: DialerData;
  loading: boolean;
  reload: () => void;
  onPickLead: (leadId: number) => void;
}) {
  const recentEvents = data.events.slice(0, 20);

  return (
    <section className="grid gap-6">
      <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_18px_60px_rgba(33,41,24,0.08)] sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-[#60721f]">Admin dashboard</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
              Team progress
            </h2>
          </div>
          <button
            type="button"
            onClick={reload}
            className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-medium transition hover:bg-black/[0.03]"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Assigned", data.stats.assigned],
            ["Called", data.stats.called],
            ["Closed", data.stats.closed],
            ["Calls", data.stats.calls],
            ["Recordings", data.stats.recordings],
            ["Tasks", data.stats.openTasks],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-black/8 bg-[#fafbf7] p-4">
              <p className="font-mono text-3xl font-semibold">{value}</p>
              <p className="mt-1 text-sm text-black/52">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_18px_60px_rgba(33,41,24,0.08)] sm:p-6">
          <p className="text-sm font-medium text-[#60721f]">Callers</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
            Saleh, Arslan, Ayaz
          </h2>

          <div className="mt-5 grid gap-3">
            {data.stats.byCaller.map((caller) => (
              <article key={caller.id} className="rounded-2xl border border-black/8 bg-[#fafbf7] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold">{caller.name}</h3>
                    <p className="mt-1 text-sm text-black/55">
                      {caller.assigned} assigned · {caller.calls} calls · {caller.openTasks} task(s)
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-black/62">
                    {caller.closed} closed
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(Object.keys(DIALER_OUTCOME_LABELS) as DialerOutcome[]).map((outcome) => (
                    <span key={outcome} className={`rounded-full px-2.5 py-1 text-xs ${outcomeColors[outcome]}`}>
                      {DIALER_OUTCOME_LABELS[outcome]} {caller.outcomes[outcome] || 0}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_18px_60px_rgba(33,41,24,0.08)] sm:p-6">
          <p className="text-sm font-medium text-[#60721f]">Recent activity</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
            Call log
          </h2>

          <div className="mt-5 grid max-h-[620px] gap-3 overflow-auto pr-1">
            {recentEvents.length === 0 && (
              <p className="rounded-2xl bg-[#fafbf7] p-4 text-sm text-black/55">
                No calls logged yet.
              </p>
            )}
            {recentEvents.map((event: DialerCallEvent) => {
              const lead = data.leads.find((item) => item.id === event.lead_id);
              const recordingCount = data.recordings.filter((item) => item.lead_id === event.lead_id).length;
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => onPickLead(event.lead_id)}
                  className="rounded-2xl border border-black/8 bg-[#fafbf7] p-4 text-left transition hover:border-black/15 hover:bg-white"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{lead?.display_name || "Unknown lead"}</p>
                      <p className="mt-1 text-sm text-black/55">
                        {event.caller_name} · {humanDate(event.created_at)}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs ${outcomeColors[event.outcome]}`}>
                      {DIALER_OUTCOME_LABELS[event.outcome]}
                    </span>
                  </div>
                  {event.notes && (
                    <p className="mt-3 line-clamp-2 text-sm text-black/58">{event.notes}</p>
                  )}
                  <p className="mt-3 text-xs text-black/42">
                    {event.call_seconds}s call · {recordingCount} recording(s)
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

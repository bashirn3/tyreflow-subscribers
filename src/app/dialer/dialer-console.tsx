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
import type { DialerInitialData } from "@/lib/dialer-initial-data";

type DialerConsoleProps = {
  initialData: DialerInitialData;
};

export type DialerData = Omit<DialerInitialData, "error">;

type RecorderState = {
  media: MediaRecorder | null;
  stream: MediaStream | null;
  chunks: Blob[];
  lead: DialerLead | null;
  startedAt: number;
  mime: string;
};

type QueueFilter = "to_call" | "called" | "all" | DialerOutcome;

type SubscriberConvertForm = {
  name: string;
  phone: string;
  postcode: string;
  miles: string;
  paid_status: "paid" | "trial";
  notes: string;
};

const outcomeColors: Record<DialerOutcome, string> = {
  not_interested: "bg-rose-100 text-rose-800",
  no_answer: "bg-slate-100 text-slate-700",
  callback: "bg-amber-100 text-amber-800",
  send_whatsapp: "bg-sky-100 text-sky-800",
  send_voice_note: "bg-violet-100 text-violet-800",
  closed: "bg-[#dff1a0] text-[#34420d]",
};

const queueFilters: QueueFilter[] = [
  "to_call",
  "no_answer",
  "callback",
  "send_whatsapp",
  "send_voice_note",
  "not_interested",
  "closed",
  "called",
  "all",
];

const queueFilterLabels: Record<QueueFilter, string> = {
  to_call: "To call",
  called: "Called",
  all: "All",
  ...DIALER_OUTCOME_LABELS,
};

function matchesQueueFilter(lead: DialerLead, filter: QueueFilter) {
  if (filter === "all") return true;
  if (filter === "to_call") return lead.status === "assigned" && !lead.last_outcome;
  if (filter === "called") return lead.status === "called" || lead.status === "closed" || Boolean(lead.last_outcome);
  if (filter === "closed") return lead.status === "closed" || lead.last_outcome === "closed";
  return lead.last_outcome === filter;
}

function formatPhone(phone: string) {
  return phone || "No phone";
}

function phoneDigits(value: string | null | undefined) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function displayNameIsPhone(lead: DialerLead) {
  const displayDigits = phoneDigits(lead.display_name);
  const phone = phoneDigits(lead.phone);
  return Boolean(displayDigits && phone && displayDigits === phone);
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

function convertFormFromLead(lead: DialerLead): SubscriberConvertForm {
  return {
    name: lead.display_name || lead.public_display_name || lead.saved_name || "",
    phone: lead.phone || "",
    postcode: "",
    miles: "50",
    paid_status: "trial",
    notes: lead.last_note || "",
  };
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
  const [selectedLeadId, setSelectedLeadId] = useState<number | null>(
    initialData.leads[0]?.id || null,
  );
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialData.error);
  const [selectedOutcome, setSelectedOutcome] = useState<DialerOutcome>("no_answer");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("to_call");
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [dueAt, setDueAt] = useState<Record<number, string>>({});
  const [activeCallLeadId, setActiveCallLeadId] = useState<number | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [recordingStatus, setRecordingStatus] = useState<string | null>(null);
  const [convertLead, setConvertLead] = useState<DialerLead | null>(null);
  const [convertForm, setConvertForm] = useState<SubscriberConvertForm | null>(null);
  const recorder = useRef<RecorderState>({
    media: null,
    stream: null,
    chunks: [],
    lead: null,
    startedAt: 0,
    mime: "",
  });

  const callerAssignedLeads = useMemo(() => {
    if (!activeCaller) return [];
    return data.leads.filter((lead) => lead.assigned_to === activeCaller.id);
  }, [activeCaller, data.leads]);

  const queueCounts = useMemo(() => {
    return Object.fromEntries(
      queueFilters.map((filter) => [
        filter,
        callerAssignedLeads.filter((lead) => matchesQueueFilter(lead, filter)).length,
      ]),
    ) as Record<QueueFilter, number>;
  }, [callerAssignedLeads]);

  const callerLeads = useMemo(() => {
    const search = query.trim().toLowerCase();
    return callerAssignedLeads
      .filter((lead) => matchesQueueFilter(lead, queueFilter))
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
  }, [callerAssignedLeads, query, queueFilter]);

  const selectedLead =
    callerLeads.find((lead) => lead.id === selectedLeadId) ||
    callerLeads[0] ||
    null;
  const selectedLeadNameIsPhone = selectedLead ? displayNameIsPhone(selectedLead) : false;

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

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/dialer", { cache: "no-store" });
      const payload = (await response.json()) as DialerData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load dialer.");
      setData(payload);
      if (!selectedLeadId && payload.leads?.[0]) setSelectedLeadId(payload.leads[0].id);
      return payload;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load dialer.");
      return null;
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
      await reload();
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

  function openConvertModal(lead: DialerLead) {
    const form = convertFormFromLead(lead);
    setConvertLead(lead);
    setConvertForm({
      ...form,
      notes: notes[lead.id] || form.notes,
    });
    setError(null);
    setMessage(null);
  }

  async function saveSubscriberFromLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!convertLead || !convertForm || !activeCaller) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: convertForm.name,
          phone: convertForm.phone,
          postcode: convertForm.postcode,
          miles: convertForm.miles,
          paid_status: convertForm.paid_status,
          notes: convertForm.notes,
          active: true,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not add subscriber.");

      setMessage(`${payload.subscriber?.name || convertForm.name} added as subscriber.`);
      setConvertLead(null);
      setConvertForm(null);

      const refreshed = await reload();
      const nextLead = refreshed?.leads.find(
        (lead) =>
          lead.assigned_to === activeCaller.id &&
          lead.id !== convertLead.id &&
          matchesQueueFilter(lead, "to_call"),
      );
      setQueueFilter("to_call");
      setSelectedLeadId(nextLead?.id || null);
    } catch (convertError) {
      setError(convertError instanceof Error ? convertError.message : "Could not add subscriber.");
    } finally {
      setSaving(false);
    }
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
      await reload();
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
      const refreshed = await reload();
      const nextLead = refreshed?.leads.find(
        (lead) =>
          lead.assigned_to === activeCaller.id &&
          lead.id !== selectedLead.id &&
          matchesQueueFilter(lead, "to_call"),
      );
      setQueueFilter("to_call");
      setSelectedLeadId(nextLead?.id || null);
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
      await reload();
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
    setQueueFilter("to_call");
    const firstLead =
      data.leads.find(
        (lead) => lead.assigned_to === caller.id && matchesQueueFilter(lead, "to_call"),
      ) || data.leads.find((lead) => lead.assigned_to === caller.id);
    setSelectedLeadId(firstLead?.id || null);
  }

  if (!activeCaller) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-10 text-[#151713] sm:px-6">
        <section className="w-full max-w-2xl rounded-[30px] border border-black/8 bg-white p-6 shadow-[0_24px_80px_rgba(28,34,20,0.14)] sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#60721f]">
              TyreFlow Dialer
            </p>
            <Link
              href="/"
              className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-black/58 transition hover:border-black/20 hover:text-black"
            >
              Subscribers
            </Link>
          </div>

          <div className="mt-10">
            <h1 className="text-4xl font-semibold tracking-[-0.06em] text-[#151713] sm:text-5xl">
              Who is calling?
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-black/58">
              Pick your name to load your own lead queue, tasks, recordings, and
              call notes.
            </p>
          </div>

          {error && (
            <p className="mt-6 rounded-2xl bg-red-500/12 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
          )}

          <div className="mt-8 grid gap-3">
            {DIALER_CALLERS.map((caller) => {
              const assignedCount = data.leads.filter(
                (lead) => lead.assigned_to === caller.id,
              ).length;
              return (
                <button
                  key={caller.id}
                  type="button"
                  onClick={() => pickCaller(caller)}
                  className="rounded-3xl border border-black/8 bg-[#fafbf7] p-5 text-left transition hover:border-[#9fbd38]/60 hover:bg-white"
                >
                  <span className="block text-xl font-semibold tracking-[-0.03em] text-[#151713]">
                    {caller.name}
                  </span>
                  <span className="mt-1 block text-sm text-black/52">
                    {assignedCount} assigned lead(s)
                  </span>
                </button>
              );
            })}
          </div>

          <Link
            href="/dialer/admin"
            className="mt-6 inline-flex rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-black/58 transition hover:border-black/20 hover:text-black"
          >
            Admin dashboard
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100dvh-4rem)] px-4 py-6 text-[#151713] sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[28px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)] sm:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#60721f]">
                  TyreFlow Dialer
                </p>
                <Link
                  href="/"
                  className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-black/58 transition hover:border-black/20 hover:text-black"
                >
                  Subscribers
                </Link>
              </div>
              <h1 className="mt-5 max-w-3xl text-3xl font-semibold tracking-[-0.055em] text-[#151713] sm:text-4xl">
                Lead calling workspace
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-black/58">
                Pick a caller, claim 25 leads, record calls, save notes, and track
                callbacks or WhatsApp follow-ups without touching live messaging.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[460px]">
              {(activeCaller
                ? [
                    ["My leads", callerAssignedLeads.length],
                    ["To call", queueCounts.to_call],
                    [
                      "My calls",
                      data.events.filter((event) => event.caller_id === activeCaller.id)
                        .length,
                    ],
                  ]
                : [
                    ["Total", data.stats.total],
                    ["Unassigned", data.stats.unassigned],
                    ["Open tasks", data.stats.openTasks],
                  ]
              ).map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-black/8 bg-[#fafbf7] p-4">
                  <p className="font-mono text-2xl font-semibold text-black">{value}</p>
                  <p className="mt-1 text-sm text-black/52">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="grid gap-5 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-[26px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)]">
              <p className="text-sm font-medium text-[#60721f]">Caller session</p>
              <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em]">
                {activeCaller?.name || "No caller"}
              </h2>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-[#fafbf7] p-4">
                  <p className="font-mono text-xl font-semibold">
                    {activeCaller ? callerAssignedLeads.length : 0}
                  </p>
                  <p className="mt-1 text-black/52">Assigned</p>
                </div>
                <div className="rounded-2xl bg-[#fafbf7] p-4">
                  <p className="font-mono text-xl font-semibold">
                    {activeCaller
                      ? data.tasks.filter(
                          (task) =>
                            task.caller_id === activeCaller.id && task.status === "open",
                        ).length
                      : 0}
                  </p>
                  <p className="mt-1 text-black/52">Open tasks</p>
                </div>
              </div>

              <button
                type="button"
                disabled={!activeCaller || saving}
                onClick={claimLeads}
                className="mt-5 w-full rounded-full bg-[#151713] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#2a2e24] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? "Working..." : "Get 25 leads"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveCaller(null);
                  setSelectedLeadId(null);
                  setMessage(null);
                  setError(null);
                }}
                className="mt-3 w-full rounded-full border border-black/10 px-5 py-3 text-sm font-medium transition hover:bg-black/[0.03]"
              >
                Switch caller
              </button>
              {(message || error) && (
                <div
                  className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                    error
                      ? "bg-red-50 text-red-700"
                      : "bg-[#edf6ca] text-[#35470b]"
                  }`}
                >
                  {error || message}
                </div>
              )}
            </div>

            <div className="rounded-[26px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#60721f]">Follow-ups</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-[-0.035em]">
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

          <section className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1fr)]">
              <div className="rounded-[26px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)]">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <p className="text-sm font-medium text-[#60721f]">
                      {activeCaller ? `${activeCaller.name}'s leads` : "Choose a caller"}
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-[-0.035em]">
                      Call queue
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => reload()}
                    className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-medium transition hover:bg-black/[0.03]"
                  >
                    {loading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, phone, group, notes"
                  className="mt-4 w-full rounded-full border border-black/10 bg-[#fafbf7] px-4 py-2.5 text-sm outline-none transition focus:border-[#9fbd38] focus:bg-white"
                />

                <div className="mt-4 flex flex-wrap gap-2">
                  {queueFilters.map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setQueueFilter(filter)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        queueFilter === filter
                          ? "bg-[#151713] text-white"
                          : "bg-[#fafbf7] text-black/60 hover:bg-black/[0.04]"
                      }`}
                    >
                      {queueFilterLabels[filter]} {queueCounts[filter] || 0}
                    </button>
                  ))}
                </div>

                <div className="mt-4 grid max-h-[680px] gap-2.5 overflow-auto pr-1">
                  {!activeCaller && (
                    <p className="rounded-2xl bg-[#fafbf7] p-4 text-sm text-black/58">
                      Pick Saalah, Arslan, or Ayaz to see assigned leads.
                    </p>
                  )}
                  {activeCaller && callerLeads.length === 0 && (
                    <p className="rounded-2xl bg-[#fafbf7] p-4 text-sm text-black/58">
                      {callerAssignedLeads.length
                        ? `No ${queueFilterLabels[queueFilter].toLowerCase()} leads match this view.`
                        : "No leads assigned yet. Click Get 25 leads."}
                    </p>
                  )}
                  {callerLeads.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => setSelectedLeadId(lead.id)}
                    className={`rounded-2xl border p-3.5 text-left transition ${
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

              <div className="rounded-[26px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)]">
                {!selectedLead ? (
                  <div className="rounded-2xl bg-[#fafbf7] p-6 text-sm text-black/58">
                    Select a lead to start calling.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                      <div>
                        <p className="text-sm font-medium text-[#60721f]">Lead details</p>
                        {!selectedLeadNameIsPhone && (
                          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.045em]">
                            {selectedLead.display_name}
                          </h2>
                        )}
                        <p
                          className={`font-mono text-black/62 ${
                            selectedLeadNameIsPhone ? "mt-1 text-lg" : "mt-2 text-base"
                          }`}
                        >
                          {formatPhone(selectedLead.phone)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full bg-[#fafbf7] px-3 py-1 font-semibold text-black/60">
                            Status: {selectedLead.status}
                          </span>
                          {selectedLead.last_outcome ? (
                            <span
                              className={`rounded-full px-3 py-1 font-semibold ${outcomeColors[selectedLead.last_outcome]}`}
                            >
                              {DIALER_OUTCOME_LABELS[selectedLead.last_outcome]}
                            </span>
                          ) : (
                            <span className="rounded-full bg-[#edf6ca] px-3 py-1 font-semibold text-[#35470b]">
                              Not called yet
                            </span>
                          )}
                          {selectedLead.last_called_at && (
                            <span className="rounded-full bg-[#fafbf7] px-3 py-1 font-semibold text-black/55">
                              Last called: {humanDate(selectedLead.last_called_at)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 sm:ml-auto sm:pt-7">
                        <button
                          type="button"
                          onClick={() => startCall(selectedLead)}
                          disabled={!activeCaller || activeCallLeadId === selectedLead.id}
                          className="rounded-full bg-[#151713] px-3.5 py-2 text-xs font-medium text-white transition hover:bg-[#2a2e24] disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          {activeCallLeadId === selectedLead.id ? "Call active" : "Start call + record"}
                        </button>
                        <button
                          type="button"
                          onClick={() => openConvertModal(selectedLead)}
                          className="rounded-full bg-[#dff1a0] px-3.5 py-2 text-xs font-semibold text-[#34420d] transition hover:brightness-[0.97]"
                        >
                          Add as subscriber
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
                      {selectedLead.last_note && (
                        <p>
                          <span className="font-semibold text-black">Last note:</span>{" "}
                          {selectedLead.last_note}
                        </p>
                      )}
                      {selectedLeadTasks[0]?.due_at && (
                        <p>
                          <span className="font-semibold text-black">Open task due:</span>{" "}
                          {humanDate(selectedLeadTasks[0].due_at)}
                        </p>
                      )}
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

                    {recordingStatus && (
                      <div
                        className="mt-5 rounded-2xl bg-[#edf6ca] px-4 py-3 text-sm text-[#35470b]"
                      >
                        {recordingStatus}
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
        </section>
      </div>

      {convertLead && convertForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="max-h-[92vh] w-full max-w-xl overflow-auto rounded-[28px] bg-white p-5 shadow-[0_28px_90px_rgba(0,0,0,0.22)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#60721f]">Dialer conversion</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
                  Add subscriber
                </h2>
                <p className="mt-2 text-sm text-black/55">
                  This adds the caller to TyreFlow subscribers. After saving, the phone is filtered out of dialer queues.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConvertLead(null);
                  setConvertForm(null);
                }}
                className="rounded-full border border-black/10 px-3 py-2 text-sm font-medium transition hover:bg-black/[0.03]"
              >
                Close
              </button>
            </div>

            <form onSubmit={saveSubscriberFromLead} className="mt-5 grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  Name
                  <input
                    required
                    value={convertForm.name}
                    onChange={(event) =>
                      setConvertForm((current) =>
                        current ? { ...current, name: event.target.value } : current,
                      )
                    }
                    className="rounded-2xl border border-black/10 bg-[#fafbf7] px-4 py-3 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Phone number
                  <input
                    required
                    value={convertForm.phone}
                    onChange={(event) =>
                      setConvertForm((current) =>
                        current ? { ...current, phone: event.target.value } : current,
                      )
                    }
                    className="rounded-2xl border border-black/10 bg-[#fafbf7] px-4 py-3 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                  />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <label className="grid gap-2 text-sm font-medium sm:col-span-2">
                  Base postcode
                  <input
                    required
                    placeholder="e.g. SL2 1AF"
                    value={convertForm.postcode}
                    onChange={(event) =>
                      setConvertForm((current) =>
                        current ? { ...current, postcode: event.target.value.toUpperCase() } : current,
                      )
                    }
                    className="rounded-2xl border border-black/10 bg-[#fafbf7] px-4 py-3 uppercase outline-none transition focus:border-[#9fbd38] focus:bg-white"
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  Miles
                  <input
                    required
                    min="1"
                    type="number"
                    value={convertForm.miles}
                    onChange={(event) =>
                      setConvertForm((current) =>
                        current ? { ...current, miles: event.target.value } : current,
                      )
                    }
                    className="rounded-2xl border border-black/10 bg-[#fafbf7] px-4 py-3 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                  />
                </label>
              </div>

              <label className="grid gap-2 text-sm font-medium">
                Payment status
                <select
                  value={convertForm.paid_status}
                  onChange={(event) =>
                    setConvertForm((current) =>
                      current
                        ? {
                            ...current,
                            paid_status: event.target.value as SubscriberConvertForm["paid_status"],
                          }
                        : current,
                    )
                  }
                  className="rounded-2xl border border-black/10 bg-[#fafbf7] px-4 py-3 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                >
                  <option value="trial">Trial / not paid yet</option>
                  <option value="paid">Paid</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium">
                Notes
                <textarea
                  rows={4}
                  value={convertForm.notes}
                  onChange={(event) =>
                    setConvertForm((current) =>
                      current ? { ...current, notes: event.target.value } : current,
                    )
                  }
                  placeholder="Coverage agreement, price, caller notes..."
                  className="resize-none rounded-2xl border border-black/10 bg-[#fafbf7] px-4 py-3 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                />
              </label>

              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[#151713] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#2a2e24] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {saving ? "Adding..." : "Add subscriber"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

export function AdminView({
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
      <div className="rounded-[26px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)]">
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

      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[26px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)]">
          <p className="text-sm font-medium text-[#60721f]">Callers</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
            Saalah, Arslan, Ayaz
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

        <div className="rounded-[26px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)]">
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

"use client";

import { FormEvent, useMemo, useState } from "react";

export type Subscriber = {
  id: number;
  name: string;
  phone: string;
  postcode: string;
  miles: number;
  lat: number | null;
  lon: number | null;
  active: boolean;
  paid_status: "paid" | "trial";
  notes: string;
  created_at: string;
  coverages?: Coverage[];
};

type Coverage = {
  id?: number | null;
  coverage_type: "radius" | "prefix";
  code: string;
  label?: string | null;
  postcode?: string | null;
  miles?: number | null;
  active?: boolean;
  legacy?: boolean;
};

type FormState = {
  name: string;
  phone: string;
  postcode: string;
  miles: string;
  active: boolean;
  paid_status: "paid" | "trial";
  notes: string;
  coverages: Coverage[];
};

type StatusFilter = "all" | "active" | "paused";

const initialForm: FormState = {
  name: "",
  phone: "",
  postcode: "",
  miles: "30",
  active: true,
  paid_status: "trial",
  notes: "Agreed £50",
  coverages: [],
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

const cityNameToCode = Object.fromEntries(
  Object.entries(cityCoverageLabels).map(([code, label]) => [
    label.toLowerCase(),
    code,
  ]),
);

type SubscriberConsoleProps = {
  initialSubscribers: Subscriber[];
};

export function SubscriberConsole({ initialSubscribers }: SubscriberConsoleProps) {
  const [form, setForm] = useState<FormState>(initialForm);
  const [subscribers, setSubscribers] = useState<Subscriber[]>(initialSubscribers);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [coverageInput, setCoverageInput] = useState("");
  const [coverageMiles, setCoverageMiles] = useState("30");
  const [openActionId, setOpenActionId] = useState<number | null>(null);
  const [selectedSubscriber, setSelectedSubscriber] = useState<Subscriber | null>(null);
  const [editingSubscriberId, setEditingSubscriberId] = useState<number | null>(null);

  const activeCount = useMemo(
    () => subscribers.filter((subscriber) => subscriber.active).length,
    [subscribers],
  );

  const filteredSubscribers = useMemo(() => {
    const search = query.trim().toLowerCase();

    return subscribers.filter((subscriber) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && subscriber.active) ||
        (statusFilter === "paused" && !subscriber.active);

      if (!matchesStatus) return false;
      if (!search) return true;

      return [
        subscriber.name,
        subscriber.phone,
        subscriber.postcode,
        String(subscriber.miles),
        subscriber.paid_status,
        subscriber.notes,
        ...(subscriber.coverages || []).map(formatCoverage),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [query, statusFilter, subscribers]);

  const pausedCount = subscribers.length - activeCount;

  function normalizeCoverageCode(value: string) {
    const cleaned = value.trim().toUpperCase().replace(/\s+/g, " ");
    return cityNameToCode[cleaned.toLowerCase()] || cleaned;
  }

  function formatCoverage(coverage: Coverage) {
    if (coverage.coverage_type === "prefix") {
      const label = coverage.label || cityCoverageLabels[coverage.code];
      return label ? `${label} - ${coverage.code}` : coverage.code;
    }

    return `${coverage.code}${coverage.miles ? ` - ${coverage.miles} mi` : ""}`;
  }

  function formatDate(value: string) {
    return new Date(value).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function subscriberCoverages(subscriber: Subscriber) {
    return subscriber.coverages?.length
      ? subscriber.coverages
      : [
          {
            coverage_type: "radius" as const,
            code: subscriber.postcode,
            miles: subscriber.miles,
          },
        ];
  }

  function editSubscriber(subscriber: Subscriber) {
    const coverages = subscriberCoverages(subscriber);
    setForm({
      name: subscriber.name,
      phone: `+${subscriber.phone}`,
      postcode: subscriber.postcode,
      miles: String(subscriber.miles),
      active: subscriber.active,
      paid_status: subscriber.paid_status,
      notes: subscriber.notes || "",
      coverages,
    });
    setCoverageMiles(String(subscriber.miles || 30));
    setEditingSubscriberId(subscriber.id);
    setSelectedSubscriber(null);
    setOpenActionId(null);
    setMessage(`Editing ${subscriber.name}. Save to update their details.`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setForm(initialForm);
    setEditingSubscriberId(null);
    setMessage(null);
    setError(null);
  }

  function addCoverage() {
    const code = normalizeCoverageCode(coverageInput);
    if (!code) return;

    const isCityCoverage = Boolean(cityCoverageLabels[code]);
    const nextCoverage: Coverage = isCityCoverage
      ? {
          coverage_type: "prefix",
          code,
          label: cityCoverageLabels[code],
          active: true,
        }
      : {
          coverage_type: "radius",
          code,
          postcode: code,
          miles: Number(coverageMiles || form.miles || 30),
          active: true,
        };

    const exists = form.coverages.some(
      (coverage) =>
        coverage.coverage_type === nextCoverage.coverage_type &&
        coverage.code === nextCoverage.code,
    );
    if (exists) {
      setCoverageInput("");
      return;
    }

    setForm({ ...form, coverages: [...form.coverages, nextCoverage] });
    setCoverageInput("");
  }

  function removeCoverage(index: number) {
    setForm({
      ...form,
      coverages: form.coverages.filter((_, currentIndex) => currentIndex !== index),
    });
  }

  async function loadSubscribers() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/subscribers", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load subscribers.");
      setSubscribers(data.subscribers || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load subscribers.");
    } finally {
      setLoading(false);
    }
  }

  async function submitSubscriber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: editingSubscriberId || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save subscriber.");

      setMessage(
        data.coverageWarning ||
          `${data.subscriber.name} is ready for matching.`,
      );
      setForm(initialForm);
      setEditingSubscriberId(null);
      await loadSubscribers();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save subscriber.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleSubscriber(subscriber: Subscriber) {
    setError(null);
    setMessage(null);

    const response = await fetch("/api/subscribers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: subscriber.id, active: !subscriber.active }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not update subscriber.");
      return;
    }

    await loadSubscribers();
  }

  async function deleteSubscriber(subscriber: Subscriber) {
    setError(null);
    setMessage(null);

    const response = await fetch("/api/subscribers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: subscriber.id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Could not delete subscriber.");
      return;
    }

    await loadSubscribers();
  }

  return (
    <main className="min-h-[calc(100dvh-4rem)] px-4 py-6 text-[#151713] sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-[26px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)] lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#60721f]">
            Subscriber console
          </p>

          <div className="mt-8 max-w-xl">
            <h1 className="text-4xl font-semibold tracking-[-0.055em] text-[#151713]">
              Subscriber matching console
            </h1>
            <p className="mt-4 max-w-[58ch] text-sm leading-6 text-black/58">
              Add fitters with their phone, base postcode, and coverage areas. City
              prefixes decide eligibility; the base postcode powers drive time.
            </p>
          </div>

          <div className="mt-8 grid gap-3 text-sm text-black/58">
            <div className="rounded-2xl border border-black/8 bg-[#fafbf7] p-4">
              <p className="font-mono text-3xl font-semibold text-black">{subscribers.length}</p>
              <p className="mt-1">Total rows</p>
            </div>
            <div className="rounded-2xl border border-black/8 bg-[#edf6ca] p-4">
              <p className="font-mono text-3xl font-semibold text-[#34420d]">{activeCount}</p>
              <p className="mt-1">Enabled</p>
            </div>
            <div className="rounded-2xl border border-black/8 bg-[#fafbf7] p-4">
              <p className="font-mono text-3xl font-semibold text-black">{pausedCount}</p>
              <p className="mt-1">Paused</p>
            </div>
          </div>
        </section>

        <section className="grid gap-5">
          <form
            onSubmit={submitSubscriber}
            className="rounded-[26px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)]"
          >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-medium text-[#60721f]">
                  {editingSubscriberId ? "Editing subscriber" : "Add or update"}
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
                  {editingSubscriberId ? "Update subscriber details" : "Subscriber details"}
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {editingSubscriberId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-full border border-black/10 px-5 py-3 text-sm font-medium text-black/62 transition hover:bg-black/[0.03]"
                  >
                    Cancel edit
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-full bg-[#151713] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#2a2e24] disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {saving ? "Saving..." : editingSubscriberId ? "Update subscriber" : "Save subscriber"}
                </button>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Name
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Bashir"
                  className="rounded-xl border border-black/10 bg-[#fafbf7] px-3.5 py-2.5 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Phone number
                <input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="+2347067131336"
                  type="tel"
                  className="rounded-xl border border-black/10 bg-[#fafbf7] px-3.5 py-2.5 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Base postcode
                <input
                  value={form.postcode}
                  onChange={(event) =>
                    setForm({ ...form, postcode: event.target.value.toUpperCase() })
                  }
                  placeholder="E14 9GG"
                  className="rounded-xl border border-black/10 bg-[#fafbf7] px-3.5 py-2.5 uppercase outline-none transition focus:border-[#9fbd38] focus:bg-white"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Default miles
                <input
                  value={form.miles}
                  onChange={(event) => setForm({ ...form, miles: event.target.value })}
                  placeholder="50"
                  type="number"
                  min="1"
                  className="rounded-xl border border-black/10 bg-[#fafbf7] px-3.5 py-2.5 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Paid status
                <select
                  value={form.paid_status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      paid_status: event.target.value as "paid" | "trial",
                    })
                  }
                  className="rounded-xl border border-black/10 bg-[#fafbf7] px-3.5 py-2.5 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                >
                  <option value="trial">Trial</option>
                  <option value="paid">Paid</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Workflow status
                <select
                  value={form.active ? "active" : "paused"}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      active: event.target.value === "active",
                    })
                  }
                  className="rounded-xl border border-black/10 bg-[#fafbf7] px-3.5 py-2.5 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                >
                  <option value="active">Active - receives matching jobs</option>
                  <option value="paused">Paused - hidden from matching</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium sm:col-span-2">
                Notes
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm({ ...form, notes: event.target.value })}
                  rows={3}
                  placeholder="Agreed £50"
                  className="resize-none rounded-xl border border-black/10 bg-[#fafbf7] px-3.5 py-2.5 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                />
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-black/8 bg-[#fafbf7] p-4">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
                <div>
                  <p className="text-sm font-semibold">Coverage areas</p>
                  <p className="mt-1 text-sm text-black/55">
                    Add cities like Lancaster, LA, L1, M1, or postcode areas with
                    miles. If empty, base postcode and default miles are used.
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px_auto]">
                <input
                  value={coverageInput}
                  onChange={(event) => setCoverageInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCoverage();
                    }
                  }}
                  placeholder="LA, Lancaster, E14 9GG"
                  className="rounded-xl border border-black/10 bg-white px-3.5 py-2.5 outline-none transition focus:border-[#9fbd38]"
                />
                <input
                  value={coverageMiles}
                  onChange={(event) => setCoverageMiles(event.target.value)}
                  placeholder="Miles"
                  type="number"
                  min="1"
                  className="rounded-xl border border-black/10 bg-white px-3.5 py-2.5 outline-none transition focus:border-[#9fbd38]"
                />
                <button
                  type="button"
                  onClick={addCoverage}
                  className="rounded-full bg-[#151713] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#2a2e24]"
                >
                  Add area
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {form.coverages.length === 0 && (
                  <span className="rounded-full border border-dashed border-black/15 px-3 py-2 text-sm text-black/45">
                    No extra areas yet
                  </span>
                )}
                {form.coverages.map((coverage, index) => (
                  <button
                    key={`${coverage.coverage_type}-${coverage.code}`}
                    type="button"
                    onClick={() => removeCoverage(index)}
                    className="rounded-full bg-[#dff1a0] px-3 py-2 text-sm font-medium text-[#34420d] transition hover:bg-[#d2e98a]"
                    title="Remove coverage"
                  >
                    {formatCoverage(coverage)} x
                  </button>
                ))}
              </div>
            </div>

            {(message || error) && (
              <div
                className={`mt-5 rounded-2xl px-4 py-3 text-sm ${
                  error
                    ? "bg-red-50 text-red-700"
                    : "bg-[#edf6ca] text-[#35470b]"
                }`}
              >
                {error || message}
              </div>
            )}
          </form>

          <div className="rounded-[26px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)]">
            <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
              <div>
                <p className="text-sm font-medium text-[#60721f]">Current list</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
                  Who gets jobs
                </h2>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name, phone, coverage"
                  className="min-w-0 rounded-full border border-black/10 bg-[#fafbf7] px-4 py-2.5 text-sm outline-none transition placeholder:text-black/35 focus:border-[#9fbd38] focus:bg-white sm:w-72"
                />
                <button
                  type="button"
                  onClick={loadSubscribers}
                  className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-medium transition hover:border-black/20 hover:bg-black/[0.03]"
                >
                  Refresh
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { label: "All", value: "all", count: subscribers.length },
                { label: "Active", value: "active", count: activeCount },
                { label: "Paused", value: "paused", count: pausedCount },
              ].map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value as StatusFilter)}
                  className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                    statusFilter === filter.value
                      ? "bg-[#151713] text-white"
                      : "border border-black/10 text-black/62 hover:border-black/20 hover:bg-black/[0.03]"
                  }`}
                >
                  {filter.label} {filter.count}
                </button>
              ))}
            </div>

            <div className="mt-5">
              {loading && (
                <p className="rounded-2xl bg-[#fafbf7] p-4 text-sm text-black/58">
                  Loading subscribers...
                </p>
              )}

              {!loading && subscribers.length === 0 && (
                <p className="rounded-2xl bg-[#fafbf7] p-4 text-sm text-black/58">
                  No subscribers yet. Add the first fitter above.
                </p>
              )}

              {!loading && subscribers.length > 0 && filteredSubscribers.length === 0 && (
                <p className="rounded-2xl bg-[#fafbf7] p-4 text-sm text-black/58">
                  No subscribers match that view.
                </p>
              )}

              {!loading && filteredSubscribers.length > 0 && (
                <>
                  <div className="hidden overflow-visible rounded-2xl border border-black/8 md:block">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="bg-[#eef1e7] text-xs uppercase tracking-[0.12em] text-black/48">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Name</th>
                          <th className="px-4 py-3 font-semibold">Phone</th>
                          <th className="px-4 py-3 font-semibold">Base</th>
                          <th className="px-4 py-3 font-semibold">Coverage</th>
                          <th className="px-4 py-3 font-semibold">Payment</th>
                          <th className="px-4 py-3 font-semibold">Notes</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 text-right font-semibold">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/6 bg-white">
                        {filteredSubscribers.map((subscriber) => (
                          <tr key={subscriber.id} className="align-middle">
                            <td className="px-4 py-4 font-medium">{subscriber.name}</td>
                            <td className="px-4 py-4 font-mono text-black/62">
                              +{subscriber.phone}
                            </td>
                            <td className="px-4 py-4 font-medium">
                              {subscriber.postcode}
                            </td>
                            <td className="px-4 py-4 text-black/62">
                              <div className="flex max-w-md flex-wrap gap-1.5">
                                {subscriberCoverages(subscriber).map((coverage, index) => (
                                  <span
                                    key={`${coverage.coverage_type}-${coverage.code}-${index}`}
                                    className="rounded-full bg-white px-2.5 py-1 text-xs text-black/62"
                                  >
                                    {formatCoverage(coverage)}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                  subscriber.paid_status === "paid"
                                    ? "bg-[#dff1a0] text-[#34420d]"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {subscriber.paid_status === "paid" ? "Paid" : "Trial"}
                              </span>
                            </td>
                            <td className="max-w-44 px-4 py-4 text-black/62">
                              <span className="block truncate" title={subscriber.notes}>
                                {subscriber.notes || "Agreed £50"}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                  subscriber.active
                                    ? "bg-[#dff1a0] text-[#34420d]"
                                    : "bg-black/8 text-black/50"
                                }`}
                              >
                                {subscriber.active ? "Active" : "Paused"}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <div className="relative flex justify-end">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenActionId(
                                      openActionId === subscriber.id ? null : subscriber.id,
                                    )
                                  }
                                  className="grid size-9 place-items-center rounded-full border border-black/10 text-xl leading-none text-black/58 transition hover:border-black/20 hover:bg-white hover:text-black"
                                  aria-label={`Actions for ${subscriber.name}`}
                                >
                                  ⋮
                                </button>
                                {openActionId === subscriber.id && (
                                  <div className="absolute right-0 top-10 z-30 w-44 overflow-hidden rounded-2xl border border-black/10 bg-white p-1.5 text-sm shadow-[0_18px_50px_rgba(33,41,24,0.16)]">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedSubscriber(subscriber);
                                        setOpenActionId(null);
                                      }}
                                      className="w-full rounded-xl px-3 py-2 text-left text-black/72 transition hover:bg-[#fafbf7]"
                                    >
                                      View details
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => editSubscriber(subscriber)}
                                      className="w-full rounded-xl px-3 py-2 text-left text-black/72 transition hover:bg-[#fafbf7]"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionId(null);
                                        toggleSubscriber(subscriber);
                                      }}
                                      className="w-full rounded-xl px-3 py-2 text-left text-black/72 transition hover:bg-[#fafbf7]"
                                    >
                                      {subscriber.active ? "Pause" : "Enable"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenActionId(null);
                                        deleteSubscriber(subscriber);
                                      }}
                                      className="w-full rounded-xl px-3 py-2 text-left text-red-700 transition hover:bg-red-50"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid gap-3 md:hidden">
                    {filteredSubscribers.map((subscriber) => (
                      <article
                        key={subscriber.id}
                        className="grid gap-4 rounded-2xl border border-black/8 bg-[#fafbf7] p-4"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold tracking-[-0.02em]">
                              {subscriber.name}
                            </h3>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                subscriber.active
                                  ? "bg-[#dff1a0] text-[#34420d]"
                                  : "bg-black/8 text-black/50"
                              }`}
                            >
                              {subscriber.active ? "Active" : "Paused"}
                            </span>
                          </div>
                          <p className="mt-2 font-mono text-sm text-black/62">
                            +{subscriber.phone}
                          </p>
                          <p className="mt-3 text-sm text-black/62">
                            Base {subscriber.postcode}, default {subscriber.miles} miles
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                subscriber.paid_status === "paid"
                                  ? "bg-[#dff1a0] text-[#34420d]"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {subscriber.paid_status === "paid" ? "Paid" : "Trial"}
                            </span>
                            <span className="text-sm text-black/55">
                              {subscriber.notes || "Agreed £50"}
                            </span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {subscriberCoverages(subscriber).map((coverage, index) => (
                              <span
                                key={`${coverage.coverage_type}-${coverage.code}-${index}`}
                                className="rounded-full bg-white px-2.5 py-1 text-xs text-black/62"
                              >
                                {formatCoverage(coverage)}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedSubscriber(subscriber)}
                            className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:border-black/20 hover:bg-white"
                          >
                            View details
                          </button>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenActionId(
                                  openActionId === subscriber.id ? null : subscriber.id,
                                )
                              }
                              className="grid size-10 place-items-center rounded-full border border-black/10 text-xl leading-none text-black/58 transition hover:border-black/20 hover:bg-white hover:text-black"
                              aria-label={`Actions for ${subscriber.name}`}
                            >
                              ⋮
                            </button>
                            {openActionId === subscriber.id && (
                              <div className="absolute right-0 top-11 z-30 w-44 overflow-hidden rounded-2xl border border-black/10 bg-white p-1.5 text-sm shadow-[0_18px_50px_rgba(33,41,24,0.16)]">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    editSubscriber(subscriber);
                                  }}
                                  className="w-full rounded-xl px-3 py-2 text-left text-black/72 transition hover:bg-[#fafbf7]"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    toggleSubscriber(subscriber);
                                  }}
                                  className="w-full rounded-xl px-3 py-2 text-left text-black/72 transition hover:bg-[#fafbf7]"
                                >
                                  {subscriber.active ? "Pause" : "Enable"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    deleteSubscriber(subscriber);
                                  }}
                                  className="w-full rounded-xl px-3 py-2 text-left text-red-700 transition hover:bg-red-50"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </div>

      {selectedSubscriber && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 py-8 backdrop-blur-sm">
          <section className="max-h-[88dvh] w-full max-w-2xl overflow-auto rounded-[28px] border border-black/8 bg-white p-5 shadow-[0_24px_90px_rgba(14,18,10,0.24)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#60721f]">
                  Subscriber details
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-[-0.045em]">
                  {selectedSubscriber.name}
                </h2>
                <p className="mt-2 font-mono text-sm text-black/58">
                  +{selectedSubscriber.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSubscriber(null)}
                className="grid size-10 place-items-center rounded-full border border-black/10 text-xl text-black/58 transition hover:bg-[#fafbf7] hover:text-black"
                aria-label="Close details"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-[#fafbf7] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/42">
                  Base postcode
                </p>
                <p className="mt-2 text-lg font-semibold">{selectedSubscriber.postcode}</p>
                <p className="mt-1 text-sm text-black/52">
                  Default {selectedSubscriber.miles} miles
                </p>
              </div>
              <div className="rounded-2xl bg-[#fafbf7] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/42">
                  Status
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      selectedSubscriber.active
                        ? "bg-[#dff1a0] text-[#34420d]"
                        : "bg-black/8 text-black/50"
                    }`}
                  >
                    {selectedSubscriber.active ? "Active" : "Paused"}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      selectedSubscriber.paid_status === "paid"
                        ? "bg-[#dff1a0] text-[#34420d]"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {selectedSubscriber.paid_status === "paid" ? "Paid" : "Trial"}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-2xl bg-[#fafbf7] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/42">
                Notes
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-black/72">
                {selectedSubscriber.notes || "No notes saved."}
              </p>
            </div>

            <div className="mt-3 rounded-2xl bg-[#fafbf7] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/42">
                Coverage
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {subscriberCoverages(selectedSubscriber).map((coverage, index) => (
                  <span
                    key={`${coverage.coverage_type}-${coverage.code}-${index}`}
                    className="rounded-full bg-white px-3 py-1.5 text-sm text-black/62"
                  >
                    {formatCoverage(coverage)}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-black/48">
              <span>Created {formatDate(selectedSubscriber.created_at)}</span>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => editSubscriber(selectedSubscriber)}
                  className="rounded-full border border-black/10 px-4 py-2 font-medium text-black/68 transition hover:bg-[#fafbf7]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    toggleSubscriber(selectedSubscriber);
                    setSelectedSubscriber(null);
                  }}
                  className="rounded-full border border-black/10 px-4 py-2 font-medium text-black/68 transition hover:bg-[#fafbf7]"
                >
                  {selectedSubscriber.active ? "Pause" : "Enable"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    deleteSubscriber(selectedSubscriber);
                    setSelectedSubscriber(null);
                  }}
                  className="rounded-full border border-red-200 px-4 py-2 font-medium text-red-700 transition hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

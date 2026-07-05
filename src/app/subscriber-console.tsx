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
  created_at: string;
};

type FormState = {
  name: string;
  phone: string;
  postcode: string;
  miles: string;
};

const initialForm: FormState = {
  name: "",
  phone: "",
  postcode: "",
  miles: "30",
};

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

  const activeCount = useMemo(
    () => subscribers.filter((subscriber) => subscriber.active).length,
    [subscribers],
  );

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
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save subscriber.");

      setMessage(`${data.subscriber.name} is ready for matching.`);
      setForm(initialForm);
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
    <main className="min-h-[100dvh] bg-[#f6f7f3] px-4 py-6 text-[#151713] sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[0.9fr_1.25fr]">
        <section className="rounded-[28px] bg-[#11140f] p-6 text-white shadow-[0_24px_80px_rgba(28,34,20,0.18)] sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#b8d45f]">
              TyreFlow
            </p>
            <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70">
              {activeCount} active
            </span>
          </div>

          <div className="mt-16 max-w-xl">
            <h1 className="text-5xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
              Subscriber matching console
            </h1>
            <p className="mt-6 max-w-[58ch] text-base leading-7 text-white/68">
              Add fitters with their phone, base postcode, and coverage radius. The
              workflow sends each new tyre job only to people inside range.
            </p>
          </div>

          <div className="mt-12 grid gap-3 text-sm text-white/72 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-2xl font-semibold text-white">{subscribers.length}</p>
              <p className="mt-1">Total rows</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-2xl font-semibold text-white">{activeCount}</p>
              <p className="mt-1">Enabled</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-2xl font-semibold text-white">Live</p>
              <p className="mt-1">Supabase table</p>
            </div>
          </div>
        </section>

        <section className="grid gap-6">
          <form
            onSubmit={submitSubscriber}
            className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_18px_60px_rgba(33,41,24,0.08)] sm:p-6"
          >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <p className="text-sm font-medium text-[#60721f]">Add or update</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
                  Subscriber details
                </h2>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="rounded-full bg-[#151713] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#2a2e24] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {saving ? "Saving..." : "Save subscriber"}
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Name
                <input
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="Bashir"
                  className="rounded-2xl border border-black/10 bg-[#fafbf7] px-4 py-3 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Phone number
                <input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                  placeholder="+2347067131336"
                  type="tel"
                  className="rounded-2xl border border-black/10 bg-[#fafbf7] px-4 py-3 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Postcode
                <input
                  value={form.postcode}
                  onChange={(event) =>
                    setForm({ ...form, postcode: event.target.value.toUpperCase() })
                  }
                  placeholder="E14 9GG"
                  className="rounded-2xl border border-black/10 bg-[#fafbf7] px-4 py-3 uppercase outline-none transition focus:border-[#9fbd38] focus:bg-white"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Miles
                <input
                  value={form.miles}
                  onChange={(event) => setForm({ ...form, miles: event.target.value })}
                  placeholder="50"
                  type="number"
                  min="1"
                  className="rounded-2xl border border-black/10 bg-[#fafbf7] px-4 py-3 outline-none transition focus:border-[#9fbd38] focus:bg-white"
                />
              </label>
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

          <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-[0_18px_60px_rgba(33,41,24,0.08)] sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[#60721f]">Current list</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-[-0.035em]">
                  Who gets jobs
                </h2>
              </div>
              <button
                type="button"
                onClick={loadSubscribers}
                className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:border-black/20 hover:bg-black/[0.03]"
              >
                Refresh
              </button>
            </div>

            <div className="mt-5 grid gap-3">
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

              {subscribers.map((subscriber) => (
                <article
                  key={subscriber.id}
                  className="grid gap-4 rounded-2xl border border-black/8 bg-[#fafbf7] p-4 sm:grid-cols-[1fr_auto]"
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
                      {subscriber.postcode} within {subscriber.miles} miles
                    </p>
                  </div>

                  <div className="flex flex-wrap items-start gap-2 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => toggleSubscriber(subscriber)}
                      className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium transition hover:border-black/20 hover:bg-white"
                    >
                      {subscriber.active ? "Pause" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSubscriber(subscriber)}
                      className="rounded-full border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

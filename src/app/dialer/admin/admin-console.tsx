"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AdminView, type DialerData } from "../dialer-console";

export function AdminConsole() {
  const [pin, setPin] = useState("");
  const [data, setData] = useState<DialerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAdmin(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dialer/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load admin.");
      setData(payload);
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "Could not load admin.");
    } finally {
      setLoading(false);
    }
  }

  if (!data) {
    return (
      <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-10 text-[#151713] sm:px-6">
        <form
          onSubmit={loadAdmin}
          className="w-full max-w-lg rounded-[30px] border border-black/8 bg-white p-6 shadow-[0_24px_80px_rgba(28,34,20,0.14)] sm:p-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#60721f]">
              TyreFlow Admin
            </p>
            <Link
              href="/dialer"
              className="rounded-full border border-black/10 px-3 py-1.5 text-xs text-black/58 transition hover:border-black/20 hover:text-black"
            >
              Caller login
            </Link>
          </div>

          <h1 className="mt-10 text-5xl font-semibold tracking-[-0.06em] text-[#151713]">
            Admin PIN
          </h1>
          <p className="mt-5 text-base leading-7 text-black/58">
            Enter the admin PIN to view team progress, call activity, notes, and
            recordings.
          </p>

          <label className="mt-8 grid gap-2 text-sm font-medium text-black/70">
            PIN
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              className="rounded-2xl border border-black/10 bg-[#fafbf7] px-4 py-3 text-black outline-none transition focus:border-[#9fbd38] focus:bg-white"
              placeholder="Enter PIN"
            />
          </label>

          {error && (
            <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !pin.trim()}
            className="mt-5 w-full rounded-full bg-[#151713] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#2a2e24] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? "Opening..." : "Open admin"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100dvh-4rem)] px-4 py-6 text-[#151713] sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-5">
        <section className="rounded-[28px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)] sm:p-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#60721f]">
                TyreFlow Admin
              </p>
              <h1 className="mt-5 text-4xl font-semibold tracking-[-0.055em] text-[#151713] sm:text-5xl">
                Dialer admin
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dialer"
                className="rounded-full border border-black/10 px-4 py-2 text-sm text-black/58 transition hover:border-black/20 hover:text-black"
              >
                Caller login
              </Link>
              <button
                type="button"
                onClick={() => {
                  setData(null);
                  setPin("");
                }}
                className="rounded-full border border-black/10 px-4 py-2 text-sm text-black/58 transition hover:border-black/20 hover:text-black"
              >
                Lock
              </button>
            </div>
          </div>
        </section>

        <AdminView
          data={data}
          loading={loading}
          reload={() => loadAdmin()}
          onPickLead={() => undefined}
        />
      </div>
    </main>
  );
}

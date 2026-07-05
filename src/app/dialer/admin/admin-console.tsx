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
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#f6f7f3] px-4 py-10 text-[#151713] sm:px-6">
        <form
          onSubmit={loadAdmin}
          className="w-full max-w-lg rounded-[32px] bg-[#11140f] p-6 text-white shadow-[0_24px_80px_rgba(28,34,20,0.22)] sm:p-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#b8d45f]">
              TyreFlow Admin
            </p>
            <Link
              href="/dialer"
              className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/70 transition hover:border-white/30 hover:text-white"
            >
              Caller login
            </Link>
          </div>

          <h1 className="mt-14 text-5xl font-semibold tracking-[-0.06em] text-white">
            Admin PIN
          </h1>
          <p className="mt-5 text-base leading-7 text-white/68">
            Enter the admin PIN to view team progress, call activity, notes, and
            recordings.
          </p>

          <label className="mt-8 grid gap-2 text-sm font-medium text-white/78">
            PIN
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              className="rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-white outline-none transition focus:border-[#b8d45f]"
              placeholder="Enter PIN"
            />
          </label>

          {error && (
            <p className="mt-4 rounded-2xl bg-red-500/12 px-4 py-3 text-sm text-red-100">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !pin.trim()}
            className="mt-5 w-full rounded-full bg-[#dff1a0] px-5 py-3 text-sm font-semibold text-[#34420d] transition hover:bg-[#d2e98a] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {loading ? "Opening..." : "Open admin"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-[100dvh] bg-[#f6f7f3] px-4 py-6 text-[#151713] sm:px-6 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-6">
        <section className="rounded-[30px] bg-[#11140f] p-6 text-white shadow-[0_24px_80px_rgba(28,34,20,0.18)] sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#b8d45f]">
                TyreFlow Admin
              </p>
              <h1 className="mt-8 text-5xl font-semibold tracking-[-0.06em] text-white sm:text-6xl">
                Dialer admin
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dialer"
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
              >
                Caller login
              </Link>
              <button
                type="button"
                onClick={() => {
                  setData(null);
                  setPin("");
                }}
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-white/30 hover:text-white"
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

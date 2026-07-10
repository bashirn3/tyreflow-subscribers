import { AyazNav } from "../ayaz-nav";

export const dynamic = "force-dynamic";

type AyazSubscriber = {
  id: number;
  name: string;
  phone: string;
  postcode: string;
  miles: number;
  active: boolean;
  paid_status: "paid" | "trial" | null;
  notes: string | null;
  created_at: string;
};

type AyazSubscribersResult = {
  subscribers: AyazSubscriber[];
  warning: string | null;
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhone(phone: string) {
  const digits = String(phone || "").replace(/[^0-9]/g, "");
  if (digits.startsWith("44") && digits.length === 12) {
    const local = `0${digits.slice(2)}`;
    return `${local.slice(0, 5)} ${local.slice(5, 8)} ${local.slice(8)}`;
  }
  return phone ? `+${digits || phone}` : "No phone";
}

async function getAyazSubscribers(): Promise<AyazSubscribersResult> {
  if (!supabaseUrl || !supabaseKey) {
    return { subscribers: [], warning: "Missing Supabase environment variables." };
  }

  const select =
    "id,name,phone,postcode,miles,active,paid_status,notes,created_at,created_by_caller_id";
  const response = await fetch(
    `${supabaseUrl}/rest/v1/tyreflow_subscribers?select=${select}&created_by_caller_id=eq.ayaz&order=created_at.desc`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      cache: "no-store",
    },
  );

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const detail = payload?.message || payload?.error || response.statusText;
    const missingOwnership = String(detail).includes("created_by_caller_id");
    return {
      subscribers: [],
      warning: missingOwnership
        ? "Subscriber ownership columns are missing. Run supabase/tyreflow-subscriber-ownership-schema.sql."
        : detail,
    };
  }

  return { subscribers: payload || [], warning: null };
}

export default async function AyazSubscribersPage() {
  const { subscribers, warning } = await getAyazSubscribers();
  const activeCount = subscribers.filter((subscriber) => subscriber.active).length;

  return (
    <>
      <AyazNav active="subscribers" />
      <main className="min-h-[calc(100dvh-4rem)] px-4 py-6 text-[#151713] sm:px-6 lg:px-10">
        <div className="mx-auto grid max-w-7xl gap-5">
          <section className="rounded-[28px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)] sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#60721f]">
              Ayaz subscribers
            </p>
            <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <h1 className="max-w-3xl text-3xl font-semibold tracking-[-0.055em] text-[#151713] sm:text-4xl">
                  My subscribers
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-black/58">
                  Subscribers added from Ayaz&apos;s dialer are shown here. Global
                  subscribers and admin records stay hidden.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[300px]">
                <div className="rounded-2xl border border-black/8 bg-[#fafbf7] p-4">
                  <p className="font-mono text-3xl font-semibold text-black">
                    {subscribers.length}
                  </p>
                  <p className="mt-1 text-sm text-black/55">Owned rows</p>
                </div>
                <div className="rounded-2xl border border-black/8 bg-[#edf6ca] p-4">
                  <p className="font-mono text-3xl font-semibold text-[#34420d]">
                    {activeCount}
                  </p>
                  <p className="mt-1 text-sm text-black/55">Active</p>
                </div>
              </div>
            </div>

            {warning && (
              <p className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {warning}
              </p>
            )}
          </section>

          <section className="rounded-[28px] border border-black/8 bg-white p-5 shadow-[0_18px_50px_rgba(33,41,24,0.08)]">
            {subscribers.length === 0 ? (
              <p className="rounded-2xl bg-[#fafbf7] p-4 text-sm text-black/58">
                No subscribers added by Ayaz yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-black/8">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-[#eef1e7] text-xs uppercase tracking-[0.12em] text-black/48">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Name</th>
                      <th className="px-4 py-3 font-semibold">Phone</th>
                      <th className="px-4 py-3 font-semibold">Base</th>
                      <th className="px-4 py-3 font-semibold">Payment</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3 font-semibold">Added</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/6 bg-white">
                    {subscribers.map((subscriber) => (
                      <tr key={subscriber.id} className="align-middle">
                        <td className="px-4 py-4 font-medium">{subscriber.name}</td>
                        <td className="px-4 py-4 font-mono text-black/62">
                          {formatPhone(subscriber.phone)}
                        </td>
                        <td className="px-4 py-4 font-medium">
                          {subscriber.postcode}
                          <span className="ml-2 text-xs font-normal text-black/45">
                            {subscriber.miles} mi
                          </span>
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
                        <td className="px-4 py-4 text-black/55">
                          {formatDate(subscriber.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

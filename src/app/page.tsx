import { Subscriber, SubscriberConsole } from "./subscriber-console";

export const dynamic = "force-dynamic";

async function getInitialSubscribers(): Promise<Subscriber[]> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return [];

  try {
    let response = await fetch(
      `${supabaseUrl}/rest/v1/tyreflow_subscribers?select=id,name,phone,postcode,miles,lat,lon,active,paid_status,notes,created_at&order=created_at.desc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      response = await fetch(
        `${supabaseUrl}/rest/v1/tyreflow_subscribers?select=id,name,phone,postcode,miles,lat,lon,active,created_at&order=created_at.desc`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          cache: "no-store",
        },
      );
    }

    if (!response.ok) return [];
    const subscribers = (await response.json()).map((subscriber: Subscriber) => ({
      ...subscriber,
      paid_status: subscriber.paid_status || "trial",
      notes: subscriber.notes || "Agreed £50",
    }));

    const coverageResponse = await fetch(
      `${supabaseUrl}/rest/v1/tyreflow_subscriber_coverages?select=id,subscriber_id,coverage_type,code,label,postcode,miles,active,created_at&order=created_at.asc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      },
    );

    const coverages = coverageResponse.ok ? await coverageResponse.json() : [];
    const coverageBySubscriber = new Map<number, unknown[]>();
    for (const coverage of coverages) {
      const subscriberId = Number(coverage.subscriber_id);
      coverageBySubscriber.set(subscriberId, [
        ...(coverageBySubscriber.get(subscriberId) || []),
        coverage,
      ]);
    }

    return subscribers.map((subscriber: Subscriber) => ({
      ...subscriber,
      coverages:
        coverageBySubscriber.get(subscriber.id) ||
        [
          {
            coverage_type: "radius",
            code: subscriber.postcode,
            postcode: subscriber.postcode,
            miles: subscriber.miles,
            active: subscriber.active,
            legacy: true,
          },
        ],
    }));
  } catch {
    return [];
  }
}

export default async function Home() {
  const subscribers = await getInitialSubscribers();
  return <SubscriberConsole initialSubscribers={subscribers} />;
}

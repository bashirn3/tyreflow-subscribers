import { Subscriber, SubscriberConsole } from "./subscriber-console";

export const dynamic = "force-dynamic";

async function getInitialSubscribers(): Promise<Subscriber[]> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) return [];

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/tyreflow_subscribers?select=id,name,phone,postcode,miles,lat,lon,active,created_at&order=created_at.desc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      },
    );

    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

export default async function Home() {
  const subscribers = await getInitialSubscribers();
  return <SubscriberConsole initialSubscribers={subscribers} />;
}

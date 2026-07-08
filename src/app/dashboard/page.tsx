import { SubscriberConsole } from "../subscriber-console";
import { getInitialSubscribers } from "../page";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const subscribers = await getInitialSubscribers();
  return <SubscriberConsole initialSubscribers={subscribers} />;
}

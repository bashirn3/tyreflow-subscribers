import { getDialerInitialData } from "@/lib/dialer-initial-data";
import { DialerConsole } from "./dialer-console";

export const dynamic = "force-dynamic";

export default async function DialerPage() {
  const initialData = await getDialerInitialData();
  return <DialerConsole initialData={initialData} />;
}

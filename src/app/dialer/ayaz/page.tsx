import { getDialerInitialData } from "@/lib/dialer-initial-data";
import { DialerConsole } from "../dialer-console";
import { AyazNav } from "./ayaz-nav";

export const dynamic = "force-dynamic";

export default async function AyazDialerPage() {
  const initialData = await getDialerInitialData();
  return (
    <>
      <AyazNav active="dialer" />
      <DialerConsole
        initialData={initialData}
        initialCallerId="ayaz"
        showNavigationLinks={false}
      />
    </>
  );
}

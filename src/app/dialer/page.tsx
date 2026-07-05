import {
  buildDialerStats,
  fetchDialerEvents,
  fetchDialerLeads,
  fetchDialerRecordings,
  fetchDialerTasks,
  type DialerCallEvent,
  type DialerLead,
  type DialerRecording,
  type DialerTask,
} from "@/lib/dialer";
import { DialerConsole } from "./dialer-console";

export const dynamic = "force-dynamic";

export type DialerInitialData = {
  leads: DialerLead[];
  tasks: DialerTask[];
  events: DialerCallEvent[];
  recordings: DialerRecording[];
  stats: ReturnType<typeof buildDialerStats>;
  error: string | null;
};

async function getInitialData(): Promise<DialerInitialData> {
  try {
    const [leads, tasks, events, recordings] = await Promise.all([
      fetchDialerLeads(),
      fetchDialerTasks(),
      fetchDialerEvents(),
      fetchDialerRecordings(),
    ]);

    return {
      leads,
      tasks,
      events,
      recordings,
      stats: buildDialerStats({ leads, tasks, events, recordings }),
      error: null,
    };
  } catch (error) {
    return {
      leads: [],
      tasks: [],
      events: [],
      recordings: [],
      stats: buildDialerStats({ leads: [], tasks: [], events: [], recordings: [] }),
      error: error instanceof Error ? error.message : "Could not load dialer data.",
    };
  }
}

export default async function DialerPage() {
  const initialData = await getInitialData();
  return <DialerConsole initialData={initialData} />;
}

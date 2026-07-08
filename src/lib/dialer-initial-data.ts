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

export type DialerInitialData = {
  leads: DialerLead[];
  tasks: DialerTask[];
  events: DialerCallEvent[];
  recordings: DialerRecording[];
  stats: ReturnType<typeof buildDialerStats>;
  error: string | null;
};

export async function getDialerInitialData(): Promise<DialerInitialData> {
  try {
    const [leads, statsLeads, tasks, events, recordings] = await Promise.all([
      fetchDialerLeads(),
      fetchDialerLeads(undefined, { includeSubscriberPhones: true }),
      fetchDialerTasks(),
      fetchDialerEvents(),
      fetchDialerRecordings(),
    ]);

    return {
      leads,
      tasks,
      events,
      recordings,
      stats: buildDialerStats({ leads: statsLeads, tasks, events, recordings }),
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

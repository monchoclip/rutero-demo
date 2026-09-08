import type { Activity, Client } from "./types";

const DAY = 86_400_000;

function inWindow(date: string, from: number, to: number) {
  const time = new Date(date).getTime();
  return time >= from && time < to;
}

export type AdvisorStats = {
  portfolio: number;
  scheduled: number;
  overdue: number;
  completedTotal: number;
  completedLast7: number;
  completedPrev7: number;
  completionRate: number | null;
  avgResolutionHours: number | null;
  avgDurationMinutes: number | null;
};

// Every figure here comes straight from Client/Activity rows already on the
// wire for this workspace — nothing is estimated or backfilled.
export function advisorStats(
  advisorId: string,
  clients: Client[],
  activities: Activity[],
): AdvisorStats {
  const now = Date.now();
  const mine = activities.filter((a) => a.advisor.id === advisorId);
  const scheduled = mine.filter((a) => a.status === "scheduled");
  const overdue = scheduled.filter(
    (a) => new Date(a.dueAt).getTime() < now,
  ).length;
  const completed = mine.filter((a) => a.status === "completed");
  const completedLast7 = completed.filter(
    (a) => a.completedAt && inWindow(a.completedAt, now - 7 * DAY, now),
  ).length;
  const completedPrev7 = completed.filter(
    (a) =>
      a.completedAt && inWindow(a.completedAt, now - 14 * DAY, now - 7 * DAY),
  ).length;
  const resolutionHours = completed
    .filter((a) => a.completedAt)
    .map(
      (a) =>
        (new Date(a.completedAt!).getTime() - new Date(a.createdAt).getTime()) /
        3_600_000,
    )
    .filter((hours) => hours >= 0);
  const durations = completed
    .map((a) => a.durationSeconds)
    .filter((seconds): seconds is number => seconds != null && seconds > 0);
  const closedOrPending = scheduled.length + completed.length;
  return {
    portfolio: clients.filter((c) => c.advisorId === advisorId).length,
    scheduled: scheduled.length,
    overdue,
    completedTotal: completed.length,
    completedLast7,
    completedPrev7,
    completionRate: closedOrPending
      ? Math.round((completed.length / closedOrPending) * 100)
      : null,
    avgResolutionHours: average(resolutionHours),
    avgDurationMinutes: average(durations) ? average(durations)! / 60 : null,
  };
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

export type AgendaGroup = {
  key: "overdue" | "today" | "upcoming";
  label: string;
  hint: string;
  items: Activity[];
};

// Buckets a scheduled agenda by urgency so the UI can show "Vencidos / Hoy /
// Próximos" instead of one flat list, using only dueAt already on each row.
// "Vencidos" matches the same now-precision used for the overview's overdue
// count, so both views agree on what counts as late.
export function groupSchedule(scheduled: Activity[]): AgendaGroup[] {
  const now = Date.now();
  const endOfToday = new Date().setHours(23, 59, 59, 999);
  const groups: AgendaGroup[] = [
    {
      key: "overdue",
      label: "Vencidos",
      hint: "Ya pasaron su fecha",
      items: [],
    },
    {
      key: "today",
      label: "Hoy",
      hint: "Antes de que termine el día",
      items: [],
    },
    {
      key: "upcoming",
      label: "Próximos",
      hint: "Más adelante en tu agenda",
      items: [],
    },
  ];
  for (const activity of scheduled) {
    const due = new Date(activity.dueAt).getTime();
    const group =
      due < now ? groups[0] : due <= endOfToday ? groups[1] : groups[2];
    group.items.push(activity);
  }
  return groups;
}

export type ClientStats = {
  total: number;
  scheduled: number;
  completed: number;
  lastContact: string | null;
};

// Summarizes one client's history rows for the ficha's quick-stats row.
export function clientStats(history: Activity[]): ClientStats {
  const completed = history.filter((a) => a.status === "completed");
  const lastContact = completed
    .map((a) => a.completedAt)
    .filter((date): date is string => date != null)
    .sort()
    .at(-1);
  return {
    total: history.length,
    scheduled: history.filter((a) => a.status === "scheduled").length,
    completed: completed.length,
    lastContact: lastContact ?? null,
  };
}

// The soonest still-pending activity, so the ficha can call it out above the
// chronological timeline instead of burying it in the list.
export function nextContact(history: Activity[]): Activity | null {
  const scheduled = history.filter((a) => a.status === "scheduled");
  if (!scheduled.length) return null;
  return scheduled.reduce((soonest, a) =>
    new Date(a.dueAt) < new Date(soonest.dueAt) ? a : soonest,
  );
}

export type Trend = { current: number; previous: number; delta: number | null };

// Compares the trailing 7-day window to the 7 days before it, both derived
// from completedAt timestamps already loaded for this workspace.
export function weeklyTrend(
  activities: Activity[],
  predicate: (activity: Activity) => boolean,
): Trend {
  const now = Date.now();
  const current = activities.filter(
    (a) =>
      predicate(a) &&
      a.completedAt &&
      inWindow(a.completedAt, now - 7 * DAY, now),
  ).length;
  const previous = activities.filter(
    (a) =>
      predicate(a) &&
      a.completedAt &&
      inWindow(a.completedAt, now - 14 * DAY, now - 7 * DAY),
  ).length;
  const delta = previous
    ? Math.round(((current - previous) / previous) * 100)
    : current
      ? 100
      : null;
  return { current, previous, delta };
}

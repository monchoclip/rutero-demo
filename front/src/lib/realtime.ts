const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4068";

export type RealtimeEventType =
  | "realtime.ready"
  | "realtime.heartbeat"
  | "client.created"
  | "client.updated"
  | "activity.created"
  | "activity.completed"
  | "visit.started"
  | "visit.completed"
  | "chat.received"
  | "membership.updated"
  | "catalog.updated"
  | "campaign.enrolled"
  | "order.updated";

export type RealtimeEvent = {
  id: string;
  type: RealtimeEventType;
  organizationId: string;
  resourceId?: string;
  emittedAt: string;
};

export function subscribeRealtime({
  onEvent,
  onState,
}: {
  onEvent: (event: RealtimeEvent) => void;
  onState?: (state: "connected" | "connecting" | "fallback") => void;
}) {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    onState?.("fallback");
    return () => undefined;
  }
  let closed = false;
  let source: EventSource | null = null;
  let retry = 1000;
  let retryTimer: number | null = null;

  const connect = () => {
    if (closed) return;
    onState?.("connecting");
    source = new EventSource(`${API_URL}/realtime/events`, {
      withCredentials: true,
    });
    const read = (message: MessageEvent<string>) => {
      try {
        const event = JSON.parse(message.data) as RealtimeEvent;
        if (event.type === "realtime.ready") {
          retry = 1000;
          onState?.("connected");
        }
        if (event.type !== "realtime.heartbeat") onEvent(event);
      } catch {
        // A malformed stream message should not break the workspace.
      }
    };
    source.addEventListener("ready", read as EventListener);
    source.addEventListener("message", read as EventListener);
    source.onerror = () => {
      source?.close();
      source = null;
      if (closed) return;
      onState?.(retry >= 30_000 ? "fallback" : "connecting");
      retryTimer = window.setTimeout(connect, retry);
      retry = Math.min(retry * 2, 30_000);
    };
  };

  connect();
  return () => {
    closed = true;
    source?.close();
    if (retryTimer) window.clearTimeout(retryTimer);
  };
}

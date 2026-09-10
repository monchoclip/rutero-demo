import type { FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import type { Actor } from "../identity/IdentityTypes.js";

export type RealtimeEventType =
  | "realtime.ready"
  | "realtime.heartbeat"
  | "client.created"
  | "client.updated"
  | "activity.created"
  | "activity.completed"
  | "activity.cancelled"
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

type Client = {
  id: string;
  organizationId: string;
  reply: FastifyReply;
  heartbeat: NodeJS.Timeout;
};

export class EventHub {
  private clients = new Map<string, Client>();

  subscribe(actor: Actor, reply: FastifyReply) {
    if (!actor.organizationId) {
      reply.code(403).send({
        error: "TENANT_REQUIRED",
        message: "Selecciona una empresa autorizada.",
      });
      return;
    }
    const id = randomUUID();
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const client: Client = {
      id,
      organizationId: actor.organizationId,
      reply,
      heartbeat: setInterval(() => {
        this.write(reply, "heartbeat", {
          id: randomUUID(),
          type: "realtime.heartbeat",
          organizationId: actor.organizationId!,
          emittedAt: new Date().toISOString(),
        });
      }, 25_000),
    };
    this.clients.set(id, client);
    reply.raw.on("close", () => this.disconnect(id));
    this.write(reply, "ready", {
      id,
      type: "realtime.ready",
      organizationId: actor.organizationId,
      emittedAt: new Date().toISOString(),
    });
  }

  publish(input: Omit<RealtimeEvent, "id" | "emittedAt">) {
    const event: RealtimeEvent = {
      ...input,
      id: randomUUID(),
      emittedAt: new Date().toISOString(),
    };
    for (const client of this.clients.values()) {
      if (client.organizationId === event.organizationId)
        this.write(client.reply, "message", event);
    }
    return event;
  }

  close() {
    for (const client of this.clients.values()) this.disconnect(client.id);
  }

  private disconnect(id: string) {
    const client = this.clients.get(id);
    if (!client) return;
    clearInterval(client.heartbeat);
    this.clients.delete(id);
  }

  private write(reply: FastifyReply, event: string, data: RealtimeEvent) {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  }
}

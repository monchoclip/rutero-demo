"use client";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleDashed,
  Filter,
  UserRound,
} from "lucide-react";
import {
  activityLabels,
  type Activity,
  type Client,
  type User,
} from "../lib/types";
import { ActivityIcon, Empty } from "./WorkspaceViews";
import { visitEvidenceStatus } from "../lib/visitEvidence";

type SequenceColumn = {
  key: "blocked" | "today" | "next" | "empty";
  title: string;
  hint: string;
  items: SequenceItem[];
};
type SequenceItem =
  | { kind: "activity"; activity: Activity; client: Client | null }
  | { kind: "client"; client: Client };
type TypeFilter = "all" | Activity["type"];

const typeFilters: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "call", label: "Llamadas" },
  { value: "visit", label: "Visitas" },
  { value: "follow_up", label: "Seguimientos" },
];

const day = 86_400_000;

export function SequenceBoard({
  activities,
  clients,
  users,
  writer,
  onComplete,
  onSchedule,
  onOpenClient,
}: {
  activities: Activity[];
  clients: Client[];
  users: User[];
  writer: boolean;
  onComplete: (activity: Activity) => void;
  onSchedule: (client: Client) => void;
  onOpenClient: (client: Client) => void;
}) {
  const advisors = users.filter((user) => user.role === "advisor");
  const [advisorId, setAdvisorId] = useState("all");
  const [type, setType] = useState<TypeFilter>("all");
  const columns = useMemo(
    () => buildColumns({ activities, clients, advisorId, type }),
    [activities, clients, advisorId, type],
  );
  const total = columns.reduce((sum, column) => sum + column.items.length, 0);
  return (
    <section className="panel sequence-panel">
      <div className="section-heading sequence-heading">
        <div>
          <h2>
            Secuencia comercial <span className="badge">{total}</span>
          </h2>
          <p>
            Prioriza lo vencido, atiende el día y detecta clientes sin paso.
          </p>
        </div>
        <div className="sequence-filters" aria-label="Filtros de secuencia">
          <span>
            <Filter size={15} /> Filtros
          </span>
          {advisors.length > 1 && (
            <label>
              <span className="sr-only">Asesor</span>
              <select
                value={advisorId}
                onChange={(event) => setAdvisorId(event.target.value)}
              >
                <option value="all">Todo el equipo</option>
                {advisors.map((advisor) => (
                  <option key={advisor.id} value={advisor.id}>
                    {advisor.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span className="sr-only">Tipo de contacto</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as TypeFilter)}
            >
              {typeFilters.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="sequence-summary">
        {columns.map((column) => (
          <div key={column.key}>
            <small>{column.title}</small>
            <strong>{column.items.length}</strong>
          </div>
        ))}
      </div>
      <div className="sequence-board">
        {columns.map((column) => (
          <article className={`sequence-column ${column.key}`} key={column.key}>
            <div className="sequence-column-head">
              <div>
                <strong>{column.title}</strong>
                <small>{column.hint}</small>
              </div>
              <span className="badge">{column.items.length}</span>
            </div>
            <div className="sequence-items">
              {column.items.length ? (
                column.items.map((item) => (
                  <SequenceCard
                    key={keyFor(item)}
                    column={column.key}
                    item={item}
                    writer={writer}
                    onComplete={onComplete}
                    onSchedule={onSchedule}
                    onOpenClient={onOpenClient}
                  />
                ))
              ) : (
                <Empty
                  title="Sin tarjetas"
                  text="Cuando haya gestiones en esta etapa aparecerán aquí."
                />
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SequenceCard({
  column,
  item,
  writer,
  onComplete,
  onSchedule,
  onOpenClient,
}: {
  column: SequenceColumn["key"];
  item: SequenceItem;
  writer: boolean;
  onComplete: (activity: Activity) => void;
  onSchedule: (client: Client) => void;
  onOpenClient: (client: Client) => void;
}) {
  const priority = priorityFor(column);
  const client = item.kind === "client" ? item.client : item.client;
  const visitEvidence =
    item.kind === "activity" ? visitEvidenceStatus(item.activity) : null;
  return (
    <div className="sequence-card">
      <div className="sequence-card-top">
        <span className={`priority-pill ${priority.className}`}>
          {priority.label}
        </span>
        {item.kind === "activity" ? (
          <ActivityIcon type={item.activity.type} size={16} />
        ) : (
          <span className="activity-icon follow_up">
            <CircleDashed size={16} />
          </span>
        )}
      </div>
      <strong>
        {item.kind === "activity"
          ? item.activity.client.name
          : item.client.name}
      </strong>
      <small className="sequence-owner">
        <UserRound size={13} />
        {item.kind === "activity"
          ? item.activity.advisor.name
          : item.client.advisor.name}
      </small>
      <p>
        {item.kind === "activity"
          ? item.activity.notes
          : "Cliente sin contacto pendiente. Programa el siguiente paso."}
      </p>
      <div className="sequence-meta">
        {item.kind === "activity" ? (
          <>
            <span>
              <CalendarClock size={13} />
              {relativeDue(item.activity.dueAt)}
            </span>
            <span>{activityLabels[item.activity.type]}</span>
          </>
        ) : (
          <span>
            <AlertTriangle size={13} />
            Sin próxima gestión
          </span>
        )}
      </div>
      {visitEvidence && (
        <small>
          {visitEvidence.label}: {visitEvidence.detail}
        </small>
      )}
      <div className="sequence-actions">
        {client && (
          <button className="text-button" onClick={() => onOpenClient(client)}>
            Ficha <ArrowRight size={13} />
          </button>
        )}
        {writer &&
          (item.kind === "activity" ? (
            <button
              className="primary compact-action"
              onClick={() => onComplete(item.activity)}
            >
              Registrar
            </button>
          ) : (
            <button
              className="primary compact-action"
              onClick={() => onSchedule(item.client)}
            >
              Programar
            </button>
          ))}
      </div>
    </div>
  );
}

function buildColumns({
  activities,
  clients,
  advisorId,
  type,
}: {
  activities: Activity[];
  clients: Client[];
  advisorId: string;
  type: TypeFilter;
}): SequenceColumn[] {
  const now = Date.now();
  const endOfToday = new Date().setHours(23, 59, 59, 999);
  const nextLimit = now + 7 * day;
  const visibleClients = clients.filter(
    (client) => advisorId === "all" || client.advisorId === advisorId,
  );
  const scheduled = activities.filter(
    (activity) =>
      activity.status === "scheduled" &&
      (advisorId === "all" || activity.advisor.id === advisorId) &&
      (type === "all" || activity.type === type),
  );
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const blocked = scheduled.filter(
    (activity) => new Date(activity.dueAt).getTime() < now,
  );
  const today = scheduled.filter((activity) => {
    const due = new Date(activity.dueAt).getTime();
    return due >= now && due <= endOfToday;
  });
  const next = scheduled.filter((activity) => {
    const due = new Date(activity.dueAt).getTime();
    return due > endOfToday && due <= nextLimit;
  });
  const pendingClientIds = new Set(
    scheduled.map((activity) => activity.clientId),
  );
  const empty =
    type === "all"
      ? visibleClients.filter((client) => !pendingClientIds.has(client.id))
      : [];
  return [
    {
      key: "blocked",
      title: "Bloqueado",
      hint: "Vencido o sin registrar",
      items: sortActivities(blocked).map((activity) => ({
        kind: "activity",
        activity,
        client: clientById.get(activity.clientId) ?? null,
      })),
    },
    {
      key: "today",
      title: "Hoy",
      hint: "Debe resolverse hoy",
      items: sortActivities(today).map((activity) => ({
        kind: "activity",
        activity,
        client: clientById.get(activity.clientId) ?? null,
      })),
    },
    {
      key: "next",
      title: "Esta semana",
      hint: "Próximas gestiones",
      items: sortActivities(next).map((activity) => ({
        kind: "activity",
        activity,
        client: clientById.get(activity.clientId) ?? null,
      })),
    },
    {
      key: "empty",
      title: "Sin siguiente paso",
      hint: "Clientes sin gestión pendiente",
      items: empty.map((client) => ({ kind: "client", client })),
    },
  ];
}

function sortActivities(items: Activity[]) {
  return [...items].sort(
    (left, right) =>
      new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),
  );
}

function priorityFor(column: SequenceColumn["key"]) {
  if (column === "blocked") return { label: "P1", className: "urgent" };
  if (column === "today") return { label: "P2", className: "today" };
  if (column === "next") return { label: "P3", className: "next" };
  return { label: "P4", className: "empty" };
}

function relativeDue(date: string) {
  const time = new Date(date).getTime();
  const diff = time - Date.now();
  const abs = Math.abs(diff);
  if (abs < 60_000) return "ahora";
  const minutes = Math.round(abs / 60_000);
  if (minutes < 60)
    return diff < 0 ? `hace ${minutes} min` : `en ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return diff < 0 ? `hace ${hours} h` : `en ${hours} h`;
  const days = Math.round(hours / 24);
  return diff < 0 ? `hace ${days} días` : `en ${days} días`;
}

function keyFor(item: SequenceItem) {
  return item.kind === "activity"
    ? item.activity.id
    : `client:${item.client.id}`;
}

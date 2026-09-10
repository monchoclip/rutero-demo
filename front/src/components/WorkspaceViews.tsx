import {
  Route,
  ArrowUpRight,
  ArrowRight,
  Phone,
  MapPin,
  CalendarDays,
} from "lucide-react";
import { activityLabels, type Client, type Activity } from "../lib/types";
import { nextActionByClient } from "../lib/metrics";
import { visitEvidenceStatus } from "../lib/visitEvidence";
const dateTime = (date: string) =>
  new Date(date).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function ActivityIcon({
  type,
  size = 18,
}: {
  type: Activity["type"];
  size?: number;
}) {
  return (
    <span className={`activity-icon ${type}`}>
      {type === "call" ? (
        <Phone size={size} />
      ) : type === "visit" ? (
        <MapPin size={size} />
      ) : (
        <CalendarDays size={size} />
      )}
    </span>
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <Route size={28} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
export function ClientTable({
  clients,
  activities = [],
  onOpen,
}: {
  clients: Client[];
  activities?: Activity[];
  onOpen: (client: Client) => void;
}) {
  const nextActions = nextActionByClient(clients, activities);
  return clients.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Ciudad</th>
            <th>Asesor responsable</th>
            <th>Siguiente paso</th>
            <th>Contacto</th>
            <th>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c.id}>
              <td>
                <div className="client-name">
                  <span className="client-avatar">{initials(c.name)}</span>
                  <span>
                    <strong>{c.name}</strong>
                    <small>{c.contactName}</small>
                  </span>
                </div>
              </td>
              <td>{c.city}</td>
              <td>{c.advisor.name}</td>
              <td>
                <span
                  className={`next-action-pill ${nextActions.get(c.id)?.tone ?? "none"}`}
                >
                  {nextActions.get(c.id)?.label ?? "Sin próxima acción"}
                </span>
              </td>
              <td>{c.phone}</td>
              <td>
                <button className="text-button" onClick={() => onOpen(c)}>
                  Ver ficha <ArrowUpRight size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty
      title="Tu próxima relación empieza aquí"
      text="Agrega un cliente para consultar su responsable y su historial."
    />
  );
}
export function ActivityList({
  items,
  writer,
  onComplete,
  onCancel,
}: {
  items: Activity[];
  writer: boolean;
  onComplete: (activity: Activity) => void;
  onCancel?: (activity: Activity) => void;
}) {
  return items.length ? (
    <div>
      {items.map((a) => {
        const visitEvidence = visitEvidenceStatus(a);
        return (
          <article className="activity-row" key={a.id}>
            <ActivityIcon type={a.type} />
            <div className="activity-info">
              <strong>{a.client.name}</strong>
              <small>
                {activityLabels[a.type]} · {a.advisor.name}
              </small>
              <p>{a.notes}</p>
              {visitEvidence && (
                <small>
                  {visitEvidence.label}: {visitEvidence.detail}
                </small>
              )}
            </div>
            <div className="activity-time">
              <strong>{dateTime(a.dueAt)}</strong>
              {a.status === "completed" ? (
                <span className="badge completed">Realizado</span>
              ) : a.status === "cancelled" ? (
                <span className="badge cancelled">Cancelado</span>
              ) : writer ? (
                <div className="activity-actions">
                  <button className="text-button" onClick={() => onComplete(a)}>
                    Registrar resultado <ArrowRight size={14} />
                  </button>
                  {onCancel && (
                    <button className="text-button danger-link" onClick={() => onCancel(a)}>
                      Cancelar
                    </button>
                  )}
                </div>
              ) : (
                <span className="badge">Programado</span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  ) : (
    <Empty
      title="Todo listo para el próximo contacto"
      text="Programa una llamada, una visita o un seguimiento para comenzar."
    />
  );
}

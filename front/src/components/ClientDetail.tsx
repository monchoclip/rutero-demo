import {
  CalendarPlus,
  Mail,
  Phone,
  MapPin,
  User as UserIcon,
  Plus,
  X,
} from "lucide-react";
import { ActivityIcon, Empty } from "./WorkspaceViews";
import { clientStats, nextContact } from "../lib/metrics";
import {
  activityLabels,
  activityStatusLabels,
  activityOutcomeLabels,
  type Activity,
  type Client,
} from "../lib/types";
import { visitEvidenceStatus } from "../lib/visitEvidence";

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const dateTime = (date: string) =>
  new Date(date).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const dateOnly = (date: string) =>
  new Date(date).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export function ClientDetail({
  client,
  history,
  historyLoading,
  commercial,
  writer,
  onClose,
  onReassign,
  onSchedule,
  onComplete,
}: {
  client: Client;
  history: Activity[];
  historyLoading: boolean;
  commercial: boolean;
  writer: boolean;
  onClose: () => void;
  onReassign: () => void;
  onSchedule: () => void;
  onComplete: (activity: Activity) => void;
}) {
  const stats = clientStats(history);
  const next = nextContact(history);
  const nextVisitEvidence = next ? visitEvidenceStatus(next) : null;
  const timeline = history.filter((a) => a.id !== next?.id);
  return (
    <dialog
      className="dialog client-detail client-detail-dialog"
      ref={(node) => {
        if (node && !node.open) node.showModal();
      }}
      aria-labelledby="client-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="client-detail-header">
        <div className="client-identity">
          <span className="avatar client-avatar-lg">
            {initials(client.name)}
          </span>
          <div>
            <span className="eyebrow">FICHA DEL CLIENTE</span>
            <h2 id="client-detail-title">{client.name}</h2>
            <div className="client-meta">
              <span className="badge">{client.city}</span>
              <small>Cliente desde {dateOnly(client.createdAt)}</small>
            </div>
          </div>
        </div>
        <button className="text-button" onClick={onClose}>
          <X size={16} /> Cerrar ficha
        </button>
      </div>
      <div className="client-detail-scroll">
        <div className="client-detail-grid">
        <div className="client-detail-main">
          <div className="contact-list">
            <a className="contact-row" href={`tel:${client.phone}`}>
              <Phone size={16} /> {client.phone}
            </a>
            {client.email && (
              <a className="contact-row" href={`mailto:${client.email}`}>
                <Mail size={16} /> {client.email}
              </a>
            )}
            <span className="contact-row">
              <UserIcon size={16} /> {client.contactName}
            </span>
            <span className="contact-row">
              <MapPin size={16} /> {client.city}
            </span>
          </div>
          {client.notes && (
            <div className="client-notes">
              <h3>Notas</h3>
              <p>{client.notes}</p>
            </div>
          )}
          <div className="client-stats">
            <div>
              <small>Actividades</small>
              <strong>{stats.total}</strong>
            </div>
            <div>
              <small>Programadas</small>
              <strong>{stats.scheduled}</strong>
            </div>
            <div>
              <small>Completadas</small>
              <strong>{stats.completed}</strong>
            </div>
            <div>
              <small>Último contacto</small>
              <strong className="client-stat-date">
                {stats.lastContact ? dateOnly(stats.lastContact) : "—"}
              </strong>
            </div>
          </div>
          {next && (
            <div className="next-contact-card">
              <div className="next-contact-heading">
                <ActivityIcon type={next.type} />
                <div>
                  <span className="eyebrow">PRÓXIMO CONTACTO</span>
                  <strong>
                    {activityLabels[next.type]} · {dateTime(next.dueAt)}
                  </strong>
                </div>
                {writer && (
                  <button
                    className="secondary"
                    onClick={() => onComplete(next)}
                  >
                    Registrar resultado
                  </button>
                )}
              </div>
              <p>{next.notes}</p>
              {nextVisitEvidence && (
                <small className="timeline-outcome">
                  {nextVisitEvidence.label}: {nextVisitEvidence.detail}
                </small>
              )}
            </div>
          )}
          {!next && writer && (
            <div className="next-contact-card idle">
              <div className="next-contact-heading">
                <span className="activity-icon follow_up">
                  <CalendarPlus size={18} />
                </span>
                <div>
                  <span className="eyebrow">SIN SIGUIENTE PASO</span>
                  <strong>Programa una llamada, visita o seguimiento</strong>
                </div>
                <button className="secondary" onClick={onSchedule}>
                  Crear agenda
                </button>
              </div>
            </div>
          )}
          <h3>Historial de contacto</h3>
          {historyLoading ? (
            <div className="skeleton" />
          ) : timeline.length ? (
            <div className="timeline">
              {timeline.map((a) => {
                const visitEvidence = visitEvidenceStatus(a);
                return (
                  <div className="timeline-entry" key={a.id}>
                    <ActivityIcon type={a.type} />
                    <div className="timeline-body">
                      <div className="timeline-top">
                        <strong>{activityLabels[a.type]}</strong>
                        <span className={`badge ${a.status}`}>
                          {activityStatusLabels[a.status]}
                        </span>
                      </div>
                      <small>
                        {dateTime(a.dueAt)} · {a.advisor.name}
                        {a.status === "completed" && a.durationSeconds
                          ? ` · ${Math.round(a.durationSeconds / 60)} min`
                          : ""}
                      </small>
                      <p>{a.notes}</p>
                      {a.outcome && (
                        <small className="timeline-outcome">
                          Resultado:{" "}
                          {activityOutcomeLabels[a.outcome] ?? a.outcome}
                        </small>
                      )}
                      {visitEvidence && (
                        <small className="timeline-outcome">
                          {visitEvidence.label}: {visitEvidence.detail}
                        </small>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              title="Todavía no hay actividades"
              text="Lo que registres con este cliente quedará aquí."
            />
          )}
        </div>
        <aside className="client-detail-side">
          <div className="responsible-card">
            <span className="eyebrow">RESPONSABLE</span>
            <div className="responsible-person">
              <span className="avatar">{initials(client.advisor.name)}</span>
              <div>
                <strong>{client.advisor.name}</strong>
                <small>{client.advisor.email}</small>
              </div>
            </div>
            {commercial && (
              <button className="secondary full" onClick={onReassign}>
                Cambiar asesor
              </button>
            )}
          </div>
          {writer && (
            <button className="primary full" onClick={onSchedule}>
              <Plus size={17} /> Programar contacto
            </button>
          )}
        </aside>
        </div>
      </div>
    </dialog>
  );
}

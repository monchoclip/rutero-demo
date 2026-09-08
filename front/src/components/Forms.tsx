"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { api, post } from "../lib/api";
import {
  activityLabels,
  type User,
  type Client,
  type Activity,
} from "../lib/types";
export type FormKind = "client" | "invite" | "activity" | "complete" | "assign";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label>
      {label}
      {children}
    </label>
  );
}
export function FormDialog({
  kind,
  users,
  user,
  clients,
  activity,
  client,
  prefill,
  onClose,
  onSaved,
}: {
  kind: FormKind;
  users: User[];
  user: User;
  clients: Client[];
  activity?: Activity;
  client?: Client;
  prefill?: { phone?: string; contactName?: string };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const titles = {
    client: "Un nuevo cliente",
    invite: "Invitar a un asesor",
    activity: "Programar un contacto",
    complete: "Registrar resultado",
    assign: "Reasignar cliente",
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const input = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (kind === "client") await post("/clients", input);
      if (kind === "invite") await post("/invitations", input);
      if (kind === "assign")
        await api(`/clients/${client?.id}/assignment`, {
          method: "PATCH",
          body: JSON.stringify(input),
        });
      if (kind === "activity")
        await post("/activities", {
          ...input,
          dueAt: new Date(String(input.dueAt)).toISOString(),
          idempotencyKey: key.current,
        });
      if (kind === "complete")
        await post(`/activities/${activity?.id}/complete`, {
          outcome: input.outcome,
          notes: input.notes,
          durationSeconds: Number(input.durationMinutes) * 60,
          ...(input.followUpAt
            ? { followUpAt: new Date(String(input.followUpAt)).toISOString() }
            : {}),
        });
      await onSaved();
      onClose();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const portfolioSize = (advisorId: string) =>
    clients.filter((c) => c.advisorId === advisorId).length;
  const advisorSelect = (
    <select
      name="advisorId"
      required
      defaultValue={
        kind === "assign"
          ? ""
          : (client?.advisorId ?? (user.role === "advisor" ? user.id : ""))
      }
    >
      <option value="" disabled>
        {kind === "assign" ? "Elige el nuevo asesor" : "Selecciona un asesor"}
      </option>
      {users
        .filter((u) => u.role === "advisor")
        .map((u) => (
          <option
            key={u.id}
            value={u.id}
            disabled={kind === "assign" && u.id === client?.advisorId}
          >
            {u.name} · {portfolioSize(u.id)}{" "}
            {portfolioSize(u.id) === 1 ? "cliente" : "clientes"}
            {kind === "assign" && u.id === client?.advisorId ? " (actual)" : ""}
          </option>
        ))}
    </select>
  );
  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">GESTIÓN COMERCIAL</span>
          <h2 id="dialog-title">{titles[kind]}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Cerrar"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <form onSubmit={submit}>
        {kind === "client" && (
          <>
            {prefill && (
              <p className="hint chosen-client">
                Identificado por el número de WhatsApp que escribió.
              </p>
            )}
            <Field label="Nombre del cliente o negocio">
              <input name="name" required minLength={2} maxLength={160} />
            </Field>
            <div className="form-grid">
              <Field label="Persona de contacto">
                <input
                  name="contactName"
                  required
                  minLength={2}
                  defaultValue={prefill?.contactName}
                />
              </Field>
              <Field label="Teléfono">
                <input
                  name="phone"
                  type="tel"
                  required
                  minLength={5}
                  defaultValue={prefill?.phone}
                />
              </Field>
            </div>
            <div className="form-grid">
              <Field label="Correo (opcional)">
                <input name="email" type="email" />
              </Field>
              <Field label="Ciudad">
                <input name="city" required minLength={2} />
              </Field>
            </div>
            <Field label="Asesor responsable">{advisorSelect}</Field>
            <Field label="Notas (opcional)">
              <textarea name="notes" maxLength={3000} />
            </Field>
          </>
        )}
        {kind === "invite" && (
          <>
            <p className="hint">
              El asesor recibe un enlace para crear su contraseña. Solo tendrá
              acceso a su cartera.
            </p>
            <Field label="Nombre completo">
              <input name="name" required minLength={2} maxLength={100} />
            </Field>
            <Field label="Correo electrónico">
              <input name="email" type="email" required />
            </Field>
          </>
        )}
        {kind === "activity" && (
          <>
            {client ? (
              <>
                <p className="hint chosen-client">
                  Para <strong>{client.name}</strong>
                </p>
                <input type="hidden" name="clientId" value={client.id} />
              </>
            ) : (
              <Field label="Cliente">
                <select name="clientId" required defaultValue="">
                  <option value="" disabled>
                    Selecciona un cliente
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="form-grid">
              <Field label="Tipo de contacto">
                <select name="type">
                  {Object.entries(activityLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fecha y hora">
                <input name="dueAt" type="datetime-local" required />
              </Field>
            </div>
            <Field label="Objetivo del contacto">
              <textarea name="notes" required minLength={2} maxLength={3000} />
            </Field>
            <p className="hint">
              Horario de este dispositivo. Recordatorio preparado 15 minutos
              antes.
            </p>
          </>
        )}
        {kind === "complete" && (
          <>
            <p className="hint">{activity?.client.name}</p>
            <Field label="Resultado">
              <select name="outcome">
                <option value="contacted">Contacto realizado</option>
                <option value="no_answer">No respondió</option>
                <option value="interested">Tiene interés</option>
                <option value="not_interested">Sin interés por ahora</option>
              </select>
            </Field>
            <Field label="Qué ocurrió">
              <textarea name="notes" required minLength={2} maxLength={3000} />
            </Field>
            <div className="form-grid">
              <Field label="Duración en minutos">
                <input
                  name="durationMinutes"
                  type="number"
                  min="0"
                  max="1440"
                  defaultValue="0"
                  required
                />
              </Field>
              <Field label="Próximo seguimiento (opcional)">
                <input name="followUpAt" type="datetime-local" />
              </Field>
            </div>
          </>
        )}
        {kind === "assign" && (
          <>
            <p className="hint">
              {client?.name} está hoy con{" "}
              <strong>{client?.advisor.name}</strong>. Las tareas pendientes
              pasarán al nuevo asesor y el historial se conservará.
            </p>
            <Field label="Nuevo asesor">{advisorSelect}</Field>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button
            className="secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {busy
              ? "Guardando…"
              : kind === "invite"
                ? "Crear invitación"
                : "Guardar"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

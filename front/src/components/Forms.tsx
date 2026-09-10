"use client";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Camera, CheckCircle2, LocateFixed, MapPin, X } from "lucide-react";
import { api, post, OfflineQueuedError } from "../lib/api";
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
function DialogSummary({ title, text }: { title: string; text: string }) {
  return (
    <div className="dialog-summary">
      <strong>{title}</strong>
      <small>{text}</small>
    </div>
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
  const [activityType, setActivityType] =
    useState<Activity["type"]>("follow_up");
  const [visitEvidence, setVisitEvidence] = useState<VisitEvidenceDraft>(() =>
    evidenceFromActivity(activity),
  );
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
  const helperText = {
    client:
      "Crea una ficha útil para seguimiento, agenda y conversaciones vinculadas.",
    invite:
      "El asesor recibirá un enlace para crear contraseña y entrar solo a su cartera.",
    activity:
      "Programa el siguiente paso con fecha, objetivo y recordatorio local.",
    complete:
      "Cierra la gestión con resultado, duración y próximo seguimiento opcional.",
    assign:
      "Reasigna el cliente conservando historial y moviendo tareas pendientes.",
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
          ...(activity?.type === "visit"
            ? { visitEvidence: requireVisitEvidence(visitEvidence) }
            : {}),
          ...(input.followUpAt
            ? { followUpAt: new Date(String(input.followUpAt)).toISOString() }
            : {}),
        });
      await onSaved();
      onClose();
    } catch (error) {
      if (error instanceof OfflineQueuedError) {
        await onSaved();
        onClose();
        return;
      }
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const portfolioSize = (advisorId: string) =>
    clients.filter((c) => c.advisorId === advisorId).length;
  const ownAdvisor = user.role === "advisor";
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
  const advisorHiddenInput = (
    <input type="hidden" name="advisorId" value={user.id} />
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
          <p>{helperText[kind]}</p>
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
            <div className="dialog-summary-grid">
              <DialogSummary
                title="Contacto"
                text="Nombre, teléfono, correo y ciudad listos para operar."
              />
              <DialogSummary
                title="Cartera"
                text="El asesor queda asociado desde el primer registro."
              />
            </div>
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
            {ownAdvisor ? (
              <>
                {advisorHiddenInput}
                <p className="hint chosen-client">
                  Quedará asignado a tu cartera como asesor responsable.
                </p>
              </>
            ) : (
              <Field label="Asesor responsable">{advisorSelect}</Field>
            )}
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
            <div className="dialog-summary-grid">
              <DialogSummary
                title="Secuencia"
                text="La tarjeta entra al tablero según urgencia y fecha."
              />
              <DialogSummary
                title="Recordatorio"
                text="La cola local queda preparada 15 minutos antes."
              />
            </div>
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
                <select
                  name="type"
                  value={activityType}
                  onChange={(event) =>
                    setActivityType(event.target.value as Activity["type"])
                  }
                >
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
            {activityType === "visit" && <VisitPreparation />}
          </>
        )}
        {kind === "complete" && (
          <>
            <div className="dialog-summary-grid">
              <DialogSummary
                title={activity?.client.name ?? "Cliente"}
                text={
                  activity
                    ? `${activityLabels[activity.type]} pendiente de cierre`
                    : "Gestión pendiente de cierre"
                }
              />
              <DialogSummary
                title="Siguiente paso"
                text="Puedes dejar un seguimiento creado al guardar."
              />
            </div>
            {activity?.type === "visit" && (
              <VisitCloseGuide
                activity={activity}
                value={visitEvidence}
                onChange={setVisitEvidence}
                onError={setError}
              />
            )}
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

type VisitPoint = {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
};
type VisitEvidenceDraft = {
  start: VisitPoint | null;
  end: VisitPoint | null;
  photoDataUrl: string;
};
function evidenceFromActivity(activity?: Activity): VisitEvidenceDraft {
  if (!activity) return { start: null, end: null, photoDataUrl: "" };
  return {
    start:
      activity.visitStartLatitude !== null &&
      activity.visitStartLongitude !== null
        ? {
            latitude: activity.visitStartLatitude,
            longitude: activity.visitStartLongitude,
            accuracy: activity.visitStartAccuracy ?? 0,
            capturedAt: activity.visitStartedAt ?? new Date().toISOString(),
          }
        : null,
    end:
      activity.visitEndLatitude !== null && activity.visitEndLongitude !== null
        ? {
            latitude: activity.visitEndLatitude,
            longitude: activity.visitEndLongitude,
            accuracy: activity.visitEndAccuracy ?? 0,
            capturedAt: activity.visitFinishedAt ?? new Date().toISOString(),
          }
        : null,
    photoDataUrl: activity.visitPhotoDataUrl ?? "",
  };
}
function requireVisitEvidence(value: VisitEvidenceDraft) {
  if (!value.start || !value.end || !value.photoDataUrl)
    throw new Error(
      "Captura ubicación inicial, ubicación final y fotografía para cerrar la visita.",
    );
  return value;
}
function captureLocation() {
  return new Promise<VisitPoint>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Este navegador no permite capturar ubicación."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          capturedAt: new Date(position.timestamp).toISOString(),
        }),
      () =>
        reject(
          new Error(
            "No pudimos capturar la ubicación. Revisa permisos del navegador.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}
function readPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (file.size > 2_100_000) {
      reject(new Error("La foto debe pesar máximo 2 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No pudimos leer la fotografía."));
    reader.readAsDataURL(file);
  });
}
function distanceMeters(start: VisitPoint, end: VisitPoint) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(end.latitude - start.latitude);
  const deltaLongitude = toRadians(end.longitude - start.longitude);
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(deltaLongitude / 2) ** 2;
  return Math.round(
    earthRadiusMeters *
      2 *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
}
function pointLabel(point: VisitPoint | null) {
  if (!point) return "Pendiente";
  return `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)} · ±${Math.round(point.accuracy)} m`;
}
function VisitPreparation() {
  return (
    <div className="visit-guide">
      <div>
        <MapPin size={17} />
        <span>
          Al iniciar la visita se debe confirmar ubicación del asesor.
        </span>
      </div>
      <div>
        <Camera size={17} />
        <span>
          Al cerrar se pedirá fotografía del lugar y segunda ubicación.
        </span>
      </div>
      <small>
        La web captura evidencia solo cuando el asesor inicia y cierra la visita
        con permisos del navegador.
      </small>
    </div>
  );
}

function VisitCloseGuide({
  activity,
  value,
  onChange,
  onError,
}: {
  activity: Activity;
  value: VisitEvidenceDraft;
  onChange: (value: VisitEvidenceDraft) => void;
  onError: (message: string) => void;
}) {
  const [capturing, setCapturing] = useState<"start" | "end" | "photo" | null>(
    null,
  );
  const distance =
    value.start && value.end ? distanceMeters(value.start, value.end) : null;
  async function captureStart() {
    setCapturing("start");
    try {
      const start = await captureLocation();
      onChange({ ...value, start });
      await post(`/activities/${activity.id}/start-visit`, start);
      onError("");
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setCapturing(null);
    }
  }
  async function captureEnd() {
    setCapturing("end");
    try {
      onChange({ ...value, end: await captureLocation() });
      onError("");
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setCapturing(null);
    }
  }
  async function photoChanged(file?: File) {
    if (!file) return;
    setCapturing("photo");
    try {
      const [photoDataUrl, end] = await Promise.all([
        readPhoto(file),
        captureLocation(),
      ]);
      onChange({ ...value, photoDataUrl, end });
      onError("");
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setCapturing(null);
    }
  }
  return (
    <div className="visit-evidence-preview">
      <div className="visit-evidence-row">
        <LocateFixed size={17} />
        <span>Ubicación inicial</span>
        <strong>{pointLabel(value.start)}</strong>
        <button type="button" className="secondary" onClick={captureStart}>
          {capturing === "start" ? "Capturando..." : "Iniciar visita"}
        </button>
      </div>
      <div className="visit-evidence-row">
        <Camera size={17} />
        <span>Foto y ubicación de cierre</span>
        <strong>{value.photoDataUrl ? "Foto cargada" : "Pendiente"}</strong>
        <label className="secondary file-action">
          {capturing === "photo" ? "Leyendo..." : "Tomar foto"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={(event) => photoChanged(event.target.files?.[0])}
          />
        </label>
      </div>
      <div className="visit-evidence-row">
        <CheckCircle2 size={17} />
        <span>Ubicación de cierre</span>
        <strong>{pointLabel(value.end)}</strong>
        <button type="button" className="secondary" onClick={captureEnd}>
          {capturing === "end" ? "Capturando..." : "Cerrar ubicación"}
        </button>
      </div>
      <small>
        {distance === null
          ? "El cierre compara inicio y fin para validar que ocurrió en el mismo lugar."
          : `Diferencia calculada: ${distance} m. Idealmente debe estar dentro del margen de precisión del dispositivo.`}
      </small>
      {value.photoDataUrl && (
        <img
          className="visit-photo-preview"
          src={value.photoDataUrl}
          alt="Evidencia fotográfica de la visita"
        />
      )}
    </div>
  );
}

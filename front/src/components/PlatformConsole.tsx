"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LogOut, Plus, RefreshCw, Route, Smartphone } from "lucide-react";
import { api, post } from "../lib/api";
import type {
  PlatformOrganization,
  PlatformWhatsAppNumber,
  User,
} from "../lib/types";

const demoOrganizationId = "68000000-0000-4000-8000-000000000001";

export function PlatformConsole({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => void;
}) {
  const [numbers, setNumbers] = useState<PlatformWhatsAppNumber[]>([]);
  const [organizations, setOrganizations] = useState<PlatformOrganization[]>(
    [],
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const [registeredNumbers, registeredOrganizations] = await Promise.all([
        api<PlatformWhatsAppNumber[]>("/platform/whatsapp-numbers"),
        api<PlatformOrganization[]>("/platform/organizations"),
      ]);
      setNumbers(registeredNumbers);
      setOrganizations(registeredOrganizations);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    try {
      await post<PlatformWhatsAppNumber>("/platform/whatsapp-numbers", data);
      form.reset();
      setNotice(
        "Número registrado. La coordinación comercial ya puede asignarlo.",
      );
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="platform-shell">
      <aside className="platform-side">
        <a className="brand" href="/">
          <Route size={29} />
          <span>
            ruts<span className="brand-number">68</span>
          </span>
        </a>
        <div>
          <span className="eyebrow">PLATAFORMA</span>
          <h1>Números de WhatsApp</h1>
          <p>
            Registra una línea oficial de Meta para una empresa y deja que la
            coordinación comercial la asigne a un asesor.
          </p>
        </div>
        <button className="secondary" onClick={onLogout}>
          <LogOut size={17} /> Salir de {user.name}
        </button>
      </aside>
      <section className="platform-content">
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="success" role="status">
            {notice}
          </div>
        )}
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Registrar línea</h2>
              <p>Usa datos de la Cloud API de Meta. El token queda cifrado.</p>
            </div>
          </div>
          <form onSubmit={submit}>
            <label>
              Empresa
              <input
                name="organizationId"
                defaultValue={demoOrganizationId}
                required
              />
            </label>
            <div className="form-grid">
              <label>
                Phone number ID
                <input
                  name="phoneNumberId"
                  required
                  minLength={5}
                  maxLength={40}
                />
              </label>
              <label>
                Número visible
                <input
                  name="displayPhoneNumber"
                  placeholder="+57 300 000 0000"
                  required
                  minLength={5}
                  maxLength={30}
                />
              </label>
            </div>
            <label>
              Nombre interno
              <input
                name="label"
                placeholder="Línea comercial Bogotá"
                required
                minLength={2}
                maxLength={80}
              />
            </label>
            <label>
              Token de acceso del número
              <textarea
                name="accessToken"
                required
                minLength={20}
                maxLength={4000}
              />
            </label>
            <button className="primary" disabled={busy}>
              <Plus size={17} />
              {busy ? "Registrando..." : "Registrar número"}
            </button>
          </form>
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Números registrados</h2>
              <p>
                Vista de plataforma; cada empresa solo ve sus propias líneas.
              </p>
            </div>
            <button className="text-button" onClick={load}>
              <RefreshCw size={15} /> Actualizar
            </button>
          </div>
          {loading ? (
            <div className="skeleton" />
          ) : numbers.length ? (
            <div className="number-list">
              {numbers.map((number) => (
                <article className="number-row" key={number.id}>
                  <span className="number-icon">
                    <Smartphone size={18} />
                  </span>
                  <div>
                    <strong>{number.label}</strong>
                    <small>
                      {number.displayPhoneNumber} · {number.organization.name}
                    </small>
                  </div>
                  <span className="badge">
                    {number.advisor ? number.advisor.name : "Sin asesor"}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p className="hint">Todavía no hay números registrados.</p>
          )}
        </section>
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Empresas y membresías</h2>
              <p>Estado de prueba, plan activo y tamaño de cada cuenta.</p>
            </div>
            <button className="text-button" onClick={load}>
              <RefreshCw size={15} /> Actualizar
            </button>
          </div>
          {organizations.length ? (
            <div className="organization-list">
              {organizations.map((organization) => (
                <article className="organization-row" key={organization.id}>
                  <div>
                    <strong>{organization.name}</strong>
                    <small>
                      {organization.sector} · {organization._count.users}{" "}
                      usuarios · {organization._count.clients} clientes
                    </small>
                  </div>
                  <span
                    className={`badge ${organization.membershipStatus === "active" ? "completed" : ""}`}
                  >
                    {organization.membershipPlan
                      ? `${organization.membershipPlan} · ${organization.membershipStatus}`
                      : `Prueba · ${organization.membershipStatus}`}
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p className="hint">Todavía no hay empresas registradas.</p>
          )}
        </section>
      </section>
    </main>
  );
}

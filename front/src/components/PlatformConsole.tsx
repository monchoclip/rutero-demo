"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  LogOut,
  Plus,
  RefreshCw,
  Route,
  Save,
  Smartphone,
  ShieldCheck,
} from "lucide-react";
import { api, post, patch } from "../lib/api";
import type {
  BillingConfiguration,
  PlatformBillingSettings,
  PlatformOrganization,
  PlatformWhatsAppNumber,
  User,
} from "../lib/types";

const billingFields = [
  ["trialMonths", "Meses de prueba para nuevas empresas"],
  ["supportBps", "Soporte (puntos básicos)"],
  ["supportFixedMinor", "Soporte fijo (unidades menores)"],
  ["gatewayBps", "Pasarela (puntos básicos)"],
  ["gatewayFixedMinor", "Pasarela fija (unidades menores)"],
  ["taxBps", "Impuesto (puntos básicos)"],
] as const;

const moduleLabels = {
  overview: "Resumen",
  sequence: "Secuencia",
  clients: "Clientes",
  agenda: "Agenda",
  team: "Mi equipo",
  chats: "WhatsApp",
  billing: "Cobros",
  catalog: "Catálogo y campañas",
  orders: "Pedidos",
  mail: "Correo de prueba",
} as const;

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
  const [billingDefaults, setBillingDefaults] =
    useState<PlatformBillingSettings | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [moduleDrafts, setModuleDrafts] = useState<
    Record<string, Record<string, boolean>>
  >({});
  const [editingBilling, setEditingBilling] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const [registeredNumbers, registeredOrganizations] = await Promise.all([
        api<PlatformWhatsAppNumber[]>("/platform/whatsapp-numbers"),
        api<PlatformOrganization[]>("/platform/organizations"),
      ]);
      const defaults = await api<PlatformBillingSettings>(
        "/platform/billing-settings",
      );
      setNumbers(registeredNumbers);
      setOrganizations(registeredOrganizations);
      setBillingDefaults(defaults);
      setModuleDrafts(
        Object.fromEntries(
          registeredOrganizations.map((organization) => [
            organization.id,
            organization.moduleConfig,
          ]),
        ),
      );
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
  async function saveBillingDefaults(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!billingDefaults) return;
    setBusy(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const configuration: BillingConfiguration = {
      ...billingDefaults.configuration,
      ...Object.fromEntries(
        billingFields.map(([field]) => [field, Number(form.get(field))]),
      ),
      plans: billingDefaults.configuration.plans.map((plan) => ({
        ...plan,
        name: String(form.get(`plan-${plan.id}-name`) ?? plan.name).trim(),
        baseMinor: Number(form.get(`plan-${plan.id}-baseMinor`)),
        includedUsers: Number(form.get(`plan-${plan.id}-includedUsers`)),
        userMinor: Number(form.get(`plan-${plan.id}-userMinor`)),
      })),
    };
    try {
      const saved = await patch<PlatformBillingSettings>(
        "/platform/billing-settings",
        { version: billingDefaults.version, configuration },
      );
      setBillingDefaults(saved);
      setEditingBilling(false);
      setNotice(
        "Valores por defecto guardados. Solo aplican a empresas registradas después de este cambio.",
      );
    } catch (failure) {
      setError((failure as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="platform-shell">
      <aside className="platform-side">
        <a className="brand" href="/" aria-label="Ruts68, inicio">
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
              <h2>Valores por defecto para nuevas empresas</h2>
              <p>
                Se copian al registrar una empresa y no modifican cotizaciones
                ni membresías existentes.
              </p>
            </div>
            {billingDefaults && (
              <button
                className="text-button"
                onClick={() => setEditingBilling((open) => !open)}
              >
                {editingBilling ? "Cancelar" : "Editar valores"}
              </button>
            )}
          </div>
          {!billingDefaults ? (
            <div className="skeleton" />
          ) : editingBilling ? (
            <form onSubmit={saveBillingDefaults}>
              <div className="form-grid">
                {billingFields.map(([field, label]) => (
                  <label key={field}>
                    {label}
                    <input
                      name={field}
                      type="number"
                      min={field === "trialMonths" ? 1 : 0}
                      max={
                        field === "trialMonths"
                          ? 12
                          : field.endsWith("Bps")
                            ? 10000
                            : 100000000
                      }
                      defaultValue={
                        billingDefaults.configuration[
                          field as keyof BillingConfiguration
                        ] as number
                      }
                      required
                    />
                  </label>
                ))}
              </div>
              <div className="plan-editor-grid">
                {billingDefaults.configuration.plans.map((plan) => (
                  <fieldset className="plan-editor-card" key={plan.id}>
                    <legend>{plan.name}</legend>
                    <label>
                      Nombre visible
                      <input
                        name={`plan-${plan.id}-name`}
                        defaultValue={plan.name}
                        required
                        minLength={2}
                        maxLength={60}
                      />
                    </label>
                    <label>
                      Precio base (unidades menores de COP)
                      <input
                        name={`plan-${plan.id}-baseMinor`}
                        type="number"
                        min={0}
                        max={100000000}
                        defaultValue={plan.baseMinor}
                        required
                      />
                    </label>
                    <label>
                      Usuarios incluidos
                      <input
                        name={`plan-${plan.id}-includedUsers`}
                        type="number"
                        min={1}
                        max={500}
                        defaultValue={plan.includedUsers}
                        required
                      />
                    </label>
                    <label>
                      Usuario adicional (unidades menores)
                      <input
                        name={`plan-${plan.id}-userMinor`}
                        type="number"
                        min={0}
                        max={100000000}
                        defaultValue={plan.userMinor}
                        required
                      />
                    </label>
                  </fieldset>
                ))}
              </div>
              <button className="primary" disabled={busy} type="submit">
                {busy ? "Guardando…" : "Guardar valores por defecto"}
              </button>
            </form>
          ) : (
            <>
              <div className="plan-grid" aria-label="Valores de planes por defecto">
                {billingDefaults.configuration.plans.map((plan) => (
                  <article className="plan-card" key={plan.id}>
                    <strong>{plan.name}</strong>
                    <span className="plan-amount">
                      {new Intl.NumberFormat("es-CO", {
                        style: "currency",
                        currency: billingDefaults.configuration.currency,
                      }).format(plan.baseMinor / 100)}
                    </span>
                    <small>
                      {plan.includedUsers} usuarios incluidos · tarifa por
                      usuario adicional {plan.userMinor}
                    </small>
                  </article>
                ))}
              </div>
              <p className="hint">
                Prueba inicial: {billingDefaults.configuration.trialMonths} mes
                {billingDefaults.configuration.trialMonths === 1 ? "" : "es"} ·
                versión {billingDefaults.version}.
              </p>
            </>
          )}
        </section>
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
              <select name="organizationId" required defaultValue="">
                <option value="" disabled>
                  Selecciona una empresa
                </option>
                {organizations.map((organization) => (
                  <option value={organization.id} key={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid">
              <label>
                WhatsApp Business Account ID (WABA)
                <input
                  name="businessAccountId"
                  placeholder="123456789012345"
                  required
                  minLength={5}
                  maxLength={80}
                />
              </label>
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
              Token de acceso permanente
              <textarea
                name="accessToken"
                required
                minLength={20}
                maxLength={4000}
              />
            </label>
            <p className="hint">
              El token se cifra al guardar y nunca vuelve a mostrarse. Después
              podrás probar la conexión contra Meta.
            </p>
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
                      {number.displayPhoneNumber} · {number.organization.name} ·
                      WABA {number.businessAccountId}
                    </small>
                  </div>
                  <span className="badge">
                    {number.advisor ? number.advisor.name : "Sin asesor"}
                  </span>
                  <span
                    className={`badge ${number.connectionStatus === "verified" ? "completed" : number.connectionStatus === "error" ? "failed" : ""}`}
                  >
                    {number.connectionStatus === "verified"
                      ? "Verificada"
                      : number.connectionStatus === "error"
                        ? "Revisar credenciales"
                        : "Pendiente"}
                  </span>
                  <button
                    className="text-button"
                    disabled={verifying === number.id}
                    onClick={async () => {
                      setVerifying(number.id);
                      setError("");
                      setNotice("");
                      try {
                        await post(
                          `/platform/whatsapp-numbers/${number.id}/verify`,
                          {},
                        );
                        setNotice("Conexión verificada contra Meta.");
                        await load();
                      } catch (failure) {
                        setError((failure as Error).message);
                        await load();
                      } finally {
                        setVerifying(null);
                      }
                    }}
                  >
                    <ShieldCheck size={15} />
                    {verifying === number.id ? "Validando…" : "Probar conexión"}
                  </button>
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
                  <div className="organization-main">
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
                  <div
                    className="module-controls"
                    aria-label={`Módulos de ${organization.name}`}
                  >
                    {Object.entries(moduleLabels).map(([key, label]) => {
                      const enabled =
                        moduleDrafts[organization.id]?.[key] ?? false;
                      return (
                        <label className="module-toggle" key={key}>
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(event) =>
                              setModuleDrafts((current) => ({
                                ...current,
                                [organization.id]: {
                                  ...current[organization.id],
                                  [key]: event.target.checked,
                                },
                              }))
                            }
                          />
                          <span>{label}</span>
                        </label>
                      );
                    })}
                    <button
                      className="secondary"
                      onClick={async () => {
                        const modules = moduleDrafts[organization.id];
                        if (!modules) return;
                        setBusy(true);
                        setError("");
                        try {
                          await patch(
                            `/platform/organizations/${organization.id}/modules`,
                            { modules },
                          );
                          setNotice(
                            `Módulos de ${organization.name} actualizados.`,
                          );
                          await load();
                        } catch (failure) {
                          setError((failure as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      disabled={busy}
                    >
                      <Save size={15} /> Guardar módulos
                    </button>
                  </div>
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

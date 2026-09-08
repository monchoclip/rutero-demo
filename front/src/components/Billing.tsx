"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Check, RefreshCw, ShieldAlert } from "lucide-react";
import { api, post, patch, ApiError } from "../lib/api";
import {
  outcomeLabels,
  type BillingConfiguration,
  type BillingPlan,
  type BillingQuote,
  type BillingSettings,
  type PaymentSimulation,
  type SimulationOutcome,
} from "../lib/types";
import {
  PlanChoice,
  QuoteBreakdown,
  SimulationHistory,
  rate,
} from "./BillingViews";

const outcomes: SimulationOutcome[] = ["approved", "declined", "pending"];
const tariffFields = [
  ["supportBps", "Soporte (puntos básicos)"],
  ["supportFixedMinor", "Soporte fijo (unidades menores)"],
  ["gatewayBps", "Pasarela (puntos básicos)"],
  ["gatewayFixedMinor", "Pasarela fija (unidades menores)"],
  ["taxBps", "Impuesto (puntos básicos)"],
] as const;

export function Billing({ commercial }: { commercial: boolean }) {
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [history, setHistory] = useState<PaymentSimulation[]>([]);
  const [quote, setQuote] = useState<BillingQuote | null>(null);
  const [planId, setPlanId] = useState<BillingPlan["id"]>("growth");
  const [users, setUsers] = useState(5);
  const [outcome, setOutcome] = useState<SimulationOutcome>("approved");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  const load = useCallback(async () => {
    setError("");
    try {
      const [stored, simulations] = await Promise.all([
        api<BillingSettings>("/billing/settings"),
        api<PaymentSimulation[]>("/billing/simulations"),
      ]);
      setSettings(stored);
      setHistory(simulations);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!settings) return;
    const timer = setTimeout(async () => {
      try {
        setQuote(await post<BillingQuote>("/billing/quote", { planId, users }));
        setError("");
      } catch (failure) {
        setQuote(null);
        setError((failure as Error).message);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [settings, planId, users]);

  async function simulate() {
    if (!quote) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await post<PaymentSimulation>("/billing/simulations", {
        planId,
        users,
        outcome,
        expectedVersion: quote.version,
        idempotencyKey: idempotencyKey.current,
      });
      idempotencyKey.current = crypto.randomUUID();
      setNotice(
        `Ensayo guardado con resultado ${outcomeLabels[outcome].toLowerCase()}. No se cobró dinero.`,
      );
      await load();
    } catch (failure) {
      setError(describe(failure));
    } finally {
      setBusy(false);
    }
  }

  async function saveTariffs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    setNotice("");
    setError("");
    const form = new FormData(event.currentTarget);
    const changes = Object.fromEntries(
      tariffFields.map(([field]) => [field, Number(form.get(field))]),
    );
    try {
      const saved = await patch<BillingSettings>("/billing/settings", {
        version: settings.version,
        configuration: {
          ...settings.configuration,
          ...changes,
        } satisfies BillingConfiguration,
      });
      setSettings(saved);
      setEditing(false);
      setNotice("Las tarifas de prueba quedaron guardadas.");
    } catch (failure) {
      setError(describe(failure));
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (!settings)
    return (
      <section className="panel">
        {error ? (
          <div className="error" role="alert">
            {error}{" "}
            <button className="text-button" onClick={load}>
              Reintentar
            </button>
          </div>
        ) : (
          <div className="skeleton" />
        )}
      </section>
    );

  const configuration = settings.configuration;
  return (
    <>
      <div className="notice-strip" role="note">
        <ShieldAlert size={18} />
        <span>
          Ensayo local del cobro: no hay pasarela conectada, ningún importe se
          cobra y ningún plan queda activo. Sirve para revisar el desglose antes
          de definir el contrato con Wompi.
        </span>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="success" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Elige el plan que quieres ensayar</h2>
            <p>Las tarifas provienen del servidor, no del navegador.</p>
          </div>
          <button className="text-button" onClick={load}>
            <RefreshCw size={15} /> Actualizar tarifas
          </button>
        </div>
        <PlanChoice
          plans={configuration.plans}
          planId={planId}
          currency={configuration.currency}
          onSelect={setPlanId}
        />
        <div className="form-grid billing-inputs">
          <label>
            Usuarios facturables
            <input
              type="number"
              min={1}
              max={500}
              value={users}
              onChange={(event) =>
                setUsers(Math.max(1, Number(event.target.value) || 1))
              }
            />
          </label>
          <label>
            Resultado a practicar
            <select
              value={outcome}
              onChange={(event) =>
                setOutcome(event.target.value as SimulationOutcome)
              }
            >
              {outcomes.map((option) => (
                <option key={option} value={option}>
                  {outcomeLabels[option]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Resumen antes de pagar</h2>
            <p>Plan, usuarios, soporte, pasarela e impuestos por separado.</p>
          </div>
        </div>
        {quote ? (
          <QuoteBreakdown quote={quote} />
        ) : (
          <div className="skeleton" />
        )}
        {commercial && (
          <button
            className="primary"
            disabled={!quote || busy}
            onClick={simulate}
          >
            {busy ? "Guardando…" : "Guardar ensayo del cobro"}
          </button>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Tarifas de prueba</h2>
            <p>
              Soporte {rate(configuration.supportBps)} · pasarela{" "}
              {rate(configuration.gatewayBps)} · impuestos{" "}
              {rate(configuration.taxBps)} · versión {settings.version}
            </p>
          </div>
          {commercial && (
            <button
              className="text-button"
              onClick={() => setEditing((open) => !open)}
            >
              {editing ? "Cancelar" : "Ajustar tarifas"}
            </button>
          )}
        </div>
        <p className="hint">
          Son valores de ensayo. Las tarifas contractuales, la base gravable y
          la moneda que espera la pasarela todavía deben definirse.
        </p>
        {editing && (
          <form onSubmit={saveTariffs}>
            <div className="form-grid">
              {tariffFields.map(([field, label]) => (
                <label key={field}>
                  {label}
                  <input
                    name={field}
                    type="number"
                    min={0}
                    max={field.endsWith("Bps") ? 10000 : 100000000}
                    defaultValue={configuration[field]}
                  />
                </label>
              ))}
            </div>
            <button className="primary" disabled={busy} type="submit">
              {busy ? "Guardando…" : "Guardar tarifas"}
            </button>
          </form>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>
            Ensayos guardados <span className="badge">{history.length}</span>
          </h2>
        </div>
        <SimulationHistory items={history} />
      </section>
    </>
  );
}

function describe(failure: unknown) {
  if (failure instanceof ApiError && failure.status === 409)
    return `${failure.message} Vuelve a revisar el resumen antes de guardar.`;
  return (failure as Error).message;
}

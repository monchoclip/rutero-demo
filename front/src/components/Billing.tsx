"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Check, RefreshCw, ShieldAlert, X } from "lucide-react";
import { api, post, patch, ApiError } from "../lib/api";
import {
  outcomeLabels,
  type BillingConfiguration,
  type BillingPlan,
  type BillingQuote,
  type BillingSettings,
  type PaymentSimulation,
  type SimulationOutcome,
  type BillingCheckout,
  type PaymentTransaction,
  type User,
  type Organization,
} from "../lib/types";
import {
  PlanChoice,
  QuoteBreakdown,
  SimulationHistory,
  rate,
  money,
} from "./BillingViews";
import { subscribeRealtime } from "../lib/realtime";

const outcomes: SimulationOutcome[] = ["approved", "declined", "pending"];
const tariffFields = [
  ["supportBps", "Soporte (puntos básicos)"],
  ["supportFixedMinor", "Soporte fijo (unidades menores)"],
  ["gatewayBps", "Pasarela (puntos básicos)"],
  ["gatewayFixedMinor", "Pasarela fija (unidades menores)"],
  ["taxBps", "Impuesto (puntos básicos)"],
] as const;

export function Billing({
  commercial,
  user,
  organization,
  autoOpenPayment = false,
  initialCheckoutPlan = null,
}: {
  commercial: boolean;
  user: User;
  organization: Organization | null;
  autoOpenPayment?: boolean;
  initialCheckoutPlan?: BillingPlan["id"] | null;
}) {
  const [settings, setSettings] = useState<BillingSettings | null>(null);
  const [history, setHistory] = useState<PaymentSimulation[]>([]);
  const [quote, setQuote] = useState<BillingQuote | null>(null);
  const [planId, setPlanId] = useState<BillingPlan["id"]>(
    initialCheckoutPlan ?? "growth",
  );
  const [users, setUsers] = useState(5);
  const [outcome, setOutcome] = useState<SimulationOutcome>("approved");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
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
  useEffect(
    () =>
      subscribeRealtime({
        onEvent: (event) => {
          if (event.type === "membership.updated") void load();
        },
      }),
    [load],
  );

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
  useEffect(() => {
    if (autoOpenPayment && quote) setPaymentOpen(true);
  }, [autoOpenPayment, quote]);

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
      {organization && (
        <section className="membership-banner" aria-live="polite">
          <div>
            <span className="eyebrow">ESTADO DE TU EMPRESA</span>
            <strong>
              {organization.membershipStatus === "active"
                ? `Membresía activa · ${organization.membershipPlan ?? "Plan"}`
                : `Periodo de prueba · vence ${new Date(organization.trialEndsAt).toLocaleDateString("es-CO")}`}
            </strong>
          </div>
          <small>
            {organization.membershipEndsAt
              ? `Próxima revisión ${new Date(organization.membershipEndsAt).toLocaleDateString("es-CO")}`
              : "El pago aprobado actualizará este estado automáticamente."}
          </small>
        </section>
      )}
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
            onClick={() => setPaymentOpen(true)}
          >
            {busy ? "Preparando…" : "Continuar al pago"}
          </button>
        )}
      </section>
      {paymentOpen && quote && (
        <PaymentModal
          quote={quote}
          user={user}
          organization={organization}
          busy={busy}
          onClose={() => setPaymentOpen(false)}
          onPay={async (customer) => {
            setBusy(true);
            setError("");
            setNotice("");
            try {
              const checkout = await post<BillingCheckout>(
                "/billing/checkout",
                {
                  planId,
                  users,
                  ...customer,
                },
              );
              if (checkout.mode === "simulation") {
                await post<PaymentSimulation>("/billing/simulations", {
                  planId,
                  users,
                  outcome: "approved",
                  expectedVersion: checkout.quote.version,
                  reference: checkout.reference,
                  idempotencyKey: crypto.randomUUID(),
                });
                setNotice(
                  "Pago de prueba aprobado. La membresía de tu empresa quedó activa en el entorno local.",
                );
                setPaymentOpen(false);
                await load();
              } else {
                await openWompi(checkout, async () => {
                  const receipt = await waitForReceipt(checkout.reference);
                  if (receipt) {
                    setNotice(
                      receipt.status === "approved"
                        ? "Wompi confirmó el pago y la membresía quedó activa."
                        : `Wompi reportó el estado ${receipt.status}.`,
                    );
                    setPaymentOpen(false);
                    await load();
                  } else
                    setNotice(
                      "Pago enviado. Esperamos la confirmación del webhook de Wompi.",
                    );
                });
              }
            } catch (failure) {
              setError(describe(failure));
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
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

type CustomerData = {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  customerLegalId?: string;
  customerLegalIdType?: string;
};

function PaymentModal({
  quote,
  user,
  organization,
  busy,
  onClose,
  onPay,
}: {
  quote: BillingQuote;
  user: User;
  organization: Organization | null;
  busy: boolean;
  onClose: () => void;
  onPay: (customer: CustomerData) => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => dialog.current?.showModal(), []);
  return (
    <dialog className="dialog payment-dialog" ref={dialog} onCancel={onClose}>
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">PAGO DE MEMBRESÍA</span>
          <h2>Confirma los datos del pagador</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar">
          <X size={20} />
        </button>
      </div>
      <p className="hint chosen-client">
        {organization?.name ?? "Tu empresa"} · {quote.planName} ·{" "}
        {money(quote.totalMinor, quote.currency)}
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(event.currentTarget));
          void onPay({
            customerName: String(data.customerName),
            customerEmail: String(data.customerEmail),
            ...(data.customerPhone
              ? { customerPhone: String(data.customerPhone) }
              : {}),
            ...(data.customerLegalId
              ? { customerLegalId: String(data.customerLegalId) }
              : {}),
            ...(data.customerLegalIdType
              ? { customerLegalIdType: String(data.customerLegalIdType) }
              : {}),
          });
        }}
      >
        <label>
          Nombre del pagador
          <input
            name="customerName"
            defaultValue={user.name}
            required
            minLength={2}
            maxLength={160}
          />
        </label>
        <label>
          Correo del pagador
          <input
            name="customerEmail"
            type="email"
            defaultValue={user.email}
            required
          />
        </label>
        <div className="form-grid">
          <label>
            Teléfono (opcional)
            <input name="customerPhone" type="tel" placeholder="3001234567" />
          </label>
          <label>
            Documento (opcional)
            <input name="customerLegalId" />
          </label>
        </div>
        <label>
          Tipo de documento
          <select name="customerLegalIdType" defaultValue="CC">
            <option value="CC">Cédula de ciudadanía</option>
            <option value="NIT">NIT</option>
            <option value="CE">Cédula de extranjería</option>
            <option value="OTHER">Otro</option>
          </select>
        </label>
        <p className="hint">
          La empresa y el plan se asocian a tu sesión. En local se registra un
          pago de prueba; con llaves de Wompi se abre su checkout oficial.
        </p>
        <div className="dialog-actions">
          <button
            className="secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Procesando…" : "Pagar membresía"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

async function openWompi(
  checkout: BillingCheckout,
  onFinished: () => Promise<void>,
) {
  if (!checkout.publicKey || !checkout.signatureIntegrity)
    throw new Error("Wompi no está configurado para este entorno.");
  if (!window.WidgetCheckout) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.wompi.co/widget.js";
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("No pudimos cargar el checkout de Wompi."));
      document.head.appendChild(script);
    });
  }
  const WidgetCheckout = window.WidgetCheckout;
  if (!WidgetCheckout)
    throw new Error("El checkout de Wompi no está disponible.");
  const widget = new WidgetCheckout({
    currency: checkout.quote.currency,
    amountInCents: checkout.quote.totalMinor,
    reference: checkout.reference,
    publicKey: checkout.publicKey,
    signature: { integrity: checkout.signatureIntegrity },
    redirectUrl: checkout.redirectUrl,
    customerData: checkout.customerData,
  });
  widget.open(() => {
    void onFinished();
  });
}

async function waitForReceipt(reference: string) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 2_000));
    try {
      const receipt = await api<PaymentTransaction>(
        `/billing/payments/${reference}`,
      );
      if (receipt.status !== "pending") return receipt;
    } catch {
      return null;
    }
  }
  return null;
}

declare global {
  interface Window {
    WidgetCheckout?: new (config: Record<string, unknown>) => {
      open: (callback: (result: unknown) => void) => void;
    };
  }
}

function describe(failure: unknown) {
  if (failure instanceof ApiError && failure.status === 409)
    return `${failure.message} Vuelve a revisar el resumen antes de guardar.`;
  return (failure as Error).message;
}

import { CalendarDays } from "lucide-react";
import {
  outcomeLabels,
  type BillingConfiguration,
  type BillingQuote,
  type PaymentSimulation,
} from "../lib/types";
import { Empty } from "./WorkspaceViews";

export const money = (minor: number, currency: string) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(minor / 100);
export const rate = (basisPoints: number) =>
  `${(basisPoints / 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })} %`;
const dateTime = (date: string) =>
  new Date(date).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function PlanChoice({
  plans,
  planId,
  currency,
  onSelect,
}: {
  plans: BillingConfiguration["plans"];
  planId: string;
  currency: string;
  onSelect: (id: BillingConfiguration["plans"][number]["id"]) => void;
}) {
  return (
    <div className="plan-grid">
      {plans.map((plan) => (
        <button
          key={plan.id}
          type="button"
          aria-pressed={plan.id === planId}
          className={`plan-card ${plan.id === planId ? "selected" : ""}`}
          onClick={() => onSelect(plan.id)}
        >
          <strong>{plan.name}</strong>
          <span className="plan-amount">{money(plan.baseMinor, currency)}</span>
          <small>
            Incluye {plan.includedUsers} usuarios · cada usuario adicional{" "}
            {money(plan.userMinor, currency)}
          </small>
        </button>
      ))}
    </div>
  );
}

export function QuoteBreakdown({ quote }: { quote: BillingQuote }) {
  const lines = [
    ["Plan " + quote.planName, quote.baseMinor],
    [
      `Usuarios adicionales (${quote.additionalUsers} sobre ${quote.includedUsers} incluidos)`,
      quote.extraUsersMinor,
    ],
    ["Subtotal", quote.subtotalMinor],
    ["Soporte", quote.supportMinor],
    ["Recargo de pasarela", quote.gatewayMinor],
    ["Impuestos", quote.taxMinor],
  ] as const;
  return (
    <div className="quote">
      {lines.map(([label, amount]) => (
        <div className="quote-line" key={label}>
          <span>{label}</span>
          <strong>{money(amount, quote.currency)}</strong>
        </div>
      ))}
      <div className="quote-line total">
        <span>Total del primer cobro</span>
        <strong>{money(quote.totalMinor, quote.currency)}</strong>
      </div>
      <small className="hint">
        Tarifas de la versión {quote.version} de la configuración. Importes en
        unidades menores de {quote.currency}; las fracciones se redondean hacia
        arriba.
      </small>
    </div>
  );
}

export function SimulationHistory({ items }: { items: PaymentSimulation[] }) {
  return items.length ? (
    <div>
      {items.map((simulation) => (
        <article className="activity-row" key={simulation.id}>
          <span className="activity-icon follow_up">
            <CalendarDays size={18} />
          </span>
          <div className="activity-info">
            <strong>{simulation.snapshot.quote.planName}</strong>
            <small>
              {simulation.snapshot.quote.users} usuarios · tarifas versión{" "}
              {simulation.configurationVersion}
            </small>
            <p>
              {money(
                simulation.snapshot.quote.totalMinor,
                simulation.snapshot.quote.currency,
              )}
            </p>
          </div>
          <div className="activity-time">
            <strong>{dateTime(simulation.createdAt)}</strong>
            <span
              className={`badge ${simulation.outcome === "approved" ? "completed" : ""}`}
            >
              {outcomeLabels[simulation.outcome]}
            </span>
          </div>
        </article>
      ))}
    </div>
  ) : (
    <Empty
      title="Todavía no has guardado un ensayo"
      text="Elige un plan, revisa el resumen y registra el resultado que quieras practicar."
    />
  );
}

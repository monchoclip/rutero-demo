import type { CSSProperties, ReactNode } from "react";
import { ArrowDown, ArrowUp, Clock, PhoneCall } from "lucide-react";
import type { AdvisorStats, Trend } from "../lib/metrics";
import type { User } from "../lib/types";

const initials = (name: string) =>
  name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function TrendPill({ trend }: { trend: Trend }) {
  if (trend.delta === null)
    return <span className="trend-pill neutral">Sin datos previos</span>;
  if (trend.delta === 0)
    return (
      <span className="trend-pill neutral">Igual que la semana pasada</span>
    );
  const up = trend.delta > 0;
  return (
    <span className={`trend-pill ${up ? "up" : "down"}`}>
      {up ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
      {Math.abs(trend.delta)}% vs. semana anterior
    </span>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon,
  trend,
  warning = false,
  index = 0,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  trend?: Trend;
  warning?: boolean;
  index?: number;
}) {
  return (
    <article
      className={`stat-card ${warning ? "warning" : ""}`}
      style={{ "--stagger": index } as CSSProperties}
    >
      <div className="stat-card-top">
        <span className="stat-icon">{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <strong className="stat-value">
        {value.toString().padStart(2, "0")}
      </strong>
      <div className="stat-card-bottom">
        <small>{detail}</small>
        {trend && <TrendPill trend={trend} />}
      </div>
    </article>
  );
}

function ProgressRing({ percent }: { percent: number | null }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const value = percent ?? 0;
  const offset = circumference * (1 - value / 100);
  return (
    <div
      className="progress-ring"
      role="img"
      aria-label={`${value}% de gestiones completadas`}
    >
      <svg viewBox="0 0 64 64">
        <circle className="ring-track" cx="32" cy="32" r={radius} />
        <circle
          className="ring-value"
          cx="32"
          cy="32"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={percent === null ? circumference : offset}
        />
      </svg>
      <strong>{percent === null ? "—" : `${value}%`}</strong>
    </div>
  );
}

export function AdvisorPerformanceCard({
  advisor,
  stats,
  trend,
  index,
}: {
  advisor: User;
  stats: AdvisorStats;
  trend: Trend;
  index: number;
}) {
  return (
    <article
      className="advisor-card"
      style={{ "--stagger": index } as CSSProperties}
    >
      <div className="advisor-card-head">
        <span className="avatar">{initials(advisor.name)}</span>
        <div>
          <strong>{advisor.name}</strong>
          <small>{advisor.email}</small>
        </div>
        <ProgressRing percent={stats.completionRate} />
      </div>
      <div className="advisor-stats">
        <div>
          <small>Cartera</small>
          <strong>{stats.portfolio}</strong>
        </div>
        <div>
          <small>Programadas</small>
          <strong>{stats.scheduled}</strong>
        </div>
        <div className={stats.overdue > 0 ? "advisor-stat-warning" : ""}>
          <small>Vencidas</small>
          <strong>{stats.overdue}</strong>
        </div>
        <div>
          <small>Completadas · 7 días</small>
          <strong>{stats.completedLast7}</strong>
        </div>
      </div>
      <div className="advisor-card-foot">
        <TrendPill trend={trend} />
        {stats.avgResolutionHours !== null && (
          <span className="advisor-detail">
            <Clock size={13} />
            {formatHours(stats.avgResolutionHours)} en resolver una gestión
          </span>
        )}
        {stats.avgDurationMinutes !== null && (
          <span className="advisor-detail">
            <PhoneCall size={13} />
            {formatHours(stats.avgDurationMinutes / 60)} de duración promedio
          </span>
        )}
      </div>
    </article>
  );
}

function formatHours(hours: number) {
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours / 24)} días`;
}

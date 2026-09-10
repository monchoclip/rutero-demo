"use client";
import { Empty, ClientTable, ActivityList } from "./WorkspaceViews";
import { ClientDetail } from "./ClientDetail";
import { StatCard, AdvisorPerformanceCard } from "./Insights";
import { advisorStats, weeklyTrend, groupSchedule } from "../lib/metrics";
import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Route,
  LayoutDashboard,
  ListChecks,
  Users,
  CalendarDays,
  ContactRound,
  Mail,
  LogOut,
  Plus,
  ArrowUpRight,
  Search,
  Phone,
  MapPin,
  ArrowRight,
  Check,
  Clock,
  Building2,
  Receipt,
  MessageCircle,
  Target,
} from "lucide-react";
import { api, post, ApiError } from "../lib/api";
import { queuedMutationCount, replayOfflineQueue } from "../lib/offlineQueue";
import {
  activityLabels,
  roleLabels,
  type User,
  type Organization,
  type Client,
  type Activity,
  type Mail as MailItem,
  type Invitation,
  type WhatsAppNumber,
  type ModuleKey,
} from "../lib/types";
import { FormDialog, type FormKind } from "./Forms";
import { Billing } from "./Billing";
import { Chat } from "./Chat";
import { SequenceBoard } from "./SequenceBoard";
type Tab =
  | "overview"
  | "sequence"
  | "clients"
  | "agenda"
  | "team"
  | "chats"
  | "billing"
  | "mail";
const tabs = [
  { id: "overview", label: "Resumen", icon: LayoutDashboard },
  { id: "sequence", label: "Secuencia", icon: ListChecks },
  { id: "clients", label: "Clientes", icon: ContactRound },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "team", label: "Mi equipo", icon: Users },
  { id: "chats", label: "WhatsApp", icon: MessageCircle },
  { id: "billing", label: "Cobro simulado", icon: Receipt },
  { id: "mail", label: "Correo de prueba", icon: Mail },
] as const;
const defaultModuleConfig: Record<ModuleKey, boolean> = {
  overview: true,
  sequence: true,
  clients: true,
  agenda: true,
  team: true,
  chats: true,
  billing: true,
  mail: false,
};
const headings: Record<Tab, { title: string; text: string }> = {
  overview: {
    title: "Tu equipo en movimiento",
    text: "Una vista de tu cartera y de lo que viene después.",
  },
  sequence: {
    title: "Trabajo ordenado por prioridad",
    text: "Bloqueados, hoy, esta semana y clientes sin siguiente paso.",
  },
  clients: {
    title: "Cada relación cuenta",
    text: "Clientes, responsables y todo su historial de contacto.",
  },
  agenda: {
    title: "El próximo contacto, claro",
    text: "Llamadas, visitas y seguimientos con un responsable.",
  },
  team: {
    title: "Las personas detrás de cada venta",
    text: "Invita a tus asesores y empieza a asignarles clientes.",
  },
  chats: {
    title: "Cada conversación, con un responsable",
    text: "Los chats de WhatsApp de tu línea, en un solo lugar.",
  },
  billing: {
    title: "Un ensayo antes del primer cobro",
    text: "Revisa plan, usuarios y recargos sin mover dinero real.",
  },
  mail: {
    title: "Bandeja de desarrollo",
    text: "Estos mensajes no se han enviado a correos reales.",
  },
};
const advisorHeadings: Partial<Record<Tab, { title: string; text: string }>> = {
  overview: {
    title: "Mi jornada comercial",
    text: "Prioriza visitas, llamadas y clientes sin siguiente paso.",
  },
  sequence: {
    title: "Mi secuencia de trabajo",
    text: "Tarjetas por urgencia para cerrar pendientes y programar avances.",
  },
  clients: {
    title: "Mi cartera asignada",
    text: "Clientes bajo tu responsabilidad con ficha, historial y agenda.",
  },
  agenda: {
    title: "Mi agenda del día",
    text: "Contactos pendientes, vencidos y gestiones ya registradas.",
  },
};
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
// The server decides who sees an optional module; a denial only hides its tab.
async function available(path: string) {
  try {
    await api(path);
    return true;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 403 || error.status === 404)
    )
      return false;
    throw error;
  }
}
// Every role can call this once a number is registered, scoped to what they
// may see; an empty list means WhatsApp isn't set up for this company yet.
async function hasWhatsAppNumbers() {
  try {
    return (await api<WhatsAppNumber[]>("/whatsapp/numbers")).length > 0;
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 403 || error.status === 404)
    )
      return false;
    throw error;
  }
}
export function Workspace({
  user,
  onLogout,
  autoOpenPayment = false,
  initialCheckoutPlan = null,
}: {
  user: User;
  onLogout: () => void;
  autoOpenPayment?: boolean;
  initialCheckoutPlan?: "essential" | "growth" | "enterprise" | null;
}) {
  const [tab, setTab] = useState<Tab>(autoOpenPayment ? "billing" : "overview");
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [mail, setMail] = useState<MailItem[]>([]);
  const [localMail, setLocalMail] = useState(false);
  const [billing, setBilling] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState("");
  const [online, setOnline] = useState(true);
  const [pendingSync, setPendingSync] = useState(0);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<{
    kind: FormKind;
    activity?: Activity;
    client?: Client;
    prefill?: { phone?: string; contactName?: string };
  } | null>(null);
  const [detail, setDetail] = useState<Client | null>(null);
  const [history, setHistory] = useState<Activity[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const commercial = user.role === "commercial_coordinator";
  const advisorMode = user.role === "advisor";
  const writer = commercial || user.role === "advisor";
  const coordinator = commercial || user.role === "administrative_coordinator";
  const load = useCallback(async () => {
    setError("");
    try {
      const [org, team, customers, tasks] = await Promise.all([
        api<Organization>("/organization"),
        api<User[]>("/users"),
        api<Client[]>("/clients?limit=100"),
        api<Activity[]>("/activities"),
      ]);
      setOrganization(org);
      setUsers(team);
      setClients(customers);
      setActivities(tasks);
      setLastSyncedAt(new Date());
      if (commercial) setInvitations(await api<Invitation[]>("/invitations"));
      if (coordinator) setBilling(await available("/billing/settings"));
      setWhatsapp(await hasWhatsAppNumbers());
      try {
        setMail(await api<MailItem[]>("/development/mailbox"));
        setLocalMail(true);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
        setLocalMail(false);
      }
      return customers;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onLogout();
      else setError((error as Error).message);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [commercial, coordinator, onLogout]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setOnline(navigator.onLine);
    const refreshQueue = () => {
      void queuedMutationCount()
        .then(setPendingSync)
        .catch(() => setPendingSync(0));
    };
    const sync = () => {
      setOnline(true);
      void replayOfflineQueue().then(({ synced, remaining }) => {
        setPendingSync(remaining);
        if (synced) {
          setNotice(
            `${synced} actividad${synced === 1 ? "" : "es"} sincronizada${synced === 1 ? "" : "s"}.`,
          );
          void load();
        }
      });
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", sync);
    window.addEventListener("offline", goOffline);
    window.addEventListener("ruts68:queue-changed", refreshQueue);
    navigator.serviceWorker?.addEventListener("message", (event) => {
      if (event.data?.type === "ruts68:sync") sync();
    });
    refreshQueue();
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("ruts68:queue-changed", refreshQueue);
    };
  }, [load]);
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const interval = window.setInterval(refreshWhenVisible, 30_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);
  async function saved() {
    const customers = await load();
    // Keep the ficha open after saving from it, refreshed with the new
    // advisor/history instead of dropping the coordinator back to the list.
    setDetail((current) => {
      if (!current) return current;
      const updated = customers?.find((c) => c.id === current.id);
      return updated ?? null;
    });
    if (detail) {
      try {
        setHistory(await api<Activity[]>(`/clients/${detail.id}/history`));
      } catch {
        // The ficha already reflects the failure to load fresh data via `error`.
      }
    }
    setNotice("Los cambios quedaron guardados.");
  }
  async function logout() {
    try {
      await post("/auth/logout", {});
      onLogout();
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function openClient(client: Client) {
    setTab("clients");
    setDetail(client);
    setHistory([]);
    setHistoryLoading(true);
    try {
      setHistory(await api<Activity[]>(`/clients/${client.id}/history`));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  }
  const scheduled = activities.filter((a) => a.status === "scheduled");
  const completed = activities.filter((a) => a.status === "completed");
  const overdue = scheduled.filter(
    (a) => new Date(a.dueAt).getTime() < Date.now(),
  );
  const filteredClients = clients.filter((c) =>
    `${c.name} ${c.contactName} ${c.city}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const remainingDays = organization
    ? Math.max(
        0,
        Math.ceil(
          (new Date(organization.trialEndsAt).getTime() - Date.now()) /
            86400000,
        ),
      )
    : 0;
  const hasAdvisors = users.some((u) => u.role === "advisor");
  const advisors = users.filter((u) => u.role === "advisor");
  const coordinators = users.filter((u) => u.role !== "advisor");
  const enabledModules = organization?.moduleConfig ?? defaultModuleConfig;
  const visibleTabs = tabs.filter(
    (t) =>
      enabledModules[t.id] &&
      (t.id !== "team" || coordinator) &&
      (t.id !== "chats" || whatsapp) &&
      (t.id !== "billing" || billing) &&
      (t.id !== "mail" || localMail),
  );
  useEffect(() => {
    if (!visibleTabs.some((item) => item.id === tab))
      setTab(visibleTabs[0]?.id ?? "overview");
  }, [tab, visibleTabs]);
  const completionTrend = weeklyTrend(activities, () => true);
  const todayActivities = scheduled.filter((activity) => {
    const due = new Date(activity.dueAt).getTime();
    return due <= new Date().setHours(23, 59, 59, 999);
  });
  const activeHeading = advisorMode
    ? (advisorHeadings[tab] ?? headings[tab])
    : headings[tab];
  const nextActivity =
    [...scheduled].sort(
      (left, right) =>
        new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),
    )[0] ?? null;
  const clientsWithoutNext = clients.filter(
    (client) => !scheduled.some((activity) => activity.clientId === client.id),
  );
  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Ruts68, inicio">
          <Route size={29} />
          <span>
            ruts<span className="brand-number">68</span>
          </span>
        </a>
        <div className="company-switch">
          <span className="company-icon">
            <Building2 size={18} />
          </span>
          <div>
            <strong>{organization?.name ?? "Tu empresa"}</strong>
            <small>Espacio de trabajo</small>
          </div>
        </div>
        <span className="nav-label">GESTIÓN COMERCIAL</span>
        <nav aria-label="Navegación principal">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setDetail(null);
                setNotice("");
              }}
              className={tab === t.id ? "nav-item active" : "nav-item"}
              aria-current={tab === t.id ? "page" : undefined}
            >
              <t.icon size={19} />
              {t.label}
              {t.id === "agenda" && scheduled.length > 0 && (
                <span className="nav-count">{scheduled.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="trial-card">
            <span className="eyebrow">TU PRIMER MES</span>
            <strong>
              {remainingDays
                ? `${remainingDays} días para explorar`
                : "Tu prueba ha terminado"}
            </strong>
            <p>
              {remainingDays
                ? "Conecta a tu equipo y empieza a organizar tu cartera."
                : "Los planes estarán disponibles en la siguiente etapa."}
            </p>
            <div className="trial-line">
              <span
                style={{
                  width: `${Math.min(100, (remainingDays / 31) * 100)}%`,
                }}
              />
            </div>
          </div>
          <div className="profile">
            <span className="avatar">{initials(user.name)}</span>
            <div>
              <strong>{user.name}</strong>
              <small>{roleLabels[user.role]}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Cerrar sesión"
              onClick={logout}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>
            Tu empresa <span className="slash">/</span>{" "}
            <strong>{tabs.find((t) => t.id === tab)?.label}</strong>
          </span>
          <div className="topbar-right">
            <span
              className={online ? "environment-dot" : "environment-dot offline"}
            />{" "}
            {online ? "En línea" : "Sin conexión"}{" "}
            {pendingSync > 0 && (
              <span
                className="sync-queue"
                title="Actividades pendientes de sincronización"
              >
                {pendingSync} pendiente{pendingSync === 1 ? "" : "s"}
              </span>
            )}{" "}
            <span className="environment-separator">·</span> Desarrollo local{" "}
            <span className="sync-status">
              {lastSyncedAt
                ? `· Actualizado ${lastSyncedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`
                : "· Sincronizando…"}
            </span>{" "}
            <span className="avatar small-avatar">{initials(user.name)}</span>
          </div>
        </header>
        <main className="workspace-content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {new Date().toLocaleDateString("es-CO", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </span>
              <h1>{activeHeading.title}</h1>
              <p>{activeHeading.text}</p>
            </div>
            {writer && tab !== "billing" && tab !== "chats" && (
              <button
                className="primary"
                onClick={() =>
                  setForm({
                    kind:
                      tab === "team" || (commercial && !hasAdvisors)
                        ? "invite"
                        : tab === "clients" || !clients.length
                          ? "client"
                          : "activity",
                  })
                }
              >
                <Plus size={18} />
                {tab === "team" || (commercial && !hasAdvisors)
                  ? "Invitar asesor"
                  : tab === "clients" || !clients.length
                    ? "Nuevo cliente"
                    : "Programar contacto"}
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}{" "}
              <button className="text-button" onClick={load}>
                Reintentar
              </button>
            </div>
          )}
          {notice && (
            <div className="success" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}
          {loading ? (
            <div className="panel">
              <div className="skeleton" />
              <div className="skeleton" />
              <p>Cargando tu información…</p>
            </div>
          ) : (
            <div className="tab-panel" key={tab}>
              {tab === "overview" && (
                <>
                  {advisorMode && (
                    <section className="advisor-command">
                      <div>
                        <span className="eyebrow">MODO ASESOR</span>
                        <h2>
                          {nextActivity
                            ? `Primero: ${nextActivity.client.name}`
                            : "Tu jornada está despejada"}
                        </h2>
                        <p>
                          {nextActivity
                            ? `${activityLabels[nextActivity.type]} · ${dateTime(nextActivity.dueAt)}`
                            : "Crea el siguiente contacto o revisa clientes sin próxima gestión."}
                        </p>
                      </div>
                      <div className="advisor-command-actions">
                        {nextActivity && (
                          <button
                            className="primary"
                            onClick={() =>
                              setForm({
                                kind: "complete",
                                activity: nextActivity,
                              })
                            }
                          >
                            <Check size={17} />
                            Registrar resultado
                          </button>
                        )}
                        <button
                          className="secondary"
                          onClick={() =>
                            clientsWithoutNext[0]
                              ? setForm({
                                  kind: "activity",
                                  client: clientsWithoutNext[0],
                                })
                              : setForm({ kind: "activity" })
                          }
                          disabled={!clients.length}
                        >
                          <Target size={17} />
                          Programar avance
                        </button>
                      </div>
                    </section>
                  )}
                  <div className="metrics">
                    <StatCard
                      index={0}
                      label="Clientes en cartera"
                      value={clients.length}
                      detail="Con un asesor responsable"
                      icon={<ContactRound size={19} />}
                    />
                    <StatCard
                      index={1}
                      label={
                        advisorMode ? "Agenda de hoy" : "Contactos pendientes"
                      }
                      value={
                        advisorMode ? todayActivities.length : scheduled.length
                      }
                      detail={
                        advisorMode
                          ? "Vencidos y compromisos del día"
                          : "Tu agenda por completar"
                      }
                      icon={<CalendarDays size={19} />}
                    />
                    <StatCard
                      index={2}
                      label="Gestiones realizadas"
                      value={completed.length}
                      detail="Resultados registrados"
                      icon={<Check size={19} />}
                      trend={completionTrend}
                    />
                    <StatCard
                      index={3}
                      label="Requieren atención"
                      value={overdue.length}
                      detail="Actividades con fecha vencida"
                      icon={<Clock size={19} />}
                      warning={overdue.length > 0}
                    />
                  </div>
                  <div className="overview-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <div>
                          <h2>Próximos contactos</h2>
                          <p>El siguiente paso para seguir cerca.</p>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => setTab("agenda")}
                        >
                          Ver agenda <ArrowUpRight size={15} />
                        </button>
                      </div>
                      <ActivityList
                        items={scheduled.slice(0, 6)}
                        writer={writer}
                        onComplete={(activity) =>
                          setForm({ kind: "complete", activity })
                        }
                      />
                    </section>
                    <section className="next-step">
                      <span className="eyebrow">CONSTRUYE TU CARTERA</span>
                      <h2>
                        El seguimiento
                        <br />
                        empieza aquí.
                      </h2>
                      <p>
                        {!hasAdvisors
                          ? "Invita a tu primer asesor. Cuando acepte, podrás asignarle sus clientes."
                          : !clients.length
                            ? "Agrega tu primer cliente y deja definido quién lo acompañará."
                            : "Una conversación registrada ayuda a preparar mejor la siguiente."}
                      </p>
                      <button
                        className="secondary"
                        onClick={() =>
                          commercial && !hasAdvisors
                            ? setForm({ kind: "invite" })
                            : writer
                              ? setForm({
                                  kind: clients.length ? "activity" : "client",
                                })
                              : setTab("clients")
                        }
                      >
                        {!hasAdvisors && commercial
                          ? "Invitar a mi equipo"
                          : clients.length
                            ? "Ir al siguiente paso"
                            : "Crear primer cliente"}
                        <ArrowRight size={17} />
                      </button>
                      <Route className="next-step-icon" size={90} />
                    </section>
                  </div>
                  <section className="panel">
                    <div className="section-heading">
                      <div>
                        <h2>Tu cartera, a la mano</h2>
                        <p>Un responsable para cada relación.</p>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => setTab("clients")}
                      >
                        Ver clientes <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <ClientTable
                      clients={clients.slice(0, 5)}
                      activities={activities}
                      onOpen={openClient}
                    />
                  </section>
                </>
              )}
              {tab === "sequence" && (
                <SequenceBoard
                  activities={activities}
                  clients={clients}
                  users={users}
                  writer={writer}
                  onComplete={(activity) =>
                    setForm({ kind: "complete", activity })
                  }
                  onSchedule={(client) => setForm({ kind: "activity", client })}
                  onOpenClient={openClient}
                />
              )}
              {tab === "clients" && (
                <section className="panel">
                  <div className="section-heading">
                    <h2>
                      Clientes <span className="badge">{clients.length}</span>
                    </h2>
                    <label className="search">
                      <Search size={17} />
                      <input
                        aria-label="Buscar clientes cargados"
                        placeholder="Buscar nombre o ciudad…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  <ClientTable
                    clients={filteredClients}
                    activities={activities}
                    onOpen={openClient}
                  />
                  {clients.length === 100 && (
                    <p className="hint">
                      Se muestran los primeros 100 clientes.
                    </p>
                  )}
                </section>
              )}
              {detail && tab === "clients" && (
                <ClientDetail
                  client={detail}
                  history={history}
                  historyLoading={historyLoading}
                  commercial={commercial}
                  writer={writer}
                  onClose={() => setDetail(null)}
                  onReassign={() => setForm({ kind: "assign", client: detail })}
                  onSchedule={() =>
                    setForm({ kind: "activity", client: detail })
                  }
                  onComplete={(activity) =>
                    setForm({ kind: "complete", activity })
                  }
                />
              )}
              {tab === "agenda" && (
                <>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>
                        Por realizar{" "}
                        <span className="badge">{scheduled.length}</span>
                      </h2>
                      <span className="hint">Horario de tu dispositivo</span>
                    </div>
                    {scheduled.length ? (
                      <div className="agenda-board">
                        {groupSchedule(scheduled)
                          .filter((group) => group.items.length)
                          .map((group, index) => (
                            <div
                              className={`agenda-group agenda-${group.key}`}
                              key={group.key}
                              style={{ "--stagger": index } as CSSProperties}
                            >
                              <div className="agenda-group-heading">
                                <h3>{group.label}</h3>
                                <span className="badge">
                                  {group.items.length}
                                </span>
                                <small>{group.hint}</small>
                              </div>
                              <ActivityList
                                items={group.items}
                                writer={writer}
                                onComplete={(activity) =>
                                  setForm({ kind: "complete", activity })
                                }
                              />
                            </div>
                          ))}
                      </div>
                    ) : (
                      <Empty
                        title="Todo listo para el próximo contacto"
                        text="Programa una llamada, una visita o un seguimiento para comenzar."
                      />
                    )}
                  </section>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>Gestiones realizadas</h2>
                    </div>
                    <ActivityList
                      items={completed}
                      writer={false}
                      onComplete={() => {}}
                    />
                  </section>
                </>
              )}
              {tab === "team" && (
                <>
                  {!commercial && (
                    <div className="notice-strip" role="status">
                      <Users size={17} />
                      <span>
                        Vista administrativa de solo lectura. Puedes revisar el
                        equipo y su operación; las invitaciones y cambios
                        comerciales los gestiona el coordinador comercial.
                      </span>
                    </div>
                  )}
                  {advisors.length > 0 && (
                    <section className="panel">
                      <div className="section-heading">
                        <div>
                          <h2>
                            Rendimiento del equipo{" "}
                            <span className="badge">{advisors.length}</span>
                          </h2>
                          <p>Cartera, cumplimiento y ritmo de cada asesor.</p>
                        </div>
                      </div>
                      <div className="advisor-grid">
                        {advisors.map((advisor, index) => (
                          <AdvisorPerformanceCard
                            key={advisor.id}
                            advisor={advisor}
                            index={index}
                            stats={advisorStats(
                              advisor.id,
                              clients,
                              activities,
                            )}
                            trend={weeklyTrend(
                              activities,
                              (a) => a.advisor.id === advisor.id,
                            )}
                          />
                        ))}
                      </div>
                    </section>
                  )}
                  {commercial && (
                    <section className="panel">
                      <div className="section-heading">
                        <h2>
                          Coordinación{" "}
                          <span className="badge">{coordinators.length}</span>
                        </h2>
                      </div>
                      <div className="team-grid">
                        {coordinators.map((u) => (
                          <article className="team-card" key={u.id}>
                            <span className="avatar">{initials(u.name)}</span>
                            <h3>{u.name}</h3>
                            <span className="badge">{roleLabels[u.role]}</span>
                            <p>{u.email}</p>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                  {commercial && (
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Invitaciones pendientes</h2>
                      </div>
                      {invitations.length ? (
                        invitations.map((i) => (
                          <div className="invitation-row" key={i.id}>
                            <span>
                              <strong>{i.name}</strong>
                              <small>{i.email}</small>
                            </span>
                            <span className="badge">
                              Vence {dateTime(i.expiresAt)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <Empty
                          title="Sin invitaciones pendientes"
                          text="Aquí aparecerán las personas que aún no han aceptado."
                        />
                      )}
                    </section>
                  )}
                </>
              )}
              {tab === "chats" && (
                <Chat
                  commercial={commercial}
                  writer={writer}
                  currentUserId={user.id}
                  users={users}
                  onCreateClient={(prefill) =>
                    setForm({ kind: "client", prefill })
                  }
                />
              )}
              {tab === "billing" && (
                <Billing
                  commercial={commercial}
                  user={user}
                  organization={organization}
                  autoOpenPayment={autoOpenPayment}
                  initialCheckoutPlan={initialCheckoutPlan}
                />
              )}
              {tab === "mail" && (
                <section className="panel">
                  <div className="section-heading">
                    <h2>Mensajes de prueba</h2>
                    <button className="text-button" onClick={load}>
                      Actualizar
                    </button>
                  </div>
                  <p className="hint">
                    Abre una invitación para probar el ingreso del asesor. Los
                    recordatorios permanecen en cola hasta ejecutar el proceso
                    de correo local.
                  </p>
                  {mail.length ? (
                    mail.map((m) => (
                      <article className="mail-card" key={m.id}>
                        <div className="section-heading">
                          <h3>{m.subject}</h3>
                          <span className="badge">
                            {m.cancelledAt
                              ? "Cancelado"
                              : m.sentAt
                                ? "Procesado localmente"
                                : "En cola"}
                          </span>
                        </div>
                        <small>
                          Para: {m.recipient} · {dateTime(m.availableAt)}
                        </small>
                        <p>{m.body}</p>
                        {m.body
                          .match(
                            /http:\/\/localhost:3068\/(?:ingresar\/)?\?invitation=[a-f0-9]{64}/,
                          )
                          ?.map((url) => (
                            <a
                              className="text-button"
                              key={url}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Abrir invitación <ArrowUpRight size={15} />
                            </a>
                          ))}
                      </article>
                    ))
                  ) : (
                    <Empty
                      title="No hay mensajes todavía"
                      text="Invita a un asesor o programa un contacto para generar el primer mensaje."
                    />
                  )}
                </section>
              )}
            </div>
          )}
          <footer className="workspace-footer">
            <span>Ruts68 · Gestión de relaciones</span>
            <span>Primera versión · PostgreSQL local</span>
          </footer>
        </main>
      </div>
      {form && (
        <FormDialog
          {...form}
          users={users}
          user={user}
          clients={clients}
          onClose={() => setForm(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}

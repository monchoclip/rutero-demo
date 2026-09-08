"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Route,
  Check,
  Menu,
  X,
  ShieldCheck,
  Users,
  CalendarDays,
  ContactRound,
  Phone,
  MapPin,
  GraduationCap,
  Sprout,
  HeartPulse,
  Store,
  Sparkles,
} from "lucide-react";
import {
  CompanySection,
  SecuritySection,
  RoadmapSection,
  FaqSection,
} from "./Information";
import { PlansSection } from "./PlansSection";
export function Home() {
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invitation");
    if (token && /^[a-f0-9]{64}$/.test(token))
      window.location.replace(`/ingresar/?invitation=${token}`);
  }, []);
  return (
    <div className="marketing">
      <a href="#contenido" className="skip-link">
        Ir al contenido
      </a>
      <div className="announcement">
        <span>Una nueva forma de conectar con tus clientes.</span>
        <a href="#novedades">
          Conoce lo que viene <ArrowUpRight size={13} />
        </a>
      </div>
      <header className="home-header">
        <a href="/" className="home-brand" aria-label="Ruts68, inicio">
          <Route size={29} />
          <span>
            ruts<span>68</span>
          </span>
        </a>
        <nav
          className={menu ? "home-nav open" : "home-nav"}
          aria-label="Navegación del sitio"
        >
          {[
            ["Soluciones", "#soluciones"],
            ["Cómo funciona", "#como-funciona"],
            ["Planes", "#planes"],
            ["Nosotros", "#nosotros"],
          ].map(([label, href]) => (
            <a key={href} href={href} onClick={() => setMenu(false)}>
              {label}
            </a>
          ))}
        </nav>
        <div className="home-nav-actions">
          <a className="home-login" href="/ingresar/">
            Ingresar
          </a>
          <a className="home-button dark compact" href="/ingresar/?register=1">
            Empieza gratis <ArrowUpRight size={16} />
          </a>
          <button
            className="mobile-menu"
            aria-label={menu ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <main id="contenido">
        <section className="home-hero home-container">
          <div className="hero-copy">
            <span className="home-kicker">
              <i /> TU EQUIPO. TUS CLIENTES. MÁS CERCA.
            </span>
            <h1>
              Cada contacto,
              <br />
              una oportunidad
              <br />
              <em>de crecer.</em>
            </h1>
            <p>
              Convierte llamadas, visitas y seguimientos en relaciones que
              duran. Un CRM para las personas que hacen crecer tu negocio, todos
              los días.
            </p>
            <div className="hero-actions">
              <a className="home-button dark" href="/ingresar/?register=1">
                Comienza tu mes gratis <ArrowUpRight size={19} />
              </a>
              <a className="home-button outline" href="/ingresar/?demo=advisor">
                Explorar la demo <ArrowRight size={18} />
              </a>
            </div>
            <div className="hero-notes">
              <span>
                <Check size={15} /> Sin tarjeta para empezar
              </span>
              <span>
                <Check size={15} /> Un mes para conocerlo
              </span>
            </div>
            <div className="hero-maker">
              <span className="dvia-monogram">D</span>
              <div>
                Diseñado para conectar.
                <br />
                <strong>Desarrollado por DVIA.</strong>
              </div>
            </div>
          </div>
          <ProductPreview />
        </section>
        <div className="sector-strip">
          <div className="home-container">
            <span>UN CRM. MUCHAS FORMAS DE CRECER.</span>
            <div>
              <Sprout size={21} /> Alimentos
            </div>
            <div>
              <GraduationCap size={23} /> Educación
            </div>
            <div>
              <HeartPulse size={22} /> Salud
            </div>
            <div>
              <Store size={21} /> Comercio
            </div>
          </div>
        </div>
        <SolutionsSection />
        <HowSection />
        <PlansSection />
        <CompanySection />
        <SecuritySection />
        <RoadmapSection />
        <FaqSection />
        <section className="closing-section home-container">
          <span className="home-kicker">EL SIGUIENTE PASO ES TUYO</span>
          <h2>
            Tu próxima gran relación
            <br />
            empieza con <em>un contacto.</em>
          </h2>
          <p>Dale a tu equipo un lugar para trabajar mejor, juntos.</p>
          <a className="home-button light" href="/ingresar/?register=1">
            Crear mi empresa <ArrowUpRight size={19} />
          </a>
          <a className="closing-demo" href="/ingresar/?demo=advisor">
            Primero quiero explorar la demo →
          </a>
        </section>
      </main>
      <footer className="home-footer home-container">
        <div className="footer-top">
          <div>
            <a href="/" className="home-brand">
              <Route size={27} />
              <span>
                ruts<span>68</span>
              </span>
            </a>
            <p>
              Ventas, atención y fidelización.
              <br />
              Relaciones que siguen creciendo.
            </p>
          </div>
          <div>
            <strong>Descubre Ruts68</strong>
            <a href="#soluciones">Soluciones por sector</a>
            <a href="#planes">Planes de demostración</a>
            <a href="#novedades">Novedades del producto</a>
          </div>
          <div>
            <strong>Conócenos</strong>
            <a href="#nosotros">Misión, visión y objetivos</a>
            <a href="#seguridad">Seguridad de la información</a>
            <a href="#dvia">Desarrollado por DVIA</a>
          </div>
          <div>
            <strong>Tu espacio</strong>
            <a href="/ingresar/">Iniciar sesión</a>
            <a href="/ingresar/?register=1">Registrar mi empresa</a>
            <a href="/ingresar/?demo=coordinator">Demo para coordinadores</a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} Ruts68 · Desarrollado por DVIA
          </span>
          <span>Versión de demostración · Sin cobros reales</span>
        </div>
      </footer>
    </div>
  );
}
function ProductPreview() {
  const [view, setView] = useState<"agenda" | "clients">("agenda");
  return (
    <div className="hero-product">
      <div className="product-orbit" aria-hidden="true" />
      <div className="preview-note top">
        <span>
          <Check size={16} />
        </span>
        <div>
          <strong>Cada cliente tiene su lugar</strong>
          <small>Y una persona que lo acompaña.</small>
        </div>
      </div>
      <div className="product-window">
        <div className="window-chrome">
          <span />
          <span />
          <span />
          <small>ruts68 · Tu espacio de trabajo</small>
          <ShieldCheck size={14} />
        </div>
        <div className="preview-body">
          <div className="preview-sidebar">
            <Route size={24} />
            <button
              aria-label="Ver ejemplo de agenda"
              aria-pressed={view === "agenda"}
              className={view === "agenda" ? "selected" : ""}
              onClick={() => setView("agenda")}
            >
              <CalendarDays size={18} />
            </button>
            <button
              aria-label="Ver ejemplo de cartera"
              aria-pressed={view === "clients"}
              className={view === "clients" ? "selected" : ""}
              onClick={() => setView("clients")}
            >
              <ContactRound size={18} />
            </button>
            <Users size={18} />
          </div>
          <div className="preview-content">
            <div className="preview-greeting">
              <div>
                <span>MIÉRCOLES · UN NUEVO DÍA</span>
                <h3>
                  Hola, Ana <span>✦</span>
                </h3>
              </div>
              <span className="preview-avatar">AM</span>
            </div>
            <p className="preview-intro">
              Las buenas relaciones se construyen paso a paso.
            </p>
            <div className="preview-metrics">
              <div>
                <small>Mi cartera</small>
                <strong>
                  04<em>clientes</em>
                </strong>
              </div>
              <div>
                <small>Próximos contactos</small>
                <strong>
                  03<em>por realizar</em>
                </strong>
              </div>
            </div>
            <div className="preview-list-heading">
              <strong>
                {view === "agenda"
                  ? "Tu siguiente contacto"
                  : "Personas detrás de cada cliente"}
              </strong>
              <span>Ver todo ↗</span>
            </div>
            <div key={view} className="preview-records">
              {(view === "agenda"
                ? [
                    ["09:30", "Colegio Horizonte", "Seguimiento de admisiones"],
                    ["11:00", "Centro Vida Integral", "Visita de presentación"],
                    ["14:30", "Comercial Andina", "Primera conversación"],
                  ]
                : [
                    ["LH", "La Huerta", "Laura Gómez · Bogotá"],
                    ["CH", "Colegio Horizonte", "Andrés Molina · Medellín"],
                    ["CV", "Centro Vida Integral", "Valentina Díaz · Cali"],
                  ]
              ).map(([time, name, note], i) => (
                <div className="preview-record" key={name}>
                  <span className={`preview-time color-${i}`}>
                    {view === "agenda" ? (
                      i === 1 ? (
                        <MapPin size={17} />
                      ) : (
                        <Phone size={16} />
                      )
                    ) : (
                      time
                    )}
                  </span>
                  <div>
                    <strong>{name}</strong>
                    <small>{note}</small>
                  </div>
                  {view === "agenda" && <span>{time}</span>}
                </div>
              ))}
            </div>
            <div className="preview-progress">
              <span>
                <i /> Cada gestión queda en el historial
              </span>
              <Check size={14} />
            </div>
          </div>
        </div>
      </div>
      <div className="preview-note bottom">
        <span>
          <CalendarDays size={18} />
        </span>
        <div>
          <strong>El próximo paso, siempre claro.</strong>
          <small>Tu agenda y tu cartera, juntas.</small>
        </div>
        <Sparkles size={20} />
      </div>
      <small className="preview-disclaimer">
        Vista ilustrativa · Datos de demostración
      </small>
    </div>
  );
}
const sectors = [
  {
    id: "commerce",
    label: "Comercio",
    icon: Store,
    title: "De la primera conversación a la próxima compra.",
    text: "Asigna una cartera a cada asesor, registra lo que necesita cada cliente y organiza el siguiente contacto sin perder el contexto.",
    example: "Comercial Andina",
    task: "Llamada de seguimiento comercial",
    person: "Daniel Rojas",
    bullets: [
      "Clientes con un responsable",
      "Llamadas con resultado e historial",
      "Seguimiento para volver a conectar",
    ],
  },
  {
    id: "food",
    label: "Alimentos",
    icon: Sprout,
    title: "Una relación que va más allá de la entrega.",
    text: "Acompaña a tus distribuidores y puntos de venta. Programa visitas y registra acuerdos para mantener una atención constante.",
    example: "Distribuciones La Huerta",
    task: "Visita de reposición y fidelización",
    person: "Laura Gómez",
    bullets: [
      "Cartera por asesor o distribuidor",
      "Visitas en una agenda compartida",
      "Pedidos y ERP en la siguiente etapa",
    ],
  },
  {
    id: "education",
    label: "Educación",
    icon: GraduationCap,
    title: "Acompaña cada decisión de aprender.",
    text: "Da continuidad a las consultas de familias y aspirantes. Conserva sus intereses y deja programado el próximo paso de admisiones.",
    example: "Colegio Horizonte",
    task: "Seguimiento a solicitud de información",
    person: "Andrés Molina",
    bullets: [
      "Solicitudes con un asesor asignado",
      "Historial de orientación",
      "Recordatorios para próximos contactos",
    ],
  },
  {
    id: "health",
    label: "Salud",
    icon: HeartPulse,
    title: "Una atención cercana también se organiza.",
    text: "Gestiona relaciones y contactos administrativos con personas e instituciones. Este CRM no reemplaza una historia clínica.",
    example: "Centro Vida Integral",
    task: "Contacto de atención administrativa",
    person: "Valentina Díaz",
    bullets: [
      "Continuidad en la atención",
      "Asignación y seguimiento administrativo",
      "Sin historias clínicas en este alcance",
    ],
  },
];
function SolutionsSection() {
  const [selected, setSelected] = useState(0);
  const sector = sectors[selected];
  return (
    <section id="soluciones" className="home-section home-container">
      <div className="section-intro">
        <span className="home-kicker">TAN VERSÁTIL COMO TU NEGOCIO</span>
        <h2>
          Cambia el sector.
          <br />
          La importancia de conectar, <em>no.</em>
        </h2>
        <p>Personas distintas, una misma necesidad: sentirse bien atendidas.</p>
      </div>
      <div
        className="sector-tabs"
        role="tablist"
        aria-label="Soluciones por sector"
      >
        {sectors.map((s, i) => (
          <button
            key={s.id}
            id={`tab-${s.id}`}
            role="tab"
            tabIndex={selected === i ? 0 : -1}
            aria-selected={selected === i}
            aria-controls="sector-panel"
            onClick={() => setSelected(i)}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? 3
                      : (i + (e.key === "ArrowRight" ? 1 : 3)) % 4;
                setSelected(next);
                document.getElementById(`tab-${sectors[next].id}`)?.focus();
              }
            }}
          >
            <s.icon size={19} />
            {s.label}
          </button>
        ))}
      </div>
      <div
        className="sector-panel"
        id="sector-panel"
        role="tabpanel"
        aria-labelledby={`tab-${sector.id}`}
      >
        <div>
          <span className="home-kicker">
            RUTS68 PARA {sector.label.toUpperCase()}
          </span>
          <h3>{sector.title}</h3>
          <p>{sector.text}</p>
          <ul>
            {sector.bullets.map((b) => (
              <li key={b}>
                <Check size={17} />
                {b}
              </li>
            ))}
          </ul>
          <a href="/ingresar/?demo=advisor" className="home-text-link">
            Descubre el recorrido de un asesor <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="sector-example" key={sector.id}>
          <div className="sector-example-top">
            <sector.icon size={25} />
            <span>UN CONTACTO CON CONTEXTO</span>
          </div>
          <h4>{sector.example}</h4>
          <p>{sector.person}</p>
          <div className="example-contact">
            <CalendarDays size={20} />
            <div>
              <small>Próximo paso</small>
              <strong>{sector.task}</strong>
            </div>
          </div>
          <div className="example-owner">
            <span className="preview-avatar">AM</span>
            <div>
              <strong>Ana Martínez</strong>
              <small>Asesora responsable</small>
            </div>
            <span className="example-status">Asignado</span>
          </div>
          <small>Ejemplo de uso · Datos ficticios</small>
        </div>
      </div>
    </section>
  );
}
function HowSection() {
  return (
    <section id="como-funciona" className="how-section">
      <div className="home-container">
        <div className="section-intro">
          <span className="home-kicker">DEL CONTACTO A LA CONTINUIDAD</span>
          <h2>
            Menos pendientes sueltos.
            <br />
            <em>Más próximos pasos.</em>
          </h2>
        </div>
        <div className="how-grid">
          {[
            {
              number: "01",
              icon: Users,
              title: "Conecta a tu equipo",
              text: "Crea tu empresa e invita a tus asesores. Cada persona entra con su propia cuenta.",
            },
            {
              number: "02",
              icon: ContactRound,
              title: "Dale un dueño a cada relación",
              text: "Asigna los clientes y reúne la información que hace más útil cada conversación.",
            },
            {
              number: "03",
              icon: CalendarDays,
              title: "Haz que el seguimiento suceda",
              text: "Programa el contacto, registra el resultado y deja listo el siguiente paso.",
            },
          ].map((s) => (
            <article key={s.number}>
              <div>
                <s.icon size={26} />
                <span>{s.number}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
        <a href="/ingresar/?demo=coordinator" className="home-text-link">
          Ver cómo trabaja un coordinador <ArrowUpRight size={18} />
        </a>
      </div>
    </section>
  );
}

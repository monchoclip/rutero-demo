import {
  ArrowUpRight,
  Target,
  Telescope,
  Compass,
  Fingerprint,
  LockKeyhole,
  ShieldCheck,
  History,
  Layers,
  Code2,
} from "lucide-react";
export function CompanySection() {
  return (
    <section
      id="nosotros"
      className="home-section home-container company-section"
    >
      <div className="company-story">
        <span className="home-kicker">TECNOLOGÍA CON PROPÓSITO</span>
        <h2>
          Detrás de cada dato,
          <br />
          <em>hay una relación.</em>
        </h2>
        <p>
          Creemos que una buena herramienta debe acercar a las personas. Ruts68
          nace para darle continuidad a cada conversación y ayudar a los equipos
          a trabajar con más claridad.
        </p>
        <div id="dvia" className="developer-card">
          <Code2 size={27} />
          <div>
            <span>DISEÑO Y DESARROLLO</span>
            <h3>DVIA</h3>
            <p>
              La empresa desarrolladora de Ruts68. Construimos este producto
              alrededor de la gestión comercial, la atención y la fidelización.
            </p>
          </div>
        </div>
      </div>
      <div className="purpose-cards">
        {[
          {
            icon: Target,
            label: "Nuestra misión",
            title: "Hacer más cercana la gestión.",
            text: "Ayudar a empresas e instituciones a organizar sus equipos y dar seguimiento a sus clientes, con información clara y herramientas fáciles de usar.",
          },
          {
            icon: Telescope,
            label: "Nuestra visión",
            title: "Crecer junto a quienes conectan.",
            text: "Ser un CRM accesible y versátil que acompañe a organizaciones de distintos sectores en la construcción de relaciones duraderas.",
          },
          {
            icon: Compass,
            label: "Nuestro objetivo",
            title: "Que ningún próximo paso se pierda.",
            text: "Reunir responsables, conversaciones y tareas en un solo lugar, para mejorar la continuidad de la atención y la colaboración del equipo.",
          },
        ].map((p) => (
          <article key={p.label}>
            <span>
              <p.icon size={21} />
            </span>
            <div>
              <small>{p.label}</small>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
export function SecuritySection() {
  return (
    <section id="seguridad" className="security-section">
      <div className="home-container">
        <div className="security-heading">
          <div>
            <span className="home-kicker">SEGURIDAD DE LA INFORMACIÓN</span>
            <h2>
              La confianza también
              <br />
              <em>se construye por dentro.</em>
            </h2>
          </div>
          <p>
            Tu información merece un acceso controlado. Estas son las medidas
            que ya forman parte de la base de Ruts68.
          </p>
        </div>
        <div className="security-grid">
          {[
            {
              icon: Layers,
              title: "Cada empresa, su espacio",
              text: "El acceso a clientes y actividades se limita a la empresa de la cuenta autenticada.",
            },
            {
              icon: Fingerprint,
              title: "Permisos por responsabilidad",
              text: "El asesor consulta su cartera; la coordinación organiza su equipo y las asignaciones.",
            },
            {
              icon: LockKeyhole,
              title: "Acceso con protección",
              text: "Contraseñas protegidas con hash y sesiones que se revocan al cerrar sesión.",
            },
            {
              icon: History,
              title: "Cambios con trazabilidad",
              text: "Se registran acciones clave como asignaciones, invitaciones y resultados de actividades.",
            },
          ].map((s) => (
            <article key={s.title}>
              <s.icon size={25} />
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
        <div className="security-note">
          <ShieldCheck size={20} />
          <p>
            En desarrollo local. La validación del entorno productivo, los
            respaldos y las políticas operativas se completarán antes de
            publicar. No se anuncian certificaciones ni garantías de seguridad
            absoluta.
          </p>
        </div>
      </div>
    </section>
  );
}
export function RoadmapSection() {
  return (
    <section id="novedades" className="home-section home-container">
      <div className="section-intro row">
        <div>
          <span className="home-kicker">UN PRODUCTO QUE EVOLUCIONA</span>
          <h2>
            Lo nuevo. Lo útil.
            <br />
            <em>Lo que viene.</em>
          </h2>
        </div>
        <p>
          Conoce qué puedes explorar hoy y hacia dónde estamos construyendo
          Ruts68.
        </p>
      </div>
      <div className="news-grid">
        <article>
          <span className="release-label available">Ya puedes probarlo</span>
          <span className="news-number">01 / GESTIÓN</span>
          <h3>Tu cartera, con memoria.</h3>
          <p>
            Equipo, clientes, historial y agenda conectados. Registra una
            llamada y programa el siguiente contacto sin perder el hilo.
          </p>
          <a href="/ingresar/?demo=advisor">
            Explorar el CRM <ArrowUpRight size={17} />
          </a>
        </article>
        <article>
          <span className="release-label testing">En demostración</span>
          <span className="news-number">02 / PLANES</span>
          <h3>Entiende cada concepto del pago.</h3>
          <p>
            Prueba planes, número de usuarios, soporte y pasarela. Edita valores
            y simula resultados sin mover dinero.
          </p>
          <a href="/ingresar/?demo=coordinator">
            Probar la configuración <ArrowUpRight size={17} />
          </a>
        </article>
        <article>
          <span className="release-label upcoming">Próximas etapas</span>
          <span className="news-number">03 / CONEXIONES</span>
          <h3>Más contexto, más posibilidades.</h3>
          <p>
            Catálogo, campañas, pedidos al ERP, ubicación en visitas y Wompi
            real forman parte del siguiente recorrido del producto.
          </p>
          <a href="#preguntas">
            Resolver mis dudas <ArrowUpRight size={17} />
          </a>
        </article>
      </div>
    </section>
  );
}
export function FaqSection() {
  return (
    <section id="preguntas" className="faq-section home-container">
      <div>
        <span className="home-kicker">ANTES DE COMENZAR</span>
        <h2>
          Las respuestas,
          <br />
          <em>sin rodeos.</em>
        </h2>
        <p>Lo esencial para dar tu primer paso.</p>
      </div>
      <div>
        {[
          [
            "¿Ruts68 es solo para empresas de alimentos?",
            "No. Está pensado para ventas, atención y fidelización en comercio, distribución, educación, salud y otros servicios. El ejemplo de salud es administrativo y no incluye historia clínica.",
          ],
          [
            "¿Cómo funciona el mes gratis?",
            "Al registrar una empresa nueva se guarda una prueba de un mes calendario. No se solicita tarjeta para crearla. Los valores publicados en esta demo son ejemplos; aún no se realizan cobros.",
          ],
          [
            "¿Puedo entrar sin registrar mi empresa?",
            "Sí. Elige “Explorar la demo” para usar la cuenta de asesor con datos ficticios. La demo de coordinador permite revisar el equipo y los pagos simulados. Ambas comparten una empresa de pruebas.",
          ],
          [
            "¿Los pagos ya se procesan con Wompi?",
            "Todavía no. El módulo actual calcula y guarda simulaciones locales de pago. No solicita datos de tarjeta, no se conecta a Wompi y no activa suscripciones reales.",
          ],
          [
            "¿Puedo ver la ubicación de mis asesores?",
            "Puedes programar visitas en la agenda. La captura real de ubicación y la consola de seguimiento están previstas para otra etapa y requieren permisos del usuario y del dispositivo.",
          ],
          [
            "¿Quién desarrolla Ruts68?",
            "DVIA es la empresa desarrolladora. La misión es dar a los equipos una herramienta accesible para organizar relaciones comerciales y mejorar la continuidad de la atención.",
          ],
        ].map(([q, a]) => (
          <details key={q} name="ruts68-faq">
            <summary>
              {q}
              <span aria-hidden="true">+</span>
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

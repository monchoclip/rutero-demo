"use client";
import { useState } from "react";
import { ArrowUpRight, Check, CreditCard, Info } from "lucide-react";
const plans = [
  {
    name: "Esencial",
    price: 49000,
    included: 2,
    extra: 19000,
    description: "Para dar orden a tus primeras relaciones.",
    features: [
      "Cartera de clientes asignados",
      "Agenda y registro de contactos",
      "Historial por cliente",
    ],
  },
  {
    name: "Crecimiento",
    price: 129000,
    included: 5,
    extra: 15000,
    description: "Para un equipo que quiere avanzar junto.",
    features: [
      "La base completa del CRM",
      "Más usuarios incluidos",
      "Coordinación de la cartera",
    ],
  },
  {
    name: "Organización",
    price: 249000,
    included: 10,
    extra: 12000,
    description: "Para conectar a un equipo más amplio.",
    features: [
      "La base completa del CRM",
      "Diez usuarios para comenzar",
      "Seguimiento comercial compartido",
    ],
  },
];
const money = (n: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
export function PlansSection() {
  const [users, setUsers] = useState(5);
  return (
    <section id="planes" className="home-section home-container">
      <div className="section-intro">
        <span className="home-kicker">ESPACIO PARA TU EQUIPO</span>
        <h2>
          Empieza simple.
          <br />
          <em>Crece a tu ritmo.</em>
        </h2>
        <p>
          Un mes gratis al registrar tu empresa. Explora estos planes de ejemplo
          y encuentra la escala de tu equipo.
        </p>
      </div>
      <div className="plan-controls">
        <span>
          <Info size={17} /> Valores ilustrativos · No son tarifas comerciales
        </span>
        <label>
          Personas en tu equipo{" "}
          <select
            value={users}
            onChange={(e) => setUsers(Number(e.target.value))}
          >
            {[1, 2, 5, 10, 15, 20].map((n) => (
              <option value={n} key={n}>
                {n} {n === 1 ? "persona" : "personas"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="home-plans">
        {plans.map((p, i) => (
          <article
            className={i === 1 ? "home-plan featured" : "home-plan"}
            key={p.name}
          >
            {i === 1 && (
              <span className="featured-tag">PARA TRABAJAR EN EQUIPO</span>
            )}
            <h3>{p.name}</h3>
            <p>{p.description}</p>
            <div className="plan-price">
              {money(p.price + Math.max(0, users - p.included) * p.extra)}
              <span>COP / mes · ejemplo</span>
            </div>
            <small>
              Incluye {p.included} usuarios · Adicional: {money(p.extra)}/mes
            </small>
            <a
              href="/ingresar/?demo=coordinator"
              className={`home-button ${i === 1 ? "light" : "outline"}`}
            >
              Explorar este plan <ArrowUpRight size={17} />
            </a>
            <ul>
              {p.features.map((f) => (
                <li key={f}>
                  <Check size={16} />
                  {f}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <div className="payment-note">
        <CreditCard size={25} />
        <p>
          <strong>Un pago que puedas entender.</strong> En la demo de
          coordinación puedes parametrizar soporte, pasarela e impuestos de
          prueba y ver el total desglosado. Estos importes del home no incluyen
          esos conceptos. Wompi real está pendiente de integración.
        </p>
      </div>
    </section>
  );
}

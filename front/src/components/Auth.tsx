"use client";
import { useState, type FormEvent } from "react";
import { ArrowUpRight, Check, Route } from "lucide-react";
import { post } from "../lib/api";
import type { User } from "../lib/types";
export function Auth({
  onLogin,
  invitation,
  initialRegister = false,
  demoRole = null,
}: {
  onLogin: (user: User) => void;
  invitation: string | null;
  initialRegister?: boolean;
  demoRole?: "advisor" | "coordinator" | null;
}) {
  const [register, setRegister] = useState(initialRegister);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const user = await post<User>(
        invitation
          ? "/auth/accept-invitation"
          : register
            ? "/auth/register"
            : "/auth/login",
        invitation ? { password: data.password, token: invitation } : data,
      );
      onLogin(user);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="/">
          <Route size={30} />
          <span>
            ruts<span className="brand-number">68</span>
          </span>
        </a>
        <div>
          <span className="eyebrow">RELACIONES QUE CRECEN</span>
          <h1>
            Cada cliente.
            <br />
            Un próximo paso.
          </h1>
          <p>
            Organiza a tu equipo y acompaña a tus clientes, desde la primera
            llamada hasta la próxima visita.
          </p>
          <div className="story-checks">
            <span>
              <Check size={18} /> Una cartera para cada asesor
            </span>
            <span>
              <Check size={18} /> Seguimientos que quedan registrados
            </span>
            <span>
              <Check size={18} /> Un mes gratis para tu empresa
            </span>
          </div>
        </div>
        <small>Ruts68 · Ventas, atención y fidelización</small>
      </section>
      <section className="auth-form-wrap">
        <div className="auth-form">
          <span className="eyebrow">TU ESPACIO DE TRABAJO</span>
          <h2>
            {invitation
              ? "Únete a tu equipo"
              : register
                ? "Comencemos por tu empresa"
                : "Qué bueno verte de nuevo"}
          </h2>
          <p>
            {invitation
              ? "Crea tu contraseña para aceptar la invitación como asesor."
              : register
                ? "Crea tu cuenta de coordinación comercial. Tu mes de prueba empieza hoy."
                : "Ingresa para continuar con tus clientes."}
          </p>
          <form onSubmit={submit}>
            {demoRole && !register && (
              <div className="demo-access-note">
                <strong>
                  Demostración ·{" "}
                  {demoRole === "advisor" ? "Asesor" : "Coordinador"}
                </strong>
                <p>
                  Datos ficticios y pagos simulados. La cuenta está lista para
                  ingresar.
                </p>
                <small>
                  Clave de prueba: <code>Ruts68.Demo2026!</code>
                </small>
              </div>
            )}
            {register && !invitation && (
              <>
                <label>
                  Nombre de la empresa
                  <input
                    name="companyName"
                    required
                    minLength={2}
                    maxLength={160}
                  />
                </label>
                <label>
                  Tu nombre
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </label>
                <label>
                  Sector
                  <select name="sector">
                    <option value="commerce">Comercio</option>
                    <option value="food">Alimentos y distribución</option>
                    <option value="education">Educación</option>
                    <option value="health">Salud</option>
                    <option value="services">Servicios</option>
                    <option value="other">Otro</option>
                  </select>
                </label>
              </>
            )}
            {!invitation && (
              <label>
                Correo electrónico
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="tu@empresa.com"
                  defaultValue={
                    demoRole
                      ? `${demoRole === "advisor" ? "asesor" : "coordinador"}@ruts68.test`
                      : ""
                  }
                  required
                />
              </label>
            )}
            <label>
              Contraseña
              <input
                type="password"
                name="password"
                autoComplete={
                  register || invitation ? "new-password" : "current-password"
                }
                required
                minLength={12}
                maxLength={128}
                defaultValue={demoRole ? "Ruts68.Demo2026!" : ""}
              />
              <small>Al menos 12 caracteres.</small>
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy
                ? "Un momento…"
                : invitation
                  ? "Aceptar invitación"
                  : register
                    ? "Crear mi empresa"
                    : "Ingresar"}
              <ArrowUpRight size={18} />
            </button>
          </form>
          {!invitation && (
            <button
              className="text-button auth-toggle"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register
                ? "Ya tengo cuenta · Ingresar"
                : "¿Primera vez aquí? Crea tu empresa"}
            </button>
          )}
          <div className="auth-footnote">
            Entorno local de desarrollo. Los correos se guardan en una bandeja
            de prueba.
            <a href="/" className="text-button">
              ← Volver al inicio
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

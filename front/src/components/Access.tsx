"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import type { User } from "../lib/types";
import { Auth } from "./Auth";
import { Workspace } from "./Workspace";
export function Access() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [invitation, setInvitation] = useState<string | null>(null);
  const [register, setRegister] = useState(false);
  const [demoRole, setDemoRole] = useState<"advisor" | "coordinator" | null>(
    null,
  );
  const logout = useCallback(() => {
    window.location.assign("/ingresar/");
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const token = query.get("invitation");
    setInvitation(token);
    setRegister(query.get("register") === "1");
    const demo = query.get("demo");
    if (demo === "advisor" || demo === "coordinator") setDemoRole(demo);
    if (token || demo || query.has("register")) {
      setLoading(false);
      return;
    }
    api<User>("/auth/me")
      .then(setUser)
      .catch((error) => {
        if (!(error instanceof ApiError && error.status === 401))
          setError(error.message);
      })
      .finally(() => setLoading(false));
  }, []);
  if (loading)
    return (
      <main className="loading-screen">
        <div className="skeleton" />
        <p>Preparando tu espacio…</p>
      </main>
    );
  if (error)
    return (
      <main className="loading-screen">
        <p role="alert">{error}</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Reintentar
        </button>
        <a href="/">Volver al inicio</a>
      </main>
    );
  return user ? (
    <Workspace user={user} onLogout={logout} />
  ) : (
    <Auth
      key={`${register}-${demoRole}`}
      invitation={invitation}
      initialRegister={register}
      demoRole={demoRole}
      onLogin={() => window.location.assign("/app/")}
    />
  );
}

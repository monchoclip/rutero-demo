import type { Metadata } from "next";
import "./globals.css";
import "./workspace.css";
import { PwaRegistration } from "../lib/pwa";
export const metadata: Metadata = {
  title: "Ruts68 · Gestión de clientes",
  description:
    "Tu equipo, tus clientes y cada próximo contacto, en un solo lugar.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-CO">
      <body>
        {children}
        <PwaRegistration />
      </body>
    </html>
  );
}

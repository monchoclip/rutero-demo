import type { FastifyRequest, FastifyReply } from "fastify";
import type { IdentityService } from "../identity/IdentityService.js";
import type { CrmService } from "../crm/CrmService.js";
import type { Actor } from "../identity/IdentityTypes.js";
declare module "fastify" {
  interface FastifyRequest {
    actor: Actor | null;
  }
}
export type Services = {
  identity: IdentityService;
  crm: CrmService;
  production: boolean;
  localMail: boolean;
};
export type Handler = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<unknown>;
export const cookieName = "ruts68_session";
export function setSession(
  reply: FastifyReply,
  token: string,
  production: boolean,
) {
  reply.setCookie(cookieName, token, {
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    path: "/",
    maxAge: 86400,
  });
}

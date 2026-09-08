import {
  registerSchema,
  loginSchema,
  acceptSchema,
} from "../IdentitySchema.js";
import {
  cookieName,
  setSession,
  type Handler,
  type Services,
} from "../../shared/context.js";
export function identityHandlers(services: Services): Record<string, Handler> {
  const { identity, production } = services;
  return {
    register: async (request, reply) => {
      const result = await identity.register(
        registerSchema.parse(request.body),
      );
      setSession(reply, result.token, production);
      reply.code(201);
      return result.user;
    },
    login: async (request, reply) => {
      const input = loginSchema.parse(request.body);
      await identity.limit(`email:${input.email}`);
      const result = await identity.login(input);
      setSession(reply, result.token, production);
      return result.user;
    },
    acceptInvitation: async (request, reply) => {
      const result = await identity.accept(acceptSchema.parse(request.body));
      setSession(reply, result.token, production);
      return result.user;
    },
    logout: async (request, reply) => {
      await identity.logout(request.cookies[cookieName] ?? "");
      reply.clearCookie(cookieName, { path: "/" });
      return { loggedOut: true };
    },
    me: async (request) => request.actor,
  };
}

import type { z } from "zod";
import type {
  registerSchema,
  loginSchema,
  acceptSchema,
} from "./IdentitySchema.js";
import { IdentityRepository } from "./IdentityRepository.js";
import { AppError } from "../shared/errors.js";
import {
  hashPassword,
  verifyPassword,
  newToken,
  hashToken,
} from "../shared/security.js";
import { addCalendarMonths } from "../shared/dates.js";
import { publicUser } from "./IdentityTypes.js";
import { billingConfigSchema } from "../billing/BillingSchema.js";
import { defaultBillingConfig } from "../billing/BillingTypes.js";
export class IdentityService {
  constructor(private repository: IdentityRepository) {}
  async limit(key: string) {
    const attempt = await this.repository.attempt(hashToken(key), new Date());
    if (attempt.attempts > 15)
      throw new AppError(
        429,
        "TOO_MANY_ATTEMPTS",
        "Demasiados intentos. Espera 10 minutos.",
      );
  }
  async register(input: z.infer<typeof registerSchema>) {
    if (await this.repository.findByEmail(input.email))
      throw new AppError(
        409,
        "EMAIL_UNAVAILABLE",
        "Este correo ya está registrado.",
      );
    const storedDefaults = await this.repository.platformBillingDefaults();
    const billingConfiguration = storedDefaults
      ? billingConfigSchema.parse(storedDefaults.configuration)
      : defaultBillingConfig;
    const organization = await this.repository.register(
      input,
      await hashPassword(input.password),
      addCalendarMonths(new Date(), billingConfiguration.trialMonths),
      billingConfiguration,
    );
    return this.issue(organization.users[0]);
  }
  async login(input: z.infer<typeof loginSchema>) {
    const user = await this.repository.findByEmail(input.email);
    const fallback =
      "scrypt:00000000000000000000000000000000:" + "0".repeat(128);
    const valid = await verifyPassword(
      input.password,
      user?.passwordHash ?? fallback,
    );
    if (!user?.active || !valid)
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Correo o contraseña incorrectos.",
      );
    return this.issue(user);
  }
  private async issue(user: Parameters<typeof publicUser>[0]) {
    const token = newToken();
    await this.repository.createSession(
      user.id,
      hashToken(token),
      new Date(Date.now() + 86_400_000),
    );
    return { user: publicUser(user), token };
  }
  async authenticate(token?: string) {
    if (!token)
      throw new AppError(401, "UNAUTHORIZED", "Inicia sesión para continuar.");
    const session = await this.repository.session(hashToken(token));
    if (!session || session.expiresAt <= new Date() || !session.user.active)
      throw new AppError(
        401,
        "UNAUTHORIZED",
        "Tu sesión venció. Vuelve a ingresar.",
      );
    return publicUser(session.user);
  }
  logout(token: string) {
    return this.repository.logout(hashToken(token));
  }
  async accept(input: z.infer<typeof acceptSchema>) {
    const invitation = await this.repository.invitation(hashToken(input.token));
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt <= new Date()
    )
      throw new AppError(
        410,
        "INVITATION_EXPIRED",
        "La invitación ya fue usada o venció.",
      );
    const user = await this.repository.accept(
      invitation,
      await hashPassword(input.password),
    );
    if (!user)
      throw new AppError(
        410,
        "INVITATION_EXPIRED",
        "La invitación ya fue usada o venció.",
      );
    return this.issue(user);
  }
}

import { z } from "zod";

export const moduleKeys = [
  "overview",
  "sequence",
  "clients",
  "agenda",
  "team",
  "chats",
  "billing",
  "mail",
] as const;

export const moduleConfigSchema = z
  .object(
    Object.fromEntries(moduleKeys.map((key) => [key, z.boolean()])) as Record<
      (typeof moduleKeys)[number],
      z.ZodBoolean
    >,
  )
  .strict();

export const modulesUpdateSchema = z
  .object({ modules: moduleConfigSchema })
  .strict();

export type ModuleConfig = z.infer<typeof moduleConfigSchema>;

export const defaultModuleConfig: ModuleConfig = {
  overview: true,
  sequence: true,
  clients: true,
  agenda: true,
  team: true,
  chats: true,
  billing: true,
  mail: false,
};

export function normalizeModuleConfig(value: unknown): ModuleConfig {
  const parsed = moduleConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : defaultModuleConfig;
}

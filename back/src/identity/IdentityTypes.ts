import type { User } from "@prisma/client";
export type Actor = Pick<
  User,
  "id" | "organizationId" | "name" | "email" | "role"
>;
export const publicUser = (user: Actor): Actor => ({
  id: user.id,
  organizationId: user.organizationId,
  name: user.name,
  email: user.email,
  role: user.role,
});

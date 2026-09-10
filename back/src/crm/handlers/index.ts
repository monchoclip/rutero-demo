import { inviteSchema } from "../../identity/IdentitySchema.js";
import {
  clientSchema,
  listSchema,
  idSchema,
  activitySchema,
  completeSchema,
  assignmentSchema,
  visitStartSchema,
} from "../CrmSchema.js";
import { AppError } from "../../shared/errors.js";
import type { Handler, Services } from "../../shared/context.js";
import { modulesUpdateSchema } from "../OrganizationSchema.js";
export function crmHandlers({
  crm,
  production,
  localMail,
}: Services): Record<string, Handler> {
  return {
    organization: async (r) => crm.organization(r.actor!),
    platformUpdateModules: async (r) => {
      const params = idSchema.parse(r.params);
      return crm.platformUpdateModules(
        r.actor!,
        params.id,
        modulesUpdateSchema.parse(r.body).modules,
      );
    },
    users: async (r) => crm.users(r.actor!),
    invitations: async (r) => crm.invitations(r.actor!),
    invite: async (r, reply) => {
      const result = await crm.invite(r.actor!, inviteSchema.parse(r.body));
      reply.code(201);
      return result;
    },
    clients: async (r) => crm.clients(r.actor!, listSchema.parse(r.query)),
    createClient: async (r, reply) => {
      const result = await crm.createClient(
        r.actor!,
        clientSchema.parse(r.body),
      );
      reply.code(201);
      return result;
    },
    reassignClient: async (r) =>
      crm.reassign(
        r.actor!,
        idSchema.parse(r.params).id,
        assignmentSchema.parse(r.body).advisorId,
      ),
    history: async (r) => crm.history(r.actor!, idSchema.parse(r.params).id),
    activities: async (r) => crm.activities(r.actor!),
    createActivity: async (r, reply) => {
      const result = await crm.createActivity(
        r.actor!,
        activitySchema.parse(r.body),
      );
      reply.code(201);
      return result;
    },
    completeActivity: async (r) =>
      crm.complete(
        r.actor!,
        idSchema.parse(r.params).id,
        completeSchema.parse(r.body),
      ),
    startVisit: async (r) =>
      crm.startVisit(
        r.actor!,
        idSchema.parse(r.params).id,
        visitStartSchema.parse(r.body),
      ),
    mailbox: async (r) => {
      if (production || !localMail)
        throw new AppError(404, "NOT_FOUND", "Esta página no está disponible.");
      return crm.mailbox(r.actor!);
    },
  };
}

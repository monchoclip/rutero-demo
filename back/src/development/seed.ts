import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../shared/security.js";
import { addCalendarMonth } from "../shared/dates.js";
import {
  DEMO_ORGANIZATION_ID,
  defaultBillingConfig,
} from "../billing/BillingTypes.js";
import { encryptSecret } from "../shared/secrets.js";
export const DEMO_PASSWORD = "Ruts68.Demo2026!";
export const demoPlatformUser = {
  id: "68000000-0000-4000-8000-000000000010",
  name: "Diana Plataforma",
  email: "plataforma@ruts68.test",
  role: "super_admin" as const,
};
export const demoUsers = [
  {
    id: "68000000-0000-4000-8000-000000000011",
    name: "Camila Torres",
    email: "coordinador@ruts68.test",
    role: "commercial_coordinator" as const,
  },
  {
    id: "68000000-0000-4000-8000-000000000012",
    name: "Ana Martínez",
    email: "asesor@ruts68.test",
    role: "advisor" as const,
  },
  {
    id: "68000000-0000-4000-8000-000000000013",
    name: "Diego Ruiz",
    email: "diego@ruts68.test",
    role: "advisor" as const,
  },
];
const customers = [
  [
    "Distribuciones La Huerta",
    "Laura Gómez",
    "Bogotá",
    "Alimentos · reposición semanal",
  ],
  [
    "Colegio Horizonte",
    "Andrés Molina",
    "Medellín",
    "Educación · seguimiento a admisiones",
  ],
  [
    "Centro Vida Integral",
    "Valentina Díaz",
    "Cali",
    "Salud · atención administrativa, sin datos clínicos",
  ],
  [
    "Comercial Andina",
    "Daniel Rojas",
    "Bogotá",
    "Comercio · nueva relación comercial",
  ],
  [
    "Sabores del Valle",
    "María Castro",
    "Cali",
    "Alimentos · llamada de fidelización",
  ],
  [
    "Instituto Avanza",
    "Juan Torres",
    "Medellín",
    "Educación · solicitud de información",
  ],
];
export async function seedDemo(db: PrismaClient) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  await db.organization.upsert({
    where: { id: DEMO_ORGANIZATION_ID },
    update: {},
    create: {
      id: DEMO_ORGANIZATION_ID,
      name: "DVIA · Empresa de demostración",
      sector: "services",
      trialEndsAt: addCalendarMonth(new Date()),
    },
  });
  await db.user.upsert({
    where: { id: demoPlatformUser.id },
    update: {},
    create: {
      ...demoPlatformUser,
      organizationId: null,
      passwordHash,
    },
  });
  for (const user of demoUsers)
    await db.user.upsert({
      where: { id: user.id },
      update: {},
      create: { ...user, organizationId: DEMO_ORGANIZATION_ID, passwordHash },
    });
  await db.billingSettings.upsert({
    where: { organizationId: DEMO_ORGANIZATION_ID },
    update: {},
    create: {
      organizationId: DEMO_ORGANIZATION_ID,
      configuration: defaultBillingConfig,
    },
  });
  for (const [index, customer] of customers.entries())
    await seedCustomer(db, index, customer);
  await seedWhatsApp(db);
  return {
    organizationId: DEMO_ORGANIZATION_ID,
    accounts: [demoPlatformUser, ...demoUsers].map(({ email, role }) => ({
      email,
      role,
    })),
    password: DEMO_PASSWORD,
  };
}
async function seedCustomer(
  db: PrismaClient,
  index: number,
  customer: string[],
) {
  const id = `68000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`;
  const advisorId = demoUsers[index < 4 ? 1 : 2].id;
  await db.client.upsert({
    where: { id },
    update: {},
    create: {
      id,
      organizationId: DEMO_ORGANIZATION_ID,
      advisorId,
      name: customer[0],
      contactName: customer[1],
      city: customer[2],
      notes: `DATOS FICTICIOS. ${customer[3]}`,
      phone: "0000000000",
      email: `cliente${index + 1}@example.test`,
    },
  });
  const dueAt = new Date();
  dueAt.setHours(9 + index, 30, 0, 0);
  if (index > 2) dueAt.setDate(dueAt.getDate() + 1);
  const activityId = `68000000-0000-4000-8000-${String(200 + index).padStart(12, "0")}`;
  await db.activity.upsert({
    where: { id: activityId },
    update: {},
    create: {
      id: activityId,
      organizationId: DEMO_ORGANIZATION_ID,
      clientId: id,
      advisorId,
      type: index % 3 === 0 ? "call" : index % 3 === 1 ? "follow_up" : "visit",
      status: index === 0 ? "completed" : "scheduled",
      dueAt,
      notes: [
        "Confirmar interés y acordar próximo contacto",
        "Compartir información del programa",
        "Visita de presentación",
      ][index % 3],
      idempotencyKey: `seed:${id}`,
      ...(index === 0
        ? {
            completedAt: new Date(),
            outcome: "interested",
            durationSeconds: 180,
          }
        : {}),
    },
  });
  if (index !== 0)
    await db.emailJob.upsert({
      where: { activityId },
      update: {},
      create: {
        organizationId: DEMO_ORGANIZATION_ID,
        activityId,
        recipient: demoUsers[index < 4 ? 1 : 2].email,
        subject: `[PRUEBA] Contacto con ${customer[0]}`,
        body: `Actividad ficticia para practicar el seguimiento de ${customer[0]}. No enviar a destinatarios reales.`,
        availableAt: new Date(dueAt.getTime() - 900000),
      },
    });
}
async function seedWhatsApp(db: PrismaClient) {
  const numberId = "68000000-0000-4000-8000-000000000301";
  const advisorId = demoUsers[1].id;
  await db.whatsAppNumber.upsert({
    where: { id: numberId },
    update: {},
    create: {
      id: numberId,
      organizationId: DEMO_ORGANIZATION_ID,
      phoneNumberId: "680000000301",
      displayPhoneNumber: "+57 300 000 0301",
      label: "Línea comercial · demostración",
      accessTokenCipher: encryptSecret("demo-fake-token-not-a-real-credential"),
      advisorId,
    },
  });
  const linkedAt = new Date(Date.now() - 3_600_000);
  await db.whatsAppConversation.upsert({
    where: { id: "68000000-0000-4000-8000-000000000401" },
    update: {},
    create: {
      id: "68000000-0000-4000-8000-000000000401",
      organizationId: DEMO_ORGANIZATION_ID,
      whatsAppNumberId: numberId,
      contactPhone: "573001110001",
      contactName: "Laura Gómez",
      clientId: "68000000-0000-4000-8000-000000000100",
      lastMessageAt: new Date(linkedAt.getTime() + 900_000),
    },
  });
  await db.whatsAppMessage.upsert({
    where: { waMessageId: "demo-wamid-in-401" },
    update: {},
    create: {
      organizationId: DEMO_ORGANIZATION_ID,
      conversationId: "68000000-0000-4000-8000-000000000401",
      direction: "inbound",
      type: "text",
      body: "Hola, quiero saber si tienen disponibilidad esta semana",
      waMessageId: "demo-wamid-in-401",
      status: "received",
      createdAt: linkedAt,
    },
  });
  await db.whatsAppMessage.upsert({
    where: { waMessageId: "demo-wamid-out-401" },
    update: {},
    create: {
      organizationId: DEMO_ORGANIZATION_ID,
      conversationId: "68000000-0000-4000-8000-000000000401",
      direction: "outbound",
      type: "text",
      body: "¡Hola Laura! Claro, tenemos disponibilidad el jueves y viernes.",
      senderId: advisorId,
      waMessageId: "demo-wamid-out-401",
      status: "sent",
      createdAt: new Date(linkedAt.getTime() + 900_000),
    },
  });
  const leadAt = new Date(Date.now() - 1_200_000);
  await db.whatsAppConversation.upsert({
    where: { id: "68000000-0000-4000-8000-000000000402" },
    update: {},
    create: {
      id: "68000000-0000-4000-8000-000000000402",
      organizationId: DEMO_ORGANIZATION_ID,
      whatsAppNumberId: numberId,
      contactPhone: "573001110002",
      lastMessageAt: leadAt,
    },
  });
  await db.whatsAppMessage.upsert({
    where: { waMessageId: "demo-wamid-in-402" },
    update: {},
    create: {
      organizationId: DEMO_ORGANIZATION_ID,
      conversationId: "68000000-0000-4000-8000-000000000402",
      direction: "inbound",
      type: "text",
      body: "Buenas, vi su anuncio y quiero más información",
      waMessageId: "demo-wamid-in-402",
      status: "received",
      createdAt: leadAt,
    },
  });
}

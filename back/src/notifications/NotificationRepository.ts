import type { PrismaClient } from "@prisma/client";
export class NotificationRepository {
  constructor(private db: PrismaClient) {}
  pending(now: Date) {
    return this.db.emailJob.findMany({
      where: {
        sentAt: null,
        cancelledAt: null,
        availableAt: { lte: now },
        attempts: { lt: 5 },
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      take: 25,
      orderBy: { availableAt: "asc" },
    });
  }
  claim(id: string, now: Date) {
    return this.db.emailJob.updateMany({
      where: {
        id,
        sentAt: null,
        cancelledAt: null,
        OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      },
      data: {
        lockedUntil: new Date(now.getTime() + 300_000),
        attempts: { increment: 1 },
      },
    });
  }
  current(id: string) {
    return this.db.emailJob.findUniqueOrThrow({
      where: { id },
      include: { activity: true },
    });
  }
  cancel(id: string) {
    return this.db.emailJob.update({
      where: { id },
      data: { cancelledAt: new Date(), lockedUntil: null },
    });
  }
  sent(id: string) {
    return this.db.emailJob.update({
      where: { id },
      data: {
        sentAt: new Date(),
        lockedUntil: null,
        lastError: null,
        body: "[Contenido entregado; consulta el registro de actividad]",
      },
    });
  }
  failed(id: string, attempts: number) {
    return this.db.emailJob.update({
      where: { id },
      data: {
        lockedUntil: null,
        availableAt: new Date(
          Date.now() + Math.min(3600, 60 * 2 ** attempts) * 1000,
        ),
        lastError: "MAIL_DELIVERY_FAILED",
      },
    });
  }
}

import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  NotificationService,
  type MailTransport,
} from "./NotificationService.js";
import { NotificationRepository } from "./NotificationRepository.js";
const local = process.env.MAIL_TRANSPORT !== "ses";
if (local && process.env.NODE_ENV === "production")
  throw new Error("Production requires an email provider");
const transport: MailTransport = {
  async send(job) {
    if (local) {
      const directory = resolve("../.local/mail");
      await mkdir(directory, { recursive: true });
      await writeFile(
        resolve(directory, `${job.id}.txt`),
        `To: ${job.recipient}\nSubject: ${job.subject}\n\n${job.body}`,
        { flag: "w" },
      );
      return;
    }
    if (!process.env.MAIL_FROM) throw new Error("MAIL_FROM is required");
    await new SESv2Client({}).send(
      new SendEmailCommand({
        FromEmailAddress: process.env.MAIL_FROM,
        Destination: { ToAddresses: [job.recipient] },
        Content: {
          Simple: {
            Subject: { Data: job.subject },
            Body: { Text: { Data: job.body } },
          },
        },
      }),
    );
  },
};
const db = new PrismaClient();
try {
  console.log(
    await new NotificationService(
      new NotificationRepository(db),
      transport,
    ).run(),
  );
} finally {
  await db.$disconnect();
}

import { NotificationRepository } from "./NotificationRepository.js";
export type MailTransport = {
  send(input: {
    id: string;
    recipient: string;
    subject: string;
    body: string;
  }): Promise<void>;
};
export class NotificationService {
  constructor(
    private repository: NotificationRepository,
    private transport: MailTransport,
  ) {}
  async run(now = new Date()) {
    let delivered = 0;
    for (const pending of await this.repository.pending(now)) {
      if (!(await this.repository.claim(pending.id, now)).count) continue;
      const job = await this.repository.current(pending.id);
      if (
        job.cancelledAt ||
        (job.activity && job.activity.status !== "scheduled")
      ) {
        await this.repository.cancel(job.id);
        continue;
      }
      try {
        await this.transport.send(job);
        await this.repository.sent(job.id);
        delivered++;
      } catch {
        await this.repository.failed(job.id, job.attempts);
      }
    }
    return { delivered };
  }
}

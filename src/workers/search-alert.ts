/**
 * Search alerts worker. Triggered when a listing publishes (event:
 * listing_published → enqueue here). Matches against active saved
 * searches and sends alerts via the user's preferred channels.
 */

import { Worker as BullWorker } from "bullmq";
import { prisma } from "../db/client";
import { logger } from "../lib/logger";
import { redis, type SearchAlertJob } from "./queues";
import { matches } from "../services/saved-searches";
import { sendSms } from "../services/notifications";
import { send as sendEmail } from "../services/email";
import { sendPush } from "../lib/push";

const PHOTO_BASE = process.env.R2_PUBLIC_URL ?? "https://photos.nuru.com";

export function startSearchAlertWorker() {
  const worker = new BullWorker<SearchAlertJob>(
    "search-alerts",
    async (job) => {
      const { listingId } = job.data;
      const listing = await prisma.listing.findUnique({ where: { id: listingId } });
      if (!listing || listing.status !== "ACTIVE" || !listing.publishedAt) return;

      const candidates = await prisma.savedSearch.findMany({
        where: { isActive: true, lastSeenAt: { lt: listing.publishedAt } },
        take: 1000,
      });

      let matched = 0;
      for (const ss of candidates) {
        if (!matches(ss, {
          id: listing.id,
          title: listing.title,
          neighborhood: listing.neighborhood,
          bedrooms: listing.bedrooms,
          rentKesCents: listing.rentKesCents,
          features: listing.features,
          publishedAt: listing.publishedAt,
          primaryPhotoKey: listing.primaryPhotoKey,
        })) {
          // Bump lastSeenAt so we don't re-test it next time.
          await prisma.savedSearch.update({
            where: { id: ss.id },
            data: { lastSeenAt: listing.publishedAt },
          });
          continue;
        }

        await sendAlert(ss, listing).catch((e) =>
          logger.warn({ err: e, savedSearchId: ss.id, listingId }, "alert send failed"),
        );

        await prisma.savedSearch.update({
          where: { id: ss.id },
          data: { lastSeenAt: listing.publishedAt, lastMatchAt: new Date() },
        });
        matched++;
      }
      logger.info({ listingId, candidates: candidates.length, matched }, "search-alert");
    },
    { connection: redis, concurrency: 4 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "search-alert worker failed");
  });
  return worker;
}

async function sendAlert(
  ss: { id: string; userId: string; name: string; alertPush: boolean; alertSms: boolean; alertEmail: boolean },
  listing: { id: string; title: string; neighborhood: string; rentKesCents: number; primaryPhotoKey: string | null },
) {
  const user = await prisma.user.findUnique({ where: { id: ss.userId } });
  if (!user) return;

  const rentKes = Math.round(listing.rentKesCents / 100).toLocaleString("en-KE");
  const linkPath = `/listing/${listing.id}`;

  if (ss.alertSms) {
    await sendSms(
      user.phoneE164,
      `Nuru: New match for "${ss.name}" — ${listing.title} in ${listing.neighborhood}, KES ${rentKes}/mo. nuru.com${linkPath}`,
    ).catch(() => undefined);
  }

  if (ss.alertEmail && user.email) {
    const photo = listing.primaryPhotoKey ? `${PHOTO_BASE}/${listing.primaryPhotoKey}` : null;
    await sendEmail({
      to: user.email,
      subject: `New match: ${listing.title}`,
      text: `A listing just published that matches your saved search "${ss.name}":\n\n${listing.title}\n${listing.neighborhood} · KES ${rentKes}/mo\n\nView it: ${process.env.WEB_URL ?? "https://nuru.com"}${linkPath}`,
      html: `<p>A listing just published that matches your saved search <strong>${ss.name}</strong>:</p>
${photo ? `<p><img src="${photo}" alt="" style="max-width:100%;border-radius:8px"/></p>` : ""}
<h2 style="margin:12px 0 4px"><a href="${process.env.WEB_URL ?? "https://nuru.com"}${linkPath}">${escapeHtml(listing.title)}</a></h2>
<p style="color:#555">${escapeHtml(listing.neighborhood)} · KES ${rentKes}/mo</p>
<p><a href="${process.env.WEB_URL ?? "https://nuru.com"}${linkPath}" style="background:#f5840b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;display:inline-block">View listing</a></p>`,
      marketing: false,         // user opted in, but it's transactional alert
      tags: [{ name: "alert", value: "saved-search" }],
    }).catch(() => undefined);
  }

  if (ss.alertPush) {
    const subs = await prisma.pushSubscription.findMany({ where: { userId: ss.userId }, take: 5 });
    for (const sub of subs) {
      await sendPush({
        subscription: { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        payload: { title: `New match: ${listing.title}`, body: `${listing.neighborhood} · KES ${rentKes}/mo`, url: linkPath },
      }).catch(() => undefined);
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

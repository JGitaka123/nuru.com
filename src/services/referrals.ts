/**
 * Referral codes.
 *
 * Each agent/landlord gets a unique short code on first generate. Sharing
 * the code: invitee enters it on signup → discount/free month + reward
 * accrues to the owner.
 *
 * Reward is paid out after the invitee's first paid invoice — gates
 * abuse where someone signs up on trial and never converts.
 */

import { z } from "zod";
import { randomInt } from "node:crypto";
import { prisma } from "../db/client";
import { ConflictError, NotFoundError } from "../lib/errors";

export const RedeemSchema = z.object({
  code: z.string().min(3).max(20).regex(/^[A-Z0-9]+$/i),
});

function makeCode(): string {
  // 6 chars, no ambiguous letters.
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[randomInt(0, alphabet.length)];
  return s;
}

export async function getOrCreateForUser(userId: string) {
  const existing = await prisma.referralCode.findFirst({ where: { ownerId: userId } });
  if (existing) return existing;

  for (let i = 0; i < 5; i++) {
    const code = makeCode();
    try {
      return await prisma.referralCode.create({
        data: { code, ownerId: userId },
      });
    } catch {
      // collision — retry
    }
  }
  throw new ConflictError("Could not generate a unique code; try again");
}

export async function redeemForSignup(redeemerId: string, codeStr: string) {
  const code = codeStr.toUpperCase();
  const ref = await prisma.referralCode.findUnique({ where: { code } });
  if (!ref) throw new NotFoundError("Referral code");
  if (ref.expiresAt && ref.expiresAt < new Date()) {
    throw new ConflictError("Referral code has expired");
  }
  if (ref.maxRedemptions && ref.redemptions >= ref.maxRedemptions) {
    throw new ConflictError("Referral code is fully redeemed");
  }
  if (ref.ownerId === redeemerId) {
    throw new ConflictError("Cannot redeem your own code");
  }

  const existing = await prisma.referralRedemption.findUnique({ where: { redeemedById: redeemerId } });
  if (existing) throw new ConflictError("Already redeemed a referral code");

  return prisma.$transaction(async (tx) => {
    const redemption = await tx.referralRedemption.create({
      data: { codeId: ref.id, redeemedById: redeemerId },
    });
    await tx.referralCode.update({
      where: { id: ref.id },
      data: { redemptions: { increment: 1 } },
    });
    return redemption;
  });
}

/** Called after the redeemer's first paid invoice — credit the owner. */
export async function payoutRewardOnFirstPaidInvoice(redeemerId: string) {
  const redemption = await prisma.referralRedemption.findUnique({
    where: { redeemedById: redeemerId },
    include: { code: true },
  });
  if (!redemption || redemption.rewardPaidAt) return;

  // Record the payout. The actual credit (free month, KES) is granted by
  // ops as a manual extension or admin promo applied to the next invoice.
  await prisma.referralRedemption.update({
    where: { id: redemption.id },
    data: { rewardPaidAt: new Date() },
  });
}

export async function listMine(userId: string) {
  const code = await getOrCreateForUser(userId);
  const redemptions = await prisma.referralRedemption.findMany({
    where: { codeId: code.id },
    orderBy: { redeemedAt: "desc" },
    take: 100,
  });
  return { code, redemptions };
}

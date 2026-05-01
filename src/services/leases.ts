/**
 * Lease — created on application approval, kicks off the deposit flow.
 *
 * Lifecycle:
 *   PENDING_DEPOSIT → ACTIVE   (when STK callback lands; handled in escrow.ts)
 *   ACTIVE → ENDED              (lease end date passes, no renewal)
 *   ACTIVE → TERMINATED         (early termination — manual flag for now)
 *   ACTIVE → DISPUTED           (open dispute — escrow stays HELD)
 *
 * Signing: both parties (tenant + landlord) tick a checkbox in-app to sign.
 * For MVP we don't require a real e-signature provider; we record timestamps.
 * Future: upload signed PDF to R2 and store key in `documentR2Key`.
 */

import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { prisma } from "../db/client";
import { ForbiddenError, NotFoundError, ConflictError } from "../lib/errors";

export const SignSchema = z.object({
  asRole: z.enum(["TENANT", "LANDLORD"]),
});

export async function getLease(id: string, userId: string, role: UserRole) {
  const lease = await prisma.lease.findUnique({
    where: { id },
    include: {
      listing: true,
      tenant: { select: { id: true, name: true, phoneE164: true } },
      landlord: { select: { id: true, name: true, phoneE164: true } },
      escrow: true,
    },
  });
  if (!lease) throw new NotFoundError("Lease");
  if (
    lease.tenantId !== userId &&
    lease.landlordId !== userId &&
    role !== "ADMIN"
  ) {
    throw new ForbiddenError("Not a party to this lease");
  }
  return lease;
}

export async function listMyLeases(userId: string, role: UserRole) {
  const where = role === "ADMIN"
    ? {}
    : { OR: [{ tenantId: userId }, { landlordId: userId }] };
  return prisma.lease.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      listing: { select: { id: true, title: true, primaryPhotoKey: true, neighborhood: true } },
      escrow: true,
    },
    take: 100,
  });
}

export async function signLease(leaseId: string, userId: string, role: UserRole) {
  const lease = await prisma.lease.findUnique({ where: { id: leaseId } });
  if (!lease) throw new NotFoundError("Lease");

  let data: { signedTenantAt?: Date; signedLandlordAt?: Date } = {};
  if (lease.tenantId === userId) {
    if (lease.signedTenantAt) throw new ConflictError("Already signed by tenant");
    data.signedTenantAt = new Date();
  } else if (lease.landlordId === userId || role === "ADMIN") {
    if (lease.signedLandlordAt) throw new ConflictError("Already signed by landlord");
    data.signedLandlordAt = new Date();
  } else {
    throw new ForbiddenError("Not a party to this lease");
  }

  return prisma.lease.update({
    where: { id: leaseId },
    data,
  });
}

/** Mark a lease as DISPUTED — pauses any pending escrow release. */
export async function disputeLease(leaseId: string, userId: string, reason: string) {
  const lease = await prisma.lease.findUnique({
    where: { id: leaseId },
    include: { escrow: true },
  });
  if (!lease) throw new NotFoundError("Lease");
  if (lease.tenantId !== userId && lease.landlordId !== userId) {
    throw new ForbiddenError("Not a party to this lease");
  }
  if (lease.status !== "ACTIVE") throw new ConflictError(`Lease is ${lease.status}`);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.lease.update({
      where: { id: leaseId },
      data: { status: "DISPUTED" },
    });
    if (lease.escrow) {
      await tx.escrowEvent.create({
        data: {
          escrowId: lease.escrow.id,
          type: "lease_disputed",
          payload: { reason, byUserId: userId },
        },
      });
    }
    return updated;
  });
}

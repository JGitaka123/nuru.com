/**
 * User verification.
 *
 * Tenants: hash of national ID + (optional) selfie key.
 * Agents:  KRA PIN + agency name + ID hash. KRA PIN format is A123456789Z.
 *
 * We hash the national ID with bcrypt-like sha256+pepper and discard the raw.
 * The hash lets us detect duplicate identities without storing raw IDs.
 *
 * Approval flow: PENDING → human review (admin) → VERIFIED or REJECTED.
 * For now we auto-approve agents with valid-looking KRA PINs (admin can revoke).
 */

import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "../db/client";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { logger } from "../lib/logger";

const KRA_PIN_REGEX = /^[AP]\d{9}[A-Z]$/;
const NATIONAL_ID_REGEX = /^\d{6,10}$/;

export const TenantVerificationSchema = z.object({
  nationalId: z.string().regex(NATIONAL_ID_REGEX, "Kenyan ID is 6-10 digits"),
  fullName: z.string().min(3).max(100),
  selfieKey: z.string().optional(),
});

export const AgentVerificationSchema = z.object({
  nationalId: z.string().regex(NATIONAL_ID_REGEX),
  fullName: z.string().min(3).max(100),
  kraPin: z.string().regex(KRA_PIN_REGEX, "KRA PIN format: A123456789Z"),
  agencyName: z.string().min(2).max(120),
});

function pepper(): string {
  return process.env.JWT_SECRET ?? "dev-pepper-change-me-in-prod";
}

export function hashNationalId(id: string): string {
  return createHash("sha256").update(`${pepper()}:nid:${id}`).digest("hex");
}

export async function submitTenantVerification(
  userId: string,
  input: z.infer<typeof TenantVerificationSchema>,
) {
  const data = TenantVerificationSchema.parse(input);
  const idHash = hashNationalId(data.nationalId);

  // If another user already has this hash, that's suspicious — flag for review.
  const collision = await prisma.user.findFirst({
    where: { nationalIdHash: idHash, NOT: { id: userId } },
  });
  if (collision) {
    logger.warn({ userId, collisionUserId: collision.id }, "national id hash collision");
    throw new ConflictError("This ID is already linked to another account");
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.fullName,
      nationalIdHash: idHash,
      verificationStatus: "PENDING",
    },
  });
  return { id: updated.id, verificationStatus: updated.verificationStatus };
}

export async function submitAgentVerification(
  userId: string,
  input: z.infer<typeof AgentVerificationSchema>,
) {
  const data = AgentVerificationSchema.parse(input);
  const idHash = hashNationalId(data.nationalId);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError("User");
  if (user.role !== "AGENT" && user.role !== "LANDLORD") {
    throw new ValidationError("Only agents/landlords can submit agent verification");
  }

  // KRA PIN must be unique across users (one PIN, one account).
  const collision = await prisma.user.findFirst({
    where: { kraPin: data.kraPin, NOT: { id: userId } },
  });
  if (collision) throw new ConflictError("KRA PIN already linked to another account");

  await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.fullName,
      nationalIdHash: idHash,
      kraPin: data.kraPin,
      verificationStatus: "VERIFIED",
      verifiedAt: new Date(),
      agentProfile: {
        upsert: {
          create: { agencyName: data.agencyName },
          update: { agencyName: data.agencyName },
        },
      },
    },
  });
  return { verificationStatus: "VERIFIED" as const };
}

/** Admin-only: approve or reject a pending verification. */
export async function reviewVerification(userId: string, decision: "VERIFIED" | "REJECTED") {
  return prisma.user.update({
    where: { id: userId },
    data: {
      verificationStatus: decision,
      ...(decision === "VERIFIED" ? { verifiedAt: new Date() } : {}),
    },
  });
}

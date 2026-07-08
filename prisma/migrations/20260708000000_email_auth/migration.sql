-- AlterTable
ALTER TABLE "OtpAttempt" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'phone',
ADD COLUMN     "email" TEXT,
ALTER COLUMN "phoneE164" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "phoneE164" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "OtpAttempt_email_createdAt_idx" ON "OtpAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "OtpAttempt_channel_createdAt_idx" ON "OtpAttempt"("channel", "createdAt");


-- AlterTable
ALTER TABLE "public"."AIInteraction" ADD COLUMN     "challengeId" TEXT;

-- CreateTable
CREATE TABLE "public"."ValidationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "attemptId" TEXT,
    "promptHash" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "action" TEXT NOT NULL,
    "reasons" TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ValidationRule" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 50,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ValidationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GovernanceMetrics" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT,
    "date" DATE NOT NULL,
    "totalValidations" INTEGER NOT NULL DEFAULT 0,
    "blockedCount" INTEGER NOT NULL DEFAULT 0,
    "throttledCount" INTEGER NOT NULL DEFAULT 0,
    "allowedCount" INTEGER NOT NULL DEFAULT 0,
    "avgRiskScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgProcessingTime" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "topPatterns" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ValidationLog_userId_idx" ON "public"."ValidationLog"("userId");

-- CreateIndex
CREATE INDEX "ValidationLog_challengeId_idx" ON "public"."ValidationLog"("challengeId");

-- CreateIndex
CREATE INDEX "ValidationLog_attemptId_idx" ON "public"."ValidationLog"("attemptId");

-- CreateIndex
CREATE INDEX "ValidationLog_classification_idx" ON "public"."ValidationLog"("classification");

-- CreateIndex
CREATE INDEX "ValidationLog_createdAt_idx" ON "public"."ValidationLog"("createdAt");

-- CreateIndex
CREATE INDEX "ValidationLog_userId_challengeId_createdAt_idx" ON "public"."ValidationLog"("userId", "challengeId", "createdAt");

-- CreateIndex
CREATE INDEX "ValidationRule_challengeId_idx" ON "public"."ValidationRule"("challengeId");

-- CreateIndex
CREATE INDEX "ValidationRule_enabled_idx" ON "public"."ValidationRule"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ValidationRule_challengeId_ruleId_key" ON "public"."ValidationRule"("challengeId", "ruleId");

-- CreateIndex
CREATE INDEX "GovernanceMetrics_challengeId_idx" ON "public"."GovernanceMetrics"("challengeId");

-- CreateIndex
CREATE INDEX "GovernanceMetrics_date_idx" ON "public"."GovernanceMetrics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "GovernanceMetrics_challengeId_date_key" ON "public"."GovernanceMetrics"("challengeId", "date");

-- AddForeignKey
ALTER TABLE "public"."ValidationLog" ADD CONSTRAINT "ValidationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ValidationLog" ADD CONSTRAINT "ValidationLog_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "public"."Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ValidationLog" ADD CONSTRAINT "ValidationLog_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."ChallengeAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ValidationRule" ADD CONSTRAINT "ValidationRule_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "public"."Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GovernanceMetrics" ADD CONSTRAINT "GovernanceMetrics_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "public"."Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

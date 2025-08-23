-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('JUNIOR', 'PLENO', 'SENIOR', 'TECH_LEAD', 'ARCHITECT');

-- CreateEnum
CREATE TYPE "public"."Plan" AS ENUM ('FREE', 'TEAM', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "public"."Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD', 'EXPERT');

-- CreateEnum
CREATE TYPE "public"."Category" AS ENUM ('BACKEND', 'FRONTEND', 'FULLSTACK', 'DEVOPS', 'MOBILE', 'DATA');

-- CreateEnum
CREATE TYPE "public"."AttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "public"."Rarity" AS ENUM ('COMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "public"."XPSource" AS ENUM ('CHALLENGE', 'BADGE', 'STREAK', 'BONUS', 'ACHIEVEMENT');

-- CreateEnum
CREATE TYPE "public"."AIProvider" AS ENUM ('OPENAI', 'ANTHROPIC', 'GOOGLE', 'META');

-- CreateEnum
CREATE TYPE "public"."EventType" AS ENUM ('TYPED', 'PASTED', 'DELETED', 'FORMATTED', 'SAVED');

-- CreateEnum
CREATE TYPE "public"."CertLevel" AS ENUM ('FOUNDATION', 'PROFESSIONAL', 'EXPERT');

-- CreateEnum
CREATE TYPE "public"."BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "public"."UserRole" NOT NULL DEFAULT 'JUNIOR',
    "position" TEXT,
    "yearsOfExperience" INTEGER NOT NULL DEFAULT 0,
    "preferredLanguages" TEXT[],
    "githubUsername" TEXT,
    "companyId" TEXT,
    "teamId" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "termsAcceptedAt" TIMESTAMP(3),
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "logo" TEXT,
    "plan" "public"."Plan" NOT NULL DEFAULT 'FREE',
    "maxUsers" INTEGER NOT NULL DEFAULT 5,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Challenge" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "difficulty" "public"."Difficulty" NOT NULL,
    "category" "public"."Category" NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "languages" TEXT[],
    "instructions" TEXT NOT NULL,
    "starterCode" TEXT,
    "solution" TEXT NOT NULL,
    "testCases" JSONB NOT NULL,
    "hints" JSONB NOT NULL,
    "traps" JSONB NOT NULL,
    "baseXp" INTEGER NOT NULL DEFAULT 100,
    "bonusXp" INTEGER NOT NULL DEFAULT 50,
    "targetMetrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChallengeAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "status" "public"."AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalCode" TEXT,
    "codeSnapshots" JSONB NOT NULL,
    "language" TEXT NOT NULL,
    "testResults" JSONB NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "finalDI" DOUBLE PRECISION,
    "finalPR" DOUBLE PRECISION,
    "finalCS" DOUBLE PRECISION,

    CONSTRAINT "ChallengeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MetricSnapshot" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionTime" INTEGER NOT NULL,
    "dependencyIndex" DOUBLE PRECISION NOT NULL,
    "passRate" DOUBLE PRECISION NOT NULL,
    "checklistScore" DOUBLE PRECISION NOT NULL,
    "codeQuality" DOUBLE PRECISION,
    "debugTime" INTEGER,
    "aiUsageTime" INTEGER,
    "manualCodingTime" INTEGER,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserMetrics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "averageDI" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averagePR" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageCS" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "weeklyTrends" JSONB NOT NULL,
    "metricsByCategory" JSONB NOT NULL,
    "firstWeekDI" DOUBLE PRECISION,
    "currentWeekDI" DOUBLE PRECISION,
    "improvement" DOUBLE PRECISION,
    "strongAreas" TEXT[],
    "weakAreas" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Badge" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "rarity" "public"."Rarity" NOT NULL,
    "requirements" JSONB NOT NULL,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Badge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserBadge" (
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("userId","badgeId")
);

-- CreateTable
CREATE TABLE "public"."XPTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "source" "public"."XPSource" NOT NULL,
    "sourceId" TEXT,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XPTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AIInteraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attemptId" TEXT,
    "provider" "public"."AIProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "messages" JSONB NOT NULL,
    "promptComplexity" TEXT,
    "responseLength" INTEGER NOT NULL,
    "codeLinesGenerated" INTEGER NOT NULL DEFAULT 0,
    "wasCopied" BOOLEAN NOT NULL DEFAULT false,
    "copyTimestamp" TIMESTAMP(3),
    "pasteTimestamp" TIMESTAMP(3),
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CodeEvent" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."EventType" NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionTime" INTEGER NOT NULL,
    "linesAdded" INTEGER NOT NULL DEFAULT 0,
    "linesRemoved" INTEGER NOT NULL DEFAULT 0,
    "totalLines" INTEGER NOT NULL,
    "charactersChanged" INTEGER NOT NULL,
    "cursorPosition" JSONB,
    "fileName" TEXT,
    "wasFromAI" BOOLEAN NOT NULL DEFAULT false,
    "aiInteractionId" TEXT,

    CONSTRAINT "CodeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TrapDetection" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "trapId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reactionTime" INTEGER NOT NULL,
    "fellIntoTrap" BOOLEAN NOT NULL,
    "fixedAfterWarning" BOOLEAN NOT NULL DEFAULT false,
    "learnedFrom" BOOLEAN NOT NULL DEFAULT false,
    "explanationShown" BOOLEAN NOT NULL DEFAULT false,
    "explanationReadTime" INTEGER,
    "quizAnswered" BOOLEAN NOT NULL DEFAULT false,
    "quizScore" DOUBLE PRECISION,

    CONSTRAINT "TrapDetection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Certificate" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "level" "public"."CertLevel" NOT NULL,
    "theoryScore" DOUBLE PRECISION NOT NULL,
    "practicalScore" DOUBLE PRECISION NOT NULL,
    "portfolioScore" DOUBLE PRECISION NOT NULL,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "grade" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verificationHash" TEXT NOT NULL,
    "qrCode" TEXT,
    "skills" TEXT[],
    "challengesCompleted" INTEGER NOT NULL,
    "totalHours" DOUBLE PRECISION NOT NULL,
    "averageDI" DOUBLE PRECISION NOT NULL,
    "averagePR" DOUBLE PRECISION NOT NULL,
    "averageCS" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Team" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leaderId" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Billing" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "plan" "public"."Plan" NOT NULL,
    "seats" INTEGER NOT NULL,
    "usedSeats" INTEGER NOT NULL,
    "billingCycle" "public"."BillingCycle" NOT NULL,
    "nextBillingDate" TIMESTAMP(3) NOT NULL,
    "apiCalls" INTEGER NOT NULL DEFAULT 0,
    "storageUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "aiTokensUsed" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Billing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_companyId_idx" ON "public"."User"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_domain_key" ON "public"."Company"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Challenge_slug_key" ON "public"."Challenge"("slug");

-- CreateIndex
CREATE INDEX "Challenge_slug_idx" ON "public"."Challenge"("slug");

-- CreateIndex
CREATE INDEX "Challenge_difficulty_idx" ON "public"."Challenge"("difficulty");

-- CreateIndex
CREATE INDEX "Challenge_category_idx" ON "public"."Challenge"("category");

-- CreateIndex
CREATE INDEX "ChallengeAttempt_userId_idx" ON "public"."ChallengeAttempt"("userId");

-- CreateIndex
CREATE INDEX "ChallengeAttempt_challengeId_idx" ON "public"."ChallengeAttempt"("challengeId");

-- CreateIndex
CREATE INDEX "ChallengeAttempt_status_idx" ON "public"."ChallengeAttempt"("status");

-- CreateIndex
CREATE INDEX "MetricSnapshot_attemptId_idx" ON "public"."MetricSnapshot"("attemptId");

-- CreateIndex
CREATE INDEX "MetricSnapshot_userId_idx" ON "public"."MetricSnapshot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserMetrics_userId_key" ON "public"."UserMetrics"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Badge_key_key" ON "public"."Badge"("key");

-- CreateIndex
CREATE INDEX "XPTransaction_userId_idx" ON "public"."XPTransaction"("userId");

-- CreateIndex
CREATE INDEX "AIInteraction_userId_idx" ON "public"."AIInteraction"("userId");

-- CreateIndex
CREATE INDEX "AIInteraction_attemptId_idx" ON "public"."AIInteraction"("attemptId");

-- CreateIndex
CREATE INDEX "CodeEvent_attemptId_idx" ON "public"."CodeEvent"("attemptId");

-- CreateIndex
CREATE INDEX "CodeEvent_type_idx" ON "public"."CodeEvent"("type");

-- CreateIndex
CREATE INDEX "TrapDetection_attemptId_idx" ON "public"."TrapDetection"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_code_key" ON "public"."Certificate"("code");

-- CreateIndex
CREATE INDEX "Certificate_code_idx" ON "public"."Certificate"("code");

-- CreateIndex
CREATE INDEX "Certificate_userId_idx" ON "public"."Certificate"("userId");

-- CreateIndex
CREATE INDEX "Team_companyId_idx" ON "public"."Team"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Billing_companyId_key" ON "public"."Billing"("companyId");

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChallengeAttempt" ADD CONSTRAINT "ChallengeAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChallengeAttempt" ADD CONSTRAINT "ChallengeAttempt_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "public"."Challenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."ChallengeAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserMetrics" ADD CONSTRAINT "UserMetrics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "public"."Badge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."XPTransaction" ADD CONSTRAINT "XPTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AIInteraction" ADD CONSTRAINT "AIInteraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AIInteraction" ADD CONSTRAINT "AIInteraction_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."ChallengeAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CodeEvent" ADD CONSTRAINT "CodeEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."ChallengeAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CodeEvent" ADD CONSTRAINT "CodeEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TrapDetection" ADD CONSTRAINT "TrapDetection_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "public"."ChallengeAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Certificate" ADD CONSTRAINT "Certificate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Team" ADD CONSTRAINT "Team_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Billing" ADD CONSTRAINT "Billing_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "public"."Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

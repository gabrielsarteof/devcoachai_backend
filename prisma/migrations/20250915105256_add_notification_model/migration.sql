-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('achievement', 'reminder', 'milestone', 'level_up', 'badge_unlock', 'streak_risk');

-- CreateEnum
CREATE TYPE "public"."NotificationPriority" AS ENUM ('low', 'medium', 'high');

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "icon" TEXT NOT NULL,
    "priority" "public"."NotificationPriority" NOT NULL DEFAULT 'medium',
    "category" VARCHAR(50),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "public"."Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "public"."Notification"("type");

-- CreateIndex
CREATE INDEX "Notification_priority_idx" ON "public"."Notification"("priority");

-- CreateIndex
CREATE INDEX "Notification_readAt_idx" ON "public"."Notification"("readAt");

-- CreateIndex
CREATE INDEX "Notification_expiresAt_idx" ON "public"."Notification"("expiresAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "public"."Notification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ProgressStatus" AS ENUM ('COMPLETED', 'NOT_COMPLETED');

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "status" "ProgressStatus" NOT NULL DEFAULT 'NOT_COMPLETED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserAchievement_accountId_idx" ON "UserAchievement"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAchievement_accountId_achievementId_key" ON "UserAchievement"("accountId", "achievementId");

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GameAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

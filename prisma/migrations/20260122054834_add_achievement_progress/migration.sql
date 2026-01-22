-- CreateTable
CREATE TABLE "AchievementProgress" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AchievementProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AchievementProgress_accountId_idx" ON "AchievementProgress"("accountId");

-- CreateIndex
CREATE INDEX "AchievementProgress_achievementId_idx" ON "AchievementProgress"("achievementId");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementProgress_accountId_achievementId_key" ON "AchievementProgress"("accountId", "achievementId");

-- AddForeignKey
ALTER TABLE "AchievementProgress" ADD CONSTRAINT "AchievementProgress_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GameAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementProgress" ADD CONSTRAINT "AchievementProgress_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('ARTIFACT_ANALYSIS', 'ARTIFACT_BATCH_ANALYSIS', 'ARTIFACT_POTENTIAL', 'BUILD_RECOMMENDATION', 'BUILD_COMPARISON', 'BUILD_REASONING', 'STRATEGY_CHAT');

-- CreateTable
CREATE TABLE "AiResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "artifactId" TEXT,
    "characterId" TEXT,
    "conversationId" TEXT,
    "feature" "AiFeature" NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "model" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiFeedback" (
    "id" TEXT NOT NULL,
    "aiResultId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "helpful" BOOLEAN,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiResult_userId_idx" ON "AiResult"("userId");

-- CreateIndex
CREATE INDEX "AiResult_accountId_idx" ON "AiResult"("accountId");

-- CreateIndex
CREATE INDEX "AiResult_feature_idx" ON "AiResult"("feature");

-- CreateIndex
CREATE INDEX "AiResult_artifactId_idx" ON "AiResult"("artifactId");

-- CreateIndex
CREATE INDEX "AiResult_characterId_idx" ON "AiResult"("characterId");

-- CreateIndex
CREATE INDEX "AiResult_conversationId_idx" ON "AiResult"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "AiFeedback_aiResultId_key" ON "AiFeedback"("aiResultId");

-- CreateIndex
CREATE INDEX "AiFeedback_userId_idx" ON "AiFeedback"("userId");

-- CreateIndex
CREATE INDEX "AiUsage_date_idx" ON "AiUsage"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_userId_date_key" ON "AiUsage"("userId", "date");

-- AddForeignKey
ALTER TABLE "AiResult" ADD CONSTRAINT "AiResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiResult" ADD CONSTRAINT "AiResult_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GameAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_aiResultId_fkey" FOREIGN KEY ("aiResultId") REFERENCES "AiResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiFeedback" ADD CONSTRAINT "AiFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

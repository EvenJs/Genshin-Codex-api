-- CreateTable
CREATE TABLE "ArtifactBuild" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "characterId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "primarySetId" TEXT NOT NULL,
    "secondarySetId" TEXT,
    "useFullSet" BOOLEAN NOT NULL DEFAULT true,
    "recommendedMainStats" JSONB NOT NULL,
    "subStatPriority" JSONB NOT NULL,
    "statWeights" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtifactBuild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedBuild" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "buildId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedBuild_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArtifactBuild_characterId_idx" ON "ArtifactBuild"("characterId");

-- CreateIndex
CREATE INDEX "ArtifactBuild_creatorId_idx" ON "ArtifactBuild"("creatorId");

-- CreateIndex
CREATE INDEX "ArtifactBuild_isPublic_idx" ON "ArtifactBuild"("isPublic");

-- CreateIndex
CREATE INDEX "ArtifactBuild_primarySetId_idx" ON "ArtifactBuild"("primarySetId");

-- CreateIndex
CREATE INDEX "SavedBuild_userId_idx" ON "SavedBuild"("userId");

-- CreateIndex
CREATE INDEX "SavedBuild_buildId_idx" ON "SavedBuild"("buildId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedBuild_userId_buildId_key" ON "SavedBuild"("userId", "buildId");

-- AddForeignKey
ALTER TABLE "ArtifactBuild" ADD CONSTRAINT "ArtifactBuild_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactBuild" ADD CONSTRAINT "ArtifactBuild_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactBuild" ADD CONSTRAINT "ArtifactBuild_primarySetId_fkey" FOREIGN KEY ("primarySetId") REFERENCES "ArtifactSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactBuild" ADD CONSTRAINT "ArtifactBuild_secondarySetId_fkey" FOREIGN KEY ("secondarySetId") REFERENCES "ArtifactSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedBuild" ADD CONSTRAINT "SavedBuild_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedBuild" ADD CONSTRAINT "SavedBuild_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "ArtifactBuild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

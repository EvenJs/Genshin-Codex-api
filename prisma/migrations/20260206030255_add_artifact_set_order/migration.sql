-- AlterTable
ALTER TABLE "ArtifactSet" ADD COLUMN     "orderIndex" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ArtifactSet_orderIndex_idx" ON "ArtifactSet"("orderIndex");

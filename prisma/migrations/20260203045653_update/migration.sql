/*
  Warnings:

  - You are about to drop the column `category` on the `Achievement` table. All the data in the column will be lost.
  - You are about to drop the column `region` on the `Achievement` table. All the data in the column will be lost.
  - Added the required column `categoryId` to the `Achievement` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Achievement_category_idx";

-- DropIndex
DROP INDEX "Achievement_region_idx";

-- AlterTable
ALTER TABLE "Achievement" DROP COLUMN "category",
DROP COLUMN "region",
ADD COLUMN     "categoryId" TEXT NOT NULL,
ADD COLUMN     "source" TEXT;

-- CreateTable
CREATE TABLE "AchievementCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "link" TEXT,
    "icon" TEXT,
    "background" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AchievementCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AchievementCategory_name_key" ON "AchievementCategory"("name");

-- CreateIndex
CREATE INDEX "AchievementCategory_name_idx" ON "AchievementCategory"("name");

-- CreateIndex
CREATE INDEX "AchievementCategory_sortOrder_idx" ON "AchievementCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "Achievement_categoryId_idx" ON "Achievement"("categoryId");

-- AddForeignKey
ALTER TABLE "Achievement" ADD CONSTRAINT "Achievement_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AchievementCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

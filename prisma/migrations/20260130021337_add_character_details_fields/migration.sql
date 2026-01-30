-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "affiliation" TEXT,
ADD COLUMN     "constellations" JSONB,
ADD COLUMN     "role" TEXT,
ADD COLUMN     "talents" JSONB,
ADD COLUMN     "visionAffiliation" TEXT;

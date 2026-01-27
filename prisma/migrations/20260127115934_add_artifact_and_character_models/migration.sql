-- CreateEnum
CREATE TYPE "ArtifactSlot" AS ENUM ('FLOWER', 'PLUME', 'SANDS', 'GOBLET', 'CIRCLET');

-- CreateEnum
CREATE TYPE "Element" AS ENUM ('PYRO', 'HYDRO', 'ANEMO', 'ELECTRO', 'DENDRO', 'CRYO', 'GEO');

-- CreateEnum
CREATE TYPE "WeaponType" AS ENUM ('SWORD', 'CLAYMORE', 'POLEARM', 'BOW', 'CATALYST');

-- CreateTable
CREATE TABLE "ArtifactSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rarity" INTEGER[],
    "twoPieceBonus" TEXT NOT NULL,
    "fourPieceBonus" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtifactSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserArtifact" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "slot" "ArtifactSlot" NOT NULL,
    "mainStat" TEXT NOT NULL,
    "mainStatValue" DOUBLE PRECISION NOT NULL,
    "subStats" JSONB NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "rarity" INTEGER NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "equippedById" TEXT,

    CONSTRAINT "UserArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "element" "Element" NOT NULL,
    "weaponType" "WeaponType" NOT NULL,
    "rarity" INTEGER NOT NULL,
    "region" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountCharacter" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "constellation" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountCharacter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArtifactSet_name_idx" ON "ArtifactSet"("name");

-- CreateIndex
CREATE INDEX "UserArtifact_accountId_idx" ON "UserArtifact"("accountId");

-- CreateIndex
CREATE INDEX "UserArtifact_setId_idx" ON "UserArtifact"("setId");

-- CreateIndex
CREATE INDEX "UserArtifact_slot_idx" ON "UserArtifact"("slot");

-- CreateIndex
CREATE INDEX "UserArtifact_equippedById_idx" ON "UserArtifact"("equippedById");

-- CreateIndex
CREATE INDEX "Character_element_idx" ON "Character"("element");

-- CreateIndex
CREATE INDEX "Character_weaponType_idx" ON "Character"("weaponType");

-- CreateIndex
CREATE INDEX "Character_rarity_idx" ON "Character"("rarity");

-- CreateIndex
CREATE INDEX "AccountCharacter_accountId_idx" ON "AccountCharacter"("accountId");

-- CreateIndex
CREATE INDEX "AccountCharacter_characterId_idx" ON "AccountCharacter"("characterId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountCharacter_accountId_characterId_key" ON "AccountCharacter"("accountId", "characterId");

-- AddForeignKey
ALTER TABLE "UserArtifact" ADD CONSTRAINT "UserArtifact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GameAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserArtifact" ADD CONSTRAINT "UserArtifact_setId_fkey" FOREIGN KEY ("setId") REFERENCES "ArtifactSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserArtifact" ADD CONSTRAINT "UserArtifact_equippedById_fkey" FOREIGN KEY ("equippedById") REFERENCES "AccountCharacter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountCharacter" ADD CONSTRAINT "AccountCharacter_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "GameAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountCharacter" ADD CONSTRAINT "AccountCharacter_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

import { PrismaClient, Element, WeaponType, Prisma } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';

type CharacterSeed = {
  id: string;
  name: string;
  element: Element;
  weaponType?: WeaponType | null;
  rarity?: number | null;
  region?: string | null;
  affiliation?: string | null;
  visionAffiliation?: string | null;
  role?: string | null;
  talents?: Record<string, string> | null;
  constellations?: Record<string, string> | null;
  imageUrl?: string | null;
};

type AchievementCategorySeed = {
  name: string;
  title: string;
  sortOrder?: number;
  link?: string | null;
  icon?: string | null;
  background?: string | null;
};

type AchievementSeed = {
  id: string;
  name: string;
  description: string;
  category: string;
  version?: string | null;
  isHidden?: boolean;
  rewardPrimogems?: number;
  guide?: string | null;
  source?: string | null;
};

type ArtifactSetSeed = {
  id: string;
  name: string;
  rarity: number[];
  twoPieceBonus: string;
  fourPieceBonus?: string | null;
  imageUrl?: string | null;
  orderIndex?: number | null;
};

const prisma = new PrismaClient();

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

async function seedAchievementCategories() {
  const dataPath = path.resolve(__dirname, 'seed-data', 'achievementCategories.json');
  const categories = readJsonFile<AchievementCategorySeed[]>(dataPath);

  if (!Array.isArray(categories)) {
    throw new Error('Achievement categories seed data is not an array.');
  }

  for (const [index, c] of categories.entries()) {
    const sortOrder = c.sortOrder ?? index;
    await prisma.achievementCategory.upsert({
      where: { name: c.name },
      update: {
        title: c.title,
        sortOrder,
        link: c.link ?? null,
        icon: c.icon ?? null,
        background: c.background ?? null
      },
      create: {
        name: c.name,
        title: c.title,
        sortOrder,
        link: c.link ?? null,
        icon: c.icon ?? null,
        background: c.background ?? null
      }
    });
  }

  console.log(`Seeded achievement categories: ${categories.length}`);
}

async function seedAchievements() {
  const dataPath = path.resolve(__dirname, 'seed-data', 'achievements.json');
  const achievements = readJsonFile<AchievementSeed[]>(dataPath);

  if (!Array.isArray(achievements)) {
    throw new Error('Achievements seed data is not an array.');
  }

  // Get all categories for mapping
  const categories = await prisma.achievementCategory.findMany();
  const categoryMap = new Map(categories.map((c) => [c.name, c.id]));

  for (const a of achievements) {
    const categoryId = categoryMap.get(a.category);
    if (!categoryId) {
      console.warn(`Category not found for achievement ${a.id}: ${a.category}`);
      continue;
    }

    await prisma.achievement.upsert({
      where: { id: a.id },
      update: {
        name: a.name,
        description: a.description,
        categoryId,
        version: a.version ?? null,
        isHidden: a.isHidden ?? false,
        rewardPrimogems: a.rewardPrimogems ?? 0,
        guide: a.guide ?? null,
        source: a.source ?? null
      },
      create: {
        id: a.id,
        name: a.name,
        description: a.description,
        categoryId,
        version: a.version ?? null,
        isHidden: a.isHidden ?? false,
        rewardPrimogems: a.rewardPrimogems ?? 0,
        guide: a.guide ?? null,
        source: a.source ?? null
      }
    });
  }

  console.log(`Seeded achievements: ${achievements.length}`);
}

async function seedArtifactSets() {
  const dataPath = path.resolve(__dirname, 'seed-data', 'artifact-sets.json');
  const artifactSets = readJsonFile<ArtifactSetSeed[]>(dataPath);

  if (!Array.isArray(artifactSets)) {
    throw new Error('Artifact sets seed data is not an array.');
  }

  await prisma.$transaction(
    artifactSets.map((s, index) => {
      const orderIndex = s.orderIndex ?? index;
      return prisma.artifactSet.upsert({
        where: { id: s.id },
        update: {
          name: s.name,
          rarity: s.rarity,
          twoPieceBonus: s.twoPieceBonus,
          fourPieceBonus: s.fourPieceBonus ?? null,
          imageUrl: s.imageUrl ?? null,
          orderIndex
        },
        create: {
          id: s.id,
          name: s.name,
          rarity: s.rarity,
          twoPieceBonus: s.twoPieceBonus,
          fourPieceBonus: s.fourPieceBonus ?? null,
          imageUrl: s.imageUrl ?? null,
          orderIndex
        }
      })
    })
  );

  console.log(`Seeded artifact sets: ${artifactSets.length}`);
}

async function seedCharacters() {
  const dataPath = path.resolve(__dirname, 'seed-data', 'characters.json');
  const characters = readJsonFile<CharacterSeed[]>(dataPath);

  if (!Array.isArray(characters)) {
    throw new Error('Characters seed data is not an array.');
  }

  const validCharacters = characters.filter(
    (c) => c.id && c.name && c.element,
  );

  await prisma.$transaction(
    validCharacters.map((c) =>
      prisma.character.upsert({
        where: { id: c.id },
        update: {
          name: c.name,
          element: c.element,
          weaponType: c.weaponType,
          rarity: c.rarity,
          region: c.region ?? null,
          affiliation: c.affiliation ?? null,
          visionAffiliation: c.visionAffiliation ?? null,
          role: c.role ?? null,
          talents: c.talents ?? Prisma.JsonNull,
          constellations: c.constellations ?? Prisma.JsonNull,
          imageUrl: c.imageUrl ?? null
        },
        create: {
          id: c.id,
          name: c.name,
          element: c.element,
          weaponType: c.weaponType,
          rarity: c.rarity,
          region: c.region ?? null,
          affiliation: c.affiliation ?? null,
          visionAffiliation: c.visionAffiliation ?? null,
          role: c.role ?? null,
          talents: c.talents ?? Prisma.JsonNull,
          constellations: c.constellations ?? Prisma.JsonNull,
          imageUrl: c.imageUrl ?? null
        }
      })
    )
  );

  if (validCharacters.length !== characters.length) {
    console.warn(
      `Skipped characters with missing fields: ${characters.length - validCharacters.length}`,
    );
  }
  console.log(`Seeded characters: ${validCharacters.length}`);
}

async function main() {
  await seedAchievementCategories();
  await seedAchievements();
  await seedArtifactSets();
  await seedCharacters();
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

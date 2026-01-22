import { PrismaClient } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';

type AchievementSeed = {
  id: string;
  name: string;
  description: string;
  category: string;
  region: string;
  version?: string | null;
  isHidden?: boolean;
  rewardPrimogems?: number;
  guide?: string | null;
};

const prisma = new PrismaClient();

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

async function main() {
  const dataPath = path.resolve(__dirname, 'seed-data', 'achievements.json');
  const achievements = readJsonFile<AchievementSeed[]>(dataPath);

  if (!Array.isArray(achievements)) {
    throw new Error('Seed data is not an array.');
  }

  await prisma.$transaction(
    achievements.map((a) =>
      prisma.achievement.upsert({
        where: { id: a.id },
        update: {
          name: a.name,
          description: a.description,
          category: a.category,
          region: a.region,
          version: a.version ?? null,
          isHidden: a.isHidden ?? false,
          rewardPrimogems: a.rewardPrimogems ?? 0,
          guide: a.guide ?? null
        },
        create: {
          id: a.id,
          name: a.name,
          description: a.description,
          category: a.category,
          region: a.region,
          version: a.version ?? null,
          isHidden: a.isHidden ?? false,
          rewardPrimogems: a.rewardPrimogems ?? 0,
          guide: a.guide ?? null
        }
      })
    )
  );

  console.log(`Seeded achievements: ${achievements.length}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

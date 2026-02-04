import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Element, WeaponType } from '@prisma/client';

interface KnowledgeContextResult {
  context: string | null;
  hasResults: boolean;
}

@Injectable()
export class KnowledgeService {
  private readonly maxResults = 4;

  constructor(private readonly prisma: PrismaService) {}

  async getKnowledgeContext(query: string): Promise<KnowledgeContextResult> {
    const keywords = this.extractKeywords(query);

    if (keywords.length === 0) {
      return { context: null, hasResults: false };
    }

    const [characters, artifactSets] = await Promise.all([
      this.findCharacters(keywords),
      this.findArtifactSets(keywords),
    ]);

    const context = this.buildContext(characters, artifactSets);

    return {
      context,
      hasResults: Boolean(context),
    };
  }

  private async findCharacters(keywords: string[]) {
    const elementFilters = this.extractElementFilters(keywords);
    const weaponFilters = this.extractWeaponFilters(keywords);

    return this.prisma.character.findMany({
      where: {
        OR: [
          ...keywords.map((keyword) => ({
            name: { contains: keyword, mode: 'insensitive' as const },
          })),
          ...(elementFilters.length
            ? elementFilters.map((element) => ({ element }))
            : []),
          ...(weaponFilters.length
            ? weaponFilters.map((weaponType) => ({ weaponType }))
            : []),
        ],
      },
      select: {
        name: true,
        element: true,
        weaponType: true,
        rarity: true,
        role: true,
        region: true,
      },
      take: this.maxResults,
    });
  }

  private async findArtifactSets(keywords: string[]) {
    return this.prisma.artifactSet.findMany({
      where: {
        OR: keywords.map((keyword) => ({
          name: { contains: keyword, mode: 'insensitive' as const },
        })),
      },
      select: {
        name: true,
        twoPieceBonus: true,
        fourPieceBonus: true,
      },
      take: this.maxResults,
    });
  }

  private buildContext(
    characters: {
      name: string;
      element: Element;
      weaponType: WeaponType | null;
      rarity: number | null;
      role: string | null;
      region: string | null;
    }[],
    artifactSets: {
      name: string;
      twoPieceBonus: string;
      fourPieceBonus: string | null;
    }[],
  ): string | null {
    const sections: string[] = [];

    if (characters.length > 0) {
      const characterLines = characters.map((character) => {
        const details = [
          character.element,
          character.weaponType ?? 'Unknown weapon',
          character.rarity ? `${character.rarity}★` : null,
          character.role ? `Role: ${character.role}` : null,
          character.region ? `Region: ${character.region}` : null,
        ]
          .filter(Boolean)
          .join(' | ');

        return `- ${character.name} (${details})`;
      });

      sections.push(`Characters:\n${characterLines.join('\n')}`);
    }

    if (artifactSets.length > 0) {
      const setLines = artifactSets.map((set) => {
        const fourPiece = set.fourPieceBonus
          ? `4pc: ${set.fourPieceBonus}`
          : '4pc: N/A';
        return `- ${set.name}\n  2pc: ${set.twoPieceBonus}\n  ${fourPiece}`;
      });

      sections.push(`Artifact Sets:\n${setLines.join('\n')}`);
    }

    if (sections.length === 0) {
      return null;
    }

    return sections.join('\n\n');
  }

  private extractKeywords(query: string): string[] {
    const cleaned = query
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, ' ');

    const tokens = cleaned
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);

    return Array.from(new Set(tokens)).slice(0, 6);
  }

  private extractElementFilters(keywords: string[]): Element[] {
    const map: Record<string, Element> = {
      pyro: 'PYRO',
      hydro: 'HYDRO',
      anemo: 'ANEMO',
      electro: 'ELECTRO',
      dendro: 'DENDRO',
      cryo: 'CRYO',
      geo: 'GEO',
    };

    const results = keywords
      .map((keyword) => map[keyword])
      .filter((value): value is Element => Boolean(value));

    return Array.from(new Set(results));
  }

  private extractWeaponFilters(keywords: string[]): WeaponType[] {
    const map: Record<string, WeaponType> = {
      sword: 'SWORD',
      claymore: 'CLAYMORE',
      polearm: 'POLEARM',
      bow: 'BOW',
      catalyst: 'CATALYST',
    };

    const results = keywords
      .map((keyword) => map[keyword])
      .filter((value): value is WeaponType => Boolean(value));

    return Array.from(new Set(results));
  }
}

import { IsOptional, IsString, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Request DTO for single artifact analysis
 */
export class AnalyzeArtifactDto {
  @ApiPropertyOptional({ description: 'Target character ID for context-aware analysis' })
  @IsOptional()
  @IsString()
  characterId?: string;

  @ApiPropertyOptional({ description: 'Skip cache and force fresh analysis' })
  @IsOptional()
  @IsBoolean()
  skipCache?: boolean;
}

/**
 * Request DTO for batch artifact analysis
 */
export class BatchAnalyzeDto {
  @ApiProperty({ description: 'Array of artifact IDs to analyze', type: [String] })
  @IsArray()
  @IsString({ each: true })
  artifactIds: string[];

  @ApiPropertyOptional({ description: 'Target character ID for context-aware analysis' })
  @IsOptional()
  @IsString()
  characterId?: string;
}

/**
 * Main stat analysis result
 */
export class MainStatAnalysisResult {
  @ApiProperty({ enum: ['optimal', 'good', 'acceptable', 'poor'] })
  rating: 'optimal' | 'good' | 'acceptable' | 'poor';

  @ApiProperty()
  comment: string;
}

/**
 * Sub-stat analysis result
 */
export class SubStatAnalysisResult {
  @ApiProperty({ description: 'Crit Value (CritRate*2 + CritDmg)' })
  critValue: number;

  @ApiProperty({ enum: ['high', 'medium', 'low'] })
  rollQuality: 'high' | 'medium' | 'low';

  @ApiProperty({ description: 'Estimated effective sub-stat rolls' })
  effectiveRolls: number;

  @ApiProperty({ type: [String], description: 'Stats that rolled well' })
  highlights: string[];

  @ApiProperty({ type: [String], description: 'Wasted or low-value stats' })
  weakPoints: string[];
}

/**
 * Potential evaluation result
 */
export class PotentialResult {
  @ApiProperty({ enum: ['endgame', 'transitional', 'fodder'] })
  currentTier: 'endgame' | 'transitional' | 'fodder';

  @ApiProperty({ enum: ['high', 'medium', 'low', 'skip'] })
  upgradePriority: 'high' | 'medium' | 'low' | 'skip';

  @ApiPropertyOptional({ description: 'Expected score when upgraded to +20' })
  expectedScoreAt20?: number;

  @ApiProperty()
  reasoning: string;
}

/**
 * Single artifact analysis result
 */
export class ArtifactAnalysisResult {
  @ApiProperty({ description: 'Artifact ID' })
  artifactId: string;

  @ApiProperty({ description: 'Overall score 0-100' })
  overallScore: number;

  @ApiProperty({ enum: ['S', 'A', 'B', 'C', 'D'] })
  grade: 'S' | 'A' | 'B' | 'C' | 'D';

  @ApiProperty({ type: MainStatAnalysisResult })
  mainStatAnalysis: MainStatAnalysisResult;

  @ApiProperty({ type: SubStatAnalysisResult })
  subStatAnalysis: SubStatAnalysisResult;

  @ApiProperty({ type: PotentialResult })
  potential: PotentialResult;

  @ApiProperty({ type: [String], description: 'Characters this artifact suits' })
  suitableCharacters: string[];

  @ApiProperty({ type: [String], description: 'Actionable recommendations' })
  recommendations: string[];

  @ApiProperty({ description: 'Analysis timestamp' })
  analyzedAt: string;
}

/**
 * Batch analysis summary item
 */
export class BatchArtifactSummary {
  @ApiProperty()
  artifactId: string;

  @ApiProperty()
  index: number;

  @ApiProperty({ description: 'Score 0-100' })
  score: number;

  @ApiProperty({ enum: ['S', 'A', 'B', 'C', 'D'] })
  grade: 'S' | 'A' | 'B' | 'C' | 'D';

  @ApiProperty({ enum: ['endgame', 'transitional', 'fodder'] })
  tier: 'endgame' | 'transitional' | 'fodder';

  @ApiProperty()
  keyStrength: string;

  @ApiProperty()
  keyWeakness: string;
}

/**
 * Set analysis in batch result
 */
export class SetAnalysisResult {
  @ApiProperty({ type: [String] })
  completeSets: string[];

  @ApiProperty()
  recommendation: string;
}

/**
 * Batch analysis result
 */
export class BatchAnalysisResult {
  @ApiProperty({ type: [BatchArtifactSummary] })
  artifacts: BatchArtifactSummary[];

  @ApiProperty({ type: [String], description: 'Artifact IDs sorted by score' })
  ranking: string[];

  @ApiProperty({ type: SetAnalysisResult })
  setAnalysis: SetAnalysisResult;

  @ApiProperty()
  overallSuggestion: string;

  @ApiProperty()
  analyzedAt: string;
}

/**
 * Upgrade scenario analysis
 */
export class UpgradeScenario {
  @ApiProperty()
  score: number;

  @ApiProperty()
  description: string;
}

/**
 * Risk assessment for upgrade
 */
export class RiskAssessment {
  @ApiProperty({ enum: ['low', 'medium', 'high'] })
  level: 'low' | 'medium' | 'high';

  @ApiProperty()
  goodRollProbability: string;

  @ApiProperty({ type: [String] })
  factors: string[];
}

/**
 * Upgrade recommendation
 */
export class UpgradeRecommendation {
  @ApiProperty()
  shouldUpgrade: boolean;

  @ApiProperty({ enum: ['high', 'medium', 'low', 'skip'] })
  priority: 'high' | 'medium' | 'low' | 'skip';

  @ApiProperty()
  reasoning: string;

  @ApiProperty({ description: 'Level at which to stop if rolls go poorly' })
  breakpoint: string;
}

/**
 * Potential evaluation result
 */
export class PotentialEvaluationResult {
  @ApiProperty()
  artifactId: string;

  @ApiProperty()
  currentState: {
    score: number;
    critValue: number;
    subStatCount: number;
  };

  @ApiProperty()
  upgradeScenarios: {
    bestCase: UpgradeScenario;
    worstCase: UpgradeScenario;
    averageCase: UpgradeScenario;
  };

  @ApiProperty({ type: UpgradeRecommendation })
  recommendation: UpgradeRecommendation;

  @ApiProperty({ type: RiskAssessment })
  riskAssessment: RiskAssessment;

  @ApiProperty()
  analyzedAt: string;
}

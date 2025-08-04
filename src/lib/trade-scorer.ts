/**
 * Trade Scoring Algorithm
 * Copy this into: src/lib/trade-scorer.ts
 */

interface FactorConfig {
  type: 'quantitative' | 'qualitative' | 'options';
  weight: number;
  enabled: boolean;
  targetConfig: any;
}

interface ScoreResults {
  finalScore: number;
  grade: string;
  compliance: string;
  factorScores: Record<string, number>;
  factorDetails: Record<string, any>;
  summary: {
    totalFactors: number;
    scoredFactors: number;
    missingFactors: number;
    targetsMet: number;
    totalWeightedScore: number;
    totalAvailableWeight: number;
    weightCoverage: number;
  };
}

export class TradeScorer {
  private ipsConfig: any;
  private enabledFactors: Record<string, FactorConfig>;
  private totalWeight: number;

  constructor(ipsConfig: any) {
    this.ipsConfig = ipsConfig;
    this.enabledFactors = Object.entries(ipsConfig.factors || {})
      .filter(([_, config]: [string, any]) => config.enabled)
      .reduce((acc, [name, config]) => {
        acc[name] = config as FactorConfig;
        return acc;
      }, {} as Record<string, FactorConfig>);
    
    this.totalWeight = Object.values(this.enabledFactors)
      .reduce((sum, config) => sum + config.weight, 0);
  }

  scoreTrace(tradeData: Record<string, any>): ScoreResults {
    const factorScores: Record<string, number> = {};
    const factorDetails: Record<string, any> = {};
    let totalWeightedScore = 0;
    let totalAvailableWeight = 0;

    // Score each enabled factor
    for (const [factorName, config] of Object.entries(this.enabledFactors)) {
      const factorValue = tradeData[factorName];
      
      if (factorValue !== undefined && factorValue !== null && factorValue !== '') {
        const score = this.scoreIndividualFactor(factorName, factorValue, config);
        const weightedScore = score * config.weight;
        
        factorScores[factorName] = score;
        factorDetails[factorName] = {
          score,
          weight: config.weight,
          weightedScore,
          value: factorValue,
          target: this.getTargetDescription(config),
          met: score >= 70,
          type: config.type
        };
        
        totalWeightedScore += weightedScore;
        totalAvailableWeight += config.weight;
      } else {
        factorDetails[factorName] = {
          score: null,
          weight: config.weight,
          weightedScore: 0,
          value: null,
          target: this.getTargetDescription(config),
          met: false,
          missing: true,
          type: config.type
        };
      }
    }

    const finalScore = totalAvailableWeight > 0 
      ? (totalWeightedScore / totalAvailableWeight) 
      : 0;

    return {
      finalScore: Math.round(finalScore * 100) / 100,
      grade: this.getGrade(finalScore),
      compliance: this.getCompliance(finalScore),
      factorScores,
      factorDetails,
      summary: {
        totalFactors: Object.keys(this.enabledFactors).length,
        scoredFactors: Object.values(factorDetails).filter(d => !d.missing).length,
        missingFactors: Object.values(factorDetails).filter(d => d.missing).length,
        targetsMet: Object.values(factorDetails).filter(d => d.met).length,
        totalWeightedScore,
        totalAvailableWeight,
        weightCoverage: totalAvailableWeight / this.totalWeight
      }
    };
  }

  private scoreIndividualFactor(factorName: string, value: any, config: FactorConfig): number {
    const numValue = parseFloat(value);
    
    if (config.type === 'qualitative') {
      return this.scoreQualitativeFactor(numValue, config);
    } else {
      return this.scoreQuantitativeFactor(numValue, config);
    }
  }

  private scoreQualitativeFactor(value: number, config: FactorConfig): number {
    const targetValue = config.targetConfig.targetValue || config.targetConfig.min_rating || 4;
    
    if (value >= targetValue) {
      const range = 5 - targetValue;
      const progress = Math.min(value - targetValue, range);
      return range > 0 ? 70 + (progress / range) * 30 : 85;
    } else {
      return (value / targetValue) * 70;
    }
  }

  private scoreQuantitativeFactor(value: number, config: FactorConfig): number {
    const targetConfig = config.targetConfig;
    const targetValue = parseFloat(targetConfig.value || targetConfig.targetValue || 0);
    const targetValueMax = targetConfig.max_value || targetConfig.targetValueMax 
      ? parseFloat(targetConfig.max_value || targetConfig.targetValueMax) 
      : null;
    const operator = targetConfig.operator || targetConfig.targetOperator || 'gte';
    
    switch (operator) {
      case 'gte':
        return this.scoreGreaterThanEqual(value, targetValue);
      case 'lte':
        return this.scoreLessThanEqual(value, targetValue);
      case 'eq':
        return this.scoreEquals(value, targetValue);
      case 'range':
        return this.scoreRange(value, targetValue, targetValueMax || targetValue);
      default:
        return 0;
    }
  }

  private scoreGreaterThanEqual(value: number, target: number): number {
    if (value >= target) {
      const excessRatio = (value - target) / Math.max(target, 1);
      return Math.min(100, 70 + excessRatio * 30);
    } else {
      return (value / target) * 70;
    }
  }

  private scoreLessThanEqual(value: number, target: number): number {
    if (value <= target) {
      const savings = (target - value) / Math.max(target, 1);
      return Math.min(100, 70 + savings * 30);
    } else {
      const excess = (value - target) / Math.max(target, 1);
      return Math.max(0, 70 - excess * 70);
    }
  }

  private scoreEquals(value: number, target: number): number {
    const percentDiff = Math.abs(value - target) / Math.max(target, 1);
    if (percentDiff <= 0.05) return 100;
    if (percentDiff <= 0.1) return 90;
    if (percentDiff <= 0.2) return 75;
    if (percentDiff <= 0.5) return 50;
    return Math.max(0, 50 - percentDiff * 50);
  }

  private scoreRange(value: number, min: number, max: number): number {
    if (value >= min && value <= max) {
      const rangeSize = max - min;
      if (rangeSize === 0) return 100;
      const position = (value - min) / rangeSize;
      const distanceFromCenter = Math.abs(position - 0.5);
      return 70 + (1 - distanceFromCenter * 2) * 30;
    } else if (value < min) {
      const distance = (min - value) / Math.max(min, 1);
      return Math.max(0, 70 - distance * 70);
    } else {
      const distance = (value - max) / Math.max(max, 1);
      return Math.max(0, 70 - distance * 70);
    }
  }

  private getTargetDescription(config: FactorConfig): string {
    if (config.type === 'qualitative') {
      const targetValue = config.targetConfig.targetValue || config.targetConfig.min_rating || 4;
      const ratings = { 1: 'Poor', 2: 'Below Average', 3: 'Average', 4: 'Good', 5: 'Excellent' };
      return `Minimum ${ratings[targetValue as keyof typeof ratings]} (${targetValue}/5)`;
    }
    
    const targetConfig = config.targetConfig;
    const operator = targetConfig.operator || targetConfig.targetOperator || 'gte';
    const value = targetConfig.value || targetConfig.targetValue;
    const maxValue = targetConfig.max_value || targetConfig.targetValueMax;
    
    switch (operator) {
      case 'gte':
        return `≥ ${value}`;
      case 'lte':
        return `≤ ${value}`;
      case 'eq':
        return `= ${value}`;
      case 'range':
        return `${value} - ${maxValue}`;
      default:
        return String(value);
    }
  }

  private getGrade(score: number): string {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private getCompliance(score: number): string {
    if (score >= 85) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 65) return 'Acceptable';
    if (score >= 50) return 'Below Target';
    return 'Poor';
  }
}
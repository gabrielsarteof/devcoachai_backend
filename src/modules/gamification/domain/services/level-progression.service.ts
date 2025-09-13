import { logger } from '@/shared/infrastructure/monitoring/logger';
import { LevelThreshold } from '../types/gamification.types';

export class LevelProgressionService {
  private readonly levels: LevelThreshold[] = [
    { level: 1, requiredXP: 0, title: 'Iniciante', perks: ['Desafios básicos'] },
    { level: 2, requiredXP: 100, title: 'Aprendiz', perks: ['Hints grátis'] },
    { level: 3, requiredXP: 300, title: 'Praticante', perks: ['Desafios médios'] },
    { level: 4, requiredXP: 600, title: 'Competente', perks: ['Análise de código'] },
    { level: 5, requiredXP: 1000, title: 'Proficiente', perks: ['Desafios difíceis', 'Badge exclusivo'] },
    { level: 6, requiredXP: 1500, title: 'Avançado', perks: ['Freeze de streak'] },
    { level: 7, requiredXP: 2500, title: 'Especialista', perks: ['Desafios expert'] },
    { level: 8, requiredXP: 4000, title: 'Mestre', perks: ['Certificação bronze'] },
    { level: 9, requiredXP: 6000, title: 'Grão-Mestre', perks: ['Certificação prata'] },
    { level: 10, requiredXP: 10000, title: 'Lenda', perks: ['Certificação ouro', 'Título especial'] },
  ];

  calculateLevel(totalXP: number): {
    currentLevel: LevelThreshold;
    nextLevel: LevelThreshold | null;
    progress: number;
    xpToNext: number;
  } {
    let currentLevel = this.levels[0];
    let nextLevel: LevelThreshold | null = null;

    for (let i = this.levels.length - 1; i >= 0; i--) {
      if (totalXP >= this.levels[i].requiredXP) {
        currentLevel = this.levels[i];
        nextLevel = this.levels[i + 1] || null;
        break;
      }
    }

    const progress = nextLevel 
      ? ((totalXP - currentLevel.requiredXP) / (nextLevel.requiredXP - currentLevel.requiredXP)) * 100
      : 100;

    const xpToNext = nextLevel 
      ? nextLevel.requiredXP - totalXP
      : 0;

    logger.debug({
      operation: 'level_calculated',
      totalXP,
      currentLevel: currentLevel.level,
      progress,
      xpToNext,
    }, 'Level progression calculated');

    return {
      currentLevel,
      nextLevel,
      progress: Math.round(progress * 100) / 100,
      xpToNext,
    };
  }

  checkLevelUp(oldXP: number, newXP: number): {
    leveledUp: boolean;
    oldLevel: number;
    newLevel: number;
    unlockedPerks: string[];
  } {
    const oldLevelData = this.calculateLevel(oldXP);
    const newLevelData = this.calculateLevel(newXP);
    
    const leveledUp = newLevelData.currentLevel.level > oldLevelData.currentLevel.level;
    
    const result = {
      leveledUp,
      oldLevel: oldLevelData.currentLevel.level,
      newLevel: newLevelData.currentLevel.level,
      unlockedPerks: leveledUp ? newLevelData.currentLevel.perks : [],
    };

    if (leveledUp) {
      logger.info({
        operation: 'level_up_detected',
        oldLevel: result.oldLevel,
        newLevel: result.newLevel,
        unlockedPerks: result.unlockedPerks,
        levelUpEvent: true,
      }, 'LEVEL UP EVENT DETECTED');
    }

    return result;
  }
}
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { LevelNotFoundError } from '../errors';

export interface LevelProps {
  level: number;
  title: string;
  minXP: number;
  perks: string[];
}

export class LevelEntity {
  private constructor(private readonly props: LevelProps) {}

  static create(data: LevelProps): LevelEntity {
    logger.info({
      operation: 'level_entity_creation',
      level: data.level,
      title: data.title,
      minXP: data.minXP,
      perksCount: data.perks.length
    }, 'Creating level entity');

    return new LevelEntity(data);
  }

  static fromNumber(level: number): LevelEntity {
    const levels = this.getAllLevels();
    const levelData = levels.find(l => l.level === level);
    
    if (!levelData) {
      throw new LevelNotFoundError(`Level ${level} not found`);
    }

    return new LevelEntity(levelData);
  }

  static getAllLevels(): LevelProps[] {
    return [
      { level: 1, title: 'Iniciante', minXP: 0, perks: ['Desafios básicos'] },
      { level: 2, title: 'Aprendiz', minXP: 100, perks: ['Hints grátis'] },
      { level: 3, title: 'Praticante', minXP: 300, perks: ['Desafios médios'] },
      { level: 4, title: 'Competente', minXP: 600, perks: ['Análise de código'] },
      { level: 5, title: 'Proficiente', minXP: 1000, perks: ['Desafios difíceis', 'Badge exclusivo'] },
      { level: 6, title: 'Especialista', minXP: 1500, perks: ['Freeze de streak'] },
      { level: 7, title: 'Mestre', minXP: 2500, perks: ['Desafios expert'] },
      { level: 8, title: 'Arquiteto', minXP: 4000, perks: ['Certificação'] }
    ];
  }

  getLevel(): number {
    return this.props.level;
  }

  getTitle(): string {
    return this.props.title;
  }

  getMinXP(): number {
    return this.props.minXP;
  }

  getPerks(): string[] {
    return this.props.perks;
  }

  toJSON() {
    return { ...this.props };
  }
}
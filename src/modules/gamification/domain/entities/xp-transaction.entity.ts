import { logger } from '@/shared/infrastructure/monitoring/logger';
import { XPSource } from '@/shared/domain/enums';

export interface XPTransactionProps {
  id: string;
  userId: string;
  amount: number;
  source: XPSource;
  sourceId?: string;
  reason: string;
  multipliers: {
    difficulty: number;
    performance: number;
    streak: number;
    independence: number;
  };
  metadata?: Record<string, any>;
  createdAt: Date;
}

export class XPTransactionEntity {
  private constructor(private readonly props: XPTransactionProps) {}

  static create(data: {
    userId: string;
    baseAmount: number;
    source: XPSource;
    sourceId?: string;
    reason: string;
    multipliers: XPTransactionProps['multipliers'];
    metadata?: Record<string, any>;
  }): XPTransactionEntity {
    const finalAmount = Math.round(
      data.baseAmount * 
      data.multipliers.difficulty * 
      data.multipliers.performance * 
      data.multipliers.streak * 
      data.multipliers.independence
    );

    const props: XPTransactionProps = {
      id: crypto.randomUUID(),
      userId: data.userId,
      amount: finalAmount,
      source: data.source,
      sourceId: data.sourceId,
      reason: data.reason,
      multipliers: data.multipliers,
      metadata: data.metadata,
      createdAt: new Date(),
    };

    logger.info({
      operation: 'xp_transaction_created',
      userId: data.userId,
      baseAmount: data.baseAmount,
      finalAmount,
      source: data.source,
      multipliers: data.multipliers,
    }, 'XP transaction created');

    return new XPTransactionEntity(props);
  }

  getAmount(): number {
    return this.props.amount;
  }

  toJSON() {
    return {
      ...this.props,
      breakdown: {
        base: Math.round(this.props.amount / 
          (this.props.multipliers.difficulty * 
           this.props.multipliers.performance * 
           this.props.multipliers.streak * 
           this.props.multipliers.independence)),
        multipliers: this.props.multipliers,
        final: this.props.amount,
      }
    };
  }
}
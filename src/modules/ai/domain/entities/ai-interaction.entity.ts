import { AIInteraction as PrismaAIInteraction, AIProvider } from '@prisma/client';

export class AIInteractionEntity {
  private constructor(private readonly props: PrismaAIInteraction) {}

  static create(data: {
    userId: string;
    attemptId?: string;
    provider: string; 
    model: string;
    messages: any;
    promptComplexity?: string;
    responseLength: number;
    codeLinesGenerated: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  }): AIInteractionEntity {
    let providerEnum: AIProvider;
    
    switch (data.provider.toLowerCase()) {
      case 'openai':
        providerEnum = AIProvider.OPENAI;
        break;
      case 'anthropic':
        providerEnum = AIProvider.ANTHROPIC;
        break;
      case 'google':
        providerEnum = AIProvider.GOOGLE;
        break;
      case 'meta':
        providerEnum = AIProvider.META;
        break;
      default:
        throw new Error(`Invalid provider: ${data.provider}`);
    }

    const props: PrismaAIInteraction = {
      id: crypto.randomUUID(),
      userId: data.userId,
      attemptId: data.attemptId || null,
      provider: providerEnum,
      model: data.model,
      messages: data.messages,
      promptComplexity: data.promptComplexity || null,
      responseLength: data.responseLength,
      codeLinesGenerated: data.codeLinesGenerated,
      wasCopied: false,
      copyTimestamp: null,
      pasteTimestamp: null,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      estimatedCost: data.estimatedCost,
      createdAt: new Date(),
    };

    return new AIInteractionEntity(props);
  }

  static fromPrisma(interaction: PrismaAIInteraction): AIInteractionEntity {
    return new AIInteractionEntity(interaction);
  }

  markAsCopied(): void {
    this.props.wasCopied = true;
    this.props.copyTimestamp = new Date();
  }

  markAsPasted(): void {
    this.props.pasteTimestamp = new Date();
  }

  calculateDependencyContribution(): number {
    if (!this.props.wasCopied) return 0;
    return this.props.codeLinesGenerated;
  }

  getTimeToAction(): number | null {
    if (!this.props.copyTimestamp) return null;
    const copyTime = new Date(this.props.copyTimestamp).getTime();
    const createTime = this.props.createdAt.getTime();
    return copyTime - createTime;
  }

  toPrisma(): PrismaAIInteraction {
    return this.props;
  }

  toJSON() {
    const providerString = this.props.provider.toLowerCase();
    
    return {
      id: this.props.id,
      provider: providerString,
      model: this.props.model,
      responseLength: this.props.responseLength,
      codeLinesGenerated: this.props.codeLinesGenerated,
      wasCopied: this.props.wasCopied,
      inputTokens: this.props.inputTokens,
      outputTokens: this.props.outputTokens,
      estimatedCost: this.props.estimatedCost,
      createdAt: this.props.createdAt,
    };
  }
}
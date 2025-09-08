import { AIInteraction as PrismaAIInteraction, AIProvider } from '@prisma/client';
import { logger } from '@/shared/infrastructure/monitoring/logger';

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
    const startTime = Date.now();
    
    logger.info({
      operation: 'ai_interaction_entity_creation',
      userId: data.userId,
      attemptId: data.attemptId,
      provider: data.provider,
      model: data.model,
      messagesCount: Array.isArray(data.messages) ? data.messages.length : 0,
      promptComplexity: data.promptComplexity,
      responseLength: data.responseLength,
      codeLinesGenerated: data.codeLinesGenerated,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: data.inputTokens + data.outputTokens,
      estimatedCost: data.estimatedCost
    }, 'Creating AI interaction entity');

    try {
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
          logger.error({
            operation: 'ai_interaction_invalid_provider',
            userId: data.userId,
            provider: data.provider,
            supportedProviders: ['openai', 'anthropic', 'google', 'meta']
          }, 'Invalid AI provider specified');
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

      const processingTime = Date.now() - startTime;
      
      logger.info({
        operation: 'ai_interaction_entity_creation_success',
        interactionId: props.id,
        userId: data.userId,
        attemptId: data.attemptId,
        provider: data.provider,
        model: data.model,
        totalTokens: data.inputTokens + data.outputTokens,
        estimatedCost: data.estimatedCost,
        codeLinesGenerated: data.codeLinesGenerated,
        processingTime
      }, 'AI interaction entity created successfully');

      // Log high token usage or cost
      if (data.inputTokens + data.outputTokens > 5000) {
        logger.warn({
          interactionId: props.id,
          userId: data.userId,
          provider: data.provider,
          model: data.model,
          totalTokens: data.inputTokens + data.outputTokens,
          highTokenUsage: true
        }, 'High token usage in AI interaction');
      }

      if (data.estimatedCost > 0.10) {
        logger.warn({
          interactionId: props.id,
          userId: data.userId,
          provider: data.provider,
          model: data.model,
          estimatedCost: data.estimatedCost,
          highCost: true
        }, 'High cost AI interaction detected');
      }

      return new AIInteractionEntity(props);
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        operation: 'ai_interaction_entity_creation_failed',
        userId: data.userId,
        provider: data.provider,
        model: data.model,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTime
      }, 'Failed to create AI interaction entity');
      
      throw error;
    }
  }

  static fromPrisma(interaction: PrismaAIInteraction): AIInteractionEntity {
    logger.debug({
      operation: 'ai_interaction_entity_from_prisma',
      interactionId: interaction.id,
      userId: interaction.userId,
      attemptId: interaction.attemptId,
      provider: interaction.provider,
      model: interaction.model,
      responseLength: interaction.responseLength,
      codeLinesGenerated: interaction.codeLinesGenerated,
      wasCopied: interaction.wasCopied,
      inputTokens: interaction.inputTokens,
      outputTokens: interaction.outputTokens,
      estimatedCost: interaction.estimatedCost,
      createdAt: interaction.createdAt
    }, 'Creating AI interaction entity from Prisma model');

    const entity = new AIInteractionEntity(interaction);
    
    logger.debug({
      interactionId: interaction.id,
      hasTimestamps: {
        created: !!interaction.createdAt,
        copied: !!interaction.copyTimestamp,
        pasted: !!interaction.pasteTimestamp
      }
    }, 'AI interaction entity created from Prisma successfully');
    
    return entity;
  }

  markAsCopied(): void {
    logger.info({
      operation: 'mark_ai_interaction_copied',
      interactionId: this.props.id,
      userId: this.props.userId,
      attemptId: this.props.attemptId,
      provider: this.props.provider,
      model: this.props.model,
      codeLinesGenerated: this.props.codeLinesGenerated,
      previouslyCopied: this.props.wasCopied
    }, 'Marking AI interaction as copied');

    this.props.wasCopied = true;
    this.props.copyTimestamp = new Date();

    logger.info({
      interactionId: this.props.id,
      userId: this.props.userId,
      copyTimestamp: this.props.copyTimestamp,
      codeLinesGenerated: this.props.codeLinesGenerated,
      aiCodeCopied: true
    }, 'AI interaction marked as copied');
  }

  markAsPasted(): void {
    logger.info({
      operation: 'mark_ai_interaction_pasted',
      interactionId: this.props.id,
      userId: this.props.userId,
      attemptId: this.props.attemptId,
      wasCopied: this.props.wasCopied,
      copyTimestamp: this.props.copyTimestamp
    }, 'Marking AI interaction as pasted');

    this.props.pasteTimestamp = new Date();

    const timeToAction = this.getTimeToAction();
    
    logger.info({
      interactionId: this.props.id,
      userId: this.props.userId,
      pasteTimestamp: this.props.pasteTimestamp,
      timeToAction,
      aiCodePasted: true
    }, 'AI interaction marked as pasted');

    if (timeToAction && timeToAction < 5000) { // Less than 5 seconds
      logger.warn({
        interactionId: this.props.id,
        userId: this.props.userId,
        timeToAction,
        quickPaste: true
      }, 'Very quick copy-paste of AI code detected');
    }
  }

  calculateDependencyContribution(): number {
    const contribution = this.props.wasCopied ? this.props.codeLinesGenerated : 0;
    
    logger.debug({
      operation: 'calculate_dependency_contribution',
      interactionId: this.props.id,
      wasCopied: this.props.wasCopied,
      codeLinesGenerated: this.props.codeLinesGenerated,
      contribution
    }, 'Calculating dependency contribution');

    return contribution;
  }

  getTimeToAction(): number | null {
    if (!this.props.copyTimestamp) {
      logger.debug({
        operation: 'get_time_to_action',
        interactionId: this.props.id,
        hasCopyTimestamp: false
      }, 'No copy timestamp available for time to action calculation');
      return null;
    }

    const copyTime = new Date(this.props.copyTimestamp).getTime();
    const createTime = this.props.createdAt.getTime();
    const timeToAction = copyTime - createTime;
    
    logger.debug({
      operation: 'time_to_action_calculated',
      interactionId: this.props.id,
      createdAt: this.props.createdAt,
      copyTimestamp: this.props.copyTimestamp,
      timeToActionMs: timeToAction,
      timeToActionSeconds: Math.round(timeToAction / 1000)
    }, 'Time to action calculated');

    return timeToAction;
  }

  toPrisma(): PrismaAIInteraction {
    logger.debug({
      operation: 'ai_interaction_to_prisma',
      interactionId: this.props.id,
      provider: this.props.provider,
      model: this.props.model,
      wasCopied: this.props.wasCopied
    }, 'Converting AI interaction entity to Prisma model');

    return this.props;
  }

  toJSON() {
    const providerString = this.props.provider.toLowerCase();
    
    logger.debug({
      operation: 'ai_interaction_to_json',
      interactionId: this.props.id,
      provider: providerString,
      model: this.props.model,
      wasCopied: this.props.wasCopied,
      hasTimestamps: {
        created: !!this.props.createdAt,
        copied: !!this.props.copyTimestamp,
        pasted: !!this.props.pasteTimestamp
      }
    }, 'Converting AI interaction entity to JSON');
    
    const jsonData = {
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

    logger.debug({
      interactionId: this.props.id,
      jsonDataKeys: Object.keys(jsonData),
      excludesSensitiveData: true
    }, 'AI interaction JSON data prepared');

    return jsonData;
  }
}
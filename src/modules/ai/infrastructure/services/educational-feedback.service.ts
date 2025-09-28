import { Redis } from 'ioredis';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { IEducationalFeedbackService } from '../../domain/services/educational-feedback.service.interface';
import {
  EducationalFeedback,
  FeedbackLevel
} from '../../domain/types/educational-feedback.types';
import {
  PromptValidationResult,
  ChallengeContext
} from '../../domain/types/governance.types';

export class EducationalFeedbackService implements IEducationalFeedbackService {
  private readonly serviceLogger = logger.child({ service: 'EducationalFeedback' });
  private readonly CACHE_TTL = 600; 

  private readonly feedbackTemplates = {
    BLOCKED: {
      beginner: {
        tone: 'encouraging' as const,
        templates: [
          'Entendo sua tentativa, mas isso parece uma solicitação direta de solução.',
          'Vamos abordar isso de forma diferente para maximizar seu aprendizado.',
          'Percebi que você está tentando obter a resposta completa. Que tal focarmos em entender o conceito?'
        ]
      },
      intermediate: {
        tone: 'neutral' as const,
        templates: [
          'Sua pergunta foi bloqueada pois solicita a solução direta.',
          'Este tipo de pergunta não contribui para seu aprendizado efetivo.',
          'Tente reformular focando em conceitos específicos que não entende.'
        ]
      },
      advanced: {
        tone: 'strict' as const,
        templates: [
          'Solicitação de solução direta detectada e bloqueada.',
          'Como desenvolvedor experiente, você deveria focar em questões conceituais.',
          'Este comportamento não é compatível com seu nível de experiência.'
        ]
      }
    },
    WARNING: {
      beginner: {
        tone: 'encouraging' as const,
        templates: [
          'Sua pergunta está no caminho certo, mas pode ser melhorada.',
          'Quase lá! Tente ser mais específico sobre o que não entende.',
          'Boa tentativa! Vamos refinar um pouco sua abordagem.'
        ]
      },
      intermediate: {
        tone: 'neutral' as const,
        templates: [
          'Pergunta parcialmente adequada. Considere focar em aspectos específicos.',
          'Você pode melhorar esta questão sendo mais preciso.',
          'Tente abordar um conceito por vez para melhor compreensão.'
        ]
      },
      advanced: {
        tone: 'neutral' as const,
        templates: [
          'Sua questão poderia ser mais técnica e específica.',
          'Considere aprofundar em aspectos arquiteturais ou de design.',
          'Para seu nível, esperamos questões mais complexas e específicas.'
        ]
      }
    },
    SAFE: {
      beginner: {
        tone: 'encouraging' as const,
        templates: [
          'Excelente pergunta! É assim que se aprende.',
          'Muito bem! Esta é uma abordagem correta para aprender.',
          'Ótimo! Continue fazendo perguntas assim.'
        ]
      },
      intermediate: {
        tone: 'encouraging' as const,
        templates: [
          'Boa pergunta! Mostra compreensão do problema.',
          'Pergunta bem formulada e relevante.',
          'Esta é exatamente o tipo de questão que esperamos.'
        ]
      },
      advanced: {
        tone: 'neutral' as const,
        templates: [
          'Questão técnica apropriada.',
          'Abordagem correta para o problema.',
          'Pergunta adequada ao seu nível de experiência.'
        ]
      }
    }
  };

  constructor(private readonly redis: Redis) { }

  async generateFeedback(params: {
    validation: PromptValidationResult;
    userLevel: number;
    userId: string;
    context?: ChallengeContext;
  }): Promise<EducationalFeedback> {
    const { validation, userLevel, context } = params;
    const startTime = Date.now();
    const feedbackId = crypto.randomUUID();
    const level = this.determineUserLevel(userLevel);

    const cacheKey = `feedback:user:${params.userId}:${context?.challengeId}:${validation.riskScore}`;
    const cachedFeedback = await this.redis.get(cacheKey);

    if (cachedFeedback) {
      this.serviceLogger.info({ feedbackId, status: 'cached' }, 'Returning cached educational feedback');
      return JSON.parse(cachedFeedback);
    }

    this.serviceLogger.info({
      feedbackId,
      classification: validation.classification,
      riskScore: validation.riskScore,
      userLevel,
      level,
      hasContext: !!context
    }, 'Generating educational feedback');

    try {
      const template = this.feedbackTemplates[validation.classification][level];
      const baseMessage = template.templates[Math.floor(Math.random() * template.templates.length)];

      // Adapta a mensagem baseada no tipo de violação detectada
      let contextMessage = baseMessage;

      // Tratamento específico para prompt injection
      if (context?.category === 'prompt_injection' ||
          (validation.reasons.some(r => r.includes('engenharia social')) &&
           validation.classification === 'BLOCKED')) {
        contextMessage = 'Esta solicitação foi bloqueada devido a prompt injection detectado. ' + baseMessage;
      }

      const feedback: EducationalFeedback = {
        feedbackId,
        userId: params.userId,
        level,
        context: {
          whatHappened: contextMessage,
          whyBlocked: validation.classification === 'BLOCKED'
            ? this.explainBlockReason(validation.reasons)
            : undefined,
          riskScore: validation.riskScore,
          classification: validation.classification
        },
        guidance: {
          immediateFix: this.generateImmediateFixes(validation),
          betterApproaches: this.generateBetterApproaches(context),
          conceptsToReview: this.identifyConceptsToReview(validation, context),
          commonMistakes: this.getCommonMistakes(validation.classification, level)
        },
        learningPath: {
          currentStage: this.identifyCurrentStage(validation, userLevel),
          nextSteps: this.generateNextSteps(validation),
          estimatedProgress: this.calculateProgress(validation, userLevel),
          suggestedResources: this.getSuggestedResources(validation, context)
        },
        tone: template.tone,
        language: 'pt'
      };

      await this.redis.set(cacheKey, JSON.stringify(feedback), 'EX', this.CACHE_TTL);

      const processingTime = Date.now() - startTime;
      this.serviceLogger.info({
        feedbackId,
        level,
        tone: template.tone,
        processingTime
      }, 'Educational feedback generated and cached');

      return feedback;
    } catch (error) {
      this.serviceLogger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        feedbackId,
        validation,
        userLevel
      }, 'Failed to generate educational feedback');
      throw error;
    }
  }

  private determineUserLevel(userLevel: number): FeedbackLevel {
    if (userLevel <= 3) return 'beginner';
    if (userLevel <= 7) return 'intermediate';
    return 'advanced';
  }

  private explainBlockReason(reasons: string[]): string {
    const explanations: Record<string, string> = {
      'Solicitação direta de solução detectada':
        'Você pediu a solução completa ao invés de tentar entender o problema.',
      'Tentativa de engenharia social detectada':
        'Detectamos uma tentativa de manipular o sistema para obter respostas.',
      'Conteúdo fora do tópico detectado':
        'Sua pergunta não está relacionada ao desafio atual.',
      'Padrões proibidos detectados':
        'Sua pergunta contém padrões que indicam tentativa de obter código pronto.',
      'solution_seeking':
        'Sua pergunta solicita diretamente a solução do problema.'
    };

    // Identificação de tentativas de prompt injection
    const hasPromptInjection = reasons.some(r =>
      r.includes('engenharia social') || r.includes('prompt injection') || r === 'solution_seeking'
    );

    if (hasPromptInjection) {
      return 'Esta solicitação foi bloqueada devido a prompt injection detectado. ' +
        reasons.map(r => explanations[r] || r).join(' ');
    }

    return reasons
      .map(r => explanations[r] || r)
      .join(' ');
  }

  private generateImmediateFixes(
    validation: PromptValidationResult
  ): string[] {
    const fixes: string[] = [];

    if (validation.classification === 'BLOCKED') {
      if (validation.reasons.some(r => r.includes('solução'))) {
        fixes.push('Reformule perguntando sobre conceitos específicos');
        fixes.push('Divida o problema em partes menores');
        fixes.push('Pergunte sobre o "porquê" ao invés do "como fazer"');
      }
      if (validation.reasons.some(r => r.includes('engenharia social'))) {
        fixes.push('Use o sistema de forma honesta e direta');
        fixes.push('Foque em aprender, não em obter respostas prontas');
      }
    } else if (validation.classification === 'WARNING') {
      fixes.push('Seja mais específico sobre sua dúvida');
      fixes.push('Mostre o que já tentou resolver');
      fixes.push('Foque em um aspecto por vez');
    }

    return fixes;
  }

  private generateBetterApproaches(
    context?: ChallengeContext
  ): string[] {
    const approaches: string[] = [];

    if (context) {
      approaches.push(`Pergunte sobre conceitos de ${context.category.toLowerCase()}`);
      approaches.push(`Explore os tópicos: ${context.allowedTopics.slice(0, 3).join(', ')}`);
    }

    approaches.push('Compartilhe seu raciocínio e peça validação');
    approaches.push('Pergunte sobre casos extremos e tratamento de erros');
    approaches.push('Solicite explicações sobre padrões e boas práticas');

    return approaches;
  }

  private identifyConceptsToReview(
    validation: PromptValidationResult,
    context?: ChallengeContext
  ): string[] {
    const concepts: string[] = [];

    if (context) {
      if (context.techStack) {
        concepts.push(...context.techStack.map(tech => `Fundamentos de ${tech}`));
      }

      if (context.learningObjectives) {
        concepts.push(...context.learningObjectives.slice(0, 2));
      }
    }

    if (validation.riskScore > 70) {
      concepts.push('Metodologia de resolução de problemas');
      concepts.push('Pensamento algorítmico');
    }

    return concepts.slice(0, 5);
  }

  private getCommonMistakes(
    classification: 'SAFE' | 'WARNING' | 'BLOCKED',
    level: FeedbackLevel
  ): string[] {
    const mistakes: Record<string, string[]> = {
      BLOCKED: [
        'Pedir código completo ao invés de entender conceitos',
        'Tentar múltiplas variações da mesma pergunta bloqueada',
        'Usar termos vagos como "tudo", "completo", "inteiro"',
        'Não mostrar tentativa própria de resolução'
      ],
      WARNING: [
        'Perguntas muito amplas ou genéricas',
        'Não especificar o contexto do problema',
        'Misturar múltiplas dúvidas em uma pergunta',
        'Não indicar o que já foi tentado'
      ],
      SAFE: []
    };

    return mistakes[classification].slice(0, level === 'beginner' ? 3 : 2);
  }

  private identifyCurrentStage(
    validation: PromptValidationResult,
    userLevel: number
  ): string {
    if (validation.classification === 'BLOCKED') {
      return 'Aprendendo a formular perguntas educacionais';
    }
    if (validation.classification === 'WARNING') {
      return 'Refinando abordagem de questionamento';
    }
    if (userLevel <= 3) {
      return 'Construindo fundamentos';
    }
    if (userLevel <= 7) {
      return 'Desenvolvendo autonomia';
    }
    return 'Aperfeiçoando expertise';
  }

  private generateNextSteps(
    validation: PromptValidationResult,

  ): string[] {
    const steps: string[] = [];

    if (validation.classification === 'BLOCKED') {
      steps.push('Aprenda a decompor problemas complexos');
      steps.push('Pratique fazer perguntas conceituais');
      steps.push('Desenvolva pensamento analítico');
    } else if (validation.classification === 'WARNING') {
      steps.push('Refine sua capacidade de questionar');
      steps.push('Aprenda a identificar a raiz dos problemas');
    } else {
      steps.push('Continue explorando casos extremos');
      steps.push('Aprofunde em otimizações');
      steps.push('Explore padrões arquiteturais');
    }

    return steps.slice(0, 3);
  }

  private calculateProgress(
    validation: PromptValidationResult,
    userLevel: number
  ): number {
    let progress = userLevel * 10;

    if (validation.classification === 'SAFE') {
      progress += 10;
    } else if (validation.classification === 'WARNING') {
      progress += 5;
    }

    return Math.min(progress, 100);
  }

  private getSuggestedResources(
    validation: PromptValidationResult,
    context?: ChallengeContext
  ): Array<{ type: 'article' | 'video' | 'exercise' | 'documentation'; title: string; url?: string; relevance: number }> {
    const resources: Array<{ type: 'article' | 'video' | 'exercise' | 'documentation'; title: string; url?: string; relevance: number }> = [];

    if (validation.classification === 'BLOCKED') {
      resources.push({
        type: 'article',
        title: 'Como fazer perguntas técnicas efetivas',
        relevance: 100
      });
      resources.push({
        type: 'video',
        title: 'Desenvolvendo pensamento analítico',
        relevance: 90
      });
    }

    if (context?.techStack) {
      context.techStack.forEach(tech => {
        resources.push({
          type: 'documentation',
          title: `Documentação oficial: ${tech}`,
          relevance: 80
        });
      });
    }

    resources.push({
      type: 'exercise',
      title: 'Exercícios de decomposição de problemas',
      relevance: 70
    });

    return resources.slice(0, 4);
  }

  async getProgressInsights(
    userId: string,
    challengeId: string
  ): Promise<{ strengths: string[]; improvements: string[]; nextMilestone: string; estimatedTime: number }> {
    const logs = await this.redis.get(`progress:${userId}:${challengeId}`);

    if (!logs) {
      return {
        strengths: ['Iniciando jornada de aprendizado'],
        improvements: ['Continue praticando'],
        nextMilestone: 'Completar primeiro desafio',
        estimatedTime: 30
      };
    }

    const parsed = JSON.parse(logs);

    return {
      strengths: parsed.strengths || ['Boa formulação de perguntas', 'Pensamento estruturado'],
      improvements: parsed.improvements || ['Seja mais específico', 'Divida problemas complexos'],
      nextMilestone: parsed.nextMilestone || 'Dominar conceitos intermediários',
      estimatedTime: parsed.estimatedTime || 45
    };
  }
}
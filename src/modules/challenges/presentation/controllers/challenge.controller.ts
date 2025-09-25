import type { FastifyRequest, FastifyReply } from 'fastify';
import { CreateChallengeUseCase } from '../../application/use-cases/create-challenge.use-case';
import { GetChallengeUseCase } from '../../application/use-cases/get-challenge.use-case';
import { ListChallengesUseCase } from '../../application/use-cases/list-challenges.use-case';
import { UpdateChallengeUseCase } from '../../application/use-cases/update-challenge.use-case';
import { DeleteChallengeUseCase } from '../../application/use-cases/delete-challenge.use-case';
import { StartChallengeUseCase } from '../../application/use-cases/start-challenge.use-case';
import { SubmitSolutionUseCase } from '../../application/use-cases/submit-solution.use-case';
import { AnalyzeCodeUseCase } from '../../application/use-cases/analyze-code.use-case';
import { CreateChallengeDTO } from '../../domain/schemas/challenge.schema';
import { SubmitSolutionDTO } from '../../application/use-cases/submit-solution.use-case';
import { AnalyzeCodeDTO } from '../../application/use-cases/analyze-code.use-case';
import { ChallengeFilters } from '../../domain/repositories/challenge.repository.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export class ChallengeController {
  constructor(
    private readonly createChallengeUseCase: CreateChallengeUseCase,
    private readonly getChallengeUseCase: GetChallengeUseCase,
    private readonly listChallengesUseCase: ListChallengesUseCase,
    private readonly updateChallengeUseCase: UpdateChallengeUseCase,
    private readonly deleteChallengeUseCase: DeleteChallengeUseCase,
    private readonly startChallengeUseCase: StartChallengeUseCase,
    private readonly submitSolutionUseCase: SubmitSolutionUseCase,
    private readonly analyzeCodeUseCase: AnalyzeCodeUseCase
  ) {}

  createChallenge = async (
    request: FastifyRequest<{ Body: CreateChallengeDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;
    
    logger.info({
      requestId,
      operation: 'challenge_creation_request',
      userId: user?.id,
      userRole: user?.role,
      slug: request.body.slug,
      title: request.body.title,
      difficulty: request.body.difficulty,
      category: request.body.category,
      estimatedMinutes: request.body.estimatedMinutes,
      languages: request.body.languages,
      testCasesCount: request.body.testCases.length,
      trapsCount: request.body.traps.length,
      baseXp: request.body.baseXp,
      ipAddress: request.ip
    }, 'Challenge creation request received');

    try {
      const challenge = await this.createChallengeUseCase.execute(request.body);
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        challengeId: challenge.id,
        slug: challenge.slug,
        title: challenge.title,
        difficulty: challenge.difficulty,
        category: challenge.category,
        createdBy: user?.id,
        creatorRole: user?.role,
        executionTime,
        challengeCreated: true
      }, 'Challenge created successfully');

      return reply.status(201).send(challenge);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof Error && error.message.includes('weights must sum to 1.0')) {
        logger.warn({
          requestId,
          operation: 'challenge_creation_invalid_weights',
          userId: user?.id,
          slug: request.body.slug,
          error: errorMessage,
          reason: 'invalid_test_case_weights',
          executionTime
        }, 'Challenge creation failed - invalid test case weights');
        
        return reply.status(500).send({
          error: 'Internal server error',
          message: error.message,
        });
      }

      if (error instanceof Error && error.message.includes('already exists')) {
        logger.warn({
          requestId,
          operation: 'challenge_creation_conflict',
          userId: user?.id,
          slug: request.body.slug,
          error: errorMessage,
          reason: 'slug_already_exists',
          executionTime
        }, 'Challenge creation failed - slug already exists');
        
        return reply.status(409).send({
          error: 'Conflict',
          message: error.message,
        });
      }

      logger.error({
        requestId,
        operation: 'challenge_creation_failed',
        userId: user?.id,
        slug: request.body.slug,
        title: request.body.title,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Challenge creation failed');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to create challenge',
      });
    }
  };

  getChallenge = async (
    request: FastifyRequest<{ Params: { idOrSlug: string } }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string } | undefined;
    
    logger.debug({
      requestId,
      operation: 'challenge_get_request',
      userId: user?.id,
      idOrSlug: request.params.idOrSlug,
      hasUser: !!user,
      ipAddress: request.ip
    }, 'Challenge get request received');

    try {
      const result = await this.getChallengeUseCase.execute(
        request.params.idOrSlug,
        user?.id
      );
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        challengeId: result.challenge.id,
        slug: result.challenge.slug,
        title: result.challenge.title,
        difficulty: result.challenge.difficulty,
        category: result.challenge.category,
        userId: user?.id,
        attemptsCount: result.attempts.length,
        executionTime,
        challengeRetrieved: true
      }, 'Challenge retrieved successfully');

      return reply.send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof Error && (error.message.includes('not found') || error.message.includes('não encontrado'))) {
        logger.warn({
          requestId,
          operation: 'challenge_not_found',
          idOrSlug: request.params.idOrSlug,
          userId: user?.id,
          executionTime
        }, 'Challenge not found');
        
        return reply.status(404).send({
          error: 'Not found',
          message: error.message,
        });
      }

      logger.error({
        requestId,
        operation: 'challenge_get_failed',
        idOrSlug: request.params.idOrSlug,
        userId: user?.id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Failed to retrieve challenge');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to retrieve challenge',
      });
    }
  };

  listChallenges = async (
    request: FastifyRequest<{ Querystring: ChallengeFilters }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string } | undefined;
    
    logger.debug({
      requestId,
      operation: 'challenges_list_request',
      userId: user?.id,
      filters: {
        difficulty: request.query.difficulty,
        category: request.query.category,
        languages: request.query.languages,
        search: request.query.search,
        limit: request.query.limit,
        offset: request.query.offset
      },
      hasUser: !!user,
      ipAddress: request.ip
    }, 'Challenges list request received');

    try {
      const challenges = await this.listChallengesUseCase.execute(
        request.query,
        user?.id
      );
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        userId: user?.id,
        challengesCount: challenges.length,
        filters: request.query,
        executionTime,
        challengesListed: true
      }, 'Challenges listed successfully');

      return reply.send({ challenges });
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error({
        requestId,
        operation: 'challenges_list_failed',
        userId: user?.id,
        filters: request.query,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Failed to list challenges');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to list challenges',
      });
    }
  };

  updateChallenge = async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: Partial<CreateChallengeDTO>;
    }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;
    
    logger.info({
      requestId,
      operation: 'challenge_update_request',
      challengeId: request.params.id,
      userId: user?.id,
      userRole: user?.role,
      fieldsToUpdate: Object.keys(request.body),
      hasSlugChange: !!request.body.slug,
      hasTestCasesChange: !!request.body.testCases,
      hasTrapsChange: !!request.body.traps,
      ipAddress: request.ip
    }, 'Challenge update request received');

    try {
      const challenge = await this.updateChallengeUseCase.execute(
        request.params.id,
        request.body
      );
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        challengeId: challenge.id,
        slug: challenge.slug,
        title: challenge.title,
        updatedBy: user?.id,
        updaterRole: user?.role,
        fieldsUpdated: Object.keys(request.body),
        executionTime,
        challengeUpdated: true
      }, 'Challenge updated successfully');

      return reply.send(challenge);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof Error && (error.message.includes('not found') || error.message.includes('não encontrado'))) {
        logger.warn({
          requestId,
          operation: 'challenge_update_not_found',
          challengeId: request.params.id,
          userId: user?.id,
          executionTime
        }, 'Challenge update failed - challenge not found');
        
        return reply.status(404).send({
          error: 'Not found',
          message: error.message,
        });
      }

      logger.error({
        requestId,
        operation: 'challenge_update_failed',
        challengeId: request.params.id,
        userId: user?.id,
        fieldsToUpdate: Object.keys(request.body),
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Challenge update failed');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to update challenge',
      });
    }
  };

  deleteChallenge = async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string; email: string; role: string } | undefined;
    
    logger.warn({
      requestId,
      operation: 'challenge_deletion_request',
      challengeId: request.params.id,
      userId: user?.id,
      userRole: user?.role,
      ipAddress: request.ip,
      criticalOperation: true
    }, 'Challenge deletion request received');

    try {
      await this.deleteChallengeUseCase.execute(request.params.id);
      
      const executionTime = Date.now() - startTime;
      
      logger.warn({
        requestId,
        challengeId: request.params.id,
        deletedBy: user?.id,
        deleterRole: user?.role,
        executionTime,
        challengeDeleted: true,
        criticalOperation: true
      }, 'Challenge deleted successfully');

      return reply.status(204).send();
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof Error && (error.message.includes('not found') || error.message.includes('não encontrado'))) {
        logger.warn({
          requestId,
          operation: 'challenge_deletion_not_found',
          challengeId: request.params.id,
          userId: user?.id,
          executionTime
        }, 'Challenge deletion failed - challenge not found');
        
        return reply.status(404).send({
          error: 'Not found',
          message: error.message,
        });
      }

      logger.error({
        requestId,
        operation: 'challenge_deletion_failed',
        challengeId: request.params.id,
        userId: user?.id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime,
        criticalOperationFailed: true
      }, 'Challenge deletion failed');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to delete challenge',
      });
    }
  };

  startChallenge = async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { language: string };
    }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string };
    
    logger.info({
      requestId,
      operation: 'challenge_start_request',
      challengeId: request.params.id,
      userId: user.id,
      language: request.body.language,
      ipAddress: request.ip,
      userAgent: request.headers['user-agent']
    }, 'Challenge start request received');

    try {
      const result = await this.startChallengeUseCase.execute(
        user.id,
        request.params.id,
        request.body.language
      );
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        challengeId: request.params.id,
        userId: user.id,
        language: request.body.language,
        attemptId: result.attemptId,
        sessionId: result.sessionId,
        resumed: result.resumed,
        executionTime,
        challengeStarted: true
      }, result.resumed ? 'Challenge resumed successfully' : 'Challenge started successfully');

      return reply.send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof Error && (error.message.includes('not found') || error.message.includes('não encontrado'))) {
        logger.warn({
          requestId,
          operation: 'challenge_start_not_found',
          challengeId: request.params.id,
          userId: user.id,
          language: request.body.language,
          executionTime
        }, 'Challenge start failed - challenge not found');
        
        return reply.status(404).send({
          error: 'Not found',
          message: error.message,
        });
      }

      if (error instanceof Error && (error.message.includes('not supported') || error.message.includes('não suportado'))) {
        logger.warn({
          requestId,
          operation: 'challenge_start_language_unsupported',
          challengeId: request.params.id,
          userId: user.id,
          language: request.body.language,
          executionTime
        }, 'Challenge start failed - language not supported');
        
        return reply.status(400).send({
          error: 'Bad request',
          message: error.message,
        });
      }

      logger.error({
        requestId,
        operation: 'challenge_start_failed',
        challengeId: request.params.id,
        userId: user.id,
        language: request.body.language,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Challenge start failed');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to start challenge',
      });
    }
  };

  submitSolution = async (
    request: FastifyRequest<{ Body: SubmitSolutionDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string };
    
    logger.info({
      requestId,
      operation: 'solution_submission_request',
      challengeId: request.body.challengeId,
      attemptId: request.body.attemptId,
      userId: user.id,
      language: request.body.language,
      codeLength: request.body.code.length,
      ipAddress: request.ip
    }, 'Solution submission request received');

    try {
      const result = await this.submitSolutionUseCase.execute(user.id, request.body);
      
      const executionTime = Date.now() - startTime;
      
      logger.info({
        requestId,
        challengeId: request.body.challengeId,
        attemptId: request.body.attemptId,
        userId: user.id,
        language: request.body.language,
        passed: result.passed,
        score: result.score,
        testsPassed: result.testResults?.filter(t => t.passed).length || 0,
        testsTotal: result.testResults?.length || 0,
        xpEarned: result.xpEarned,
        executionTime,
        solutionSubmitted: true
      }, result.passed ? 'Solution submitted and passed!' : 'Solution submitted but did not pass');

      // Log achievement event if passed
      if (result.passed) {
        logger.info({
          userId: user.id,
          challengeId: request.body.challengeId,
          attemptId: request.body.attemptId,
          score: result.score,
          xpEarned: result.xpEarned,
          achievementEvent: true
        }, 'CHALLENGE COMPLETED EVENT');
      }

      return reply.send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof Error && (error.message.includes('not found') || error.message.includes('não encontrado'))) {
        logger.warn({
          requestId,
          operation: 'solution_submission_not_found',
          challengeId: request.body.challengeId,
          attemptId: request.body.attemptId,
          userId: user.id,
          executionTime
        }, 'Solution submission failed - challenge or attempt not found');
        
        return reply.status(404).send({
          error: 'Not found',
          message: error.message,
        });
      }

      if (error instanceof Error && error.message.includes('já completado')) {
        logger.warn({
          requestId,
          operation: 'solution_submission_already_completed',
          challengeId: request.body.challengeId,
          attemptId: request.body.attemptId,
          userId: user.id,
          executionTime
        }, 'Solution submission failed - attempt already completed');
        
        return reply.status(400).send({
          error: 'Bad request',
          message: error.message,
        });
      }

      if (error instanceof Error && (error.message.includes('Invalid attempt') || error.message.includes('Tentativa inválida'))) {
        logger.warn({
          requestId,
          operation: 'solution_submission_invalid_attempt',
          challengeId: request.body.challengeId,
          attemptId: request.body.attemptId,
          userId: user.id,
          executionTime
        }, 'Solution submission failed - invalid attempt');
        
        return reply.status(403).send({
          error: 'Forbidden',
          message: error.message,
        });
      }

      logger.error({
        requestId,
        operation: 'solution_submission_failed',
        challengeId: request.body.challengeId,
        attemptId: request.body.attemptId,
        userId: user.id,
        language: request.body.language,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Solution submission failed');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to submit solution',
      });
    }
  };

  analyzeCode = async (
    request: FastifyRequest<{ Body: AnalyzeCodeDTO }>,
    reply: FastifyReply
  ): Promise<void> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();
    const user = request.user as { id: string };
    
    logger.info({
      requestId,
      operation: 'code_analysis_request',
      challengeId: request.body.challengeId,
      attemptId: request.body.attemptId,
      userId: user.id,
      codeLength: request.body.code.length,
      checkpointTime: request.body.checkpointTime,
      ipAddress: request.ip
    }, 'Code analysis request received');

    try {
      const result = await this.analyzeCodeUseCase.execute(user.id, request.body);
      
      const executionTime = Date.now() - startTime;
      
      const trapsDetected = result.trapsDetected?.length || 0;
      const criticalTraps = result.trapsDetected?.filter(t => 
        t.detected && t.trapId.includes('critical')
      ).length || 0;
      
      logger.info({
        requestId,
        challengeId: request.body.challengeId,
        attemptId: request.body.attemptId,
        userId: user.id,
        trapsDetected,
        criticalTraps,
        codeQualityScore: result.codeQuality?.securityScore,
        warningsCount: result.warnings?.length || 0,
        feedbackCount: result.feedback?.length || 0,
        executionTime,
        codeAnalyzed: true
      }, 'Code analysis completed successfully');

      // Log security warnings if critical traps found
      if (criticalTraps > 0) {
        logger.warn({
          userId: user.id,
          attemptId: request.body.attemptId,
          criticalTraps,
          trapsDetected,
          securityEvent: true
        }, 'Critical security vulnerabilities detected in code analysis');
      }

      return reply.send(result);
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (error instanceof Error && (error.message.includes('Invalid attempt') || error.message.includes('Tentativa inválida'))) {
        logger.warn({
          requestId,
          operation: 'code_analysis_invalid_attempt',
          challengeId: request.body.challengeId,
          attemptId: request.body.attemptId,
          userId: user.id,
          executionTime
        }, 'Code analysis failed - invalid attempt');
        
        return reply.status(403).send({
          error: 'Forbidden',
          message: error.message,
        });
      }

      logger.error({
        requestId,
        operation: 'code_analysis_failed',
        challengeId: request.body.challengeId,
        attemptId: request.body.attemptId,
        userId: user.id,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        executionTime
      }, 'Code analysis failed');

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to analyze code',
      });
    }
  };
}
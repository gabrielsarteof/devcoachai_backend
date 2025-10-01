import type { FastifyRequest, FastifyReply } from 'fastify';
import { CreateChallengeUseCase } from '../../application/use-cases/create-challenge.use-case';
import { GetChallengeUseCase } from '../../application/use-cases/get-challenge.use-case';
import { ListChallengesUseCase } from '../../application/use-cases/list-challenges.use-case';
import { UpdateChallengeUseCase } from '../../application/use-cases/update-challenge.use-case';
import { DeleteChallengeUseCase } from '../../application/use-cases/delete-challenge.use-case';
import { StartChallengeUseCase } from '../../application/use-cases/start-challenge.use-case';
import { SubmitSolutionUseCase } from '../../application/use-cases/submit-solution.use-case';
import { AnalyzeCodeUseCase } from '../../application/use-cases/analyze-code.use-case';
import { CreateChallengeDTO, CreateChallengeSchema } from '../../domain/schemas/challenge.schema';
import { SubmitSolutionDTO, SubmitSolutionSchema } from '../../application/use-cases/submit-solution.use-case';
import { AnalyzeCodeDTO, AnalyzeCodeSchema } from '../../application/use-cases/analyze-code.use-case';
import { ChallengeFilters } from '../../domain/repositories/challenge.repository.interface';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { ChallengeError, ValidationError } from '../../domain/errors';
import { ZodError } from 'zod';

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

    try {
      const validatedData = CreateChallengeSchema.parse(request.body);

      logger.info({
        requestId,
        operation: 'challenge_creation_request',
        userId: user?.id,
        userRole: user?.role,
        slug: validatedData.slug,
        title: validatedData.title,
        difficulty: validatedData.difficulty,
        category: validatedData.category,
        estimatedMinutes: validatedData.estimatedMinutes,
        languages: validatedData.languages,
        testCasesCount: validatedData.testCases.length,
        trapsCount: validatedData.traps.length,
        baseXp: validatedData.baseXp,
        ipAddress: request.ip
      }, 'Challenge creation request received');

      const challenge = await this.createChallengeUseCase.execute(validatedData);

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

      return reply.status(201).send({
        success: true,
        data: challenge
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof ChallengeError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      logger.error({
        requestId,
        operation: 'challenge_creation_failed',
        userId: user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
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

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof ChallengeError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      logger.error({
        requestId,
        operation: 'challenge_get_failed',
        idOrSlug: request.params.idOrSlug,
        userId: user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
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

      return reply.send({
        success: true,
        data: {
          challenges,
          total: challenges.length,
          limit: request.query.limit || 20,
          offset: request.query.offset || 0
        }
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof ChallengeError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      logger.error({
        requestId,
        operation: 'challenges_list_failed',
        userId: user?.id,
        filters: request.query,
        error: error instanceof Error ? error.message : 'Unknown error',
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

      return reply.send({
        success: true,
        data: challenge
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof ChallengeError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      logger.error({
        requestId,
        operation: 'challenge_update_failed',
        challengeId: request.params.id,
        userId: user?.id,
        fieldsToUpdate: Object.keys(request.body),
        error: error instanceof Error ? error.message : 'Unknown error',
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

      if (error instanceof ChallengeError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      logger.error({
        requestId,
        operation: 'challenge_deletion_failed',
        challengeId: request.params.id,
        userId: user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
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

      return reply.status(201).send({
        success: true,
        data: result
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof ChallengeError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      logger.error({
        requestId,
        operation: 'challenge_start_failed',
        challengeId: request.params.id,
        userId: user.id,
        language: request.body.language,
        error: error instanceof Error ? error.message : 'Unknown error',
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

    try {
      const validatedData = SubmitSolutionSchema.parse(request.body);

      logger.info({
        requestId,
        operation: 'solution_submission_request',
        challengeId: validatedData.challengeId,
        attemptId: validatedData.attemptId,
        userId: user.id,
        language: validatedData.language,
        codeLength: validatedData.code.length,
        ipAddress: request.ip
      }, 'Solution submission request received');

      const result = await this.submitSolutionUseCase.execute(user.id, validatedData);
      
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

      // Registra evento de conquista para desafios concluídos
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

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof ChallengeError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      logger.error({
        requestId,
        operation: 'solution_submission_failed',
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
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

    try {
      const validatedData = AnalyzeCodeSchema.parse(request.body);

      logger.info({
        requestId,
        operation: 'code_analysis_request',
        challengeId: validatedData.challengeId,
        attemptId: validatedData.attemptId,
        userId: user.id,
        codeLength: validatedData.code.length,
        checkpointTime: validatedData.checkpointTime,
        ipAddress: request.ip
      }, 'Code analysis request received');

      const result = await this.analyzeCodeUseCase.execute(user.id, validatedData);
      
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

      // Registra avisos de segurança para armadilhas críticas detectadas
      if (criticalTraps > 0) {
        logger.warn({
          userId: user.id,
          attemptId: request.body.attemptId,
          criticalTraps,
          trapsDetected,
          securityEvent: true
        }, 'Critical security vulnerabilities detected in code analysis');
      }

      return reply.send({
        success: true,
        data: result
      });
    } catch (error) {
      const executionTime = Date.now() - startTime;

      if (error instanceof ZodError) {
        const validationError = new ValidationError(error);
        return reply.status(validationError.statusCode).send(validationError.toJSON());
      }

      if (error instanceof ChallengeError) {
        return reply.status(error.statusCode).send(error.toJSON());
      }

      logger.error({
        requestId,
        operation: 'code_analysis_failed',
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
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
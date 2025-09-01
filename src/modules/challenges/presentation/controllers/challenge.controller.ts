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
    try {
      const challenge = await this.createChallengeUseCase.execute(request.body);
      return reply.status(201).send(challenge);
    } catch (error) {
      logger.error({ error }, 'Failed to create challenge');
      
      if (error instanceof Error && error.message.includes('already exists')) {
        return reply.status(409).send({
          error: 'Conflict',
          message: error.message,
        });
      }

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
    try {
      const user = request.user as { id: string } | undefined;
      const result = await this.getChallengeUseCase.execute(
        request.params.idOrSlug,
        user?.id
      );
      return reply.send(result);
    } catch (error) {
      logger.error({ error }, 'Failed to get challenge');
      
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({
          error: 'Not found',
          message: error.message,
        });
      }

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
    try {
      const user = request.user as { id: string } | undefined;
      const challenges = await this.listChallengesUseCase.execute(
        request.query,
        user?.id
      );
      return reply.send({ challenges });
    } catch (error) {
      logger.error({ error }, 'Failed to list challenges');
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
    try {
      const challenge = await this.updateChallengeUseCase.execute(
        request.params.id,
        request.body
      );
      return reply.send(challenge);
    } catch (error) {
      logger.error({ error }, 'Failed to update challenge');
      
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({
          error: 'Not found',
          message: error.message,
        });
      }

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
    try {
      await this.deleteChallengeUseCase.execute(request.params.id);
      return reply.status(204).send();
    } catch (error) {
      logger.error({ error }, 'Failed to delete challenge');
      
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({
          error: 'Not found',
          message: error.message,
        });
      }

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
    try {
      const user = request.user as { id: string };
      const result = await this.startChallengeUseCase.execute(
        user.id,
        request.params.id,
        request.body.language
      );
      return reply.send(result);
    } catch (error) {
      logger.error({ error }, 'Failed to start challenge');
      
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({
          error: 'Not found',
          message: error.message,
        });
      }

      if (error instanceof Error && error.message.includes('not supported')) {
        return reply.status(400).send({
          error: 'Bad request',
          message: error.message,
        });
      }

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
    try {
      const user = request.user as { id: string };
      const result = await this.submitSolutionUseCase.execute(user.id, request.body);
      return reply.send(result);
    } catch (error) {
      logger.error({ error }, 'Failed to submit solution');
      
      if (error instanceof Error && error.message.includes('not found')) {
        return reply.status(404).send({
          error: 'Not found',
          message: error.message,
        });
      }

      if (error instanceof Error && error.message.includes('already completed')) {
        return reply.status(400).send({
          error: 'Bad request',
          message: error.message,
        });
      }

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
    try {
      const user = request.user as { id: string };
      const result = await this.analyzeCodeUseCase.execute(user.id, request.body);
      return reply.send(result);
    } catch (error) {
      logger.error({ error }, 'Failed to analyze code');
      
      if (error instanceof Error && error.message.includes('Invalid attempt')) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: error.message,
        });
      }

      return reply.status(500).send({
        error: 'Internal server error',
        message: 'Failed to analyze code',
      });
    }
  };
}
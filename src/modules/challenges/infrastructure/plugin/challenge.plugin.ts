import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { ChallengeRepository } from '../repositories/challenge.repository';
import { Judge0Service } from '../services/judge0.service';
import { TrapDetectorService } from '../../domain/services/trap-detector.service';
import { CreateChallengeUseCase } from '../../application/use-cases/create-challenge.use-case';
import { GetChallengeUseCase } from '../../application/use-cases/get-challenge.use-case';
import { ListChallengesUseCase } from '../../application/use-cases/list-challenges.use-case';
import { UpdateChallengeUseCase } from '../../application/use-cases/update-challenge.use-case';
import { DeleteChallengeUseCase } from '../../application/use-cases/delete-challenge.use-case';
import { StartChallengeUseCase } from '../../application/use-cases/start-challenge.use-case';
import { SubmitSolutionUseCase } from '../../application/use-cases/submit-solution.use-case';
import { AnalyzeCodeUseCase } from '../../application/use-cases/analyze-code.use-case';
import { ChallengeController } from '../../presentation/controllers/challenge.controller';
import { challengeRoutes } from '../../presentation/routes/challenge.routes';

export interface ChallengePluginOptions {
  prisma: PrismaClient;
  redis: Redis;
}

const challengePlugin: FastifyPluginAsync<ChallengePluginOptions> = async function(
  fastify: FastifyInstance,
  options: ChallengePluginOptions
): Promise<void> {
  const repository = new ChallengeRepository(options.prisma);
  const judge0Service = new Judge0Service(options.redis);
  const trapDetector = new TrapDetectorService();

  const createChallengeUseCase = new CreateChallengeUseCase(repository);
  const getChallengeUseCase = new GetChallengeUseCase(repository);
  const listChallengesUseCase = new ListChallengesUseCase(repository, options.prisma);
  const updateChallengeUseCase = new UpdateChallengeUseCase(repository);
  const deleteChallengeUseCase = new DeleteChallengeUseCase(repository);
  const startChallengeUseCase = new StartChallengeUseCase(repository);
  const submitSolutionUseCase = new SubmitSolutionUseCase(repository, judge0Service, options.prisma);
  const analyzeCodeUseCase = new AnalyzeCodeUseCase(repository, trapDetector, options.prisma);

  const controller = new ChallengeController(
    createChallengeUseCase,
    getChallengeUseCase,
    listChallengesUseCase,
    updateChallengeUseCase,
    deleteChallengeUseCase,
    startChallengeUseCase,
    submitSolutionUseCase,
    analyzeCodeUseCase
  );

  await fastify.register(async function challengeRoutesPlugin(childInstance) {
    await challengeRoutes(childInstance, controller);
  }, {
    prefix: '/challenges'
  });

  fastify.log.info('Challenge plugin registered successfully');
};

export default fp(challengePlugin, {
  name: 'challenge-plugin',
  dependencies: ['auth-plugin'],
});
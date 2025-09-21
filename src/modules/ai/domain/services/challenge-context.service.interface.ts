import { ChallengeContext, ContextStats } from '../types/context.types';

export interface IChallengeContextService {
  getChallengeContext(challengeId: string): Promise<ChallengeContext>;
  refreshChallengeContext(challengeId: string): Promise<void>;
  buildContextFromChallenge(challenge: any): ChallengeContext;
  prewarmCache(challengeIds: string[]): Promise<void>;
  getContextStats(): Promise<ContextStats>; 
}
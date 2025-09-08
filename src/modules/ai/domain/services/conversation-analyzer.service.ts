import { AIMessage } from '../types/ai.types';
import { logger } from '@/shared/infrastructure/monitoring/logger';

export interface ConversationAnalysis {
  topics: string[];
  complexity: 'simple' | 'moderate' | 'complex' | 'expert';
  codeRequested: boolean;
  codeLanguages: string[];
  estimatedDifficulty: number; 
  suggestedFollowUps: string[];
  potentialIssues: string[];
  conversationQuality: number; 
}

export class ConversationAnalyzerService {
  private readonly codePatterns = [
    /write.*code/i,
    /create.*function/i,
    /implement/i,
    /build.*app/i,
    /fix.*bug/i,
    /debug/i,
    /refactor/i,
  ];

  private readonly languagePatterns = new Map([
    ['javascript', /javascript|js|node|react|vue|angular/i],
    ['python', /python|django|flask|pandas|numpy/i],
    ['typescript', /typescript|ts|type|interface/i],
    ['java', /java|spring|maven|gradle/i],
    ['csharp', /c#|csharp|\.net|asp/i],
    ['go', /golang|go\s/i],
    ['rust', /rust|cargo/i],
    ['sql', /sql|database|query|select|insert/i],
  ]);

  analyzeConversation(messages: AIMessage[]): ConversationAnalysis {
    const startTime = Date.now();
    
    try {
      logger.debug({
        messageCount: messages.length,
        totalLength: messages.reduce((sum, m) => sum + m.content.length, 0)
      }, 'Starting conversation analysis');

      const fullText = messages.map(m => m.content).join(' ');
      
      const analysis: ConversationAnalysis = {
        topics: this.extractTopics(messages),
        complexity: this.assessComplexity(messages),
        codeRequested: this.detectCodeRequest(fullText),
        codeLanguages: this.detectLanguages(fullText),
        estimatedDifficulty: this.estimateDifficulty(messages),
        suggestedFollowUps: this.generateFollowUps(messages),
        potentialIssues: this.detectPotentialIssues(messages),
        conversationQuality: this.assessQuality(messages),
      };

      const processingTime = Date.now() - startTime;
      
      logger.info({
        analysis: {
          complexity: analysis.complexity,
          codeRequested: analysis.codeRequested,
          languagesDetected: analysis.codeLanguages,
          topicsCount: analysis.topics.length,
          issuesDetected: analysis.potentialIssues.length,
          qualityScore: analysis.conversationQuality,
          difficulty: analysis.estimatedDifficulty
        },
        processingTime,
        messageCount: messages.length
      }, 'Conversation analysis completed');

      if (analysis.potentialIssues.length > 0) {
        logger.warn({
          issues: analysis.potentialIssues,
          messageCount: messages.length
        }, 'Potential security/quality issues detected in conversation');
      }

      if (analysis.conversationQuality < 30) {
        logger.warn({
          qualityScore: analysis.conversationQuality,
          messageCount: messages.length
        }, 'Low conversation quality detected');
      }

      return analysis;
    } catch (error) {
      logger.error({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        messageCount: messages.length,
        processingTime: Date.now() - startTime
      }, 'Failed to analyze conversation');
      
      return {
        topics: [],
        complexity: 'simple',
        codeRequested: false,
        codeLanguages: [],
        estimatedDifficulty: 0,
        suggestedFollowUps: [],
        potentialIssues: ['Analysis failed'],
        conversationQuality: 0,
      };
    }
  }

  private extractTopics(messages: AIMessage[]): string[] {
    try {
      const topics = new Set<string>();
      const keywords = [
        'api', 'database', 'authentication', 'testing', 'deployment',
        'performance', 'security', 'design', 'architecture', 'algorithm',
        'frontend', 'backend', 'mobile', 'cloud', 'devops',
      ];

      const text = messages.map(m => m.content.toLowerCase()).join(' ');
      
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          topics.add(keyword);
        }
      }

      const result = Array.from(topics);
      
      logger.debug({
        topicsFound: result,
        totalKeywordsChecked: keywords.length
      }, 'Topics extraction completed');

      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to extract topics');
      return [];
    }
  }

  private assessComplexity(messages: AIMessage[]): ConversationAnalysis['complexity'] {
    try {
      const totalLength = messages.reduce((sum, m) => sum + m.content.length, 0);
      const avgLength = totalLength / messages.length;
      const technicalTerms = this.countTechnicalTerms(messages);
      
      let complexity: ConversationAnalysis['complexity'];
      if (avgLength > 1000 || technicalTerms > 20) complexity = 'expert';
      else if (avgLength > 500 || technicalTerms > 10) complexity = 'complex';
      else if (avgLength > 200 || technicalTerms > 5) complexity = 'moderate';
      else complexity = 'simple';

      logger.debug({
        avgLength,
        technicalTerms,
        complexity,
        totalLength,
        messageCount: messages.length
      }, 'Complexity assessment completed');

      return complexity;
    } catch (error) {
      logger.error({ error }, 'Failed to assess complexity');
      return 'simple';
    }
  }

  private countTechnicalTerms(messages: AIMessage[]): number {
    try {
      const technicalTerms = [
        'algorithm', 'api', 'async', 'authentication', 'cache', 'callback',
        'closure', 'concurrency', 'database', 'dependency', 'encryption',
        'framework', 'interface', 'middleware', 'optimization', 'protocol',
        'recursion', 'repository', 'scalability', 'schema', 'webhook',
      ];

      const text = messages.map(m => m.content.toLowerCase()).join(' ');
      let count = 0;

      for (const term of technicalTerms) {
        const matches = text.match(new RegExp(term, 'gi'));
        if (matches) count += matches.length;
      }

      logger.debug({
        technicalTermsCount: count,
        termsChecked: technicalTerms.length
      }, 'Technical terms counting completed');

      return count;
    } catch (error) {
      logger.error({ error }, 'Failed to count technical terms');
      return 0;
    }
  }

  private detectCodeRequest(text: string): boolean {
    try {
      const result = this.codePatterns.some(pattern => pattern.test(text));
      
      logger.debug({
        codeRequested: result,
        patternsChecked: this.codePatterns.length
      }, 'Code request detection completed');

      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to detect code request');
      return false;
    }
  }

  private detectLanguages(text: string): string[] {
    try {
      const detected: string[] = [];
      
      for (const [language, pattern] of this.languagePatterns) {
        if (pattern.test(text)) {
          detected.push(language);
        }
      }

      logger.debug({
        languagesDetected: detected,
        totalLanguagesChecked: this.languagePatterns.size
      }, 'Language detection completed');

      return detected;
    } catch (error) {
      logger.error({ error }, 'Failed to detect languages');
      return [];
    }
  }

  private estimateDifficulty(messages: AIMessage[]): number {
    try {
      const complexity = this.assessComplexity(messages);
      const complexityScore = {
        simple: 20,
        moderate: 40,
        complex: 70,
        expert: 90,
      }[complexity];

      const technicalTerms = this.countTechnicalTerms(messages);
      const termScore = Math.min(technicalTerms * 2, 30);

      const messageCount = messages.length;
      const conversationScore = Math.min(messageCount * 5, 20);

      const finalScore = Math.min(complexityScore + termScore + conversationScore, 100);

      logger.debug({
        complexity,
        complexityScore,
        technicalTerms,
        termScore,
        messageCount,
        conversationScore,
        finalDifficulty: finalScore
      }, 'Difficulty estimation completed');

      return finalScore;
    } catch (error) {
      logger.error({ error }, 'Failed to estimate difficulty');
      return 0;
    }
  }

  private generateFollowUps(messages: AIMessage[]): string[] {
    try {
      const lastMessage = messages[messages.length - 1];
      const followUps: string[] = [];

      if (this.detectCodeRequest(lastMessage.content)) {
        followUps.push('Would you like me to add error handling to this code?');
        followUps.push('Should I include unit tests for this implementation?');
      }

      const languages = this.detectLanguages(lastMessage.content);
      if (languages.length > 0) {
        followUps.push(`Would you like to see best practices for ${languages[0]}?`);
      }

      if (lastMessage.content.toLowerCase().includes('api')) {
        followUps.push('Do you need help with API documentation?');
      }

      const result = followUps.slice(0, 3);

      logger.debug({
        followUpsGenerated: result.length,
        lastMessageLength: lastMessage.content.length
      }, 'Follow-ups generation completed');

      return result;
    } catch (error) {
      logger.error({ error }, 'Failed to generate follow-ups');
      return [];
    }
  }

  private detectPotentialIssues(messages: AIMessage[]): string[] {
    try {
      const issues: string[] = [];
      const text = messages.map(m => m.content.toLowerCase()).join(' ');

      const issuePatterns = [
        { pattern: /without.*validation/i, issue: 'Missing input validation' },
        { pattern: /no.*error.*handling/i, issue: 'Lack of error handling' },
        { pattern: /hardcoded/i, issue: 'Hardcoded values detected' },
        { pattern: /sql.*injection/i, issue: 'Potential SQL injection vulnerability' },
        { pattern: /plain.*text.*password/i, issue: 'Password security concern' },
      ];

      for (const { pattern, issue } of issuePatterns) {
        if (pattern.test(text)) {
          issues.push(issue);
        }
      }

      if (issues.length > 0) {
        logger.warn({
          issuesDetected: issues,
          messageCount: messages.length
        }, 'Potential issues detected in conversation');
      }

      logger.debug({
        issuesFound: issues.length,
        patternsChecked: issuePatterns.length
      }, 'Issue detection completed');

      return issues;
    } catch (error) {
      logger.error({ error }, 'Failed to detect potential issues');
      return ['Issue detection failed'];
    }
  }

  private assessQuality(messages: AIMessage[]): number {
    try {
      let score = 100;

      const avgLength = messages.reduce((sum, m) => sum + m.content.length, 0) / messages.length;
      if (avgLength < 50) score -= 20;

      const firstMessage = messages[0];
      if (firstMessage.content.length < 100) score -= 10;

      const hasQuestionMarks = messages.some(m => m.content.includes('?'));
      if (hasQuestionMarks) score += 5;

      const hasCodeBlocks = messages.some(m => m.content.includes('\`\`\`'));
      if (hasCodeBlocks) score += 10;

      const finalScore = Math.max(0, Math.min(100, score));

      logger.debug({
        qualityScore: finalScore,
        avgLength,
        firstMessageLength: firstMessage.content.length,
        hasQuestions: hasQuestionMarks,
        hasCode: hasCodeBlocks,
        messageCount: messages.length
      }, 'Quality assessment completed');

      return finalScore;
    } catch (error) {
      logger.error({ error }, 'Failed to assess quality');
      return 0;
    }
  }
}
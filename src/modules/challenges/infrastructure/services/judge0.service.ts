import axios, { AxiosInstance } from 'axios';
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { Redis } from 'ioredis';
import * as crypto from 'crypto';

export interface CodeSubmission {
  source_code: string;
  language_id: number;
  stdin?: string;
  expected_output?: string;
  cpu_time_limit?: number;
  memory_limit?: number;
  wall_time_limit?: number;
}

export interface ExecutionResult {
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  message: string | null;
  exit_code: number;
  status: {
    id: number;
    description: string;
  };
  time: string;
  memory: number;
  token?: string;
}

export class Judge0Service {
  private client: AxiosInstance;
  private readonly languageMap: Record<string, number> = {
    'javascript': 63,
    'typescript': 74,
    'python': 71,
    'java': 62,
    'cpp': 54,
    'c': 50,
    'go': 60,
    'rust': 73,
    'ruby': 72,
    'php': 68,
  };

  constructor(
    private readonly redis: Redis,
    apiUrl: string = process.env.JUDGE0_API_URL || 'https://judge0-ce.p.rapidapi.com',
    apiKey: string = process.env.JUDGE0_API_KEY || ''
  ) {
    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com'
      },
      timeout: 30000,
    });
  }

  async executeCode(
    code: string,
    language: string,
    testCases: Array<{ input: string; expectedOutput: string }>,
    timeLimit: number = 2,
    memoryLimit: number = 128000
  ): Promise<ExecutionResult[]> {
    const languageId = this.languageMap[language.toLowerCase()];
    if (!languageId) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const results: ExecutionResult[] = [];

    for (const testCase of testCases) {
      try {
        const cacheKey = this.generateCacheKey(code, language, testCase.input);
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          results.push(JSON.parse(cached));
          continue;
        }

        const submission: CodeSubmission = {
          source_code: Buffer.from(code).toString('base64'),
          language_id: languageId,
          stdin: Buffer.from(testCase.input).toString('base64'),
          expected_output: Buffer.from(testCase.expectedOutput).toString('base64'),
          cpu_time_limit: timeLimit,
          memory_limit: memoryLimit,
          wall_time_limit: timeLimit * 2,
        };

        const { data } = await this.client.post('/submissions?base64_encoded=true&wait=true', submission);
        
        const result = await this.processResult(data);
        results.push(result);

        if (result.status.id === 3) { 
          await this.redis.setex(cacheKey, 3600, JSON.stringify(result));
        }

        await this.delay(100);
      } catch (error) {
        logger.error({ error, code, language }, 'Code execution failed');
        results.push({
          stdout: null,
          stderr: error instanceof Error ? error.message : 'Execution failed',
          compile_output: null,
          message: 'Internal execution error',
          exit_code: -1,
          status: { id: 13, description: 'Internal Error' },
          time: '0',
          memory: 0,
        });
      }
    }

    return results;
  }

  async executeWithCallback(
    code: string,
    language: string,
    input: string,
    callbackUrl: string
  ): Promise<string> {
    const languageId = this.languageMap[language.toLowerCase()];
    if (!languageId) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const submission = {
      source_code: Buffer.from(code).toString('base64'),
      language_id: languageId,
      stdin: Buffer.from(input).toString('base64'),
      callback_url: callbackUrl,
      base64_encoded: true,
    };

    const { data } = await this.client.post('/submissions', submission);
    return data.token;
  }

  async getSubmission(token: string): Promise<ExecutionResult> {
    const { data } = await this.client.get(`/submissions/${token}?base64_encoded=true`);
    return this.processResult(data);
  }

  private processResult(data: any): ExecutionResult {
    return {
      stdout: data.stdout ? Buffer.from(data.stdout, 'base64').toString() : null,
      stderr: data.stderr ? Buffer.from(data.stderr, 'base64').toString() : null,
      compile_output: data.compile_output ? Buffer.from(data.compile_output, 'base64').toString() : null,
      message: data.message,
      exit_code: data.exit_code || 0,
      status: data.status,
      time: data.time || '0',
      memory: data.memory || 0,
      token: data.token,
    };
  }

  private generateCacheKey(code: string, language: string, input: string): string {
    const hash = crypto.createHash('sha256')
      .update(code + language + input)
      .digest('hex');
    return `judge0:${hash}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getSupportedLanguages(): string[] {
    return Object.keys(this.languageMap);
  }

  getLanguageId(language: string): number | undefined {
    return this.languageMap[language.toLowerCase()];
  }
}
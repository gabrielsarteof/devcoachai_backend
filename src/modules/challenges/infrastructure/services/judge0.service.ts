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

    logger.info({
      service: 'judge0',
      apiUrl,
      supportedLanguages: Object.keys(this.languageMap),
      timeout: 30000
    }, 'Judge0Service initialized');
  }

  async executeCode(
    code: string,
    language: string,
    testCases: Array<{ input: string; expectedOutput: string }>,
    timeLimit: number = 2,
    memoryLimit: number = 128000
  ): Promise<ExecutionResult[]> {
    const executionId = crypto.randomUUID();
    const startTime = Date.now();
    
    logger.info({
      executionId,
      language,
      codeLength: code.length,
      testCasesCount: testCases.length,
      timeLimit,
      memoryLimit,
      codeHash: crypto.createHash('sha256').update(code).digest('hex').slice(0, 8)
    }, 'Starting code execution');

    const languageId = this.languageMap[language.toLowerCase()];
    if (!languageId) {
      logger.error({
        executionId,
        language,
        supportedLanguages: Object.keys(this.languageMap)
      }, 'Unsupported programming language');
      throw new Error(`Unsupported language: ${language}`);
    }

    const results: ExecutionResult[] = [];
    let totalExecutionTime = 0;
    let successfulExecutions = 0;
    let cacheHits = 0;
    let apiCalls = 0;

    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      const testStartTime = Date.now();
      
      try {
        const cacheKey = this.generateCacheKey(code, language, testCase.input);
        const cached = await this.redis.get(cacheKey);
        
        if (cached) {
          cacheHits++;
          logger.debug({
            executionId,
            testCaseIndex: i,
            cacheHit: true
          }, 'Using cached execution result');
          results.push(JSON.parse(cached));
          continue;
        }

        apiCalls++;
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
        
        const testExecutionTime = Date.now() - testStartTime;
        totalExecutionTime += testExecutionTime;
        
        if (result.status.id === 3) {
          successfulExecutions++;
          
          logger.debug({
            executionId,
            testCaseIndex: i,
            status: 'success',
            executionTime: parseFloat(result.time),
            memoryUsed: result.memory,
            apiResponseTime: testExecutionTime
          }, 'Test case executed successfully');
          
          await this.redis.setex(cacheKey, 3600, JSON.stringify(result));
        } else {
          logger.warn({
            executionId,
            testCaseIndex: i,
            status: result.status.description,
            statusId: result.status.id,
            stderr: result.stderr?.substring(0, 200),
            apiResponseTime: testExecutionTime,
            exitCode: result.exit_code
          }, 'Test case execution failed');
        }

        results.push(result);
        await this.delay(100);
        
      } catch (error) {
        const testExecutionTime = Date.now() - testStartTime;
        apiCalls++;
        
        logger.error({
          executionId,
          testCaseIndex: i,
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          apiResponseTime: testExecutionTime
        }, 'Test case execution error');
        
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

    const processingTime = Date.now() - startTime;
    const successRate = (successfulExecutions / testCases.length) * 100;
    const cacheHitRate = testCases.length > 0 ? (cacheHits / testCases.length) * 100 : 0;

    logger.info({
      executionId,
      language,
      totalTestCases: testCases.length,
      successfulExecutions,
      failedExecutions: testCases.length - successfulExecutions,
      successRate,
      totalApiTime: totalExecutionTime,
      averageExecutionTime: testCases.length > 0 ? totalExecutionTime / testCases.length : 0,
      processingTime,
      apiCalls,
      cacheHits,
      cacheHitRate
    }, 'Code execution completed');

    if (successfulExecutions === 0 && testCases.length > 0) {
      logger.warn({
        executionId,
        language,
        codeLength: code.length,
        allTestsFailed: true
      }, 'All test cases failed - possible malicious code or system issue');
    }

    if (successRate < 50 && testCases.length >= 3) {
      logger.warn({
        executionId,
        language,
        successRate,
        lowSuccessRate: true
      }, 'Low success rate detected in code execution');
    }

    if (apiCalls > 10) {
      logger.warn({
        executionId,
        apiCalls,
        cacheHitRate,
        highApiUsage: true
      }, 'High API usage detected - consider optimizing cache strategy');
    }

    return results;
  }

  async executeWithCallback(
    code: string,
    language: string,
    input: string,
    callbackUrl: string
  ): Promise<string> {
    const executionId = crypto.randomUUID();
    const startTime = Date.now();
    
    logger.info({
      executionId,
      language,
      codeLength: code.length,
      callbackUrl,
      operation: 'async_execution'
    }, 'Starting asynchronous code execution');

    try {
      const languageId = this.languageMap[language.toLowerCase()];
      if (!languageId) {
        logger.error({
          executionId,
          language,
          supportedLanguages: Object.keys(this.languageMap)
        }, 'Unsupported language for async execution');
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
      
      const processingTime = Date.now() - startTime;
      
      logger.info({
        executionId,
        token: data.token,
        language,
        processingTime
      }, 'Asynchronous execution submitted successfully');

      return data.token;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        executionId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        language,
        processingTime
      }, 'Asynchronous execution submission failed');
      
      throw error;
    }
  }

  async getSubmission(token: string): Promise<ExecutionResult> {
    const startTime = Date.now();
    
    logger.debug({
      token,
      operation: 'get_submission'
    }, 'Retrieving submission result');

    try {
      const { data } = await this.client.get(`/submissions/${token}?base64_encoded=true`);
      const result = this.processResult(data);
      
      const processingTime = Date.now() - startTime;
      
      logger.info({
        token,
        status: result.status.description,
        statusId: result.status.id,
        processingTime
      }, 'Submission result retrieved');

      return result;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error({
        token,
        error: error instanceof Error ? error.message : 'Unknown error',
        processingTime
      }, 'Failed to retrieve submission result');
      
      throw error;
    }
  }

  private processResult(data: any): ExecutionResult {
    const result: ExecutionResult = {
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

    if (result.status.id === 6) {
      logger.warn({
        token: result.token,
        statusId: result.status.id,
        compileError: true,
        compileOutput: result.compile_output?.substring(0, 200)
      }, 'Compilation error detected');
    } else if (result.status.id === 5) {
      logger.warn({
        token: result.token,
        statusId: result.status.id,
        timeLimit: true,
        executionTime: result.time
      }, 'Time limit exceeded');
    } else if (result.status.id === 11) {
      logger.warn({
        token: result.token,
        statusId: result.status.id,
        runtimeError: true,
        stderr: result.stderr?.substring(0, 200)
      }, 'Runtime error detected');
    }

    return result;
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
import { logger } from '@/shared/infrastructure/monitoring/logger';
import { Trap } from '../types/challenge.types';

export interface TrapDetectionResult {
  trapId: string;
  detected: boolean;
  lineNumber?: number;
  column?: number;
  snippet?: string;
  suggestion?: string;
}

export class TrapDetectorService {
  detectTraps(code: string, traps: Trap[]): TrapDetectionResult[] {
    const results: TrapDetectionResult[] = [];
    const lines = code.split('\n');

    for (const trap of traps) {
      try {
        const regex = new RegExp(trap.detectionPattern, 'gm');
        let match;
        let detected = false;

        while ((match = regex.exec(code)) !== null) {
          detected = true;
          const position = this.getLineAndColumn(code, match.index);
          
          results.push({
            trapId: trap.id,
            detected: true,
            lineNumber: position.line,
            column: position.column,
            snippet: this.extractSnippet(lines, position.line),
            suggestion: this.generateSuggestion(trap),
          });
        }

        if (!detected) {
          if (trap.type === 'security' && this.isMissingSecurityCheck(code, trap)) {
            results.push({
              trapId: trap.id,
              detected: true,
              suggestion: trap.explanation,
            });
          }
        }
      } catch (error) {
        logger.error({ error, trapId: trap.id }, 'Trap detection failed');
      }
    }

    return results;
  }

  analyzeCodeQuality(code: string): CodeQualityMetrics {
    const lines = code.split('\n');
    const nonEmptyLines = lines.filter(l => l.trim().length > 0);
    
    return {
      totalLines: lines.length,
      codeLines: nonEmptyLines.length,
      complexityScore: this.calculateComplexity(code),
      hasErrorHandling: this.checkErrorHandling(code),
      hasInputValidation: this.checkInputValidation(code),
      hasComments: this.checkComments(code),
      securityScore: this.calculateSecurityScore(code),
    };
  }

  private getLineAndColumn(code: string, index: number): { line: number; column: number } {
    const lines = code.substring(0, index).split('\n');
    return {
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    };
  }

  private extractSnippet(lines: string[], lineNumber: number, context: number = 2): string {
    const start = Math.max(0, lineNumber - context - 1);
    const end = Math.min(lines.length, lineNumber + context);
    
    return lines
      .slice(start, end)
      .map((line, i) => {
        const currentLine = start + i + 1;
        const marker = currentLine === lineNumber ? '> ' : '  ';
        return `${marker}${currentLine}: ${line}`;
      })
      .join('\n');
  }

  private generateSuggestion(trap: Trap): string {
    const suggestions: Record<string, string> = {
      'security': `Security Issue: ${trap.explanation}\nUse: ${trap.correctCode}`,
      'performance': `Performance Issue: ${trap.explanation}\nOptimize with: ${trap.correctCode}`,
      'logic': `Logic Error: ${trap.explanation}\nCorrect approach: ${trap.correctCode}`,
      'architecture': `Design Issue: ${trap.explanation}\nBetter pattern: ${trap.correctCode}`,
    };
    
    return suggestions[trap.type] || trap.explanation;
  }

  private isMissingSecurityCheck(code: string, trap: Trap): boolean {
    const securityPatterns = {
      'no-auth': /app\.(post|put|delete|patch).*(?!authenticate)/,
      'no-validation': /req\.(body|params|query)(?!.*validate)/,
      'no-sanitization': /innerHTML|dangerouslySetInnerHTML(?!.*sanitize)/,
      'no-rate-limit': /app\.(post|put)(?!.*rateLimit)/,
    };

    const pattern = trap.detectionPattern.toLowerCase();
    for (const [key, regex] of Object.entries(securityPatterns)) {
      if (pattern.includes(key) && regex.test(code)) {
        return true;
      }
    }
    
    return false;
  }

  private calculateComplexity(code: string): number {
    let complexity = 1;
    
    const decisionPatterns = [
      /if\s*\(/g,
      /else\s+if\s*\(/g,
      /\?\s*.*\s*:/g, 
      /switch\s*\(/g,
      /case\s+/g,
      /for\s*\(/g,
      /while\s*\(/g,
      /do\s*{/g,
      /catch\s*\(/g,
      /&&/g,
      /\|\|/g,
    ];
    
    for (const pattern of decisionPatterns) {
      const matches = code.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    }
    
    return complexity;
  }

  private checkErrorHandling(code: string): boolean {
    return /try\s*{/.test(code) || 
           /\.catch\s*\(/.test(code) ||
           /catch\s*\(/.test(code) ||
           /\.on\(['"]error/.test(code);
  }

  private checkInputValidation(code: string): boolean {
    return /validate|validation|validator|schema|joi|yup|zod/.test(code.toLowerCase());
  }

  private checkComments(code: string): boolean {
    return /\/\/.*|\/\*[\s\S]*?\*\//.test(code);
  }

  private calculateSecurityScore(code: string): number {
    let score = 100;
    
    const vulnerabilities = [
      { pattern: /eval\s*\(/, penalty: 30 },
      { pattern: /innerHTML\s*=/, penalty: 20 },
      { pattern: /document\.write/, penalty: 20 },
      { pattern: /\.exec\s*\(/, penalty: 15 },
      { pattern: /\$\{.*\}.*SELECT|INSERT|UPDATE|DELETE/, penalty: 25 },
      { pattern: /password\s*=\s*['"]/, penalty: 30 },
      { pattern: /api[_-]?key\s*=\s*['"]/, penalty: 25 },
    ];
    
    for (const vuln of vulnerabilities) {
      if (vuln.pattern.test(code)) {
        score -= vuln.penalty;
      }
    }
    
    return Math.max(0, score);
  }
}

export interface CodeQualityMetrics {
  totalLines: number;
  codeLines: number;
  complexityScore: number;
  hasErrorHandling: boolean;
  hasInputValidation: boolean;
  hasComments: boolean;
  securityScore: number;
}
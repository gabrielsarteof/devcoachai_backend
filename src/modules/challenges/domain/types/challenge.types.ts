export type TrapType = 'security' | 'performance' | 'logic' | 'architecture';
export type TrapSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Trap {
  id: string;
  type: TrapType;
  buggedCode: string;
  correctCode: string;
  explanation: string;
  detectionPattern: string;
  severity: TrapSeverity;
}

export interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  weight: number;
  description?: string;
}

export interface Hint {
  trigger: string;
  message: string;
  cost: number;
}

export interface TargetMetrics {
  maxDI: number;
  minPR: number;
  minCS: number;
}

export function isTrapType(value: string): value is TrapType {
  return ['security', 'performance', 'logic', 'architecture'].includes(value);
}

export function isTrapSeverity(value: string): value is TrapSeverity {
  return ['low', 'medium', 'high', 'critical'].includes(value);
}

export function validateTrap(trap: any): Trap {
  if (!trap.id || typeof trap.id !== 'string') {
    throw new Error('Invalid trap: missing id');
  }
  
  if (!isTrapType(trap.type)) {
    throw new Error(`Invalid trap type: ${trap.type}`);
  }
  
  if (!isTrapSeverity(trap.severity)) {
    throw new Error(`Invalid trap severity: ${trap.severity}`);
  }
  
  return {
    id: trap.id,
    type: trap.type,
    buggedCode: trap.buggedCode || '',
    correctCode: trap.correctCode || '',
    explanation: trap.explanation || '',
    detectionPattern: trap.detectionPattern || '',
    severity: trap.severity,
  };
}
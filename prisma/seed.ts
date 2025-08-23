import { PrismaClient } from '@prisma/client';
import { Password } from '../src/shared/domain/value-objects/password.vo';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  await prisma.certificate.deleteMany();
  await prisma.xPTransaction.deleteMany();
  await prisma.userBadge.deleteMany();
  await prisma.trapDetection.deleteMany();
  await prisma.codeEvent.deleteMany();
  await prisma.aIInteraction.deleteMany();
  await prisma.metricSnapshot.deleteMany();
  await prisma.challengeAttempt.deleteMany();
  await prisma.userMetrics.deleteMany();
  await prisma.badge.deleteMany();
  await prisma.challenge.deleteMany();
  await prisma.user.deleteMany();
  await prisma.team.deleteMany();
  await prisma.billing.deleteMany();
  await prisma.company.deleteMany();

// COMPANIES
const techCorp = await prisma.company.create({
  data: {
    name: 'TechCorp',
    domain: 'techcorp.com',
    plan: 'ENTERPRISE',
    maxUsers: 100,
    activeUsers: 3,
  },
});

const startupInc = await prisma.company.create({
  data: {
    name: 'StartupInc',
    domain: 'startupinc.io',
    plan: 'TEAM',
    maxUsers: 10,
    activeUsers: 2,
  },
});

const adminPassword = await Password.create('Admin@123');
const userPassword = await Password.create('User@123');

// USERS 
const admin = await prisma.user.create({
  data: {
    email: 'admin@techcorp.com',
    password: adminPassword.getHash(),
    name: 'Usuário Admin',
    role: 'TECH_LEAD',
    position: 'Líder Técnico',
    yearsOfExperience: 8,
    preferredLanguages: ['TypeScript', 'Python', 'Go'],
    githubUsername: 'admin',
    companyId: techCorp.id,
    emailVerified: true,
    onboardingCompleted: true,
    currentLevel: 10,
    totalXp: 15000,
    currentStreak: 45,
  },
});

const gabriel = await prisma.user.create({
  data: {
    email: 'gabriel@techcorp.com',
    password: userPassword.getHash(),
    name: 'Gabriel Sarte',
    role: 'JUNIOR',
    position: 'Desenvolvedor Full Stack',
    yearsOfExperience: 1,
    preferredLanguages: ['TypeScript', 'React', 'Node.js'],
    githubUsername: 'gabrielsarte',
    companyId: techCorp.id,
    emailVerified: true,
    onboardingCompleted: true,
    currentLevel: 2,
    totalXp: 350,
    currentStreak: 7,
  },
});

const lucas = await prisma.user.create({
  data: {
    email: 'lucas@techcorp.com',
    password: userPassword.getHash(),
    name: 'Lucas Sarte',
    role: 'PLENO',
    position: 'Desenvolvedor Backend',
    yearsOfExperience: 3,
    preferredLanguages: ['JavaScript', 'Python'],
    githubUsername: 'lucassarte',
    companyId: techCorp.id,
    emailVerified: true,
    onboardingCompleted: true,
    currentLevel: 5,
    totalXp: 2500,
    currentStreak: 15,
  },
});

const daniel = await prisma.user.create({
  data: {
    email: 'daniel@startupinc.io',
    password: userPassword.getHash(),
    name: 'Daniel Sarte',
    role: 'SENIOR',
    position: 'Líder Frontend',
    yearsOfExperience: 6,
    preferredLanguages: ['TypeScript', 'React', 'Vue'],
    githubUsername: 'danielsarte',
    companyId: startupInc.id,
    emailVerified: true,
    onboardingCompleted: true,
    currentLevel: 8,
    totalXp: 8500,
    currentStreak: 30,
  },
});

// BADGES
const bugHunter = await prisma.badge.create({
  data: {
    key: 'bug-hunter',
    name: 'Caçador de Bugs',
    description: 'Encontrou e corrigiu 10 vulnerabilidades de segurança',
    icon: '🛡️',
    rarity: 'RARE',
    requirements: {
      type: 'security_fixes',
      count: 10,
    },
    xpReward: 500,
  },
});

const speedCoder = await prisma.badge.create({
  data: {
    key: 'speed-coder',
    name: 'Programador Veloz',
    description: 'Complete 5 desafios em menos tempo que o estimado',
    icon: '⚡',
    rarity: 'COMMON',
    requirements: {
      type: 'speed_completion',
      count: 5,
    },
    xpReward: 200,
  },
});

const aiMaster = await prisma.badge.create({
  data: {
    key: 'ai-master',
    name: 'Mestre da IA',
    description: 'Mantenha o Índice de Dependência abaixo de 30% por 10 desafios',
    icon: '🤖',
    rarity: 'EPIC',
    requirements: {
      type: 'low_dependency',
      count: 10,
    },
    xpReward: 1000,
  },
});

// CHALLENGES
const apiChallenge = await prisma.challenge.create({
  data: {
    slug: 'todo-api-rest',
    title: 'Construa uma API REST para Lista de Tarefas',
    description: 'Crie uma API REST completa com operações CRUD para uma aplicação de lista de tarefas com autenticação',
    difficulty: 'MEDIUM',
    category: 'BACKEND',
    estimatedMinutes: 60,
    languages: ['javascript', 'typescript', 'python'],
    instructions: `
# Desafio: API REST Lista de Tarefas

## Objetivo
Construir uma API RESTful para uma aplicação de lista de tarefas com os seguintes requisitos:

## Requisitos
1. **Autenticação**
  - Registro de usuário com email/senha
  - Login com token JWT
  - Rotas protegidas

2. **Operações CRUD de Tarefas**
  - Criar uma nova tarefa
  - Listar todas as tarefas (com paginação)
  - Obter uma tarefa específica por ID
  - Atualizar uma tarefa
  - Excluir uma tarefa
  - Marcar tarefa como completa/incompleta

3. **Validação de Dados**
  - Validar todas as entradas
  - Retornar mensagens de erro apropriadas
  - Tratar casos extremos

4. **Segurança**
  - Hash das senhas adequadamente
  - Prevenir injeção SQL
  - Limitação de taxa
  - Configuração CORS

## Endpoints
- POST /auth/register
- POST /auth/login
- GET /todos (paginado, filtrado)
- GET /todos/:id
- POST /todos
- PUT /todos/:id
- DELETE /todos/:id
- PATCH /todos/:id/toggle

## Critérios de Avaliação
- Organização e estrutura do código
- Práticas de segurança
- Tratamento de erros
- Padrões de design de API
- Cobertura de testes
    `,
    starterCode: `// Starter Express.js
const express = require('express');
const app = express();

app.use(express.json());

// TODO: Implementar middleware de autenticação

// TODO: Implementar rotas

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(\`Servidor rodando na porta \${PORT}\`);
});`,
    solution: '// Solução completa oculta',
    testCases: [
      {
        id: 'test-1',
        input: 'POST /auth/register com dados válidos',
        expectedOutput: '201 Created com objeto do usuário',
        weight: 0.15,
        description: 'Registro de usuário deve funcionar',
      },
      {
        id: 'test-2',
        input: 'POST /auth/login com credenciais válidas',
        expectedOutput: '200 OK com token JWT',
        weight: 0.15,
        description: 'Login do usuário deve retornar token',
      },
      {
        id: 'test-3',
        input: 'GET /todos sem autenticação',
        expectedOutput: '401 Unauthorized',
        weight: 0.1,
        description: 'Rotas protegidas devem exigir autenticação',
      },
      {
        id: 'test-4',
        input: 'POST /todos com dados válidos e autenticação',
        expectedOutput: '201 Created com objeto da tarefa',
        weight: 0.2,
        description: 'Criar tarefa deve funcionar',
      },
      {
        id: 'test-5',
        input: 'Tentativa de injeção SQL no título da tarefa',
        expectedOutput: 'Sanitizado ou rejeitado',
        weight: 0.2,
        description: 'Deve prevenir injeção SQL',
      },
      {
        id: 'test-6',
        input: 'GET /todos com parâmetros de paginação',
        expectedOutput: 'Resultados paginados',
        weight: 0.1,
        description: 'Paginação deve funcionar corretamente',
      },
      {
        id: 'test-7',
        input: 'DELETE /todos/:id com usuário errado',
        expectedOutput: '403 Forbidden',
        weight: 0.1,
        description: 'Deve prevenir exclusão não autorizada',
      },
    ],
    hints: [
      {
        trigger: 'after_error_auth',
        message: 'Lembre-se de fazer hash das senhas usando bcrypt antes de armazenar',
        cost: 10,
      },
      {
        trigger: 'after_error_sql',
        message: 'Use consultas parametrizadas ou um ORM para prevenir injeção SQL',
        cost: 20,
      },
      {
        trigger: 'after_30_minutes',
        message: 'Considere usar middleware para verificações de autenticação',
        cost: 15,
      },
    ],
    traps: [
      {
        id: 'trap-sql-injection',
        type: 'security',
        buggedCode: "db.query(`SELECT * FROM todos WHERE user_id = '${userId}'`)",
        correctCode: "db.query('SELECT * FROM todos WHERE user_id = ?', [userId])",
        explanation: 'Interpolação direta de string em consultas SQL permite ataques de injeção SQL',
        detectionPattern: '\\$\\{.*\\}.*SELECT|INSERT|UPDATE|DELETE',
        severity: 'critical',
      },
      {
        id: 'trap-plain-password',
        type: 'security',
        buggedCode: 'user.password = req.body.password',
        correctCode: 'user.password = await bcrypt.hash(req.body.password, 10)',
        explanation: 'Senhas devem ser hasheadas antes do armazenamento',
        detectionPattern: 'password\\s*=\\s*req\\.(body|params|query)',
        severity: 'critical',
      },
      {
        id: 'trap-no-auth-check',
        type: 'security',
        buggedCode: 'app.delete("/todos/:id", (req, res) => { // deletar tarefa })',
        correctCode: 'app.delete("/todos/:id", authenticate, authorize, (req, res) => { // deletar tarefa })',
        explanation: 'Operações destrutivas devem verificar autorização do usuário',
        detectionPattern: 'app\\.(delete|put|patch).*(?!authenticate)',
        severity: 'high',
      },
    ],
    baseXp: 150,
    bonusXp: 75,
    targetMetrics: {
      maxDI: 40,
      minPR: 70,
      minCS: 8,
    },
  },
});

const reactChallenge = await prisma.challenge.create({
  data: {
    slug: 'react-form-validation',
    title: 'Construa um Formulário React com Validação Avançada',
    description: 'Crie um formulário multi-etapas com regras de validação complexas e gerenciamento de estado',
    difficulty: 'HARD',
    category: 'FRONTEND',
    estimatedMinutes: 90,
    languages: ['javascript', 'typescript'],
    instructions: `
# Desafio: Formulário React Multi-Etapas

## Objetivo
Construir um formulário de registro multi-etapas com validação avançada e gerenciamento de estado.

## Requisitos
1. **Navegação Multi-Etapas**
  - Etapa 1: Informações Pessoais
  - Etapa 2: Detalhes da Conta
  - Etapa 3: Preferências
  - Etapa 4: Revisar e Enviar

2. **Regras de Validação**
  - Validação em tempo real
  - Validação entre campos
  - Validação assíncrona (disponibilidade do nome de usuário)
  - Indicador de força da senha

3. **Gerenciamento de Estado**
  - Preservar estado entre etapas
  - Permitir navegação para frente/trás
  - Mostrar indicador de progresso

4. **Recursos de UX**
  - Estados de carregamento
  - Mensagens de erro
  - Feedback de sucesso
  - Acessibilidade (labels ARIA)

## Avaliação
- Arquitetura de componentes
- Abordagem de gerenciamento de estado
- Implementação da validação
- Experiência do usuário
- Reutilização de código
    `,
    starterCode: `import React from 'react';

function MultiStepForm() {
  // TODO: Implementar lógica do formulário
  
  return (
    <div>
      <h1>Formulário de Registro</h1>
      {/* TODO: Implementar etapas do formulário */}
    </div>
  );
}

export default MultiStepForm;`,
    solution: '// Solução completa oculta',
    testCases: [
      {
        id: 'test-1',
        input: 'Navegar por todas as etapas',
        expectedOutput: 'Estado preservado corretamente',
        weight: 0.2,
      },
      {
        id: 'test-2',
        input: 'Enviar email inválido',
        expectedOutput: 'Mostrar erro de validação',
        weight: 0.15,
      },
      {
        id: 'test-3',
        input: 'Senhas não coincidem',
        expectedOutput: 'Erro de validação entre campos',
        weight: 0.15,
      },
      {
        id: 'test-4',
        input: 'Verificar nome de usuário duplicado',
        expectedOutput: 'Validação assíncrona funciona',
        weight: 0.2,
      },
      {
        id: 'test-5',
        input: 'Enviar formulário válido',
        expectedOutput: 'Mensagem de sucesso e dados enviados',
        weight: 0.3,
      },
    ],
    hints: [
      {
        trigger: 'after_error_state',
        message: 'Considere usar useReducer para gerenciamento complexo de estado',
        cost: 15,
      },
      {
        trigger: 'after_error_validation',
        message: 'Você pode usar bibliotecas como Yup ou Zod para esquemas de validação',
        cost: 20,
      },
    ],
    traps: [
      {
        id: 'trap-uncontrolled-inputs',
        type: 'logic',
        buggedCode: '<input name="email" />',
        correctCode: '<input name="email" value={email} onChange={handleChange} />',
        explanation: 'Inputs não controlados perdem estado em re-renderizações',
        detectionPattern: '<input(?!.*value=)(?!.*defaultValue)',
        severity: 'medium',
      },
      {
        id: 'trap-missing-keys',
        type: 'performance',
        buggedCode: 'items.map(item => <div>{item.name}</div>)',
        correctCode: 'items.map(item => <div key={item.id}>{item.name}</div>)',
        explanation: 'Keys ausentes causam re-renderizações desnecessárias',
        detectionPattern: '\\.map\\(.*=>.*(?!key=)',
        severity: 'low',
      },
    ],
    baseXp: 200,
    bonusXp: 100,
    targetMetrics: {
      maxDI: 35,
      minPR: 75,
      minCS: 8.5,
    },
  },
});

const debugChallenge = await prisma.challenge.create({
  data: {
    slug: 'debug-memory-leak',
    title: 'Debugar e Corrigir Vazamento de Memória',
    description: 'Identifique e corrija vazamentos de memória em uma aplicação Node.js',
    difficulty: 'EXPERT',
    category: 'BACKEND',
    estimatedMinutes: 120,
    languages: ['javascript', 'typescript'],
    instructions: `
# Desafio: Debug de Vazamento de Memória

## Cenário
Você herdou uma aplicação Node.js que está sofrendo vazamentos de memória em produção.
A aplicação trava a cada poucas horas devido a erros de falta de memória.

## Sua Tarefa
1. Identificar a fonte dos vazamentos de memória
2. Corrigir os problemas
3. Implementar monitoramento
4. Adicionar testes para prevenir regressão

## A Aplicação
Um serviço de análise em tempo real que:
- Processa eventos de entrada
- Mantém conexões WebSocket
- Faz cache de dados processados
- Gera relatórios

## Ferramentas Disponíveis
- Profiler de heap do Node.js
- Chrome DevTools
- Utilitários de monitoramento de processos

## Critérios de Sucesso
- Uso de memória estável ao longo do tempo
- Sem crescimento do tamanho do heap
- Todas as conexões fechadas adequadamente
- Recursos liberados apropriadamente
    `,
    starterCode: '// Código com bugs e vazamentos de memória fornecido',
    solution: '// Solução corrigida oculta',
    testCases: [
      {
        id: 'test-1',
        input: 'Executar por 10 minutos com carga',
        expectedOutput: 'Uso de memória estável',
        weight: 0.4,
      },
      {
        id: 'test-2',
        input: 'Abrir e fechar 1000 conexões',
        expectedOutput: 'Todos os recursos liberados',
        weight: 0.3,
      },
      {
        id: 'test-3',
        input: 'Processar 100k eventos',
        expectedOutput: 'Sem crescimento de memória',
        weight: 0.3,
      },
    ],
    hints: [
      {
        trigger: 'after_60_minutes',
        message: 'Verifique vazamentos de event listeners e referências circulares',
        cost: 30,
      },
    ],
    traps: [
      {
        id: 'trap-event-listeners',
        type: 'performance',
        buggedCode: 'emitter.on("data", handler)',
        correctCode: 'emitter.once("data", handler) // ou remover listener',
        explanation: 'Event listeners não removidos causam vazamentos de memória',
        detectionPattern: '\\.on\\((?!.*\\.off|\\.removeListener)',
        severity: 'high',
      },
    ],
    baseXp: 500,
    bonusXp: 250,
    targetMetrics: {
      maxDI: 30,
      minPR: 80,
      minCS: 9,
    },
  },
});

//  USER METRICS
await prisma.userMetrics.create({
  data: {
    userId: gabriel.id,
    averageDI: 65.5,
    averagePR: 72.3,
    averageCS: 7.2,
    weeklyTrends: [
      { week: 1, di: 85, pr: 45, cs: 5 },
      { week: 2, di: 75, pr: 60, cs: 6.5 },
      { week: 3, di: 65, pr: 70, cs: 7 },
      { week: 4, di: 55, pr: 85, cs: 8 },
    ],
    metricsByCategory: {
      BACKEND: { avgDI: 60, avgPR: 75, avgCS: 7.5, attempts: 8 },
      FRONTEND: { avgDI: 70, avgPR: 68, avgCS: 6.8, attempts: 5 },
    },
    firstWeekDI: 85,
    currentWeekDI: 55,
    improvement: 30,
    strongAreas: ['depuração', 'testes'],
    weakAreas: ['dependência-ia', 'segurança'],
  },
});

// HALLENGE ATTEMPT
const attempt = await prisma.challengeAttempt.create({
  data: {
    userId: gabriel.id,
    challengeId: apiChallenge.id,
    sessionId: crypto.randomUUID(),
    attemptNumber: 1,
    status: 'COMPLETED',
    currentStep: 7,
    completedAt: new Date(),
    duration: 3600,
    finalCode: '// Código da solução final aqui',
    codeSnapshots: [],
    language: 'typescript',
    testResults: [
      { testId: 'test-1', passed: true, output: 'Sucesso' },
      { testId: 'test-2', passed: true, output: 'Sucesso' },
      { testId: 'test-3', passed: false, output: 'Falha: Sem verificação de autenticação' },
      { testId: 'test-4', passed: true, output: 'Sucesso' },
      { testId: 'test-5', passed: true, output: 'Sucesso' },
    ],
    score: 75,
    passed: true,
    finalDI: 45,
    finalPR: 71,
    finalCS: 7.5,
  },
});

console.log('✅ Seed completed successfully!');
console.log({
  empresas: 2,
  usuários: 4,
  badges: 3,
  desafios: 3,
  tentativas: 1,
});
}

main()
 .catch((e) => {
   console.error('❌ Seed failed:', e);
   process.exit(1);
 })
 .finally(async () => {
   await prisma.$disconnect();
 });
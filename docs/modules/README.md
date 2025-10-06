# Documentação dos Módulos

Esta pasta contém a documentação técnica de todos os módulos da plataforma Journey. A documentação foi desenvolvida como parte do trabalho de conclusão de curso, seguindo padrões acadêmicos para análise de arquitetura de software.

## Módulos Documentados

### Authentication ([auth.md](./auth.md))
Sistema responsável pela autenticação de usuários, controle de acesso e gestão de sessões. Implementa JWT tokens, middleware de autorização e integração com banco de dados.

### Challenges ([challenges.md](./challenges.md))
Módulo central da plataforma que gerencia desafios de programação, execução de código via Judge0, detecção de vulnerabilidades e sistema de pontuação. Inclui análise de qualidade de código e feedback automatizado.

### Metrics ([metrics.md](./metrics.md))
Sistema de telemetria que captura, calcula e analisa o desempenho dos desenvolvedores durante a resolução de desafios. Monitora dependência de IA (DI), taxa de aprovação em testes (PR) e score de checklist de validação (CS), fornecendo insights acionáveis e streaming em tempo real.

### AI ([ai.md](./ai.md))
Módulo avançado de integração com múltiplos provedores de IA (OpenAI, Anthropic) que implementa governança educacional sofisticada. Inclui validação multi-camada de prompts, feedback educacional personalizado, detecção de copy/paste, análise temporal de comportamento e sistema robusto de rate limiting e quotas.

### Gamification ([gamification.md](./gamification.md))
Sistema completo de gamificação que transforma o aprendizado em experiência envolvente através de XP, níveis, badges, streaks e leaderboards. Implementa algoritmo sofisticado de cálculo de pontos baseado em métricas de qualidade, sistema de badges com diferentes raridades, gestão de streaks com proteções inteligentes e rankings competitivos com cache otimizado. Inclui notificações real-time via WebSocket e dashboard consolidado.

## Estrutura da Documentação

Cada módulo foi documentado seguindo um formato consistente que inclui:

**Visão Geral**: Propósito e responsabilidades do módulo
**Arquitetura**: Padrões utilizados, dependências e fluxo de dados
**Estrutura de Arquivos**: Organização do código e componentes
**Componentes Principais**: Classes e serviços mais importantes
**Integrações**: APIs externas e comunicação entre módulos
**Tecnologias**: Frameworks, bibliotecas e ferramentas utilizadas
**Decisões de Design**: Justificativas técnicas e alternativas consideradas
**Limitações**: Problemas conhecidos e oportunidades de melhoria
**Testes**: Estratégia de testes e cobertura
**Exemplos**: Casos de uso práticos com código

## Sobre as Decisões de Design

Uma parte importante da documentação é a análise das decisões arquiteturais tomadas. Para cada escolha técnica significativa, foram documentadas:

- As razões que levaram à decisão
- Outras alternativas que foram consideradas
- Os trade-offs envolvidos
- Referências teóricas que fundamentaram a escolha

Esta abordagem visa demonstrar o processo de pensamento técnico por trás da implementação, não apenas o resultado final.

## Arquitetura Geral

O projeto segue os princípios da Clean Architecture, com separação clara entre camadas de domínio, aplicação, infraestrutura e apresentação. Esta estrutura facilita a manutenibilidade, testabilidade e evolução do sistema.

Os módulos são independentes mas se comunicam através de interfaces bem definidas, permitindo evolução individual sem impactar o resto do sistema.

## Manutenção da Documentação

A documentação deve ser atualizada sempre que houver mudanças significativas na arquitetura ou implementação dos módulos. Particular atenção deve ser dada às seções de limitações conhecidas e débito técnico, que refletem o estado atual do sistema.

Para alterações na documentação, mantenha o mesmo padrão de escrita e nível de detalhe técnico estabelecido nos módulos já documentados.
# DevCoach AI - Postman Collections

Coleções Postman completas para testar todos os módulos da API DevCoach AI com automação total, CI/CD integrado e relatórios avançados.

## 📚 Coleções Disponíveis

### 🎯 **All Tests (Master Collection)** ⭐
- 🚀 Collection master que executa TODOS os testes em ordem
- 🔄 Gerenciamento automático de dependências entre módulos
- 📊 Scripts globais de validação e tracking
- 🎨 Relatório consolidado de execução
- ✅ **Recomendado para execução completa**

### 1. **Auth Module** (`auth-collection.json`)
- ✅ 21 testes organizados
- Registro de usuários
- Login e autenticação
- Gerenciamento de tokens
- Acesso a perfil
- Logout

### 2. **Challenges Module** (`challenges-collection.json`)
- ✅ 19 testes organizados
- Challenge Discovery (listar, filtrar, detalhes)
- Challenge Attempts (iniciar, analisar código, submeter solução)
- Challenge Management CRUD (TECH_LEAD)
- Trap Detection e Code Analysis
- Error Handling com códigos de domínio

### 3. **Metrics Module** (`metrics-collection.json`)
- ✅ 20 testes organizados
- Metrics Tracking (POST /metrics com validação de cálculos)
- Session Metrics (GET /metrics/session/:attemptId com análise de tendências)
- Metrics Streaming (POST/DELETE /metrics/stream com controle de intervalo)
- Domain Error Validation (METRIC_INVALID_ATTEMPT, METRIC_VALIDATION_FAILED, METRIC_DATA_INCONSISTENT, METRIC_ATTEMPT_NOT_FOUND)
- Risk Assessment e Performance Insights

---

## 🌍 Environments Consolidados

Os environments globais funcionam com TODAS as collections:

### **Development** (Recomendado)
- Arquivo: `global-environment.json`
- URL: `http://localhost:3333`
- Timeout: 5s

### **Staging**
- Arquivo: `global-environment-staging.json`
- URL: `https://api-staging.devcoach.ai`
- Timeout: 10s

### **Production**
- Arquivo: `global-environment-production.json`
- URL: `https://api.devcoach.ai`
- Timeout: 15s

**Benefícios:**
- ✅ Variáveis compartilhadas entre todos os módulos
- ✅ Tokens gerenciados automaticamente
- ✅ Sem necessidade de copiar valores manualmente
- ✅ Suporte a múltiplos ambientes

---

## 🚀 Como Usar

### Opção 1: Master Collection (Recomendado)

**A forma mais simples de rodar TODOS os testes:**

#### No Postman:
1. Importe `collections/all-tests-collection.json`
2. Importe `environments/global-environment.json`
3. Selecione o environment no dropdown
4. Click "Run Collection"
5. Aguarde execução completa e veja o relatório

#### Via Newman (CLI):
```bash
# Instalar Newman
npm install -g newman newman-reporter-htmlextra

# Executar todos os testes
newman run .postman/collections/all-tests-collection.json \
  -e .postman/environments/global-environment.json \
  --reporters cli,htmlextra \
  --reporter-htmlextra-export report.html
```

#### Via Scripts Automatizados:
```bash
# Linux/Mac
cd .postman/scripts
./run-all-tests.sh              # Development
./run-all-tests.sh staging      # Staging
./run-all-tests.sh production   # Production

# Windows
cd .postman\scripts
run-all-tests.bat              REM Development
run-all-tests.bat staging      REM Staging
run-all-tests.bat production   REM Production
```

---

### Opção 2: Collections Individuais

Se você quer rodar apenas um módulo específico:

#### Passo 1: Importar Collections

**No Postman:**
1. Clique em **Import**
2. Selecione os arquivos disponíveis em `.postman/collections/`

#### Passo 2: Importar Environment

**No Postman:**
1. Clique em **Environments** → **Import**
2. Selecione: `.postman/environments/global-environment.json`

#### Passo 3: Executar

1. Selecione o environment no dropdown
2. Execute as collections em ordem de dependência

---

## 🎯 Features da Master Collection

### 1. **Scripts Globais de Pre-Request**
Executam automaticamente ANTES de cada request:

- ✅ Adiciona headers comuns (`User-Agent`, `Accept`)
- ✅ Gera `Request-ID` único para rastreamento
- ✅ Injeta token de autenticação automaticamente
- ✅ Registra logs detalhados no console
- ✅ Mascara dados sensíveis (passwords, tokens)

### 2. **Scripts Globais de Test**
Executam automaticamente DEPOIS de cada request:

- ✅ Valida response time (< 5s)
- ✅ Valida Content-Type (JSON)
- ✅ Rastreia estatísticas (sucessos/falhas)
- ✅ Extrai e loga erros automaticamente
- ✅ Preview do response body

### 3. **Relatório Consolidado**
No final da execução, gera:

```
═══════════════════════════════════════════════════════════════
📊 TEST EXECUTION SUMMARY
═══════════════════════════════════════════════════════════════

🌍 Environment Configuration:
   Environment: development
   API URL: http://localhost:3333
   User ID: usr_abc123
   Auth Token: Set ✅

📊 Execution Statistics:
   Total Requests: 45
   Successful: 42 ✅
   Failed: 3 ❌
   Success Rate: 93.33%

📦 Module Status:
   ✅ Authentication Module: Complete
   ✅ Gamification Module: Complete
   ✅ Metrics Module: Complete

═══════════════════════════════════════════════════════════════
🎉 All tests completed successfully!
═══════════════════════════════════════════════════════════════
```

---

## 🔧 Integração CI/CD

### GitHub Actions

Workflow configurado para rodar os testes automaticamente:

**Localização:** `.github/workflows/postman-tests.yml`

**Triggers:**
- ✅ Push para `main` ou `develop`
- ✅ Pull Requests para `main` ou `develop`
- ✅ Execução manual via workflow_dispatch

**O que faz:**
1. Sobe banco PostgreSQL em container
2. Roda migrations e seeds
3. Inicia API server
4. Executa TODOS os testes via Newman
5. Gera relatórios HTML/JSON
6. Faz upload dos relatórios como artifacts
7. Adiciona summary no PR

**Exemplo de uso:**
```yaml
# O workflow roda automaticamente, mas você pode executar manualmente:
# GitHub → Actions → "API Tests (Postman/Newman)" → Run workflow
```

**Ver resultados:**
1. Acesse a aba "Actions" no GitHub
2. Clique na execução
3. Baixe os artifacts com os relatórios HTML

---

## 📊 Scripts Automatizados

### Linux/Mac: `run-all-tests.sh`

```bash
cd .postman/scripts
./run-all-tests.sh [environment]

# Exemplos:
./run-all-tests.sh              # Development (padrão)
./run-all-tests.sh staging      # Staging
./run-all-tests.sh production   # Production
```

**Features:**
- ✅ Colorização no terminal
- ✅ Validação de dependências
- ✅ Relatórios HTML gerados automaticamente
- ✅ Abre relatório no browser ao final
- ✅ Exit code apropriado para CI/CD

### Windows: `run-all-tests.bat`

```cmd
cd .postman\scripts
run-all-tests.bat [environment]

REM Exemplos:
run-all-tests.bat              REM Development (padrão)
run-all-tests.bat staging      REM Staging
run-all-tests.bat production   REM Production
```

**Features:**
- ✅ Suporte completo para Windows
- ✅ Mesmo comportamento do script Linux
- ✅ Abre relatório no browser ao final

---

## 📋 Ordem de Execução

### Automática (Master Collection)
A ordem é gerenciada automaticamente:

```
1. Health Check → Verifica se API está rodando
2. Módulos configurados → Executam em ordem de dependência
3. Final Summary → Gera relatório consolidado
```

### Manual (Collections Individuais)

Se rodar manualmente, siga esta ordem:

```
1. Auth Module (primeiro)
   ├─ Register → Cria usuário
   ├─ Login → Obtém tokens
   └─ Tokens salvos automaticamente no environment

2. Outros módulos
   └─ Usam tokens do Auth automaticamente
```

---

## 🧪 Usando Newman (CLI)

### Instalar Newman:
```bash
npm install -g newman newman-reporter-htmlextra
```

### Executar Master Collection:
```bash
newman run .postman/collections/all-tests-collection.json \
  -e .postman/environments/global-environment.json \
  --reporters cli,json,htmlextra \
  --reporter-json-export ./reports/report.json \
  --reporter-htmlextra-export ./reports/report.html \
  --reporter-htmlextra-logs \
  --color on
```

### Executar Collection Específica:
```bash
# Exemplo: Auth Module
newman run .postman/collections/auth-collection.json \
  -e .postman/environments/global-environment.json \
  --reporters cli,htmlextra

# Outros módulos seguem o mesmo padrão
newman run .postman/collections/{module}-collection.json \
  -e .postman/environments/global-environment.json \
  --reporters cli,htmlextra
```

---

## 📊 Relatórios

### Tipos de Relatórios Gerados

#### 1. **CLI Reporter** (Console)
- Saída colorida no terminal
- Resumo de testes passados/falhados
- Tempo de execução

#### 2. **JSON Reporter**
- Arquivo JSON com todos os detalhes
- Útil para parsing e integração
- Localização: `./reports/*.json`

#### 3. **HTML Extra Reporter**
- Relatório visual detalhado
- Gráficos e estatísticas
- Request/Response completos
- Localização: `./reports/*.html`

### Visualizar Relatórios

```bash
# Linux/Mac
open ./reports/all-tests-report.html

# Windows
start ./reports/all-tests-report.html

# Ou abra manualmente no navegador
```

---

## ⚠️ Troubleshooting

### Erro: "Newman not found"

**Solução:**
```bash
npm install -g newman newman-reporter-htmlextra
```

### Erro: "Unauthorized" (401)

**Causa:** Token inválido ou expirado

**Solução:**
1. Execute novamente o Auth Module → Login
2. Use a Master Collection (gerencia tokens automaticamente)
3. Verifique se o environment está selecionado

### Erro: "Connection refused" / "ECONNREFUSED"

**Causa:** API não está rodando

**Solução:**
```bash
# Em outro terminal, inicie a API
npm run dev

# Aguarde até ver: "Server listening on port 3333"
```

### Erro: "Not Found" (404)

**Causa:** Rota incorreta ou módulo não implementado

**Solução:**
1. Verifique os logs do servidor
2. Confirme que a rota existe na API
3. Verifique o `baseUrl` no environment

### Tests estão falhando mas API funciona

**Causa:** Estrutura de resposta mudou

**Solução:**
1. Verifique a resposta real no Postman
2. Ajuste os scripts de teste conforme necessário
3. Reporte para atualizar a collection

---

## 🔗 Estrutura de Arquivos

```
.postman/
├── README.md                                    # Este arquivo
├── collections/                                 # Collections organizadas
│   ├── all-tests-collection.json               # Master collection
│   ├── auth-collection.json                    # Auth module
│   ├── challenges-collection.json              # Challenges module
│   └── metrics-collection.json                 # Metrics module
├── environments/                                # Environments consolidados
│   ├── global-environment.json                 # Development (recomendado)
│   ├── global-environment-staging.json         # Staging
│   └── global-environment-production.json      # Production
├── scripts/                                     # Scripts de automação
│   ├── run-all-tests.sh                        # Linux/Mac
│   └── run-all-tests.bat                       # Windows
└── reports/                                     # Relatórios gerados (gitignored)
    └── [timestamp]/
        ├── all-tests-report.html
        ├── all-tests-report.json
        ├── auth-report.html
        ├── auth-report.json
        ├── challenges-report.html
        ├── challenges-report.json
        ├── metrics-report.html
        └── metrics-report.json
```

---

## 📝 Atualizando as Collections

Se você fizer alterações nas collections no Postman:

1. **Export Collection:**
   - Right-click na collection → Export
   - Escolha "Collection v2.1"
   - Salve em `.postman/collections/`

2. **Export Environment:**
   - Environments → Click no environment
   - Export → Salve em `.postman/environments/`

3. **Commit as mudanças:**
   ```bash
   git add .postman/
   git commit -m "chore(postman): update collections"
   git push
   ```

---

## 🎯 Melhores Práticas

### ✅ DO:
- Use a **Master Collection** para execução completa
- Use **global environments** (não os antigos por módulo)
- Execute via **scripts automatizados** para consistência
- Rode no **CI/CD** para validação contínua
- Revise os **relatórios HTML** para debugging

### ❌ DON'T:
- Não copie tokens manualmente entre environments
- Não rode collections fora de ordem (Auth sempre primeiro)
- Não ignore falhas nos testes
- Não modifique environments diretamente (use o Postman)
- Não commite o diretório `reports/` (está no .gitignore)

---

## 🔗 Links Úteis

- [Postman Documentation](https://learning.postman.com/docs)
- [Newman Documentation](https://learning.postman.com/docs/collections/using-newman-cli/command-line-integration-with-newman/)
- [Collection Runner](https://learning.postman.com/docs/collections/running-collections/intro-to-collection-runs/)
- [Newman Reporter HTMLExtra](https://github.com/DannyDainton/newman-reporter-htmlextra)

---

## 📞 Suporte

Se encontrar problemas:

1. ✅ Verifique se o servidor está rodando: `npm run dev`
2. ✅ Confirme que os tokens estão válidos (rode Auth Module)
3. ✅ Verifique os logs do servidor para erros
4. ✅ Revise a documentação da API
5. ✅ Rode via Master Collection para automação completa
6. ✅ Verifique os relatórios HTML gerados

---

---

**Versão:** 1.0.0
**Última Atualização:** 2025-10-01
**Compatibilidade:** Postman 10.x+, Newman 6.x+

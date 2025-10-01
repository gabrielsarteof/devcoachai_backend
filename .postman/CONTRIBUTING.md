# Contributing Guide - Adding New Test Modules

Este guia explica como adicionar novos módulos de teste à infraestrutura Postman mantendo os padrões estabelecidos.

---

## 📋 Overview

A infraestrutura de testes Postman segue um padrão modular onde:
- Cada módulo da API tem sua própria collection
- Environments são compartilhados globalmente
- A Master Collection orquestra a execução
- Scripts automatizados rodam tudo localmente
- CI/CD executa no GitHub Actions

---

## 🎯 Checklist para Adicionar Novo Módulo

Quando adicionar um novo módulo (ex: Gamification, Metrics, Challenges):

### ✅ 1. Criar Collection do Módulo

**Arquivo:** `.postman/collections/{module}-collection.json`

**Estrutura:**
```json
{
  "info": {
    "_postman_id": "unique-module-id",
    "name": "DevCoach AI - {Module Name} Module",
    "description": "Descrição do módulo e seus testes",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "📂 Grupo de Testes",
      "item": [
        {
          "name": "Nome do Teste",
          "event": [
            {
              "listen": "prerequest",
              "script": {
                "exec": ["// Scripts antes do request"],
                "type": "text/javascript"
              }
            },
            {
              "listen": "test",
              "script": {
                "exec": [
                  "pm.test('Descrição do teste', function () {",
                  "    pm.response.to.have.status(200);",
                  "});",
                  "",
                  "console.log('✅ Mensagem de sucesso');"
                ],
                "type": "text/javascript"
              }
            }
          ],
          "request": {
            "method": "GET",
            "header": [
              {
                "key": "Authorization",
                "value": "Bearer {{accessToken}}"
              }
            ],
            "url": {
              "raw": "{{baseUrl}}/api/{module}/endpoint",
              "host": ["{{baseUrl}}"],
              "path": ["api", "{module}", "endpoint"]
            }
          }
        }
      ]
    }
  ]
}
```

**Padrões obrigatórios:**
- ✅ Use emojis nos nomes dos grupos (📂 🔐 🎮 📊 ✅)
- ✅ Sempre use `{{baseUrl}}` para URLs
- ✅ Use `{{accessToken}}` para autenticação
- ✅ Inclua `console.log` com emoji de status (✅ ❌ ⚠️)
- ✅ Testes devem ter descrições claras
- ✅ Salve IDs importantes no environment com `pm.environment.set()`

---

### ✅ 2. Adicionar à Master Collection

**Arquivo:** `.postman/collections/all-tests-collection.json`

**Localização:** Entre o último módulo e "Final Summary"

**Adicionar:**
```json
{
  "name": "🎮 {N}. {Module Name} Module",
  "description": "Descrição do que este módulo testa",
  "item": [
    {
      "name": "Endpoint Principal",
      "event": [
        {
          "listen": "test",
          "script": {
            "exec": [
              "pm.test('Teste básico do módulo', function () {",
              "    pm.response.to.have.status(200);",
              "});",
              "",
              "console.log('✅ Módulo testado com sucesso');"
            ],
            "type": "text/javascript"
          }
        }
      ],
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{accessToken}}"
          }
        ],
        "url": {
          "raw": "{{baseUrl}}/api/{module}/main-endpoint",
          "host": ["{{baseUrl}}"],
          "path": ["api", "{module}", "main-endpoint"]
        }
      }
    }
  ]
}
```

**Importante:**
- Numerar corretamente (0. Health Check, 1. Auth, 2. Novo Módulo, ...)
- Escolher emoji apropriado (🎮 📊 🏆 📈 etc)
- Manter estrutura simples (1-3 requests principais)

---

### ✅ 3. Atualizar Environment Global

**Arquivo:** `.postman/environments/global-environment.json`

**Adicionar variáveis necessárias:**
```json
{
  "key": "moduleSpecificId",
  "value": "",
  "description": "ID específico do módulo (automatically set)",
  "type": "default",
  "enabled": true
}
```

**Padrões:**
- Use nomes descritivos: `challengeId`, `attemptId`, `notificationId`
- Sempre com `value: ""`
- Descrição indica se é auto-set ou manual
- `type: "default"` para IDs, `type: "secret"` para tokens

**Replicar em:**
- `global-environment-staging.json`
- `global-environment-production.json`

---

### ✅ 4. Atualizar Scripts Shell

**Arquivo:** `.postman/scripts/run-all-tests.sh`

**Adicionar ANTES do comentário "# Generate summary":**

```bash
run_collection \
    "{Module Name} Module" \
    "${COLLECTIONS_DIR}/{module}-collection.json" \
    "{module}"
TOTAL_TESTS=$((TOTAL_TESTS + 1))
```

**Exemplo:**
```bash
run_collection \
    "Gamification Module" \
    "${COLLECTIONS_DIR}/gamification-collection.json" \
    "gamification"
TOTAL_TESTS=$((TOTAL_TESTS + 1))
```

---

### ✅ 5. Atualizar Scripts Batch (Windows)

**Arquivo:** `.postman/scripts/run-all-tests.bat`

**Adicionar ANTES do comentário "REM Generate summary":**

```batch
REM Run {Module} Collection
echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo Running: {Module Name} Module
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.

newman run "%COLLECTIONS_DIR%\{module}-collection.json" ^
    -e "%ENV_FILE%" ^
    --reporters cli,json,htmlextra ^
    --reporter-json-export "%REPORTS_DIR%\%TIMESTAMP%\{module}-report.json" ^
    --reporter-htmlextra-export "%REPORTS_DIR%\%TIMESTAMP%\{module}-report.html" ^
    --reporter-htmlextra-title "{Module Name} Module" ^
    --color on ^
    --delay-request 100

if %errorlevel% equ 0 (
    echo [PASSED] {Module Name} Module
) else (
    echo [FAILED] {Module Name} Module
    set /a FAILED_TESTS+=1
)
set /a TOTAL_TESTS+=1
```

---

### ✅ 6. Atualizar GitHub Actions

**Arquivo:** `.github/workflows/postman-tests.yml`

**Adicionar ANTES do step "Upload Test Reports":**

```yaml
      - name: 🧪 Run {Module} Module Tests
        if: success() || failure()
        run: |
          newman run .postman/collections/{module}-collection.json \
            -e .postman/environments/global-environment.json \
            --env-var "baseUrl=http://localhost:3333" \
            --reporters cli,json \
            --reporter-json-export ./newman/{module}-report.json \
            --color on
```

**Usar emoji apropriado:**
- 🎮 Gamification
- 📊 Metrics
- 🏆 Challenges
- 📈 Analytics

---

### ✅ 7. Atualizar README

**Arquivo:** `.postman/README.md`

**Seção "📚 Coleções Disponíveis":**

Adicionar após o último módulo:

```markdown
### {N}. **{Module Name} Module** (`{module}-collection.json`)
- ✅ {X} testes organizados
- Feature 1
- Feature 2
- Feature 3
- Feature N
```

**Seção "🔗 Estrutura de Arquivos":**

Adicionar na árvore:

```
├── collections/
│   ├── all-tests-collection.json
│   ├── auth-collection.json
│   └── {module}-collection.json              # ⭐ Novo
```

E nos reports:

```
└── reports/
    └── [timestamp]/
        ├── all-tests-report.html
        ├── auth-report.html
        └── {module}-report.html               # ⭐ Novo
```

---

## 🎨 Padrões de Código

### Nomenclatura

**Collections:**
- `{module}-collection.json` (kebab-case)
- Exemplos: `auth-collection.json`, `gamification-collection.json`

**Environment Variables:**
- `camelCase` para IDs e dados
- Exemplos: `userId`, `challengeId`, `attemptId`, `notificationId`

**Folders nos collections:**
- Emoji + Nome descritivo
- Exemplos: `🔐 User Registration`, `🎮 Dashboard`, `📊 Metrics Tracking`

### Scripts de Teste

**Estrutura padrão:**
```javascript
pm.test('Descrição clara do que está sendo testado', function () {
    pm.response.to.have.status(200);
});

pm.test('Valida estrutura da resposta', function () {
    const responseJson = pm.response.json();
    pm.expect(responseJson).to.have.property('success', true);
    pm.expect(responseJson.data).to.be.an('object');
});

// Salvar IDs importantes
const responseJson = pm.response.json();
if (responseJson.data && responseJson.data.id) {
    pm.environment.set('moduleResourceId', responseJson.data.id);
}

console.log('✅ Recurso criado/recuperado com sucesso');
```

### Mensagens de Console

**Padrões:**
- ✅ Sucesso
- ❌ Erro/Falha
- ⚠️ Aviso
- 📧 Email/Comunicação
- 🔐 Autenticação/Segurança
- 📊 Dados/Estatísticas

---

## 📝 Exemplo Completo: Adicionando Gamification

### 1. Collection Individual
Criar `.postman/collections/gamification-collection.json`:
```json
{
  "info": {
    "_postman_id": "gam-1234-5678-9abc",
    "name": "DevCoach AI - Gamification Module",
    "description": "Testes completos do módulo de gamificação..."
  },
  "item": [
    {
      "name": "🎮 Dashboard",
      "item": [...]
    },
    {
      "name": "🏆 Badges",
      "item": [...]
    }
  ]
}
```

### 2. Master Collection
Adicionar em `all-tests-collection.json`:
```json
{
  "name": "🎮 2. Gamification Module",
  "description": "Test gamification features",
  "item": [
    {
      "name": "Get Dashboard",
      "request": {...}
    }
  ]
}
```

### 3. Environment
Adicionar em `global-environment.json`:
```json
{
  "key": "testBadgeId",
  "value": "",
  "description": "Badge ID for testing (automatically set)",
  "type": "default",
  "enabled": true
}
```

### 4. Shell Script
Adicionar em `run-all-tests.sh`:
```bash
run_collection \
    "Gamification Module" \
    "${COLLECTIONS_DIR}/gamification-collection.json" \
    "gamification"
TOTAL_TESTS=$((TOTAL_TESTS + 1))
```

### 5. Batch Script
Adicionar em `run-all-tests.bat`:
```batch
newman run "%COLLECTIONS_DIR%\gamification-collection.json" ^
    -e "%ENV_FILE%" ^
    --reporters cli,json,htmlextra ^
    --reporter-json-export "%REPORTS_DIR%\%TIMESTAMP%\gamification-report.json" ^
    --reporter-htmlextra-export "%REPORTS_DIR%\%TIMESTAMP%\gamification-report.html"
```

### 6. GitHub Actions
Adicionar em `postman-tests.yml`:
```yaml
      - name: 🧪 Run Gamification Module Tests
        if: success() || failure()
        run: |
          newman run .postman/collections/gamification-collection.json \
            -e .postman/environments/global-environment.json \
            --env-var "baseUrl=http://localhost:3333" \
            --reporters cli,json \
            --reporter-json-export ./newman/gamification-report.json \
            --color on
```

### 7. README
Adicionar documentação:
```markdown
### 2. **Gamification Module** (`gamification-collection.json`)
- ✅ 23 testes organizados
- Dashboard de progresso
- Sistema de badges
- Leaderboard e rankings
```

---

## ✅ Checklist Final

Antes de fazer commit, verifique:

- [ ] Collection individual criada em `.postman/collections/`
- [ ] Collection adicionada à Master Collection
- [ ] Variáveis necessárias adicionadas aos 3 global environments
- [ ] `run-all-tests.sh` atualizado
- [ ] `run-all-tests.bat` atualizado
- [ ] `postman-tests.yml` atualizado
- [ ] README atualizado
- [ ] Testes validam status codes corretos
- [ ] Environment variables são salvas corretamente
- [ ] Console logs usam emojis apropriados
- [ ] Nomenclatura segue padrões (kebab-case, camelCase)
- [ ] Testado localmente com Newman
- [ ] Testado no Postman UI

---

## 🚀 Testando Localmente

Após adicionar o módulo:

```bash
# Teste a collection individual
newman run .postman/collections/{module}-collection.json \
  -e .postman/environments/global-environment.json

# Teste a Master Collection
newman run .postman/collections/all-tests-collection.json \
  -e .postman/environments/global-environment.json

# Teste os scripts
cd .postman/scripts
./run-all-tests.sh  # Linux/Mac
run-all-tests.bat   # Windows
```

---

## 📞 Dúvidas?

Consulte os módulos existentes como referência:
- **Auth Module**: Exemplo completo e robusto
- **Master Collection**: Veja como módulos são organizados
- **Scripts**: Observe o padrão de execução

---

**Última atualização:** 2025-10-01
**Versão:** 2.0.0

export const messages = {
  validation: {
    required: 'Campo obrigatório',
    email: 'Email inválido',
    emailTooShort: 'Email deve ter no mínimo 5 caracteres',
    emailTooLong: 'Email deve ter no máximo 255 caracteres',
    passwordTooShort: 'Senha deve ter no mínimo 8 caracteres',
    passwordTooLong: 'Senha deve ter no máximo 100 caracteres',
    passwordUppercase: 'Senha deve conter pelo menos uma letra maiúscula',
    passwordLowercase: 'Senha deve conter pelo menos uma letra minúscula',
    passwordNumber: 'Senha deve conter pelo menos um número',
    passwordSpecial: 'Senha deve conter pelo menos um caractere especial',
    nameTooShort: 'Nome deve ter no mínimo 2 caracteres',
    nameTooLong: 'Nome deve ter no máximo 100 caracteres',
    invalidUrl: 'URL inválida',
    invalidUuid: 'ID inválido',
    minValue: 'Valor mínimo é',
    maxValue: 'Valor máximo é',
    atLeastOneField: 'Pelo menos um campo deve ser fornecido',
  },

  challenge: {
    notFound: 'Desafio não encontrado',
    alreadyCompleted: 'Desafio já completado',
    locked: 'Desafio bloqueado para seu nível',
    timeExpired: 'Tempo esgotado',
    testsFailed: 'Testes falharam',
    trapDetected: 'Vulnerabilidade detectada no código',
  },

  metrics: {
    highDependency: 'Dependência alta de IA detectada',
    lowPassRate: 'Taxa de acerto abaixo do esperado',
    checklistIncomplete: 'Checklist de validação incompleto',
    improvement: 'Excelente progresso!',
  },

  certificate: {
    notEligible: 'Você ainda não é elegível para certificação',
    expired: 'Certificado expirado',
    invalid: 'Certificado inválido',
    issued: 'Certificado emitido com sucesso',
    verified: 'Certificado válido e verificado',
  },

  general: {
    success: 'Operação realizada com sucesso',
    error: 'Erro ao processar solicitação',
    notFound: 'Recurso não encontrado',
    forbidden: 'Acesso negado',
    serverError: 'Erro interno do servidor',
  },
};
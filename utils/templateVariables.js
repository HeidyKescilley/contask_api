// /utils/templateVariables.js
// Variáveis de template disponíveis no assunto/corpo das automações de e-mail.
// Sintaxe: {{{NOME_DA_VARIAVEL}}}. Tokens desconhecidos são deixados como estão.

const AVAILABLE_VARIABLES = ["RAZAO_SOCIAL", "MES_PASSADO", "MES_ATUAL"];

function formatMonthYear(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${month}/${date.getFullYear()}`;
}

/**
 * Resolve os valores das variáveis pra uma empresa, numa data de referência
 * (normalmente "agora", o momento do envio).
 */
function resolveDispatchVariables(company, referenceDate = new Date()) {
  const currentMonthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const previousMonthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);

  return {
    RAZAO_SOCIAL: company?.name || "",
    MES_ATUAL: formatMonthYear(currentMonthDate),
    MES_PASSADO: formatMonthYear(previousMonthDate),
  };
}

/**
 * Substitui os tokens {{{VARIAVEL}}} encontrados em `text` pelos valores em `vars`.
 * Tokens que não estão em `vars` são deixados como estão (não quebram o template).
 */
function substituteVariables(text, vars) {
  if (!text) return text;
  return text.replace(/\{\{\{(\w+)\}\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match
  );
}

module.exports = { AVAILABLE_VARIABLES, resolveDispatchVariables, substituteVariables };

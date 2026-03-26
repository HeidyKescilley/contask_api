// /utils/fiscalCompletionChecker.js
// Wrapper de compatibilidade — delega para o checker genérico.
const { checkAndUpdateCompletion } = require("./completionChecker");

async function checkAndUpdateFiscalCompletion(companyId, taxPeriod) {
  return checkAndUpdateCompletion(companyId, taxPeriod, "Fiscal");
}

module.exports = { checkAndUpdateFiscalCompletion };

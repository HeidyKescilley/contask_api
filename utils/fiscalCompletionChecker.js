// /utils/fiscalCompletionChecker.js
// Verifica se todos os impostos e obrigações de uma empresa estão concluídos
// e atualiza fiscalCompletedAt automaticamente.

const { Op } = require("sequelize");
const Company = require("../models/Company");
const CompanyTaxStatus = require("../models/CompanyTaxStatus");
const CompanyObligationStatus = require("../models/CompanyObligationStatus");
const AccessoryObligation = require("../models/AccessoryObligation");
const cacheManager = require("./CacheManager");
const { getCurrentPeriod } = require("./businessDays");
const logger = require("../logger/logger");

/**
 * Após alteração de status de imposto ou obrigação, verifica se todos os
 * impostos e obrigações ativas da empresa estão concluídos e atualiza
 * fiscalCompletedAt de acordo.
 *
 * Regra:
 * - Empresa NÃO zerada: concluída quando todos os impostos e obrigações
 *   atribuídos (não desabilitados) estão com status "completed".
 * - Empresa ZERADA: concluída quando todas as obrigações com sendWhenZeroed=true
 *   estão concluídas (impostos são desabilitados automaticamente).
 *
 * @param {number} companyId
 * @param {string} taxPeriod - Período YYYY-MM do imposto alterado
 */
async function checkAndUpdateFiscalCompletion(companyId, taxPeriod) {
  try {
    const company = await Company.findByPk(companyId, {
      attributes: ["id", "fiscalCompletedAt"],
      raw: true,
    });
    if (!company) return;

    // Determinar períodos ativos das obrigações fiscais
    const obligations = await AccessoryObligation.findAll({
      where: { department: "Fiscal" },
      attributes: ["id", "periodicity"],
      raw: true,
    });

    const periodSet = new Set([taxPeriod]);
    for (const obl of obligations) {
      periodSet.add(getCurrentPeriod(obl));
    }

    // Contar statuses ativos (não disabled, não excluídos manualmente) e pendentes
    const [totalTaxes, pendingTaxes, totalObls, pendingObls] = await Promise.all([
      CompanyTaxStatus.count({
        where: {
          companyId, period: taxPeriod,
          isManuallyExcluded: false,
          status: { [Op.ne]: "disabled" },
        },
      }),
      CompanyTaxStatus.count({
        where: { companyId, period: taxPeriod, isManuallyExcluded: false, status: "pending" },
      }),
      CompanyObligationStatus.count({
        where: {
          companyId,
          period: { [Op.in]: [...periodSet] },
          isManuallyExcluded: false,
          status: { [Op.ne]: "disabled" },
        },
      }),
      CompanyObligationStatus.count({
        where: {
          companyId,
          period: { [Op.in]: [...periodSet] },
          isManuallyExcluded: false,
          status: "pending",
        },
      }),
    ]);

    const total = totalTaxes + totalObls;
    const pending = pendingTaxes + pendingObls;

    // Só considera concluída se há algo para concluir E nada está pendente
    const isComplete = total > 0 && pending === 0;
    const wasComplete = company.fiscalCompletedAt != null;

    if (isComplete && !wasComplete) {
      await Company.update({ fiscalCompletedAt: new Date() }, { where: { id: companyId } });
      cacheManager.invalidateByPrefix("my_companies_");
      cacheManager.invalidateByPrefix("dashboard_my_companies_");
    } else if (!isComplete && wasComplete) {
      await Company.update({ fiscalCompletedAt: null }, { where: { id: companyId } });
      cacheManager.invalidateByPrefix("my_companies_");
      cacheManager.invalidateByPrefix("dashboard_my_companies_");
    }
  } catch (err) {
    logger.error(`checkAndUpdateFiscalCompletion(${companyId}): ${err.message}`);
  }
}

module.exports = { checkAndUpdateFiscalCompletion };

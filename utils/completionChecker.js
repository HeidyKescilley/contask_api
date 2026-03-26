// /utils/completionChecker.js
// Checker genérico de conclusão — funciona para qualquer departamento.

const { Op } = require("sequelize");
const Company = require("../models/Company");
const CompanyTax = require("../models/CompanyTax");
const CompanyTaxStatus = require("../models/CompanyTaxStatus");
const CompanyObligationStatus = require("../models/CompanyObligationStatus");
const AccessoryObligation = require("../models/AccessoryObligation");
const cacheManager = require("./CacheManager");
const { getCurrentPeriod } = require("./businessDays");
const { getDeptConfig } = require("../config/departmentConfig");
const logger = require("../logger/logger");

/**
 * Após alteração de status de imposto ou obrigação, verifica se todos os
 * impostos e obrigações ativas da empresa estão concluídos e atualiza
 * o campo completedAt do departamento de acordo.
 *
 * @param {number} companyId
 * @param {string} taxPeriod - Período YYYY-MM do item alterado
 * @param {string} department - "Fiscal" | "Pessoal" | "Contábil"
 */
async function checkAndUpdateCompletion(companyId, taxPeriod, department) {
  try {
    const cfg = getDeptConfig(department);
    if (!cfg?.completedAt || !cfg?.obligationsEnabled) return;

    // Busca IDs de impostos e obrigações do departamento
    const [deptTaxes, deptObls] = await Promise.all([
      CompanyTax.findAll({ where: { department }, attributes: ["id"], raw: true }),
      AccessoryObligation.findAll({ where: { department }, attributes: ["id", "periodicity"], raw: true }),
    ]);

    const taxIds = deptTaxes.map((t) => t.id);
    const oblIds = deptObls.map((o) => o.id);

    // Monta conjunto de períodos relevantes (mensal + quaisquer períodos especiais)
    const periodSet = new Set([taxPeriod]);
    for (const obl of deptObls) {
      periodSet.add(getCurrentPeriod(obl));
    }

    // Conta totais e pendentes
    const [totalTaxes, pendingTaxes, totalObls, pendingObls] = await Promise.all([
      taxIds.length
        ? CompanyTaxStatus.count({
            where: {
              companyId,
              taxId: taxIds,
              period: taxPeriod,
              isManuallyExcluded: false,
              status: { [Op.ne]: "disabled" },
            },
          })
        : 0,
      taxIds.length
        ? CompanyTaxStatus.count({
            where: {
              companyId,
              taxId: taxIds,
              period: taxPeriod,
              isManuallyExcluded: false,
              status: "pending",
            },
          })
        : 0,
      oblIds.length
        ? CompanyObligationStatus.count({
            where: {
              companyId,
              obligationId: oblIds,
              period: { [Op.in]: [...periodSet] },
              isManuallyExcluded: false,
              status: { [Op.ne]: "disabled" },
            },
          })
        : 0,
      oblIds.length
        ? CompanyObligationStatus.count({
            where: {
              companyId,
              obligationId: oblIds,
              period: { [Op.in]: [...periodSet] },
              isManuallyExcluded: false,
              status: "pending",
            },
          })
        : 0,
    ]);

    const total = totalTaxes + totalObls;
    const pending = pendingTaxes + pendingObls;

    // Só considera concluída se há algo para concluir E nada está pendente
    const isComplete = total > 0 && pending === 0;

    const company = await Company.findByPk(companyId, {
      attributes: ["id", cfg.completedAt],
      raw: true,
    });
    if (!company) return;

    const wasComplete = company[cfg.completedAt] != null;

    if (isComplete && !wasComplete) {
      await Company.update({ [cfg.completedAt]: new Date() }, { where: { id: companyId } });
      cacheManager.invalidateByPrefix("my_companies_");
      cacheManager.invalidateByPrefix("dashboard_my_companies_");
    } else if (!isComplete && wasComplete) {
      await Company.update({ [cfg.completedAt]: null }, { where: { id: companyId } });
      cacheManager.invalidateByPrefix("my_companies_");
      cacheManager.invalidateByPrefix("dashboard_my_companies_");
    }
  } catch (err) {
    logger.error(`checkAndUpdateCompletion(${companyId}, ${department}): ${err.message}`);
  }
}

module.exports = { checkAndUpdateCompletion };

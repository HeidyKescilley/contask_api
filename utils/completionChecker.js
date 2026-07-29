// /utils/completionChecker.js
// Checker genérico de conclusão — funciona para qualquer departamento.

const { Op } = require("sequelize");
const Company = require("../models/Company");
const CompanyTax = require("../models/CompanyTax");
const CompanyTaxStatus = require("../models/CompanyTaxStatus");
const CompanyObligationStatus = require("../models/CompanyObligationStatus");
const AccessoryObligation = require("../models/AccessoryObligation");
const cacheManager = require("./CacheManager");
const { getObligationPeriodForDisplay, obligationIsActiveForPeriod } = require("./businessDays");
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
// Retorna o período do mês anterior no formato YYYY-MM
// Na contabilidade, sempre trabalhamos com a competência anterior (mês passado)
function getCurrentMonthPeriod() {
  const d = new Date();
  d.setDate(1); // evita erro em dias 29-31 ao retroceder mês
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

async function checkAndUpdateCompletion(companyId, taxPeriod, department) {
  try {
    // Só atualiza as flags da empresa para o mês corrente.
    // Alterações em períodos futuros (competências) não devem sobrescrever o estado atual.
    if (taxPeriod !== getCurrentMonthPeriod()) return;

    const cfg = getDeptConfig(department);
    if (!cfg?.completedAt || !cfg?.obligationsEnabled) return;

    // Busca IDs de impostos e obrigações do departamento
    const [deptTaxes, deptObls] = await Promise.all([
      CompanyTax.findAll({ where: { department }, attributes: ["id"], raw: true }),
      AccessoryObligation.findAll({ where: { department }, attributes: ["id", "periodicity", "deadlineMonth"], raw: true }),
    ]);

    const taxIds = deptTaxes.map((t) => t.id);
    const oblIds = deptObls.map((o) => o.id);

    // Monta conjunto de períodos relevantes (mensal + quinzenais/anuais resolvidos para
    // o MESMO mês de competência que está sendo checado — não o mês corrente do relógio,
    // que é o que getCurrentPeriod(obl) sem data de referência retornaria por engano).
    const periodSet = new Set([taxPeriod]);
    for (const obl of deptObls) {
      if (!obligationIsActiveForPeriod(obl, taxPeriod)) continue;
      const resolved = getObligationPeriodForDisplay(obl, taxPeriod);
      if (Array.isArray(resolved)) {
        resolved.forEach((p) => periodSet.add(p));
      } else {
        periodSet.add(resolved);
      }
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

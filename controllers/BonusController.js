// /controllers/BonusController.js
const { Op } = require("sequelize");
const sequelize = require("../db/conn");
const logger = require("../logger/logger");

const Company = require("../models/Company");
const User = require("../models/User");
const BonusFactor = require("../models/BonusFactor");
const BonusResult = require("../models/BonusResult");
const CompanyTax = require("../models/CompanyTax");
const CompanyTaxStatus = require("../models/CompanyTaxStatus");
const AccessoryObligation = require("../models/AccessoryObligation");
const CompanyObligationStatus = require("../models/CompanyObligationStatus");

function getCurrentMonthPeriod(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Retorna um Set com os IDs das empresas que estão 100% concluídas para o período
 * e departamento fornecidos. Apenas empresas onde total > 0 && pending === 0.
 */
async function getCompletedCompanyIds(period, department, companyIds, transaction) {
  if (!companyIds.length) return new Set();

  // Impostos visíveis (filtra trimestrais fora do trimestre)
  const allTaxes = await CompanyTax.findAll({ where: { department }, attributes: ["id", "periodicity"], raw: true, transaction });
  const month = parseInt(period.split("-")[1], 10);
  const taxIds = allTaxes
    .filter((t) => t.periodicity !== "trimestral" || [3, 6, 9, 12].includes(month))
    .map((t) => t.id);

  // Obrigações visíveis (anuais só no mês correto)
  const allObls = await AccessoryObligation.findAll({ where: { department }, attributes: ["id", "periodicity", "deadlineMonth"], raw: true, transaction });
  const visibleObls = allObls.filter((o) => {
    if (o.periodicity !== "annual") return true;
    if (!o.deadlineMonth) return true;
    return o.deadlineMonth === month;
  });
  const oblIds = visibleObls.map((o) => o.id);

  // Períodos de banco por obrigação
  const oblPeriodSet = new Set();
  for (const obl of visibleObls) {
    if (obl.periodicity === "biweekly") { oblPeriodSet.add(`${period}-1`); oblPeriodSet.add(`${period}-2`); }
    else if (obl.periodicity === "annual") { oblPeriodSet.add(period.substring(0, 4)); }
    else { oblPeriodSet.add(period); }
  }

  // Queries em batch
  const [taxStatuses, oblStatuses] = await Promise.all([
    taxIds.length
      ? CompanyTaxStatus.findAll({
          where: { companyId: companyIds, taxId: taxIds, period, isManuallyExcluded: false, status: { [Op.ne]: "disabled" } },
          attributes: ["companyId", "status"],
          raw: true,
          transaction,
        })
      : [],
    oblIds.length && oblPeriodSet.size
      ? CompanyObligationStatus.findAll({
          where: { companyId: companyIds, obligationId: oblIds, period: { [Op.in]: [...oblPeriodSet] }, isManuallyExcluded: false, status: { [Op.ne]: "disabled" } },
          attributes: ["companyId", "status"],
          raw: true,
          transaction,
        })
      : [],
  ]);

  const totals = {};
  for (const id of companyIds) totals[id] = { total: 0, pending: 0 };
  for (const s of taxStatuses) { if (totals[s.companyId]) { totals[s.companyId].total++; if (s.status === "pending") totals[s.companyId].pending++; } }
  for (const s of oblStatuses) { if (totals[s.companyId]) { totals[s.companyId].total++; if (s.status === "pending") totals[s.companyId].pending++; } }

  const completedIds = new Set();
  for (const [id, { total, pending }] of Object.entries(totals)) {
    if (total > 0 && pending === 0) completedIds.add(parseInt(id, 10));
  }
  return completedIds;
}

// Chaves dos fatores para consistência
const FACTOR_KEYS = {
  DP_FATOR_1: "dp_fator_1",
  DP_FATOR_2: "dp_fator_2",
  FISCAL_VALOR_BASE_C: "fiscal_valor_base_c",
  CONTABIL_VALOR_MES: "contabil_valor_mes",
};

module.exports = class BonusController {
  /**
   * Busca os fatores de bônus e os retorna como um objeto chave-valor.
   */
  static async getBonusFactors(req, res) {
    try {
      const factors = await BonusFactor.findAll();
      // Inicializa com valores padrão caso não existam no banco
      const factorsMap = {
        [FACTOR_KEYS.DP_FATOR_1]: "0.00",
        [FACTOR_KEYS.DP_FATOR_2]: "0.00",
        [FACTOR_KEYS.FISCAL_VALOR_BASE_C]: "0.00",
        [FACTOR_KEYS.CONTABIL_VALOR_MES]: "0.00",
      };
      factors.forEach((f) => {
        factorsMap[f.factorKey] = f.factorValue;
      });
      res.status(200).json(factorsMap);
    } catch (error) {
      logger.error(`Erro ao buscar fatores de bônus: ${error.message}`);
      res.status(500).json({ message: "Erro ao buscar fatores de bônus." });
    }
  }

  /**
   * Atualiza os valores dos fatores de bônus no banco.
   */
  static async updateBonusFactors(req, res) {
    const { dp_fator_1, dp_fator_2, fiscal_valor_base_c, contabil_valor_mes } =
      req.body;
    try {
      const factorsToUpdate = [
        { factorKey: FACTOR_KEYS.DP_FATOR_1, factorValue: dp_fator_1 },
        { factorKey: FACTOR_KEYS.DP_FATOR_2, factorValue: dp_fator_2 },
        {
          factorKey: FACTOR_KEYS.FISCAL_VALOR_BASE_C,
          factorValue: fiscal_valor_base_c,
        },
        {
          factorKey: FACTOR_KEYS.CONTABIL_VALOR_MES,
          factorValue: contabil_valor_mes,
        },
      ];

      for (const factor of factorsToUpdate) {
        await BonusFactor.upsert(factor);
      }

      logger.info(`Fatores de bônus atualizados por Admin (${req.user.email})`);
      res
        .status(200)
        .json({ message: "Fatores de bônus atualizados com sucesso." });
    } catch (error) {
      logger.error(`Erro ao atualizar fatores de bônus: ${error.message}`);
      res.status(500).json({ message: "Erro ao atualizar fatores de bônus." });
    }
  }

  /**
   * Busca os resultados de bônus previamente calculados.
   */
  static async getBonusResults(req, res) {
    try {
      const { period } = req.query;
      // Se period fornecido, filtra por ele; senão retorna registros legados (period = null)
      const where = period ? { period } : { period: null };
      const results = await BonusResult.findAll({
        where,
        order: [["userName", "ASC"]],
      });
      res.status(200).json(results);
    } catch (error) {
      logger.error(`Erro ao buscar resultados de bônus: ${error.message}`);
      res.status(500).json({ message: "Erro ao buscar resultados de bônus." });
    }
  }

  /**
   * Executa o cálculo completo de bônus para todos os funcionários dos departamentos Pessoal e Fiscal.
   */
  static async runFullBonusCalculation(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const period = req.body.period || getCurrentMonthPeriod();
      logger.info(`Admin (${req.user.email}) iniciou o recálculo de bônus para competência ${period}.`);

      // 1. Limpa os resultados anteriores APENAS para este período
      await BonusResult.destroy({ where: { period }, transaction });

      // 2. Busca os fatores
      const factors = await BonusFactor.findAll({ transaction });
      const factorsMap = factors.reduce((acc, f) => {
        acc[f.factorKey] = parseFloat(f.factorValue);
        return acc;
      }, {});

      const FATOR1_DP = factorsMap[FACTOR_KEYS.DP_FATOR_1] || 0;
      const FATOR2_DP = factorsMap[FACTOR_KEYS.DP_FATOR_2] || 0;
      const VALOR_BASE_C_FISCAL =
        factorsMap[FACTOR_KEYS.FISCAL_VALOR_BASE_C] || 0;
      const VALOR_MES_CONTABIL =
        factorsMap[FACTOR_KEYS.CONTABIL_VALOR_MES] || 0;

      // 3. Busca usuários de DP, Fiscal e Contábil que são elegíveis
      const dpUsersEligible = await User.findAll({
        where: { department: "Pessoal", hasBonus: true },
        transaction,
      });
      const fiscalUsersEligible = await User.findAll({
        where: { department: "Fiscal", hasBonus: true },
        transaction,
      });
      const contabilUsersEligible = await User.findAll({
        where: { department: "Contábil", hasBonus: true },
        transaction,
      });

      const allResults = [];
      const calculationDate = new Date();

      // --- 4. CÁLCULO PARA DEPARTAMENTO PESSOAL ---
      if (dpUsersEligible.length > 0) {
        const allDpCompanies = await Company.findAll({
          where: { respDpId: { [Op.in]: dpUsersEligible.map((u) => u.id) }, status: "ATIVA", isArchived: false },
          transaction,
        });
        const dpCompanyIds = allDpCompanies.map((c) => c.id);
        const completedDpIds = await getCompletedCompanyIds(period, "Pessoal", dpCompanyIds, transaction);

        for (const user of dpUsersEligible) {
          const companies = allDpCompanies.filter((c) => c.respDpId === user.id && completedDpIds.has(c.id));
          let totalBonus = 0;
          const details = [];

          for (const company of companies) {
            let companyBonus = 0;
            const empCount = company.employeesCount || 0;
            if (empCount <= 1) { companyBonus = FATOR1_DP; } else { companyBonus = FATOR2_DP * empCount; }
            totalBonus += companyBonus;
            details.push({ companyName: company.name, employeesCount: empCount, bonus: companyBonus });
          }
          allResults.push({ userId: user.id, userName: user.name, department: "Pessoal", totalBonus, details, calculationDate, period });
        }
      }

      // --- 5. CÁLCULO PARA DEPARTAMENTO FISCAL ---
      if (fiscalUsersEligible.length > 0) {
        const eligibleFiscalUserIds = fiscalUsersEligible.map((u) => u.id);
        const allFiscalCompanies = await Company.findAll({
          where: { respFiscalId: { [Op.in]: eligibleFiscalUserIds }, status: "ATIVA", isArchived: false },
          transaction,
        });
        const fiscalCompanyIds = allFiscalCompanies.map((c) => c.id);
        const completedFiscalIds = await getCompletedCompanyIds(period, "Fiscal", fiscalCompanyIds, transaction);
        const completedFiscalCompanies = allFiscalCompanies.filter((c) => completedFiscalIds.has(c.id));

        // A e B calculados apenas sobre empresas concluídas
        const A = completedFiscalCompanies.length || 1;
        const B = completedFiscalCompanies.reduce((sum, c) => sum + (c.bonusValue || 0), 0) || 1;
        const C = VALOR_BASE_C_FISCAL;
        const D = (B > 0 ? C / B : 0) + C * 0.05;
        const E = A > 0 ? C / A : 0;

        for (const user of fiscalUsersEligible) {
          const companies = completedFiscalCompanies.filter((c) => c.respFiscalId === user.id);
          let totalBonus = 0;
          const details = [];

          for (const company of companies) {
            const companyBonusValue = company.bonusValue || 0;
            const calculatedBonus = companyBonusValue * D + E;
            totalBonus += calculatedBonus;
            details.push({ companyName: company.name, bonusValue: companyBonusValue, bonus: calculatedBonus });
          }
          allResults.push({ userId: user.id, userName: user.name, department: "Fiscal", totalBonus, details, calculationDate, period });
        }
      }

      // --- 6. CÁLCULO PARA DEPARTAMENTO CONTÁBIL ---
      if (contabilUsersEligible.length > 0) {
        const allContabilCompanies = await Company.findAll({
          where: { respContabilId: { [Op.in]: contabilUsersEligible.map((u) => u.id) }, status: "ATIVA", isArchived: false },
          transaction,
        });
        const contabilCompanyIds = allContabilCompanies.map((c) => c.id);
        const completedContabilIds = await getCompletedCompanyIds(period, "Contábil", contabilCompanyIds, transaction);

        for (const user of contabilUsersEligible) {
          const companies = allContabilCompanies.filter((c) => c.respContabilId === user.id && completedContabilIds.has(c.id));
          let totalBonus = 0;
          const details = [];

          for (const company of companies) {
            const monthsCount = company.accountingMonthsCount || 0;
            const companyBonus = monthsCount * VALOR_MES_CONTABIL;
            totalBonus += companyBonus;
            details.push({ companyName: company.name, accountingMonthsCount: monthsCount, bonus: companyBonus });
          }
          allResults.push({ userId: user.id, userName: user.name, department: "Contábil", totalBonus, details, calculationDate, period });
        }
      }

      // 7. Insere todos os resultados no banco
      if (allResults.length > 0) {
        await BonusResult.bulkCreate(allResults, { transaction });
      }

      await transaction.commit();
      logger.info(`Cálculo de bônus (${period}) concluído e salvo com sucesso.`);
      res.status(200).json({ message: `Cálculo de bônus concluído e salvo com sucesso para ${period}.` });
    } catch (error) {
      await transaction.rollback();
      logger.error(`Erro ao executar o cálculo de bônus: ${error.message}`, {
        stack: error.stack,
      });
      res
        .status(500)
        .json({ message: "Ocorreu um erro grave durante o cálculo de bônus." });
    }
  }
};

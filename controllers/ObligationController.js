// /controllers/ObligationController.js
const AccessoryObligation = require("../models/AccessoryObligation");
const CompanyObligationStatus = require("../models/CompanyObligationStatus");
const Company = require("../models/Company");
const User = require("../models/User");
const { Op } = require("sequelize");
const logger = require("../logger/logger");
const {
  getDeadlineDate,
  getCurrentPeriod,
  formatDeadline,
} = require("../utils/businessDays");
const cacheManager = require("../utils/CacheManager");
const { checkAndUpdateCompletion } = require("../utils/completionChecker");
const { getDeptConfig } = require("../config/departmentConfig");

// ── Helpers ────────────────────────────────────────────────────────────────────

// Retorna o período do mês anterior no formato YYYY-MM
// Na contabilidade, sempre trabalhamos com a competência anterior (mês passado)
function getCurrentMonthPeriod() {
  const d = new Date();
  d.setDate(1); // evita erro em dias 29-31 ao retroceder mês
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Retorna false para obrigações anuais cujo deadlineMonth não corresponde ao mês
 * do displayPeriod fornecido. Obrigações anuais aparecem no mês ANTERIOR ao vencimento.
 * Para obrigações mensais/quinzenais: sempre true.
 */
function obligationIsActiveForPeriod(obligation, displayPeriod) {
  if (obligation.periodicity !== "annual") return true;
  if (!obligation.deadlineMonth) return true; // segurança: exibir se não configurado
  const displayMonth = parseInt(displayPeriod.split("-")[1], 10);
  // Exibe no mês anterior ao vencimento (ex: deadlineMonth=3 → exibe em fev=2)
  const expectedDisplay = obligation.deadlineMonth === 1 ? 12 : obligation.deadlineMonth - 1;
  return displayMonth === expectedDisplay;
}

/**
 * Resolve o(s) período(s) de banco para uma obrigação dado um displayPeriod YYYY-MM.
 * - Mensal: "YYYY-MM"
 * - Quinzenal: ["YYYY-MM-1", "YYYY-MM-2"] (ambas as quinzenas)
 * - Anual: "YYYY"
 * Se displayPeriod não for fornecido, usa getCurrentPeriod(obligation).
 */
function getObligationPeriodForDisplay(obligation, displayPeriod) {
  if (!displayPeriod) return getCurrentPeriod(obligation);
  if (obligation.periodicity === "biweekly") {
    return [`${displayPeriod}-1`, `${displayPeriod}-2`];
  }
  if (obligation.periodicity === "annual") {
    const [displayYear, displayMonthNum] = displayPeriod.split("-").map(Number);
    // Se vence em janeiro e exibimos em dezembro → o registro de DB pertence ao próximo ano
    if (obligation.deadlineMonth === 1 && displayMonthNum === 12) {
      return String(displayYear + 1);
    }
    return String(displayYear);
  }
  return displayPeriod;
}

/**
 * Verifica se uma obrigação se aplica a uma empresa com base nos filtros.
 */
function obligationMatchesCompany(obligation, company) {
  const { applicableRegimes, applicableClassificacoes, applicableUFs } = obligation;

  if (applicableRegimes && applicableRegimes.length > 0) {
    if (!applicableRegimes.includes(company.rule)) return false;
  }
  if (applicableClassificacoes && applicableClassificacoes.length > 0) {
    if (!applicableClassificacoes.includes(company.classi)) return false;
  }
  if (applicableUFs && applicableUFs.length > 0) {
    if (!applicableUFs.includes(company.uf)) return false;
  }
  return true;
}

/**
 * Verifica se uma obrigação deve ser desabilitada para uma empresa zerada.
 */
function isObligationDisabledForCompany(obligation, company) {
  if (obligation.sendWhenZeroed) return false;
  const cfg = getDeptConfig(obligation.department);
  if (!cfg?.isZeroed) return false;
  return !!company[cfg.isZeroed];
}

/**
 * Retorna ou cria o registro de status para uma empresa/obrigação/período.
 * Aplica lógica de desabilitação automática (zerado + sendWhenZeroed=false).
 */
async function getOrCreateStatus(company, obligation, period) {
  // Determina status inicial
  const disabled = isObligationDisabledForCompany(obligation, company);
  const initialStatus = disabled ? "disabled" : "pending";

  const [statusRecord] = await CompanyObligationStatus.findOrCreate({
    where: { companyId: company.id, obligationId: obligation.id, period },
    defaults: { status: initialStatus },
  });

  // Se empresa ficou zerada após o registro ser criado, atualiza para disabled
  if (disabled && statusRecord.status === "pending") {
    await statusRecord.update({ status: "disabled" });
    statusRecord.status = "disabled";
  }

  return statusRecord;
}

// ── Controller ─────────────────────────────────────────────────────────────────

module.exports = class ObligationController {

  // GET /obligation/all
  static async getAll(req, res) {
    try {
      const { department } = req.query;
      const where = department ? { department } : {};
      const obligations = await AccessoryObligation.findAll({
        where,
        order: [["department", "ASC"], ["name", "ASC"]],
      });
      return res.json(obligations);
    } catch (err) {
      logger.error(`ObligationController.getAll: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // POST /obligation/create  (admin only)
  static async create(req, res) {
    try {
      const {
        name, description, department, deadline, deadlineType,
        periodicity, deadlineMonth, sendWhenZeroed, isConditional, applicableRegimes,
        applicableClassificacoes, applicableUFs, baseReceiptsDir,
      } = req.body;

      if (!name || !department || !deadlineType || !periodicity) {
        return res.status(400).json({ message: "Campos obrigatórios: name, department, deadlineType, periodicity." });
      }
      if (deadlineType !== "last_business_day" && !deadline) {
        return res.status(400).json({ message: "Prazo é obrigatório para este tipo de deadline." });
      }

      const obligation = await AccessoryObligation.create({
        name, description, department,
        deadline: deadlineType === "last_business_day" ? 0 : parseInt(deadline, 10),
        deadlineType, periodicity,
        deadlineMonth: periodicity === "annual" && deadlineMonth ? parseInt(deadlineMonth, 10) : null,
        sendWhenZeroed: sendWhenZeroed !== false,
        isConditional: isConditional === true,
        applicableRegimes: applicableRegimes || null,
        applicableClassificacoes: applicableClassificacoes || null,
        applicableUFs: applicableUFs || null,
        baseReceiptsDir: baseReceiptsDir || null,
      });

      logger.info(`Obrigação "${name}" criada por ${req.user?.name}`);
      cacheManager.invalidateByPrefix("obl_dashboard");
      return res.status(201).json(obligation);
    } catch (err) {
      logger.error(`ObligationController.create: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // PATCH /obligation/:id  (admin only)
  static async update(req, res) {
    try {
      const obligation = await AccessoryObligation.findByPk(req.params.id);
      if (!obligation) return res.status(404).json({ message: "Obrigação não encontrada." });

      const allowed = [
        "name", "description", "department", "deadline", "deadlineType",
        "periodicity", "deadlineMonth", "sendWhenZeroed", "isConditional", "applicableRegimes",
        "applicableClassificacoes", "applicableUFs", "baseReceiptsDir",
      ];
      const updates = {};
      allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

      await obligation.update(updates);
      logger.info(`Obrigação ${req.params.id} atualizada por ${req.user?.name}`);
      cacheManager.invalidateByPrefix("obl_dashboard");
      return res.json(obligation);
    } catch (err) {
      logger.error(`ObligationController.update: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // DELETE /obligation/:id  (admin only)
  static async remove(req, res) {
    try {
      const obligation = await AccessoryObligation.findByPk(req.params.id);
      if (!obligation) return res.status(404).json({ message: "Obrigação não encontrada." });

      await obligation.destroy(); // CASCADE apaga CompanyObligationStatus
      logger.info(`Obrigação ${req.params.id} excluída por ${req.user?.name}`);
      cacheManager.invalidateByPrefix("obl_dashboard");
      return res.json({ message: "Obrigação excluída com sucesso." });
    } catch (err) {
      logger.error(`ObligationController.remove: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // GET /obligation/company/:companyId?period=YYYY-MM&department=Fiscal
  static async getCompanyObligations(req, res) {
    try {
      const { companyId } = req.params;
      const { department } = req.query;

      const company = await Company.findByPk(companyId);
      if (!company) return res.status(404).json({ message: "Empresa não encontrada." });

      // Busca todas as obrigações do departamento
      const whereObligation = department ? { department } : {};
      const allObligations = await AccessoryObligation.findAll({ where: whereObligation });

      // Obrigações com adição manual para esta empresa
      const manualStatuses = await CompanyObligationStatus.findAll({
        where: { companyId, isManuallyAssigned: true },
        include: [{ model: AccessoryObligation, as: "obligation" }],
      });
      const manualObligationIds = new Set(manualStatuses.map((s) => s.obligationId));

      // Obrigações excluídas manualmente para esta empresa (exceção à regra)
      const excludedStatuses = await CompanyObligationStatus.findAll({
        where: { companyId, isManuallyExcluded: true },
      });
      const excludedObligationIds = new Set(excludedStatuses.map((s) => s.obligationId));

      // Une: auto-match + manual, excluindo as removidas manualmente
      const applicableObligations = [];
      for (const obl of allObligations) {
        if (excludedObligationIds.has(obl.id)) continue; // excluída manualmente
        if (obligationMatchesCompany(obl, company) || manualObligationIds.has(obl.id)) {
          applicableObligations.push(obl);
        }
      }

      // Para cada obrigação aplicável, busca ou cria o status do período solicitado
      const displayPeriod = req.query.period || null; // YYYY-MM fornecido pelo frontend
      const result = [];

      for (const obl of applicableObligations) {
        // Anuais: só exibir no mês correto
        if (displayPeriod && !obligationIsActiveForPeriod(obl, displayPeriod)) continue;

        const resolvedPeriods = getObligationPeriodForDisplay(obl, displayPeriod);
        const periods = Array.isArray(resolvedPeriods) ? resolvedPeriods : [resolvedPeriods];
        const labels = periods.length > 1 ? ["1ª Quinzena", "2ª Quinzena"] : [null];

        for (let pi = 0; pi < periods.length; pi++) {
          const oblPeriod = periods[pi];
          const label = labels[pi];
          const statusRecord = await getOrCreateStatus(company, obl, oblPeriod);

          let deadlineDate = null;
          try {
            deadlineDate = await getDeadlineDate(obl, oblPeriod);
          } catch {}

          result.push({
            ...obl.toJSON(),
            name: label ? `${obl.name} (${label})` : obl.name,
            statusId: statusRecord.id,
            status: statusRecord.status,
            completedAt: statusRecord.completedAt,
            completedById: statusRecord.completedById,
            isManuallyAssigned: manualObligationIds.has(obl.id),
            isManuallyExcluded: false,
            period: oblPeriod,
            deadlineDate: deadlineDate ? deadlineDate.toISOString() : null,
            deadlineFormatted: deadlineDate ? formatDeadline(deadlineDate) : null,
          });
        }
      }

      // Inclui obrigações excluídas manualmente na resposta (para exibir no form de edição)
      for (const statusRec of excludedStatuses) {
        const obl = allObligations.find((o) => o.id === statusRec.obligationId);
        if (!obl) continue;
        if (displayPeriod && !obligationIsActiveForPeriod(obl, displayPeriod)) continue;
        const fallbackPeriod = getObligationPeriodForDisplay(obl, displayPeriod);
        result.push({
          ...obl.toJSON(),
          statusId: statusRec.id,
          status: statusRec.status,
          completedAt: null,
          completedById: null,
          isManuallyAssigned: false,
          isManuallyExcluded: true,
          period: Array.isArray(fallbackPeriod) ? fallbackPeriod[0] : fallbackPeriod,
          deadlineDate: null,
          deadlineFormatted: null,
        });
      }

      return res.json(result);
    } catch (err) {
      logger.error(`ObligationController.getCompanyObligations: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // POST /obligation/company/:companyId/toggle  (admin only)
  // Body: { obligationId, period?, action: "add"|"remove"|"exclude"|"include" }
  static async toggleManual(req, res) {
    try {
      const { companyId } = req.params;
      const { obligationId, action, period } = req.body;

      const company = await Company.findByPk(companyId);
      if (!company) return res.status(404).json({ message: "Empresa não encontrada." });

      const obligation = await AccessoryObligation.findByPk(obligationId);
      if (!obligation) return res.status(404).json({ message: "Obrigação não encontrada." });

      const activePeriod = period || getCurrentPeriod(obligation);

      if (action === "remove") {
        // Remove obrigação adicionada manualmente
        await CompanyObligationStatus.destroy({
          where: { companyId, obligationId, isManuallyAssigned: true },
        });
        return res.json({ message: "Obrigação removida manualmente." });
      }

      if (action === "exclude") {
        // Exclui manualmente uma obrigação auto-aplicada (exceção à regra)
        const [statusRecord] = await CompanyObligationStatus.findOrCreate({
          where: { companyId, obligationId, period: activePeriod },
          defaults: { status: "disabled", isManuallyExcluded: true },
        });
        if (!statusRecord.isManuallyExcluded) {
          await statusRecord.update({ isManuallyExcluded: true, status: "disabled" });
        }
        return res.json({ message: "Obrigação excluída manualmente para esta empresa." });
      }

      if (action === "include") {
        // Reverte uma exclusão manual (re-inclui na regra automática)
        await CompanyObligationStatus.update(
          { isManuallyExcluded: false, status: "pending" },
          { where: { companyId, obligationId, isManuallyExcluded: true } }
        );
        return res.json({ message: "Obrigação re-incluída para esta empresa." });
      }

      // action === "add"
      const [statusRecord, created] = await CompanyObligationStatus.findOrCreate({
        where: { companyId, obligationId, period: activePeriod },
        defaults: {
          status: isObligationDisabledForCompany(obligation, company) ? "disabled" : "pending",
          isManuallyAssigned: true,
        },
      });

      if (!created) {
        await statusRecord.update({ isManuallyAssigned: true });
      }

      cacheManager.invalidateByPrefix("obl_dashboard");
      return res.json({ message: "Obrigação adicionada manualmente.", statusRecord });
    } catch (err) {
      logger.error(`ObligationController.toggleManual: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // PATCH /obligation/status/:statusId
  // Body: { status: "pending"|"completed"|"disabled"|"not_applicable" }
  static async updateStatus(req, res) {
    try {
      const { statusId } = req.params;
      const { status } = req.body;

      if (!["pending", "completed", "disabled", "not_applicable"].includes(status)) {
        return res.status(400).json({ message: "Status inválido." });
      }

      const record = await CompanyObligationStatus.findByPk(statusId);
      if (!record) return res.status(404).json({ message: "Registro de status não encontrado." });

      const updates = { status };
      if (status === "completed") {
        updates.completedAt = new Date();
        updates.completedById = req.user?.id || null;
      } else {
        updates.completedAt = null;
        updates.completedById = null;
      }

      await record.update(updates);
      cacheManager.invalidateByPrefix("obl_dashboard");

      // Verifica e atualiza completedAt do departamento (fire-and-forget assíncrono)
      const obligation = await AccessoryObligation.findByPk(record.obligationId, { attributes: ["department"], raw: true });
      const taxPeriod = record.period.length === 7 ? record.period : record.period.substring(0, 7);
      if (obligation) {
        checkAndUpdateCompletion(record.companyId, taxPeriod, obligation.department).catch(() => {});
      }

      return res.json(record);
    } catch (err) {
      logger.error(`ObligationController.updateStatus: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // POST /obligation/batch-update
  // Body: { action: "add"|"remove", obligationId, companyIds[] }
  static async batchUpdate(req, res) {
    try {
      const { action, obligationId, companyIds } = req.body;
      if (!["add", "remove"].includes(action)) return res.status(400).json({ message: "Ação inválida." });
      if (!obligationId) return res.status(400).json({ message: "obligationId é obrigatório." });
      if (!Array.isArray(companyIds) || companyIds.length === 0) return res.status(400).json({ message: "companyIds deve ser um array não vazio." });

      const obligation = await AccessoryObligation.findByPk(obligationId);
      if (!obligation) return res.status(404).json({ message: "Obrigação não encontrada." });

      const period = getCurrentPeriod(obligation);

      if (action === "add") {
        const companies = await Company.findAll({ where: { id: companyIds } });
        const toCreate = [];
        for (const company of companies) {
          const shouldBeDisabled = isObligationDisabledForCompany(obligation, company);
          toCreate.push({
            companyId: company.id, obligationId, period,
            status: shouldBeDisabled ? "disabled" : "pending",
            isManuallyAssigned: true,
          });
        }
        await CompanyObligationStatus.bulkCreate(toCreate, {
          updateOnDuplicate: ["isManuallyAssigned"],
        });
      } else {
        // remove: exclui manualmente para todos os companyIds (manual ou auto-atribuído)
        // Passo 1: apaga TODOS os registros existentes para essas empresas + obligationId
        await CompanyObligationStatus.destroy({ where: { companyId: companyIds, obligationId } });
        // Passo 2: cria registros com isManuallyExcluded para bloquear re-atribuição automática
        const toExclude = companyIds.map((companyId) => ({
          companyId, obligationId, period, status: "disabled",
          isManuallyAssigned: false, isManuallyExcluded: true,
        }));
        await CompanyObligationStatus.bulkCreate(toExclude, {
          updateOnDuplicate: ["isManuallyExcluded", "status"],
        });
      }

      cacheManager.invalidateByPrefix("obl_dashboard");
      cacheManager.invalidateByPrefix("my_companies_");
      return res.json({ message: `Obrigação ${action === "add" ? "adicionada" : "removida"} para ${companyIds.length} empresa(s).` });
    } catch (err) {
      logger.error(`ObligationController.batchUpdate: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // POST /obligation/:id/reimplementar  (admin only)
  static async reimplementar(req, res) {
    try {
      const obligation = await AccessoryObligation.findByPk(req.params.id);
      if (!obligation) return res.status(404).json({ message: "Obrigação não encontrada." });

      const period = getCurrentPeriod(obligation);
      const companies = await Company.findAll({ where: { isArchived: false, status: "ATIVA" } });

      const [exclusions, manuals] = await Promise.all([
        CompanyObligationStatus.findAll({ where: { obligationId: obligation.id, isManuallyExcluded: true }, attributes: ["companyId"], raw: true }),
        CompanyObligationStatus.findAll({ where: { obligationId: obligation.id, isManuallyAssigned: true }, attributes: ["companyId"], raw: true }),
      ]);
      const excludedIds = new Set(exclusions.map((e) => e.companyId));
      const manualIds   = new Set(manuals.map((m) => m.companyId));

      let added = 0, removed = 0;
      for (const company of companies) {
        if (excludedIds.has(company.id)) continue;
        if (obligationMatchesCompany(obligation, company) || manualIds.has(company.id)) {
          const shouldDisable = isObligationDisabledForCompany(obligation, company);
          const [, created] = await CompanyObligationStatus.findOrCreate({
            where: { companyId: company.id, obligationId: obligation.id, period },
            defaults: { status: shouldDisable ? "disabled" : "pending" },
          });
          if (created) added++;
        } else {
          const count = await CompanyObligationStatus.destroy({
            where: { companyId: company.id, obligationId: obligation.id, period, [Op.or]: [{ isManuallyAssigned: false }, { isManuallyAssigned: null }] },
          });
          removed += count;
        }
      }

      cacheManager.invalidateByPrefix("obl_dashboard");
      cacheManager.invalidateByPrefix("my_companies_");
      logger.info(`Reimplementar obrigação "${obligation.name}" por ${req.user?.name}: +${added} -${removed}`);
      return res.json({ added, removed });
    } catch (err) {
      logger.error(`ObligationController.reimplementar: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // Helper estático — aplica obrigações automáticas a uma empresa recém-criada
  static async applyObligationsToCompany(company) {
    try {
      const obligations = await AccessoryObligation.findAll();
      for (const obl of obligations) {
        if (!obligationMatchesCompany(obl, company)) continue;
        const period = getCurrentPeriod(obl);
        await CompanyObligationStatus.findOrCreate({
          where: { companyId: company.id, obligationId: obl.id, period },
          defaults: {
            status: isObligationDisabledForCompany(obl, company) ? "disabled" : "pending",
          },
        });
      }
    } catch (err) {
      logger.error(`applyObligationsToCompany(${company.id}): ${err.message}`);
    }
  }

  // GET /obligation/period-summary?period=YYYY-MM&department=Fiscal
  // Retorna todas as empresas com seus status de obrigações para o período
  static async getPeriodSummary(req, res) {
    try {
      const { department = "Fiscal" } = req.query;

      const obligations = await AccessoryObligation.findAll({ where: { department } });
      if (obligations.length === 0) return res.json({ obligations: [], companies: [] });

      // Pré-computar período por obrigação (suporte a múltiplas periodicidades)
      const displayPeriod = req.query.period || null;
      const isCurrentPeriod = !displayPeriod || displayPeriod <= getCurrentMonthPeriod();

      const oblPeriods = {}; // obl.id -> string | string[]
      const periodSet = new Set();
      const visibleObligations = []; // apenas as que devem aparecer neste displayPeriod

      for (const obl of obligations) {
        if (displayPeriod && !obligationIsActiveForPeriod(obl, displayPeriod)) continue;
        const p = getObligationPeriodForDisplay(obl, displayPeriod);
        oblPeriods[obl.id] = p;
        if (Array.isArray(p)) { p.forEach((x) => periodSet.add(x)); } else { periodSet.add(p); }
        visibleObligations.push(obl);
      }

      const period = displayPeriod || getCurrentPeriod(obligations[0]);

      const companies = await Company.findAll({ where: { isArchived: false, status: "ATIVA" } });
      if (companies.length === 0) return res.json({ period, obligations, companies: [] });

      const companyIds = companies.map((c) => c.id);
      const obligationIds = obligations.map((o) => o.id);

      // 3 queries em batch — substitui N×(2+M) queries individuais
      const [allExclusions, allManuals, existingStatuses] = await Promise.all([
        CompanyObligationStatus.findAll({
          where: { companyId: companyIds, isManuallyExcluded: true },
          attributes: ["companyId", "obligationId"],
          raw: true,
        }),
        CompanyObligationStatus.findAll({
          where: { companyId: companyIds, isManuallyAssigned: true },
          attributes: ["companyId", "obligationId"],
          raw: true,
        }),
        CompanyObligationStatus.findAll({
          where: {
            companyId: companyIds,
            obligationId: obligationIds,
            period: { [Op.in]: [...periodSet] },
          },
          attributes: ["id", "companyId", "obligationId", "period", "status", "completedAt"],
          raw: true,
        }),
      ]);

      // Maps de lookup O(1)
      const excludedMap = new Map();
      for (const e of allExclusions) {
        if (!excludedMap.has(e.companyId)) excludedMap.set(e.companyId, new Set());
        excludedMap.get(e.companyId).add(e.obligationId);
      }
      const manualMap = new Map();
      for (const m of allManuals) {
        if (!manualMap.has(m.companyId)) manualMap.set(m.companyId, new Set());
        manualMap.get(m.companyId).add(m.obligationId);
      }
      const statusMap = new Map();
      for (const s of existingStatuses) {
        statusMap.set(`${s.companyId}_${s.obligationId}_${s.period}`, s);
      }

      const result = [];
      const toCreate = [];
      const toDisable = [];
      const toEnable = [];

      for (const company of companies) {
        const excludedIds = excludedMap.get(company.id) || new Set();
        const manualIds = manualMap.get(company.id) || new Set();
        const companyObligations = [];

        for (const obl of visibleObligations) {
          if (excludedIds.has(obl.id)) continue;
          if (!obligationMatchesCompany(obl, company) && !manualIds.has(obl.id)) continue;

          // Quinzenal pode ter 2 períodos; mensal/anual tem 1
          const periods = Array.isArray(oblPeriods[obl.id]) ? oblPeriods[obl.id] : [oblPeriods[obl.id]];
          const labels = periods.length > 1 ? ["1ª Quinzena", "2ª Quinzena"] : [null];

          for (let pi = 0; pi < periods.length; pi++) {
            const oblPeriod = periods[pi];
            const label = labels[pi];
            const displayName = label ? `${obl.name} (${label})` : obl.name;
            const shouldBeDisabled = isObligationDisabledForCompany(obl, company);
            const expectedStatus = shouldBeDisabled ? "disabled" : "pending";
            const key = `${company.id}_${obl.id}_${oblPeriod}`;
            const existing = statusMap.get(key);

            if (!existing) {
              if (isCurrentPeriod) {
                toCreate.push({ companyId: company.id, obligationId: obl.id, period: oblPeriod, status: expectedStatus });
                companyObligations.push({
                  obligationId: obl.id, name: displayName, period: oblPeriod,
                  statusId: null, status: expectedStatus, completedAt: null,
                  _key: key,
                });
              } else {
                companyObligations.push({
                  obligationId: obl.id, name: displayName, period: oblPeriod,
                  statusId: null, status: expectedStatus, completedAt: null,
                });
              }
            } else {
              if (shouldBeDisabled && existing.status === "pending") {
                if (isCurrentPeriod) toDisable.push(existing.id);
                existing.status = "disabled";
              } else if (!shouldBeDisabled && existing.status === "disabled") {
                // Empresa deixou de ser zerada: reabilitar obrigação automaticamente
                if (isCurrentPeriod) toEnable.push(existing.id);
                if (isCurrentPeriod) existing.status = "pending";
              }
              companyObligations.push({
                obligationId: obl.id, name: displayName, period: oblPeriod,
                statusId: existing.id, status: existing.status, completedAt: existing.completedAt,
              });
            }
          }
        }

        if (companyObligations.length > 0) {
          result.push({
            companyId: company.id,
            companyName: company.name,
            num: company.num,
            uf: company.uf,
            rule: company.rule,
            isZeroedFiscal: company.isZeroedFiscal,
            isZeroedDp: company.isZeroedDp,
            isZeroedContabil: company.isZeroedContabil,
            obligations: companyObligations,
            total: companyObligations.length,
            completed: companyObligations.filter((o) => o.status === "completed").length,
            disabled: companyObligations.filter((o) => o.status === "disabled" || o.status === "not_applicable").length,
          });
        }
      }

      // Operações em batch — apenas quando necessário
      const ops = [];
      if (toCreate.length > 0) {
        ops.push(
          CompanyObligationStatus.bulkCreate(toCreate, { ignoreDuplicates: true }).then(async () => {
            const fresh = await CompanyObligationStatus.findAll({
              where: {
                companyId: companyIds,
                obligationId: obligationIds,
                period: { [Op.in]: [...periodSet] },
              },
              attributes: ["id", "companyId", "obligationId", "period", "status"],
              raw: true,
            });
            const freshMap = new Map();
            for (const r of fresh) freshMap.set(`${r.companyId}_${r.obligationId}_${r.period}`, r);
            for (const comp of result) {
              for (const obl of comp.obligations) {
                if (obl._key) {
                  const rec = freshMap.get(obl._key);
                  if (rec) { obl.statusId = rec.id; delete obl._key; }
                }
              }
            }
          })
        );
      }
      if (toDisable.length > 0) {
        ops.push(CompanyObligationStatus.update({ status: "disabled" }, { where: { id: toDisable } }));
      }
      if (toEnable.length > 0) {
        ops.push(CompanyObligationStatus.update({ status: "pending" }, { where: { id: toEnable } }));
      }
      if (ops.length > 0) await Promise.all(ops);

      return res.json({ period, obligations, companies: result });
    } catch (err) {
      logger.error(`ObligationController.getPeriodSummary: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // GET /obligation/dashboard?department=Fiscal&period=YYYY-MM
  static async getDashboard(req, res) {
    try {
      const { department = "Fiscal" } = req.query;
      const periodParam = req.query.period || null;

      // Mapa de campo responsável por departamento
      const respFieldMap = { Fiscal: "respFiscalId", Pessoal: "respDpId", "Contábil": "respContabilId" };
      const respField = respFieldMap[department] || "respFiscalId";

      const cacheKey = `obl_dashboard_${department}_${periodParam || "current"}`;
      const cachedData = await cacheManager.getOrFetch(cacheKey, async () => {

        const [obligations, companies, deptUsers] = await Promise.all([
          AccessoryObligation.findAll({ where: { department } }),
          Company.findAll({
            where: { isArchived: false, status: "ATIVA" },
            attributes: ["id", "respFiscalId", "respDpId", "respContabilId", "isZeroedFiscal", "isZeroedDp", "isZeroedContabil", "rule", "classi", "uf"],
            raw: true,
          }),
          User.findAll({
            where: { department },
            attributes: ["id", "name"],
            order: [["name", "ASC"]],
          }),
        ]);

        if (obligations.length === 0) {
          return { period: null, obligations: [], users: [], totalCompanies: 0 };
        }

        // Pré-computar período por obrigação (anuais podem ter período diferente de mensais)
        const oblPeriods = {};
        const periodSet = new Set();
        const visibleObligations = [];
        for (const obl of obligations) {
          if (periodParam && !obligationIsActiveForPeriod(obl, periodParam)) continue;
          const p = getObligationPeriodForDisplay(obl, periodParam);
          oblPeriods[obl.id] = p;
          if (Array.isArray(p)) { p.forEach((x) => periodSet.add(x)); } else { periodSet.add(p); }
          visibleObligations.push(obl);
        }
        const mainPeriod = periodParam || getCurrentPeriod(obligations[0]);

        // 3 queries em batch substituindo N×M queries individuais
        const [allStatuses, allExclusions, allManuals] = await Promise.all([
          CompanyObligationStatus.findAll({
            where: { period: { [Op.in]: [...periodSet] } },
            attributes: ["companyId", "obligationId", "period", "status"],
            raw: true,
          }),
          CompanyObligationStatus.findAll({
            where: { isManuallyExcluded: true },
            attributes: ["companyId", "obligationId"],
            raw: true,
          }),
          CompanyObligationStatus.findAll({
            where: { isManuallyAssigned: true },
            attributes: ["companyId", "obligationId"],
            raw: true,
          }),
        ]);

        // Maps para lookup O(1)
        const statusMap = new Map();
        for (const s of allStatuses) {
          statusMap.set(`${s.companyId}_${s.obligationId}_${s.period}`, s.status);
        }
        const excludedMap = new Map();
        for (const e of allExclusions) {
          if (!excludedMap.has(e.companyId)) excludedMap.set(e.companyId, new Set());
          excludedMap.get(e.companyId).add(e.obligationId);
        }
        const manualMap = new Map();
        for (const m of allManuals) {
          if (!manualMap.has(m.companyId)) manualMap.set(m.companyId, new Set());
          manualMap.get(m.companyId).add(m.obligationId);
        }

        // Stats por usuário
        const userStats = {};
        for (const u of deptUsers) {
          userStats[u.id] = { id: u.id, name: u.name, totalCompanies: 0, completedCompanies: 0, pendingCompanies: 0 };
        }

        // Stats por obrigação (apenas obrigações visíveis para o período)
        const obligationStats = {};
        for (const obl of visibleObligations) {
          obligationStats[obl.id] = {
            id: obl.id, name: obl.name, department: obl.department,
            sendWhenZeroed: obl.sendWhenZeroed,
            total: 0, completed: 0, pending: 0, disabled: 0,
          };
        }

        // Processamento in-memory — zero queries adicionais
        for (const company of companies) {
          const excludedIds = excludedMap.get(company.id) || new Set();
          const manualIds = manualMap.get(company.id) || new Set();
          let companyActive = 0;
          let companyPending = 0;

          for (const obl of visibleObligations) {
            if (excludedIds.has(obl.id)) continue;
            if (!obligationMatchesCompany(obl, company) && !manualIds.has(obl.id)) continue;

            // Quinzenal pode ter 2 períodos; cada um conta separadamente nas stats
            const periods = Array.isArray(oblPeriods[obl.id]) ? oblPeriods[obl.id] : [oblPeriods[obl.id]];
            for (const oblPeriod of periods) {
              const statusKey = `${company.id}_${obl.id}_${oblPeriod}`;
              let status = statusMap.get(statusKey);

              // Sem registro: inferir status esperado sem tocar o banco
              if (status === undefined) {
                status = isObligationDisabledForCompany(obl, company) ? "disabled" : "pending";
              }

              const stats = obligationStats[obl.id];
              stats.total++;
              if (status === "completed") stats.completed++;
              else if (status === "disabled" || status === "not_applicable") stats.disabled++;
              else stats.pending++;

              if (status !== "disabled" && status !== "not_applicable") {
                companyActive++;
                if (status === "pending") companyPending++;
              }
            } // end for oblPeriod
          } // end for obl

          // Atribui ao responsável do departamento
          const userId = company[respField];
          if (companyActive > 0 && userId && userStats[userId]) {
            const u = userStats[userId];
            u.totalCompanies++;
            if (companyPending === 0) u.completedCompanies++;
            else u.pendingCompanies++;
          }
        }

        return {
          period: mainPeriod,
          obligations: Object.values(obligationStats),
          users: Object.values(userStats).filter((u) => u.totalCompanies > 0),
          totalCompanies: companies.length,
        };
      }); // end cacheManager.getOrFetch

      return res.json(cachedData);
    } catch (err) {
      logger.error(`ObligationController.getDashboard: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // GET /obligation/companies/:obligationId?period=YYYY-MM
  // Lista todas as empresas (ATIVAS) com seu status para esta obrigação
  static async getCompaniesByObligation(req, res) {
    try {
      const { obligationId } = req.params;
      const obligation = await AccessoryObligation.findByPk(obligationId);
      if (!obligation) return res.status(404).json({ message: "Obrigação não encontrada." });

      const period = req.query.period || getCurrentPeriod(obligation);

      // Busca em lote exclusões e inclusões manuais para esta obrigação
      const excludedCompanyIds = new Set(
        (await CompanyObligationStatus.findAll({
          where: { obligationId: obligation.id, isManuallyExcluded: true },
          attributes: ["companyId"],
        })).map((s) => s.companyId)
      );
      const manualCompanyIds = new Set(
        (await CompanyObligationStatus.findAll({
          where: { obligationId: obligation.id, isManuallyAssigned: true },
          attributes: ["companyId"],
        })).map((s) => s.companyId)
      );

      // Somente empresas ATIVAS
      const companies = await Company.findAll({
        where: { isArchived: false, status: "ATIVA" },
        include: [{ model: User, as: "respFiscal", attributes: ["id", "name"] }],
      });

      const rows = [];
      for (const company of companies) {
        if (excludedCompanyIds.has(company.id)) continue;
        if (!obligationMatchesCompany(obligation, company) && !manualCompanyIds.has(company.id)) continue;

        const statusRecord = await getOrCreateStatus(company, obligation, period);
        rows.push({
          companyId: company.id,
          companyName: company.name,
          num: company.num,
          uf: company.uf,
          rule: company.rule,
          isZeroedFiscal: company.isZeroedFiscal,
          isZeroedDp: company.isZeroedDp,
          isZeroedContabil: company.isZeroedContabil,
          respFiscalId: company.respFiscalId,
          respFiscalName: company.respFiscal?.name || null,
          status: statusRecord.status,
          completedAt: statusRecord.completedAt,
        });
      }

      // Ordena: pendentes → concluídas → desabilitadas/não aplicáveis
      const order = { pending: 0, completed: 1, disabled: 2, not_applicable: 2 };
      rows.sort((a, b) => (order[a.status] ?? 0) - (order[b.status] ?? 0));

      return res.json({ obligation: obligation.toJSON(), period, companies: rows });
    } catch (err) {
      logger.error(`ObligationController.getCompaniesByObligation: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }
};

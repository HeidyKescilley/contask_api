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

// ── Helpers ────────────────────────────────────────────────────────────────────

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
 * Retorna ou cria o registro de status para uma empresa/obrigação/período.
 * Aplica lógica de desabilitação automática (zerado + sendWhenZeroed=false).
 */
async function getOrCreateStatus(company, obligation, period) {
  // Determina status inicial
  let initialStatus = "pending";
  if (!obligation.sendWhenZeroed && company.isZeroedFiscal) {
    initialStatus = "disabled";
  }

  const [statusRecord] = await CompanyObligationStatus.findOrCreate({
    where: { companyId: company.id, obligationId: obligation.id, period },
    defaults: { status: initialStatus },
  });

  // Se empresa ficou zerada após o registro ser criado, atualiza para disabled
  if (!obligation.sendWhenZeroed && company.isZeroedFiscal && statusRecord.status === "pending") {
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
        periodicity, sendWhenZeroed, applicableRegimes,
        applicableClassificacoes, applicableUFs,
      } = req.body;

      if (!name || !department || !deadline || !deadlineType || !periodicity) {
        return res.status(400).json({ message: "Campos obrigatórios: name, department, deadline, deadlineType, periodicity." });
      }

      const obligation = await AccessoryObligation.create({
        name, description, department,
        deadline: parseInt(deadline, 10),
        deadlineType, periodicity,
        sendWhenZeroed: sendWhenZeroed !== false,
        applicableRegimes: applicableRegimes || null,
        applicableClassificacoes: applicableClassificacoes || null,
        applicableUFs: applicableUFs || null,
      });

      logger.info(`Obrigação "${name}" criada por ${req.user?.name}`);
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
        "periodicity", "sendWhenZeroed", "applicableRegimes",
        "applicableClassificacoes", "applicableUFs",
      ];
      const updates = {};
      allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

      await obligation.update(updates);
      logger.info(`Obrigação ${req.params.id} atualizada por ${req.user?.name}`);
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

      // Para cada obrigação aplicável, busca ou cria o status do período atual
      const period = req.query.period || getCurrentPeriod({ periodicity: "monthly" });
      const result = [];

      for (const obl of applicableObligations) {
        const oblPeriod = req.query.period || getCurrentPeriod(obl);
        const statusRecord = await getOrCreateStatus(company, obl, oblPeriod);

        let deadlineDate = null;
        try {
          deadlineDate = await getDeadlineDate(obl, oblPeriod);
        } catch {}

        result.push({
          ...obl.toJSON(),
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

      // Inclui obrigações excluídas manualmente na resposta (para exibir no form de edição)
      for (const statusRec of excludedStatuses) {
        const obl = allObligations.find((o) => o.id === statusRec.obligationId);
        if (!obl) continue;
        result.push({
          ...obl.toJSON(),
          statusId: statusRec.id,
          status: statusRec.status,
          completedAt: null,
          completedById: null,
          isManuallyAssigned: false,
          isManuallyExcluded: true,
          period: req.query.period || getCurrentPeriod(obl),
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
          status: !obligation.sendWhenZeroed && company.isZeroedFiscal ? "disabled" : "pending",
          isManuallyAssigned: true,
        },
      });

      if (!created) {
        await statusRecord.update({ isManuallyAssigned: true });
      }

      return res.json({ message: "Obrigação adicionada manualmente.", statusRecord });
    } catch (err) {
      logger.error(`ObligationController.toggleManual: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // PATCH /obligation/status/:statusId
  // Body: { status: "pending"|"completed"|"disabled" }
  static async updateStatus(req, res) {
    try {
      const { statusId } = req.params;
      const { status } = req.body;

      if (!["pending", "completed", "disabled"].includes(status)) {
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
      return res.json(record);
    } catch (err) {
      logger.error(`ObligationController.updateStatus: ${err.message}`);
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
            status: !obl.sendWhenZeroed && company.isZeroedFiscal ? "disabled" : "pending",
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

      // Determina período ativo
      const obligations = await AccessoryObligation.findAll({ where: { department } });
      if (obligations.length === 0) return res.json({ obligations: [], companies: [] });

      // Usa a periodicidade da primeira obrigação para calcular o período atual
      // (idealidade: suportar múltiplas periodicidades no mesmo resumo)
      const period = req.query.period || getCurrentPeriod(obligations[0]);

      // Busca apenas empresas ativas (suspensas/baixadas/distratadas não contam)
      const companies = await Company.findAll({ where: { isArchived: false, status: "ATIVA" } });

      const result = [];
      for (const company of companies) {
        // Obrigações excluídas manualmente para esta empresa
        const excludedStatuses = await CompanyObligationStatus.findAll({
          where: { companyId: company.id, isManuallyExcluded: true },
          attributes: ["obligationId"],
        });
        const excludedIds = new Set(excludedStatuses.map((s) => s.obligationId));

        // Obrigações adicionadas manualmente para esta empresa
        const manualStatuses = await CompanyObligationStatus.findAll({
          where: { companyId: company.id, isManuallyAssigned: true },
          attributes: ["obligationId"],
        });
        const manualIds = new Set(manualStatuses.map((s) => s.obligationId));

        const companyObligations = [];
        for (const obl of obligations) {
          if (excludedIds.has(obl.id)) continue; // excluída manualmente
          if (!obligationMatchesCompany(obl, company) && !manualIds.has(obl.id)) continue;
          const oblPeriod = req.query.period || getCurrentPeriod(obl);
          const statusRecord = await getOrCreateStatus(company, obl, oblPeriod);
          companyObligations.push({
            obligationId: obl.id,
            name: obl.name,
            statusId: statusRecord.id,
            status: statusRecord.status,
            completedAt: statusRecord.completedAt,
          });
        }
        if (companyObligations.length > 0) {
          result.push({
            companyId: company.id,
            companyName: company.name,
            num: company.num,
            uf: company.uf,
            rule: company.rule,
            isZeroedFiscal: company.isZeroedFiscal,
            sentToClientFiscal: company.sentToClientFiscal,
            obligations: companyObligations,
            total: companyObligations.length,
            completed: companyObligations.filter((o) => o.status === "completed").length,
          });
        }
      }

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

      const obligations = await AccessoryObligation.findAll({ where: { department } });
      if (obligations.length === 0) {
        return res.json({ period: null, obligations: [], users: [], totalCompanies: 0 });
      }

      const period = req.query.period || getCurrentPeriod(obligations[0]);
      // Somente empresas ATIVAS
      const companies = await Company.findAll({ where: { isArchived: false, status: "ATIVA" } });

      // Usuários do departamento Fiscal para breakdown por responsável
      const fiscalUsers = await User.findAll({
        where: { department: "Fiscal" },
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
      });
      const userStats = {};
      for (const u of fiscalUsers) {
        userStats[u.id] = { id: u.id, name: u.name, totalCompanies: 0, completedCompanies: 0, pendingCompanies: 0 };
      }

      // Métricas por obrigação
      const obligationStats = {};
      for (const obl of obligations) {
        obligationStats[obl.id] = {
          id: obl.id,
          name: obl.name,
          department: obl.department,
          sendWhenZeroed: obl.sendWhenZeroed,
          total: 0,
          completed: 0,
          pending: 0,
          disabled: 0,
        };
      }

      for (const company of companies) {
        const excludedStatuses = await CompanyObligationStatus.findAll({
          where: { companyId: company.id, isManuallyExcluded: true },
          attributes: ["obligationId"],
        });
        const excludedIds = new Set(excludedStatuses.map((s) => s.obligationId));

        const manualStatuses = await CompanyObligationStatus.findAll({
          where: { companyId: company.id, isManuallyAssigned: true },
          attributes: ["obligationId"],
        });
        const manualIds = new Set(manualStatuses.map((s) => s.obligationId));

        let companyActive = 0;
        let companyPending = 0;

        for (const obl of obligations) {
          if (excludedIds.has(obl.id)) continue;
          if (!obligationMatchesCompany(obl, company) && !manualIds.has(obl.id)) continue;

          const oblPeriod = req.query.period || getCurrentPeriod(obl);
          const statusRecord = await getOrCreateStatus(company, obl, oblPeriod);

          const stats = obligationStats[obl.id];
          stats.total++;
          if (statusRecord.status === "completed") stats.completed++;
          else if (statusRecord.status === "disabled") stats.disabled++;
          else stats.pending++;

          // Para breakdown por usuário: conta apenas obrigações ativas (não desabilitadas)
          if (statusRecord.status !== "disabled") {
            companyActive++;
            if (statusRecord.status === "pending") companyPending++;
          }
        }

        // Atribui ao responsável fiscal
        if (companyActive > 0 && company.respFiscalId && userStats[company.respFiscalId]) {
          const u = userStats[company.respFiscalId];
          u.totalCompanies++;
          if (companyPending === 0) u.completedCompanies++;
          else u.pendingCompanies++;
        }
      }

      return res.json({
        period,
        obligations: Object.values(obligationStats),
        users: Object.values(userStats).filter((u) => u.totalCompanies > 0),
        totalCompanies: companies.length,
      });
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
          respFiscalId: company.respFiscalId,
          respFiscalName: company.respFiscal?.name || null,
          status: statusRecord.status,
          completedAt: statusRecord.completedAt,
        });
      }

      // Ordena: pendentes → concluídas → desabilitadas
      const order = { pending: 0, completed: 1, disabled: 2 };
      rows.sort((a, b) => (order[a.status] ?? 0) - (order[b.status] ?? 0));

      return res.json({ obligation: obligation.toJSON(), period, companies: rows });
    } catch (err) {
      logger.error(`ObligationController.getCompaniesByObligation: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }
};

// /controllers/TaxController.js
const CompanyTax = require("../models/CompanyTax");
const CompanyTaxStatus = require("../models/CompanyTaxStatus");
const Company = require("../models/Company");
const User = require("../models/User");
const logger = require("../logger/logger");
const { getDeptConfig } = require("../config/departmentConfig");
const cacheManager = require("../utils/CacheManager");

// ── Período atual (sempre mensal) ──────────────────────────────────────────────
function getCurrentMonthPeriod(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ── Verificar se imposto se aplica à empresa ───────────────────────────────────
function taxMatchesCompany(tax, company) {
  const { applicableRegimes, applicableClassificacoes, applicableUFs } = tax;
  if (applicableRegimes?.length > 0 && !applicableRegimes.includes(company.rule)) return false;
  if (applicableClassificacoes?.length > 0 && !applicableClassificacoes.includes(company.classi)) return false;
  if (applicableUFs?.length > 0 && !applicableUFs.includes(company.uf)) return false;
  return true;
}

// ── Verifica se empresa está zerada para o departamento ───────────────────────
function isCompanyZeroedForDept(company, department) {
  const cfg = getDeptConfig(department);
  if (!cfg?.isZeroed) return false;
  return !!company[cfg.isZeroed];
}

// ── Busca ou cria status do imposto — aplica disabled para empresa zerada ─────
async function getOrCreateTaxStatus(company, tax, period) {
  const zeroed = isCompanyZeroedForDept(company, tax.department);
  const initialStatus = zeroed ? "disabled" : "pending";

  const [statusRecord] = await CompanyTaxStatus.findOrCreate({
    where: { companyId: company.id, taxId: tax.id, period },
    defaults: { status: initialStatus },
  });

  // Garante que empresa zerada (mesmo após criação) fique disabled
  if (zeroed && statusRecord.status === "pending") {
    await statusRecord.update({ status: "disabled" });
    statusRecord.status = "disabled";
  }

  return statusRecord;
}

module.exports = class TaxController {

  // GET /tax/all?department=Fiscal
  static async getAll(req, res) {
    try {
      const { department } = req.query;
      const where = department ? { department } : {};
      const taxes = await CompanyTax.findAll({ where, order: [["name", "ASC"]] });
      return res.json(taxes);
    } catch (err) {
      logger.error(`TaxController.getAll: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // POST /tax/create  (admin only)
  static async create(req, res) {
    try {
      const { name, department, applicableRegimes, applicableClassificacoes, applicableUFs } = req.body;
      if (!name) return res.status(400).json({ message: "Nome é obrigatório." });
      if (!department) return res.status(400).json({ message: "Departamento é obrigatório." });
      const tax = await CompanyTax.create({
        name,
        department,
        applicableRegimes: applicableRegimes || null,
        applicableClassificacoes: applicableClassificacoes || null,
        applicableUFs: applicableUFs || null,
      });
      logger.info(`Imposto "${name}" (${department}) criado por ${req.user?.name}`);
      cacheManager.invalidateByPrefix("tax_dashboard");
      return res.status(201).json(tax);
    } catch (err) {
      logger.error(`TaxController.create: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // PATCH /tax/:id  (admin only)
  static async update(req, res) {
    try {
      const tax = await CompanyTax.findByPk(req.params.id);
      if (!tax) return res.status(404).json({ message: "Imposto não encontrado." });
      const allowed = ["name", "department", "applicableRegimes", "applicableClassificacoes", "applicableUFs"];
      const updates = {};
      allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
      await tax.update(updates);
      cacheManager.invalidateByPrefix("tax_dashboard");
      return res.json(tax);
    } catch (err) {
      logger.error(`TaxController.update: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // DELETE /tax/:id  (admin only)
  static async remove(req, res) {
    try {
      const tax = await CompanyTax.findByPk(req.params.id);
      if (!tax) return res.status(404).json({ message: "Imposto não encontrado." });
      await tax.destroy();
      cacheManager.invalidateByPrefix("tax_dashboard");
      return res.json({ message: "Imposto excluído." });
    } catch (err) {
      logger.error(`TaxController.remove: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // GET /tax/company/:companyId?period=YYYY-MM
  static async getCompanyTaxes(req, res) {
    try {
      const { companyId } = req.params;
      const period = req.query.period || getCurrentMonthPeriod();

      const company = await Company.findByPk(companyId);
      if (!company) return res.status(404).json({ message: "Empresa não encontrada." });

      const allTaxes = await CompanyTax.findAll({ order: [["department", "ASC"], ["name", "ASC"]] });

      const manualStatuses = await CompanyTaxStatus.findAll({
        where: { companyId, isManuallyAssigned: true },
        attributes: ["taxId"],
      });
      const manualIds = new Set(manualStatuses.map((s) => s.taxId));

      const excludedStatuses = await CompanyTaxStatus.findAll({
        where: { companyId, isManuallyExcluded: true },
        attributes: ["taxId", "id", "status"],
      });
      const excludedIds = new Set(excludedStatuses.map((s) => s.taxId));

      const result = [];

      for (const tax of allTaxes) {
        const isExcluded = excludedIds.has(tax.id);
        const isApplicable = taxMatchesCompany(tax, company) || manualIds.has(tax.id);

        if (isExcluded) {
          result.push({ ...tax.toJSON(), statusId: null, status: "pending", isManuallyAssigned: false, isManuallyExcluded: true });
          continue;
        }
        if (!isApplicable) continue;

        const statusRecord = await getOrCreateTaxStatus(company, tax, period);

        result.push({
          ...tax.toJSON(),
          statusId: statusRecord.id,
          status: statusRecord.status,
          completedAt: statusRecord.completedAt,
          isManuallyAssigned: manualIds.has(tax.id),
          isManuallyExcluded: false,
          period,
        });
      }

      return res.json(result);
    } catch (err) {
      logger.error(`TaxController.getCompanyTaxes: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // POST /tax/company/:companyId/toggle  (admin only)
  static async toggleManual(req, res) {
    try {
      const { companyId } = req.params;
      const { taxId, action, period } = req.body;

      const company = await Company.findByPk(companyId);
      if (!company) return res.status(404).json({ message: "Empresa não encontrada." });

      const tax = await CompanyTax.findByPk(taxId);
      if (!tax) return res.status(404).json({ message: "Imposto não encontrado." });

      const activePeriod = period || getCurrentMonthPeriod();

      if (action === "remove") {
        await CompanyTaxStatus.destroy({ where: { companyId, taxId, isManuallyAssigned: true } });
        return res.json({ message: "Imposto removido manualmente." });
      }

      if (action === "exclude") {
        const [rec] = await CompanyTaxStatus.findOrCreate({
          where: { companyId, taxId, period: activePeriod },
          defaults: { status: "pending", isManuallyExcluded: true },
        });
        if (!rec.isManuallyExcluded) await rec.update({ isManuallyExcluded: true });
        return res.json({ message: "Imposto excluído para esta empresa." });
      }

      if (action === "include") {
        await CompanyTaxStatus.update(
          { isManuallyExcluded: false, status: "pending" },
          { where: { companyId, taxId, isManuallyExcluded: true } }
        );
        return res.json({ message: "Imposto re-incluído para esta empresa." });
      }

      // action === "add"
      const zeroed = isCompanyZeroedForDept(company, tax.department);
      const [rec, created] = await CompanyTaxStatus.findOrCreate({
        where: { companyId, taxId, period: activePeriod },
        defaults: { status: zeroed ? "disabled" : "pending", isManuallyAssigned: true },
      });
      if (!created) await rec.update({ isManuallyAssigned: true });
      return res.json({ message: "Imposto adicionado manualmente.", rec });
    } catch (err) {
      logger.error(`TaxController.toggleManual: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // PATCH /tax/status/:statusId
  static async updateStatus(req, res) {
    try {
      const { status } = req.body;
      if (!["pending", "completed"].includes(status)) {
        return res.status(400).json({ message: "Status inválido." });
      }
      const record = await CompanyTaxStatus.findByPk(req.params.statusId);
      if (!record) return res.status(404).json({ message: "Registro não encontrado." });

      // Não permite alterar status de registros desabilitados (empresa zerada)
      if (record.status === "disabled") {
        return res.status(400).json({ message: "Não é possível alterar o status de um imposto desabilitado (empresa zerada)." });
      }

      await record.update({
        status,
        completedAt: status === "completed" ? new Date() : null,
        completedById: status === "completed" ? (req.user?.id || null) : null,
      });
      cacheManager.invalidateByPrefix("tax_dashboard");
      return res.json(record);
    } catch (err) {
      logger.error(`TaxController.updateStatus: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // GET /tax/period-summary?period=YYYY-MM&department=Fiscal
  static async getPeriodSummary(req, res) {
    try {
      const { department } = req.query;
      const period = req.query.period || getCurrentMonthPeriod();
      const where = department ? { department } : {};
      const taxes = await CompanyTax.findAll({ where, order: [["name", "ASC"]] });
      if (taxes.length === 0) return res.json({ period, taxes: [], companies: [] });

      const companies = await Company.findAll({ where: { isArchived: false, status: "ATIVA" } });
      const result = [];

      for (const company of companies) {
        const excludedStatuses = await CompanyTaxStatus.findAll({
          where: { companyId: company.id, isManuallyExcluded: true },
          attributes: ["taxId"],
        });
        const excludedIds = new Set(excludedStatuses.map((s) => s.taxId));

        const manualStatuses = await CompanyTaxStatus.findAll({
          where: { companyId: company.id, isManuallyAssigned: true },
          attributes: ["taxId"],
        });
        const manualIds = new Set(manualStatuses.map((s) => s.taxId));

        const companyTaxes = [];
        for (const tax of taxes) {
          if (excludedIds.has(tax.id)) continue;
          if (!taxMatchesCompany(tax, company) && !manualIds.has(tax.id)) continue;

          const statusRecord = await getOrCreateTaxStatus(company, tax, period);
          companyTaxes.push({
            taxId: tax.id,
            name: tax.name,
            department: tax.department,
            statusId: statusRecord.id,
            status: statusRecord.status,
            completedAt: statusRecord.completedAt,
          });
        }

        if (companyTaxes.length > 0) {
          result.push({
            companyId: company.id,
            companyName: company.name,
            num: company.num,
            uf: company.uf,
            rule: company.rule,
            isZeroedFiscal: company.isZeroedFiscal,
            isZeroedDp: company.isZeroedDp,
            taxes: companyTaxes,
            total: companyTaxes.length,
            completed: companyTaxes.filter((t) => t.status === "completed").length,
          });
        }
      }

      return res.json({ period, taxes, companies: result });
    } catch (err) {
      logger.error(`TaxController.getPeriodSummary: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // GET /tax/dashboard?period=YYYY-MM&department=Fiscal
  static async getDashboard(req, res) {
    try {
      const { department } = req.query;
      const period = req.query.period || getCurrentMonthPeriod();
      const deptCfg = getDeptConfig(department);
      const cacheKey = `tax_dashboard_${department || "all"}_${period}`;

      const cachedData = await cacheManager.getOrFetch(cacheKey, async () => {
        const where = department ? { department } : {};

        const [taxes, companies, deptUsers] = await Promise.all([
          CompanyTax.findAll({ where, order: [["name", "ASC"]] }),
          Company.findAll({
            where: { isArchived: false, status: "ATIVA" },
            attributes: ["id", "respFiscalId", "respDpId", "respContabilId", "isZeroedFiscal", "isZeroedDp", "rule", "classi", "uf"],
            raw: true,
          }),
          deptCfg
            ? User.findAll({ where: { department }, attributes: ["id", "name"], order: [["name", "ASC"]] })
            : Promise.resolve([]),
        ]);

        if (taxes.length === 0) return { period, taxes: [], users: [], totalCompanies: 0 };

        // 3 queries em batch substituindo N×M queries individuais
        const [allStatuses, allExclusions, allManuals] = await Promise.all([
          CompanyTaxStatus.findAll({
            where: { period },
            attributes: ["companyId", "taxId", "status"],
            raw: true,
          }),
          CompanyTaxStatus.findAll({
            where: { isManuallyExcluded: true },
            attributes: ["companyId", "taxId"],
            raw: true,
          }),
          CompanyTaxStatus.findAll({
            where: { isManuallyAssigned: true },
            attributes: ["companyId", "taxId"],
            raw: true,
          }),
        ]);

        // Maps para lookup O(1)
        const statusMap = new Map();
        for (const s of allStatuses) {
          statusMap.set(`${s.companyId}_${s.taxId}`, s.status);
        }
        const excludedMap = new Map();
        for (const e of allExclusions) {
          if (!excludedMap.has(e.companyId)) excludedMap.set(e.companyId, new Set());
          excludedMap.get(e.companyId).add(e.taxId);
        }
        const manualMap = new Map();
        for (const m of allManuals) {
          if (!manualMap.has(m.companyId)) manualMap.set(m.companyId, new Set());
          manualMap.get(m.companyId).add(m.taxId);
        }

        const userStats = {};
        for (const u of deptUsers) {
          userStats[u.id] = { id: u.id, name: u.name, totalCompanies: 0, completedCompanies: 0, pendingCompanies: 0 };
        }

        const taxStats = {};
        for (const tax of taxes) {
          taxStats[tax.id] = { id: tax.id, name: tax.name, department: tax.department, total: 0, completed: 0, pending: 0, disabled: 0 };
        }

        // Processamento in-memory — zero queries adicionais
        for (const company of companies) {
          const excludedIds = excludedMap.get(company.id) || new Set();
          const manualIds = manualMap.get(company.id) || new Set();
          let companyActive = 0;
          let companyPending = 0;

          for (const tax of taxes) {
            if (excludedIds.has(tax.id)) continue;
            if (!taxMatchesCompany(tax, company) && !manualIds.has(tax.id)) continue;

            let status = statusMap.get(`${company.id}_${tax.id}`);
            // Sem registro: inferir status sem tocar o banco
            if (status === undefined) {
              status = isCompanyZeroedForDept(company, tax.department) ? "disabled" : "pending";
            }

            taxStats[tax.id].total++;
            if (status === "completed") taxStats[tax.id].completed++;
            else if (status === "disabled") taxStats[tax.id].disabled++;
            else taxStats[tax.id].pending++;

            if (status !== "disabled") {
              companyActive++;
              if (status === "pending") companyPending++;
            }
          }

          const respId = deptCfg ? company[deptCfg.responsibleField] : null;
          if (companyActive > 0 && respId && userStats[respId]) {
            const u = userStats[respId];
            u.totalCompanies++;
            if (companyPending === 0) u.completedCompanies++;
            else u.pendingCompanies++;
          }
        }

        return {
          period,
          taxes: Object.values(taxStats),
          users: Object.values(userStats).filter((u) => u.totalCompanies > 0),
          totalCompanies: companies.length,
        };
      }); // end cacheManager.getOrFetch

      return res.json(cachedData);
    } catch (err) {
      logger.error(`TaxController.getDashboard: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // GET /tax/companies/:taxId?period=YYYY-MM
  static async getCompaniesByTax(req, res) {
    try {
      const { taxId } = req.params;
      const tax = await CompanyTax.findByPk(taxId);
      if (!tax) return res.status(404).json({ message: "Imposto não encontrado." });

      const period = req.query.period || getCurrentMonthPeriod();
      const deptCfg = getDeptConfig(tax.department);

      const excludedCompanyIds = new Set(
        (await CompanyTaxStatus.findAll({
          where: { taxId: tax.id, isManuallyExcluded: true },
          attributes: ["companyId"],
        })).map((s) => s.companyId)
      );
      const manualCompanyIds = new Set(
        (await CompanyTaxStatus.findAll({
          where: { taxId: tax.id, isManuallyAssigned: true },
          attributes: ["companyId"],
        })).map((s) => s.companyId)
      );

      // Inclui o responsável correto conforme o departamento
      const includes = [];
      if (deptCfg?.responsibleAlias) {
        includes.push({ model: User, as: deptCfg.responsibleAlias, attributes: ["id", "name"] });
      }

      const companies = await Company.findAll({
        where: { isArchived: false, status: "ATIVA" },
        include: includes,
      });

      const rows = [];
      for (const company of companies) {
        if (excludedCompanyIds.has(company.id)) continue;
        if (!taxMatchesCompany(tax, company) && !manualCompanyIds.has(company.id)) continue;

        const statusRecord = await getOrCreateTaxStatus(company, tax, period);
        const respUser = deptCfg?.responsibleAlias ? company[deptCfg.responsibleAlias] : null;

        rows.push({
          companyId: company.id,
          companyName: company.name,
          num: company.num,
          uf: company.uf,
          rule: company.rule,
          isZeroedFiscal: company.isZeroedFiscal,
          isZeroedDp: company.isZeroedDp,
          respName: respUser?.name || null,
          status: statusRecord.status,
          completedAt: statusRecord.completedAt,
        });
      }

      // Ordena: pendentes → concluídas → desabilitadas
      const order = { pending: 0, completed: 1, disabled: 2 };
      rows.sort((a, b) => (order[a.status] ?? 0) - (order[b.status] ?? 0));

      return res.json({ tax: tax.toJSON(), period, companies: rows });
    } catch (err) {
      logger.error(`TaxController.getCompaniesByTax: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // Helper estático — aplica impostos automáticos a uma empresa recém-criada
  static async applyTaxesToCompany(company) {
    try {
      const period = getCurrentMonthPeriod();
      const taxes = await CompanyTax.findAll();
      for (const tax of taxes) {
        if (!taxMatchesCompany(tax, company)) continue;
        const zeroed = isCompanyZeroedForDept(company, tax.department);
        await CompanyTaxStatus.findOrCreate({
          where: { companyId: company.id, taxId: tax.id, period },
          defaults: { status: zeroed ? "disabled" : "pending" },
        });
      }
    } catch (err) {
      logger.error(`applyTaxesToCompany(${company.id}): ${err.message}`);
    }
  }
};

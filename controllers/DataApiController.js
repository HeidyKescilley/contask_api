// /controllers/DataApiController.js
const { Op } = require("sequelize");
const Company = require("../models/Company");
const User = require("../models/User");
const Automation = require("../models/Automation");
const CompanyTaxStatus = require("../models/CompanyTaxStatus");
const CompanyTax = require("../models/CompanyTax");
const CompanyObligationStatus = require("../models/CompanyObligationStatus");
const AccessoryObligation = require("../models/AccessoryObligation");
const Grupo = require("../models/Grupo");
const ContactMode = require("../models/ContactMode");

// ─── helpers ──────────────────────────────────────────────────────────────────

function parseBool(val) {
  if (val === "true" || val === "1") return true;
  if (val === "false" || val === "0") return false;
  return undefined;
}

/** Campo de igualdade exata. Suporta "null" como valor literal. */
function exact(where, field, val) {
  if (val === undefined) return;
  where[field] = val === "null" || val === "NULL" ? null : val;
}

/** Campo inteiro exato. Suporta "null". */
function exactInt(where, field, val) {
  if (val === undefined) return;
  where[field] = val === "null" || val === "NULL" ? null : Number(val);
}

/** Busca parcial case-insensitive (LIKE %val%). */
function like(where, field, val) {
  if (!val) return;
  where[field] = { [Op.like]: `%${val}%` };
}

/** Booleano: aceita true/false/1/0. */
function bool(where, field, val) {
  if (val === undefined) return;
  const b = parseBool(val);
  if (b !== undefined) where[field] = b;
}

/** Faixa numérica com ?campo_min e ?campo_max. */
function range(where, field, min, max) {
  if (min === undefined && max === undefined) return;
  where[field] = {};
  if (min !== undefined) where[field][Op.gte] = Number(min);
  if (max !== undefined) where[field][Op.lte] = Number(max);
}

/** Faixa de datas com ?campo_from (YYYY-MM-DD) e ?campo_to. */
function dateRange(where, field, from, to) {
  if (!from && !to) return;
  where[field] = {};
  if (from) where[field][Op.gte] = new Date(from);
  if (to) where[field][Op.lte] = new Date(to + "T23:59:59");
}

/** Ordena e pagina. */
function paginate(q) {
  const allowedCompanyFields = [
    "id", "num", "name", "cnpj", "rule", "classi", "status", "uf",
    "bonusValue", "employeesCount", "accountingMonthsCount",
    "createdAt", "updatedAt", "statusUpdatedAt",
  ];
  const allowedUserFields = ["id", "name", "email", "department", "role", "createdAt"];

  const allowed = [...allowedCompanyFields, ...allowedUserFields];
  const orderBy = allowed.includes(q.orderBy) ? q.orderBy : "name";
  const order = q.order === "DESC" ? "DESC" : "ASC";
  const limit = q.limit ? Math.min(Number(q.limit), 1000) : 500;
  const offset = q.offset ? Number(q.offset) : 0;
  return { order: [[orderBy, order]], limit, offset };
}

// ─── GET /api/data/companies ──────────────────────────────────────────────────
module.exports = class DataApiController {
  static async getCompanies(req, res) {
    const q = req.query;
    const where = {};

    // --- Campos exatos (ID / FK / enums) ---
    exactInt(where, "id", q.id);
    exact(where, "num", q.num);
    exact(where, "rule", q.rule);           // Simples | Presumido | Real | MEI
    exact(where, "classi", q.classi);       // ICMS | ISS | ICMS/ISS
    exact(where, "status", q.status);       // ATIVA | DISTRATO | PARALISADA …
    exact(where, "uf", q.uf);
    exact(where, "branchNumber", q.branchNumber);
    exactInt(where, "respFiscalId", q.respFiscalId);
    exactInt(where, "respDpId", q.respDpId);
    exactInt(where, "respContabilId", q.respContabilId);
    exactInt(where, "contactModeId", q.contactModeId);
    exactInt(where, "grupoId", q.grupoId);

    // --- Busca parcial (texto) ---
    like(where, "name", q.name);
    like(where, "cnpj", q.cnpj);
    like(where, "ie", q.ie);
    like(where, "email", q.email);
    like(where, "phone", q.phone);
    like(where, "contact", q.contact);
    like(where, "obs", q.obs);
    like(where, "important_info", q.important_info);

    // --- Booleanos ---
    bool(where, "isArchived", q.isArchived);
    bool(where, "isHeadquarters", q.isHeadquarters);
    bool(where, "openedByUs", q.openedByUs);
    bool(where, "isZeroedFiscal", q.isZeroedFiscal);
    bool(where, "sentToClientFiscal", q.sentToClientFiscal);
    bool(where, "isZeroedDp", q.isZeroedDp);
    bool(where, "sentToClientDp", q.sentToClientDp);
    bool(where, "declarationsCompletedDp", q.declarationsCompletedDp);
    bool(where, "hasNoDpObligations", q.hasNoDpObligations);
    bool(where, "isZeroedContabil", q.isZeroedContabil);

    // --- Faixas numéricas ---
    range(where, "bonusValue", q.bonusValue_min, q.bonusValue_max);
    range(where, "employeesCount", q.employeesCount_min, q.employeesCount_max);
    range(where, "accountingMonthsCount", q.accountingMonthsCount_min, q.accountingMonthsCount_max);

    // --- Faixas de data ---
    dateRange(where, "createdAt", q.createdAt_from, q.createdAt_to);
    dateRange(where, "statusUpdatedAt", q.statusUpdatedAt_from, q.statusUpdatedAt_to);
    dateRange(where, "fiscalCompletedAt", q.fiscalCompletedAt_from, q.fiscalCompletedAt_to);
    dateRange(where, "dpCompletedAt", q.dpCompletedAt_from, q.dpCompletedAt_to);
    dateRange(where, "contabilCompletedAt", q.contabilCompletedAt_from, q.contabilCompletedAt_to);

    // --- Includes com filtro por nome do responsável ---
    const fiscalInclude = { model: User, as: "respFiscal", attributes: ["id", "name", "department"] };
    const dpInclude = { model: User, as: "respDp", attributes: ["id", "name", "department"] };
    const contabilInclude = { model: User, as: "respContabil", attributes: ["id", "name", "department"] };

    if (q.respFiscalName) {
      fiscalInclude.where = { name: { [Op.like]: `%${q.respFiscalName}%` } };
      fiscalInclude.required = true;
    }
    if (q.respDpName) {
      dpInclude.where = { name: { [Op.like]: `%${q.respDpName}%` } };
      dpInclude.required = true;
    }
    if (q.respContabilName) {
      contabilInclude.where = { name: { [Op.like]: `%${q.respContabilName}%` } };
      contabilInclude.required = true;
    }

    const { order, limit, offset } = paginate(q);

    const companies = await Company.findAndCountAll({
      where,
      include: [
        fiscalInclude,
        dpInclude,
        contabilInclude,
        { model: Grupo, as: "grupo", attributes: ["id", "name"] },
        { model: ContactMode, as: "contactMode", attributes: ["id", "name"] },
      ],
      order,
      limit,
      offset,
      distinct: true,
    });

    return res.status(200).json({
      total: companies.count,
      limit,
      offset,
      data: companies.rows,
    });
  }

  // ─── GET /api/data/companies/:id ─────────────────────────────────────────
  static async getCompanyById(req, res) {
    const { id } = req.params;

    const company = await Company.findByPk(id, {
      include: [
        { model: User, as: "respFiscal", attributes: ["id", "name", "department"] },
        { model: User, as: "respDp", attributes: ["id", "name", "department"] },
        { model: User, as: "respContabil", attributes: ["id", "name", "department"] },
        { model: Grupo, as: "grupo", attributes: ["id", "name"] },
        { model: ContactMode, as: "contactMode", attributes: ["id", "name"] },
        {
          model: CompanyTaxStatus,
          as: "taxStatuses",
          include: [{ model: CompanyTax, as: "tax", attributes: ["id", "name", "department"] }],
        },
        {
          model: CompanyObligationStatus,
          as: "obligationStatuses",
          include: [{ model: AccessoryObligation, as: "obligation", attributes: ["id", "name"] }],
        },
        { model: Automation, as: "automations", attributes: ["id", "name"], through: { attributes: [] } },
      ],
    });

    if (!company) return res.status(404).json({ message: "Empresa não encontrada." });
    return res.status(200).json(company);
  }

  // ─── GET /api/data/users ──────────────────────────────────────────────────
  static async getUsers(req, res) {
    const q = req.query;
    const where = {};

    exactInt(where, "id", q.id);
    exact(where, "department", q.department);   // Fiscal | Pessoal | Contábil | Financeiro…
    exact(where, "role", q.role);               // admin | user | not-validated
    like(where, "name", q.name);
    like(where, "email", q.email);
    like(where, "ramal", q.ramal);
    bool(where, "hasBonus", q.hasBonus);
    dateRange(where, "birthday", q.birthday_from, q.birthday_to);
    dateRange(where, "createdAt", q.createdAt_from, q.createdAt_to);

    const { order, limit, offset } = paginate(q);

    const users = await User.findAndCountAll({
      where,
      attributes: { exclude: ["password"] },
      order,
      limit,
      offset,
    });

    return res.status(200).json({
      total: users.count,
      limit,
      offset,
      data: users.rows,
    });
  }

  // ─── GET /api/data/automations ────────────────────────────────────────────
  static async getAutomations(req, res) {
    const automations = await Automation.findAll({
      include: [
        {
          model: Company,
          as: "companies",
          attributes: ["id", "name", "cnpj", "rule", "status"],
          through: { attributes: [] },
        },
      ],
      order: [["name", "ASC"]],
    });

    return res.status(200).json(automations);
  }

  // ─── GET /api/data/taxes ──────────────────────────────────────────────────
  static async getTaxes(req, res) {
    const { month, year, type } = req.query;

    const where = {};
    if (month) where.month = month;
    if (year) where.year = year;

    const taxWhere = {};
    if (type) taxWhere.name = type;

    const { limit, offset } = paginate(req.query);

    const statuses = await CompanyTaxStatus.findAndCountAll({
      where,
      include: [
        {
          model: CompanyTax,
          as: "tax",
          attributes: ["id", "name", "department"],
          where: Object.keys(taxWhere).length ? taxWhere : undefined,
        },
        { model: Company, as: "company", attributes: ["id", "name", "cnpj", "rule", "status"] },
      ],
      order: [["year", "DESC"], ["month", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return res.status(200).json({
      total: statuses.count,
      limit,
      offset,
      data: statuses.rows,
    });
  }

  // ─── GET /api/data/obligations ────────────────────────────────────────────
  static async getObligations(req, res) {
    const { month, year } = req.query;

    const where = {};
    if (month) where.month = month;
    if (year) where.year = year;

    const { limit, offset } = paginate(req.query);

    const statuses = await CompanyObligationStatus.findAndCountAll({
      where,
      include: [
        { model: AccessoryObligation, as: "obligation", attributes: ["id", "name"] },
        { model: Company, as: "company", attributes: ["id", "name", "cnpj", "rule", "status"] },
      ],
      order: [["year", "DESC"], ["month", "DESC"]],
      limit,
      offset,
      distinct: true,
    });

    return res.status(200).json({
      total: statuses.count,
      limit,
      offset,
      data: statuses.rows,
    });
  }
};

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
const Certificate = require("../models/Certificate");
const cacheManager = require("../utils/CacheManager");
const logger = require("../logger/logger");

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
    "bonusValue", "employeesCount", "contabilNota",
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

// ─── certificado digital ──────────────────────────────────────────────────────
// Mesma regra do CompanyController: verde (>15 dias), amarelo (<=15 dias),
// vermelho (vencido), cinza (sem certificado).
const CERTIFICATE_ALERT_DAYS = 15;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Aceita os nomes de cor e apelidos legíveis.
const CERT_STATUS_ALIASES = {
  verde: "verde", valido: "verde", "válido": "verde",
  amarelo: "amarelo", vencendo: "amarelo", a_vencer: "amarelo",
  vermelho: "vermelho", vencido: "vermelho", expirado: "vermelho",
  cinza: "cinza", sem_certificado: "cinza", sem: "cinza",
};

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function certificateDaysLeft(validUntil) {
  if (!validUntil) return null;
  const v = new Date(validUntil);
  v.setHours(0, 0, 0, 0);
  return Math.ceil((v.getTime() - startOfToday().getTime()) / MS_PER_DAY);
}

function computeCertificateStatus(validUntil) {
  const dias = certificateDaysLeft(validUntil);
  if (dias === null) return "cinza";
  if (dias < 0) return "vermelho";
  if (dias <= CERTIFICATE_ALERT_DAYS) return "amarelo";
  return "verde";
}

/** Converte ?certificateStatus=verde,amarelo,... em lista de status canônicos. */
function parseCertStatuses(val) {
  if (!val) return [];
  return [...new Set(
    String(val).split(",")
      .map((v) => CERT_STATUS_ALIASES[v.trim().toLowerCase()])
      .filter(Boolean)
  )];
}

/** Condição sobre validUntil para um status de cor (null para "cinza"). */
function certStatusCondition(status) {
  const today = startOfToday();
  const yellowEnd = new Date(today.getTime() + (CERTIFICATE_ALERT_DAYS + 1) * MS_PER_DAY);
  switch (status) {
    case "vermelho": return { validUntil: { [Op.lt]: today } };
    case "amarelo": return { validUntil: { [Op.gte]: today, [Op.lt]: yellowEnd } };
    case "verde": return { validUntil: { [Op.gte]: yellowEnd } };
    default: return null;
  }
}

/** Monta o include do certificado (sem expor senha/arquivo) e o filtro de status. */
function buildCertificateInclude(q) {
  const include = {
    model: Certificate,
    as: "certificate",
    attributes: ["id", "validFrom", "validUntil", "certificateRazaoSocial"],
    required: false,
  };
  const andConds = [];
  const statuses = parseCertStatuses(q.certificateStatus);
  let topLevel = null;

  if (statuses.length) {
    const ors = statuses.map(certStatusCondition).filter(Boolean);
    const wantsNone = statuses.includes("cinza");
    if (wantsNone) {
      // Sem certificado = LEFT JOIN sem correspondência.
      topLevel = { [Op.or]: [{ "$certificate.id$": null }, ...ors.map((c) => ({ "$certificate.validUntil$": c.validUntil }))] };
    } else {
      andConds.push({ [Op.or]: ors });
      include.required = true;
    }
  }

  // Faixa livre de validade: ?certificateValidUntil_from / _to (YYYY-MM-DD)
  if (q.certificateValidUntil_from || q.certificateValidUntil_to) {
    const r = {};
    if (q.certificateValidUntil_from) r[Op.gte] = new Date(q.certificateValidUntil_from);
    if (q.certificateValidUntil_to) r[Op.lte] = new Date(q.certificateValidUntil_to + "T23:59:59");
    andConds.push({ validUntil: r });
    include.required = true;
  }

  if (andConds.length) include.where = { [Op.and]: andConds };
  return { include, topLevel };
}

/** Troca o objeto "certificate" por campos planos de status. */
function attachCertificateStatus(company) {
  const plain = company.get({ plain: true });
  const c = plain.certificate;
  plain.certificateStatus = computeCertificateStatus(c?.validUntil);
  plain.certificateValid = plain.certificateStatus === "verde" || plain.certificateStatus === "amarelo";
  plain.certificateValidFrom = c?.validFrom || null;
  plain.certificateValidUntil = c?.validUntil || null;
  plain.certificateDaysLeft = certificateDaysLeft(c?.validUntil);
  delete plain.certificate;
  return plain;
}

/** Monta where + includes de empresas a partir dos filtros (query string ou body.filter). */
function buildCompanyQuery(q) {
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
    range(where, "contabilNota", q.contabilNota_min, q.contabilNota_max);

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

    // --- Certificado digital: ?certificateStatus=verde|amarelo|vermelho|cinza (ou
    //     valido|vencendo|vencido|sem_certificado), aceita lista separada por vírgula ---
    const { include: certificateInclude, topLevel: certTopLevel } = buildCertificateInclude(q);
    if (certTopLevel) where[Op.and] = [...(where[Op.and] || []), certTopLevel];

  return {
    where,
    include: [
      fiscalInclude,
      dpInclude,
      contabilInclude,
      { model: Grupo, as: "grupo", attributes: ["id", "name"] },
      { model: ContactMode, as: "contactMode", attributes: ["id", "name"] },
      certificateInclude,
    ],
  };
}

// ─── PATCH /api/data/companies/bulk ───────────────────────────────────────────
// Campos que podem ser alterados em lote (cnpj, name, num e status ficam de fora:
// status gera histórico e os demais identificam a empresa).
const BULK_TYPES = {
  contractInit: "string", contact: "string", email: "string", phone: "string",
  ie: "string", uf: "string", obs: "string", important_info: "string",
  branchNumber: "string", rule: "string", classi: "string",
  respFiscalId: "int", respDpId: "int", respContabilId: "int",
  contactModeId: "int", grupoId: "int",
  bonusValue: "int", employeesCount: "int", contabilNota: "int",
  openedByUs: "bool", isArchived: "bool", isHeadquarters: "bool",
};
const BULK_NOT_NULL = new Set(["email", "ie", "rule", "classi", "isArchived", "isHeadquarters"]);
const BULK_MAX = 1000;

/** Valida/normaliza body.set. Retorna { values } ou { error }. */
function parseBulkSet(set) {
  if (!set || typeof set !== "object" || Array.isArray(set) || !Object.keys(set).length) {
    return { error: "Informe 'set' com ao menos um campo a alterar." };
  }
  const values = {};
  for (const [field, raw] of Object.entries(set)) {
    const type = BULK_TYPES[field];
    if (!type) return { error: `Campo '${field}' não pode ser alterado em lote.` };
    if (raw === null) {
      if (BULK_NOT_NULL.has(field)) return { error: `Campo '${field}' não aceita null.` };
      values[field] = null;
    } else if (type === "int") {
      const n = Number(raw);
      if (raw === "" || !Number.isInteger(n)) return { error: `Campo '${field}' deve ser inteiro.` };
      values[field] = n;
    } else if (type === "bool") {
      const b = typeof raw === "boolean" ? raw : parseBool(String(raw));
      if (b === undefined) return { error: `Campo '${field}' deve ser booleano.` };
      values[field] = b;
    } else {
      values[field] = String(raw);
    }
  }
  return { values };
}

// ─── GET /api/data/companies ──────────────────────────────────────────────────
module.exports = class DataApiController {
  static async getCompanies(req, res) {
    const q = req.query;
    const { where, include } = buildCompanyQuery(q);
    const { order, limit, offset } = paginate(q);

    const companies = await Company.findAndCountAll({
      where,
      include,
      order,
      limit,
      offset,
      distinct: true,
    });

    return res.status(200).json({
      total: companies.count,
      limit,
      offset,
      data: companies.rows.map(attachCertificateStatus),
    });
  }

  // ─── PATCH /api/data/companies/bulk ───────────────────────────────────────
  // Body: { filter?, cnpjs?, ids?, set, dryRun? }
  //  - filter: mesmos parâmetros do GET /companies (ex.: { "rule": "Simples" })
  //  - cnpjs / ids: listas explícitas (CNPJ com ou sem pontuação)
  //  - set: campos a alterar (ver BULK_TYPES)
  //  - dryRun: true só lista o que seria alterado
  static async bulkUpdateCompanies(req, res) {
    const { filter, cnpjs, ids, set, dryRun } = req.body || {};

    const parsed = parseBulkSet(set);
    if (parsed.error) return res.status(400).json({ message: parsed.error });

    const hasFilter = filter && typeof filter === "object" && Object.keys(filter).length > 0;
    const hasCnpjs = Array.isArray(cnpjs) && cnpjs.length > 0;
    const hasIds = Array.isArray(ids) && ids.length > 0;
    if (!hasFilter && !hasCnpjs && !hasIds) {
      return res.status(400).json({
        message: "Informe ao menos um critério: 'filter', 'cnpjs' ou 'ids' (atualizar todas as empresas não é permitido).",
      });
    }

    // Filtros chegam do body como JSON; normaliza para string como na query string.
    const q = {};
    if (hasFilter) for (const [k, v] of Object.entries(filter)) q[k] = v === null ? "null" : String(v);
    const { where, include } = buildCompanyQuery(q);

    const and = [];
    if (hasCnpjs) and.push({ cnpj: { [Op.in]: cnpjs.map((c) => String(c).replace(/\D/g, "")) } });
    if (hasIds) and.push({ id: { [Op.in]: ids.map(Number).filter(Number.isInteger) } });
    if (and.length) where[Op.and] = [...(where[Op.and] || []), ...and];

    const matched = await Company.findAll({
      where,
      include,
      attributes: ["id", "name", "cnpj"],
      limit: BULK_MAX + 1,
      subQuery: false,
    });
    const unique = [...new Map(matched.map((c) => [c.id, c])).values()];

    if (unique.length > BULK_MAX) {
      return res.status(400).json({
        message: `O filtro atinge mais de ${BULK_MAX} empresas. Refine o filtro e tente novamente.`,
      });
    }

    const summary = unique.map((c) => ({ id: c.id, name: c.name, cnpj: c.cnpj }));
    if (dryRun === true || dryRun === "true") {
      return res.status(200).json({ dryRun: true, matched: summary.length, set: parsed.values, companies: summary });
    }
    if (!summary.length) {
      return res.status(200).json({ dryRun: false, matched: 0, updated: 0, set: parsed.values, companies: [] });
    }

    try {
      const [updated] = await Company.update(parsed.values, {
        where: { id: { [Op.in]: summary.map((c) => c.id) } },
      });

      await cacheManager.reloadAllGlobal();
      cacheManager.invalidateByPrefix("my_companies_");
      cacheManager.invalidateByPrefix("dashboard_general_");
      cacheManager.invalidateByPrefix("dashboard_my_companies_");

      logger.info(`API Data: atualização em lote de ${summary.length} empresa(s) (user ${req.apiUserId}): ${JSON.stringify(parsed.values)}`);
      return res.status(200).json({ dryRun: false, matched: summary.length, updated, set: parsed.values, companies: summary });
    } catch (error) {
      logger.error(`Erro na atualização em lote de empresas: ${error.message}`);
      return res.status(400).json({ message: error.message });
    }
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
        { model: Certificate, as: "certificate", attributes: ["id", "validFrom", "validUntil", "certificateRazaoSocial"] },
      ],
    });

    if (!company) return res.status(404).json({ message: "Empresa não encontrada." });
    return res.status(200).json(attachCertificateStatus(company));
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

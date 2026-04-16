// /controllers/DataApiController.js
const { Op } = require("sequelize");
const Company = require("../models/Company");
const User = require("../models/User");
const Automation = require("../models/Automation");
const CompanyTaxStatus = require("../models/CompanyTaxStatus");
const CompanyTax = require("../models/CompanyTax");
const CompanyObligationStatus = require("../models/CompanyObligationStatus");
const AccessoryObligation = require("../models/AccessoryObligation");

module.exports = class DataApiController {
  // GET /api/data/companies
  static async getCompanies(req, res) {
    const { regime, status, grupoId, respFiscalId, respDpId, respContabilId } = req.query;

    const where = {};
    if (regime) where.rule = regime;
    if (status) where.status = status;
    if (grupoId) where.grupoId = grupoId;
    if (respFiscalId) where.respFiscalId = respFiscalId;
    if (respDpId) where.respDpId = respDpId;
    if (respContabilId) where.respContabilId = respContabilId;

    const companies = await Company.findAll({
      where,
      include: [
        { model: User, as: "respFiscal", attributes: ["id", "name"] },
        { model: User, as: "respDp", attributes: ["id", "name"] },
        { model: User, as: "respContabil", attributes: ["id", "name"] },
      ],
      order: [["name", "ASC"]],
    });

    return res.status(200).json(companies);
  }

  // GET /api/data/companies/:id
  static async getCompanyById(req, res) {
    const { id } = req.params;

    const company = await Company.findByPk(id, {
      include: [
        { model: User, as: "respFiscal", attributes: ["id", "name"] },
        { model: User, as: "respDp", attributes: ["id", "name"] },
        { model: User, as: "respContabil", attributes: ["id", "name"] },
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
        { model: Automation, as: "automations", attributes: ["id", "name"] },
      ],
    });

    if (!company) {
      return res.status(404).json({ message: "Empresa não encontrada." });
    }

    return res.status(200).json(company);
  }

  // GET /api/data/users
  static async getUsers(req, res) {
    const users = await User.findAll({
      where: { role: { [Op.ne]: "not-validated" } },
      attributes: ["id", "name", "email", "department", "role", "ramal"],
      order: [["name", "ASC"]],
    });

    return res.status(200).json(users);
  }

  // GET /api/data/automations
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

  // GET /api/data/taxes
  static async getTaxes(req, res) {
    const { month, year, type } = req.query;

    const where = {};
    if (month) where.month = month;
    if (year) where.year = year;

    const taxWhere = {};
    if (type) taxWhere.name = type;

    const statuses = await CompanyTaxStatus.findAll({
      where,
      include: [
        {
          model: CompanyTax,
          as: "tax",
          attributes: ["id", "name", "department"],
          where: Object.keys(taxWhere).length ? taxWhere : undefined,
        },
        { model: Company, as: "company", attributes: ["id", "name", "cnpj", "rule"] },
      ],
      order: [["year", "DESC"], ["month", "DESC"]],
    });

    return res.status(200).json(statuses);
  }

  // GET /api/data/obligations
  static async getObligations(req, res) {
    const { month, year } = req.query;

    const where = {};
    if (month) where.month = month;
    if (year) where.year = year;

    const statuses = await CompanyObligationStatus.findAll({
      where,
      include: [
        { model: AccessoryObligation, as: "obligation", attributes: ["id", "name"] },
        { model: Company, as: "company", attributes: ["id", "name", "cnpj", "rule"] },
      ],
      order: [["year", "DESC"], ["month", "DESC"]],
    });

    return res.status(200).json(statuses);
  }
};

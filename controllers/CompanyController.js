// /controllers/CompanyController.js
const { Op } = require("sequelize");
const cleanCNPJ = require("./../helpers/clean-cnpj");
const Company = require("../models/Company");
const StatusHistory = require("../models/StatusHistory");
const User = require("../models/User");
const transporter = require("../services/emailService");
const { suspesionTemplate } = require("../emails/templates");

module.exports = class CompanyController {
  static async addCompany(req, res) {
    const {
      num,
      name,
      cnpj,
      ie,
      rule,
      classi,
      contractInit,
      contact,
      email,
      phone,
      openedByUs,
      uf,
      obs,
    } = req.body;

    const cleanedCnpj = cleanCNPJ(cnpj);
    const cleanedIe = cleanCNPJ(ie);

    try {
      const cnpjExists = await Company.findOne({
        where: { cnpj: cleanedCnpj },
      });
      const numExists = num ? await Company.findOne({ where: { num } }) : false;

      if (cnpjExists || numExists) {
        return res.status(422).json({
          message: "CNPJ ou número já utilizado! Verique as informações.",
        });
      }

      const company = {
        num,
        name,
        cnpj: cleanedCnpj,
        ie: cleanedIe,
        rule,
        classi,
        contractInit,
        contact,
        email,
        phone,
        status: "ATIVA",
        respFiscalId: 1,
        respDpId: 1,
        respContabilId: 1,
        zen: false,
        openedByUs,
        uf,
        obs,
      };

      const newCompany = await Company.create(company);
      return res
        .status(201)
        .json({ message: "Empresa criada com sucesso!", newCompany });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async editCompany(req, res) {
    const {
      name,
      ie,
      rule,
      classi,
      contact,
      email,
      phone,
      respFiscalId,
      respDpId,
      respContabilId,
      openedByUs,
      zen,
      uf,
      obs,
    } = req.body;

    const id = req.params.id;

    const cleanedIe = cleanCNPJ(ie);

    const company = {
      name,
      ie: cleanedIe,
      rule,
      classi,
      contact,
      email,
      phone,
      respFiscalId,
      respDpId,
      respContabilId,
      openedByUs,
      zen,
      uf,
      obs,
    };

    try {
      const updatedCompany = await Company.update(company, { where: { id } });
      return res
        .status(201)
        .json({ message: "Empresa editada com sucesso!", updatedCompany });
    } catch (error) {
      return res.status(500).json({ message: error });
    }
  }

  static async getAll(req, res) {
    try {
      const allCompanies = await Company.findAll();
      if (allCompanies.length > 0) {
        return res.status(200).json(allCompanies);
      } else {
        return res.status(404).json({ message: "No companies found" });
      }
    } catch (error) {
      console.error("Error fetching all companies:", error);
      return res.status(500).json({ message: error.message });
    }
  }

  static async getOne(req, res) {
    const { id } = req.params;

    try {
      const company = await Company.findOne({
        where: { id },
        include: [
          { model: User, as: "respFiscal", attributes: ["id", "name"] },
          { model: User, as: "respContabil", attributes: ["id", "name"] },
          { model: User, as: "respDp", attributes: ["id", "name"] },
        ],
      });
      if (company) {
        return res.status(200).json(company);
      } else {
        return res.status(404).json({ message: "Company not found" });
      }
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }

  static async changeStatus(req, res) {
    const companyId = req.params.id;
    const { newStatus, statusDate } = req.body;

    try {
      // Find the company
      const company = await Company.findByPk(companyId);

      if (!company) {
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      // Update the company's status
      company.status = newStatus;
      await company.save();

      // Add a new record to StatusHistory
      await StatusHistory.create({
        date: statusDate,
        status: newStatus,
        companyId: companyId,
      });

      // Send emails after the status has been successfully updated
      await CompanyController.sendStatusChangeEmails(company, newStatus);

      return res
        .status(200)
        .json({ message: "Status da empresa atualizado com sucesso." });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }

  // New method to send emails
  static async sendStatusChangeEmails(company, newStatus) {
    try {
      const companyName = company.name;

      const htmlContent = suspensionTemplate({ companyName, newStatus });

      const subject = `${companyName} NOVO STATUS`;

      if (newStatus === "SUSPENSA" && company.email) {
        const companyEmails = company.email
          .split(",")
          .map((email) => email.trim());

        for (const email of companyEmails) {
          await transporter.sendMail({
            from: '"Contask" <naoresponda@contelb.com.br>',
            to: email,
            subject: subject,
            html: htmlContent,
          });
        }
      }

      // Send email to all registered users
      const users = await User.findAll({ attributes: ["email"] });
      const userEmails = users.map((user) => user.email);

      await transporter.sendMail({
        from: '"Contask" <naoresponda@contelb.com.br>',
        to: userEmails.join(","),
        subject: subject,
        html: htmlContent,
      });
    } catch (error) {
      console.error("Error sending emails:", error);
    }
  }

  static async getStatusHistory(req, res) {
    const { id } = req.params; // Company ID

    try {
      const history = await StatusHistory.findAll({
        where: { companyId: id },
        order: [["date", "DESC"]], // Change to 'ASC' if you want oldest first
      });

      if (!history || history.length === 0) {
        return res
          .status(404)
          .json({ message: "No history found for this company." });
      }

      return res.status(200).json(history);
    } catch (error) {
      console.error("Error fetching status history:", error);
      return res.status(500).json({ message: error.message });
    }
  }
};

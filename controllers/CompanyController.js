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
    try {
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
        uf,
        openedByUs,
        important_info,
        obs,
      } = req.body;

      // Validações básicas
      if (!num || !name || !cnpj || !rule || !classi || !contact || !email) {
        return res
          .status(400)
          .json({ message: "Campos obrigatórios faltando." });
      }

      // Verificar se a empresa já existe pelo CNPJ
      const existingCompany = await Company.findOne({ where: { cnpj } });
      if (existingCompany) {
        return res
          .status(400)
          .json({ message: "Já existe uma empresa com este CNPJ." });
      }

      // Criar a nova empresa
      const newCompany = await Company.create({
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
        uf,
        openedByUs,
        status: "ATIVA", // Status padrão ao criar uma nova empresa
        statusUpdatedAt: new Date(),
        obs,
      });

      // Adicionar histórico de status
      await StatusHistory.create({
        date: new Date(),
        status: "ATIVA",
        companyId: newCompany.id,
      });

      // Opcional: Enviar email para os responsáveis com as informações importantes
      if (important_info) {
        // Lógica para enviar email com important_info
      }

      // Retornar os dados da nova empresa
      return res.status(201).json({
        message: "Empresa criada com sucesso.",
        company: newCompany,
      });
    } catch (error) {
      console.error("Erro ao criar empresa:", error);
      return res.status(500).json({ message: "Erro ao criar empresa." });
    }
  }

  // Função para editar uma empresa (possivelmente ausente)
  static async editCompany(req, res) {
    try {
      const { id } = req.params;
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
        uf,
        openedByUs,
        obs,
        respFiscalId,
        respContabilId,
        respDpId,
      } = req.body;

      // Validações básicas
      if (!id || !name || !rule || !classi || !contact || !email) {
        return res
          .status(400)
          .json({ message: "Campos obrigatórios faltando." });
      }

      // Encontrar a empresa
      const company = await Company.findByPk(id);
      if (!company) {
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      // Atualizar os dados da empresa
      company.name = name;
      company.ie = ie;
      company.rule = rule;
      company.classi = classi;
      company.contractInit = contractInit;
      company.contact = contact;
      company.email = email;
      company.phone = phone;
      company.uf = uf;
      company.openedByUs = openedByUs;
      company.obs = obs;
      company.respFiscalId = respFiscalId;
      company.respContabilId = respContabilId;
      company.respDpId = respDpId;

      await company.save();

      return res.status(200).json({
        message: "Empresa atualizada com sucesso.",
        company: company,
      });
    } catch (error) {
      console.error("Erro ao atualizar empresa:", error);
      return res.status(500).json({ message: "Erro ao atualizar empresa." });
    }
  }

  static async getAll(req, res) {
    try {
      const allCompanies = await Company.findAll({
        include: [
          { model: User, as: "respFiscal", attributes: ["id", "name"] },
          { model: User, as: "respContabil", attributes: ["id", "name"] },
          { model: User, as: "respDp", attributes: ["id", "name"] },
        ],
      });
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
      // Encontrar a empresa
      const company = await Company.findByPk(companyId);

      if (!company) {
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      // Atualizar o status e a data da última alteração
      company.status = newStatus;
      company.statusUpdatedAt = statusDate;
      await company.save();

      // Adicionar um novo registro ao StatusHistory
      await StatusHistory.create({
        date: statusDate,
        status: newStatus,
        companyId: companyId,
      });

      // Enviar emails após a atualização do status
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

  static async getRecentStatusChanges(req, res) {
    try {
      const recentCompanies = await Company.findAll({
        where: {
          status: {
            [Op.in]: ["SUSPENSA", "BAIXADA", "DISTRATO"],
          },
        },
        order: [["statusUpdatedAt", "DESC"]],
        limit: 10,
        attributes: ["id", "name", "status", "statusUpdatedAt"],
      });

      return res.status(200).json(recentCompanies);
    } catch (error) {
      console.error("Error fetching recent status changes:", error);
      return res.status(500).json({ message: error.message });
    }
  }

  static async getRecentActiveCompanies(req, res) {
    try {
      const recentCompanies = await Company.findAll({
        where: {
          status: "ATIVA",
        },
        order: [["statusUpdatedAt", "DESC"]],
        limit: 10,
        attributes: ["id", "name", "status", "statusUpdatedAt"],
      });

      return res.status(200).json(recentCompanies);
    } catch (error) {
      console.error("Error fetching recent active companies:", error);
      return res.status(500).json({ message: error.message });
    }
  }

  static async getRecentCompanies(req, res) {
    try {
      const recentCompanies = await Company.findAll({
        include: [
          { model: User, as: "respFiscal", attributes: ["id", "name"] },
          { model: User, as: "respDp", attributes: ["id", "name"] },
          { model: User, as: "respContabil", attributes: ["id", "name"] }, // Adicionado
        ],
        order: [["createdAt", "DESC"]],
        limit: 10,
        attributes: ["id", "name", "contractInit"], // Adicionado 'contractInit'
      });

      return res.status(200).json(recentCompanies);
    } catch (error) {
      console.error("Error fetching recent companies:", error);
      return res.status(500).json({ message: error.message });
    }
  }

  static async getMyCompanies(req, res) {
    try {
      const userId = req.user.id;

      console.log("Logged-in user ID:", userId);

      const companies = await Company.findAll({
        where: {
          [Op.or]: [
            { respFiscalId: userId },
            { respDpId: userId },
            { respContabilId: userId },
          ],
        },
        include: [
          { model: User, as: "respFiscal", attributes: ["id", "name"] },
          { model: User, as: "respDp", attributes: ["id", "name"] },
          { model: User, as: "respContabil", attributes: ["id", "name"] },
        ],
      });

      if (!companies || companies.length === 0) {
        return res.status(200).json([]);
      }

      return res.status(200).json(companies);
    } catch (error) {
      console.error("Error fetching user's companies:", error);
      return res.status(500).json({ message: error.message });
    }
  }
};

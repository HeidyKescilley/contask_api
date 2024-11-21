// /controllers/CompanyController.js
const { Op } = require("sequelize");
const cleanCNPJ = require("./../helpers/clean-cnpj");
const Company = require("../models/Company");
const StatusHistory = require("../models/StatusHistory");
const User = require("../models/User");
const transporter = require("../services/emailService");
const {
  activeTemplate,
  closedTemplate,
  terminatedTemplate,
  suspendedTemplate,
  newCompanyTemplate,
} = require("../emails/templates");
const ContactMode = require("../models/ContactMode");
const Automation = require("../models/Automation");
const getToken = require("../helpers/get-token");
const formatDate = require("../helpers/format-date");
const getUserByToken = require("../helpers/get-user-by-token");

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
        important_info,
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

      await CompanyController.sendCompanyRegisteredEmails(newCompany);

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

  static async sendCompanyRegisteredEmails(company) {
    try {
      // Obter todos os e-mails dos usuários
      const users = await User.findAll({ attributes: ["email"] });
      const userEmails = users.map((user) => user.email);

      // Converter o objeto company para um objeto plano
      const companyData = company.get({ plain: true });

      companyData.contractInit = formatDate(companyData.contractInit);

      // Preparar o conteúdo do e-mail usando o template
      const emailContent = newCompanyTemplate({ company: companyData });

      const emailSubject = `Nova empresa cadastrada: ${company.name}`;

      // Enviar e-mail para todos os usuários
      await transporter.sendMail({
        from: '"Contask" <naoresponda@contelb.com.br>',
        to: userEmails.join(","),
        subject: emailSubject,
        html: emailContent,
      });
    } catch (error) {
      console.error("Erro ao enviar e-mail de nova empresa:", error);
      // Você pode decidir como lidar com o erro (log, rethrow, etc.)
    }
  }

  static async editCompany(req, res) {
    const { id } = req.params;
    const companyData = req.body;

    try {
      const company = await Company.findByPk(id);
      if (!company) {
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      // Atualiza os dados da empresa
      await company.update(companyData);

      // Atualiza as automações associadas
      if (companyData.automationIds) {
        await company.setAutomations(companyData.automationIds);
      }

      return res.status(200).json({
        message: "Empresa atualizada com sucesso.",
        company,
      });
    } catch (error) {
      console.error("Error updating company:", error);
      return res.status(500).json({ message: error.message });
    }
  }

  static async getAll(req, res) {
    try {
      const allCompanies = await Company.findAll({
        include: [
          { model: User, as: "respFiscal", attributes: ["id", "name"] },
          { model: User, as: "respContabil", attributes: ["id", "name"] },
          { model: User, as: "respDp", attributes: ["id", "name"] },
          { model: ContactMode, as: "contactMode", attributes: ["id", "name"] },
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
    const id = req.params.id;

    try {
      const company = await Company.findOne({
        where: { id },
        include: [
          { model: User, as: "respFiscal", attributes: ["id", "name"] },
          { model: User, as: "respDp", attributes: ["id", "name"] },
          { model: User, as: "respContabil", attributes: ["id", "name"] },
          { model: ContactMode, as: "contactMode", attributes: ["id", "name"] },
          { model: Automation, as: "automations", attributes: ["id", "name"] }, // Linha adicionada
        ],
      });

      if (!company) {
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      return res.status(200).json(company);
    } catch (error) {
      console.error("Error fetching company:", error);
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
      await CompanyController.sendStatusChangeEmails(
        company,
        newStatus,
        statusDate
      );

      return res
        .status(200)
        .json({ message: "Status da empresa atualizado com sucesso." });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }

  // New method to send emails
  static async sendStatusChangeEmails(company, newStatus, date) {
    try {
      const formatedDate = formatDate(date);
      const companyName = company.name;
      let emailContent;
      let emailSubject = `${companyName} - Atualização de Status`;

      switch (newStatus) {
        case "ATIVA":
          emailContent = activeTemplate({
            companyName,
            newStatus,
            formatedDate,
          });
          break;
        case "BAIXADA":
          emailContent = closedTemplate({
            companyName,
            newStatus,
            formatedDate,
          });
          break;
        case "DISTRATO":
          emailContent = terminatedTemplate({
            companyName,
            newStatus,
            formatedDate,
          });
          break;
        case "SUSPENSA":
          emailContent = suspendedTemplate({
            companyName,
            newStatus,
            formatedDate,
          });
          break;
        default:
          emailContent = `<p>O novo status da empresa <strong>${companyName}</strong> é <strong>${newStatus}</strong>.</p>`;
      }

      // Obter todos os e-mails dos usuários
      const users = await User.findAll({ attributes: ["email"] });
      const userEmails = users.map((user) => user.email);

      // Enviar e-mail para os usuários
      await transporter.sendMail({
        from: '"Contask" <naoresponda@contelb.com.br>',
        to: userEmails.join(","),
        subject: emailSubject,
        html: emailContent,
      });

      // Se o status for "SUSPENSA", enviar e-mail também para os e-mails da empresa
      if (newStatus === "SUSPENSA" && company.email) {
        const companyEmails = company.email
          .split(",")
          .map((email) => email.trim());

        await transporter.sendMail({
          from: '"Contask" <naoresponda@contelb.com.br>',
          to: companyEmails.join(","),
          subject: emailSubject,
          html: emailContent,
        });
      }
    } catch (error) {
      console.error("Erro ao enviar e-mails:", error);
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
      const token = await getToken(req);
      const user = await getUserByToken(token);

      let whereClause = {};

      // Filtrar empresas com base no departamento do usuário
      if (user.department === "Fiscal") {
        whereClause.respFiscalId = user.id;
      } else if (user.department === "Pessoal") {
        whereClause.respDpId = user.id;
      } else if (user.department === "Contábil") {
        whereClause.respContabilId = user.id;
      } else {
        // Se o usuário não pertence a um departamento específico, retornar vazio ou todas as empresas
        return res.status(200).json([]);
      }

      const companies = await Company.findAll({
        where: whereClause,
        include: [
          { model: User, as: "respFiscal", attributes: ["id", "name"] },
          { model: User, as: "respDp", attributes: ["id", "name"] },
          { model: User, as: "respContabil", attributes: ["id", "name"] },
          { model: ContactMode, as: "contactMode", attributes: ["id", "name"] }, // Adicione esta linha
        ],
      });

      return res.status(200).json(companies);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }
};

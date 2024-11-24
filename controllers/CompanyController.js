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
const logger = require("../logger/logger"); // Importa o logger do Winston

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

      logger.info(
        `Usuário (${req.user.email}) está adicionando a empresa: ${name} (CNPJ: ${cnpj})`
      );

      // Validações básicas
      if (!num || !name || !cnpj || !rule || !classi || !contact || !email) {
        logger.warn("Adição de empresa falhou: Campos obrigatórios faltando.");
        return res
          .status(400)
          .json({ message: "Campos obrigatórios faltando." });
      }

      // Verificar se a empresa já existe pelo CNPJ
      const existingCompany = await Company.findOne({ where: { cnpj } });
      if (existingCompany) {
        logger.warn(
          `Adição de empresa falhou: Empresa com CNPJ ${cnpj} já existe.`
        );
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

      logger.info(
        `Empresa criada com sucesso: ${name} (ID: ${newCompany.id}) por ${req.user.email}`
      );

      await CompanyController.sendCompanyRegisteredEmails(newCompany);

      // Retornar os dados da nova empresa
      return res.status(201).json({
        message: "Empresa criada com sucesso.",
        company: newCompany,
      });
    } catch (error) {
      logger.error(`Erro ao adicionar empresa: ${error.message}`);
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

      logger.info(
        `Emails de registro de empresa enviados para ${userEmails.length} usuários.`
      );
    } catch (error) {
      logger.error(
        `Erro ao enviar emails de registro de empresa: ${error.message}`
      );
      // Você pode decidir como lidar com o erro (log, rethrow, etc.)
    }
  }

  static async editCompany(req, res) {
    const { id } = req.params;
    const companyData = req.body;

    try {
      const company = await Company.findByPk(id);
      if (!company) {
        logger.warn(
          `Edição de empresa falhou: Empresa não encontrada (ID: ${id})`
        );
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      logger.info(
        `Empresa (${company.name}, ID: ${id}) está sendo editada por ${req.user.email}`
      );

      // Atualiza os dados da empresa
      await company.update(companyData);

      // Atualiza as automações associadas
      if (companyData.automationIds) {
        await company.setAutomations(companyData.automationIds);
      }

      logger.info(
        `Empresa atualizada com sucesso: ${company.name} (ID: ${id})`
      );

      return res.status(200).json({
        message: "Empresa atualizada com sucesso.",
        company,
      });
    } catch (error) {
      logger.error(`Erro ao editar empresa: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async getAll(req, res) {
    try {
      logger.info(`Usuário (${req.user.email}) solicitou todas as empresas.`);
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
        logger.warn("Nenhuma empresa encontrada.");
        return res.status(404).json({ message: "Nenhuma empresa encontrada" });
      }
    } catch (error) {
      logger.error(`Erro ao buscar todas as empresas: ${error.message}`);
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
        logger.warn(
          `Obtenção de empresa falhou: Empresa não encontrada (ID: ${id})`
        );
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      logger.info(`Empresa obtida com sucesso: ${company.name} (ID: ${id})`);
      return res.status(200).json(company);
    } catch (error) {
      logger.error(`Erro ao obter empresa: ${error.message}`);
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
        logger.warn(
          `Alteração de status falhou: Empresa não encontrada (ID: ${companyId})`
        );
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

      logger.info(
        `Status da empresa alterado: ${company.name} de ${company.status} para ${newStatus} por ${req.user.email}`
      );

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
      logger.error(`Erro ao alterar status da empresa: ${error.message}`);
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

      logger.info(
        `Emails de alteração de status enviados para ${userEmails.length} usuários.`
      );

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

        logger.info(
          `Emails de suspensão enviados para ${companyEmails.length} emails da empresa ${companyName}.`
        );
      }
    } catch (error) {
      logger.error(
        `Erro ao enviar emails de alteração de status: ${error.message}`
      );
    }
  }

  static async getStatusHistory(req, res) {
    const { id } = req.params; // Company ID

    try {
      logger.info(
        `Usuário (${req.user.email}) solicitou histórico de status para a empresa ID: ${id}`
      );
      const history = await StatusHistory.findAll({
        where: { companyId: id },
        order: [["date", "DESC"]], // Change to 'ASC' if you want oldest first
      });

      if (!history || history.length === 0) {
        logger.warn(
          `Histórico de status não encontrado para a empresa ID: ${id}`
        );
        return res
          .status(404)
          .json({ message: "No history found for this company." });
      }

      return res.status(200).json(history);
    } catch (error) {
      logger.error(`Erro ao buscar histórico de status: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async getRecentStatusChanges(req, res) {
    try {
      logger.info(
        `Usuário (${req.user.email}) solicitou as últimas mudanças de status.`
      );
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
      logger.error(
        `Erro ao buscar mudanças recentes de status: ${error.message}`
      );
      return res.status(500).json({ message: error.message });
    }
  }

  static async getRecentActiveCompanies(req, res) {
    try {
      logger.info(
        `Usuário (${req.user.email}) solicitou as últimas empresas ativas.`
      );
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
      logger.error(`Erro ao buscar empresas ativas recentes: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async getRecentCompanies(req, res) {
    try {
      logger.info(
        `Usuário (${req.user.email}) solicitou as últimas empresas adicionadas.`
      );
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
      logger.error(`Erro ao buscar empresas recentes: ${error.message}`);
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
        logger.warn(
          `Usuário (${user.email}) não pertence a nenhum departamento específico.`
        );
        return res.status(200).json([]);
      }

      const companies = await Company.findAll({
        where: whereClause,
        include: [
          { model: User, as: "respFiscal", attributes: ["id", "name"] },
          { model: User, as: "respDp", attributes: ["id", "name"] },
          { model: User, as: "respContabil", attributes: ["id", "name"] },
          { model: ContactMode, as: "contactMode", attributes: ["id", "name"] },
        ],
      });

      logger.info(
        `Usuário (${user.email}) solicitou suas empresas. Total encontrado: ${companies.length}`
      );
      return res.status(200).json(companies);
    } catch (error) {
      logger.error(`Erro ao buscar empresas do usuário: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }
};

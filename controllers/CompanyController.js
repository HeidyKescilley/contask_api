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
const logger = require("../logger/logger");

// Importando node-cache
const NodeCache = require("node-cache");
// Cache com TTL de 15 minutos (900 segundos)
const cache = new NodeCache({ stdTTL: 900, checkperiod: 120 });

// Funções auxiliares para lidar com cache
async function getCompaniesFromCache(key, fetchFunction) {
  let data = cache.get(key);
  if (!data) {
    const result = await fetchFunction();
    // Converte para JSON puro
    data = JSON.parse(JSON.stringify(result));
    cache.set(key, data);
  }
  return data;
}

function invalidateCache(keys) {
  keys.forEach((key) => cache.del(key));
}

// Para recarregar dados, lembre-se de converter para JSON também
async function reloadAllCompanies() {
  const fetchAllCompanies = async () => {
    const companies = await Company.findAll({
      include: [
        { model: User, as: "respFiscal", attributes: ["id", "name"] },
        { model: User, as: "respDp", attributes: ["id", "name"] },
        { model: User, as: "respContabil", attributes: ["id", "name"] },
        { model: ContactMode, as: "contactMode", attributes: ["id", "name"] },
      ],
    });
    return JSON.parse(JSON.stringify(companies));
  };
  const allCompanies = await fetchAllCompanies();
  cache.set("companies_all", allCompanies);
  return allCompanies;
}

async function reloadRecentCompanies() {
  const fetchRecent = async () => {
    const companies = await Company.findAll({
      include: [
        { model: User, as: "respFiscal", attributes: ["id", "name"] },
        { model: User, as: "respDp", attributes: ["id", "name"] },
        { model: User, as: "respContabil", attributes: ["id", "name"] },
      ],
      order: [["createdAt", "DESC"]],
      limit: 10,
      attributes: ["id", "name", "contractInit"],
    });
    return JSON.parse(JSON.stringify(companies));
  };
  const recentCompanies = await fetchRecent();
  cache.set("recent_companies", recentCompanies);
  return recentCompanies;
}

async function reloadRecentActiveCompanies() {
  const fetchRecentActive = async () => {
    const companies = await Company.findAll({
      where: {
        status: "ATIVA",
      },
      order: [["statusUpdatedAt", "DESC"]],
      limit: 10,
      attributes: ["id", "name", "status", "statusUpdatedAt"],
    });
    return JSON.parse(JSON.stringify(companies));
  };
  const recentActiveCompanies = await fetchRecentActive();
  cache.set("recent_active_companies", recentActiveCompanies);
  return recentActiveCompanies;
}

async function reloadRecentStatusChanges() {
  const fetchRecentStatusChanges = async () => {
    const companies = await Company.findAll({
      where: {
        status: {
          [Op.in]: ["SUSPENSA", "BAIXADA", "DISTRATO"],
        },
      },
      order: [["statusUpdatedAt", "DESC"]],
      limit: 10,
      attributes: ["id", "name", "status", "statusUpdatedAt"],
    });
    return JSON.parse(JSON.stringify(companies));
  };
  const recentStatusChanges = await fetchRecentStatusChanges();
  cache.set("recent_status_changes", recentStatusChanges);
  return recentStatusChanges;
}

async function reloadMyCompanies(userId) {
  const user = await User.findByPk(userId);
  let whereClause = {};

  if (user.department === "Fiscal") {
    whereClause.respFiscalId = user.id;
  } else if (user.department === "Pessoal") {
    whereClause.respDpId = user.id;
  } else if (user.department === "Contábil") {
    whereClause.respContabilId = user.id;
  }

  const fetchMyCompanies = async () => {
    const companies = await Company.findAll({
      where: whereClause,
      include: [
        { model: User, as: "respFiscal", attributes: ["id", "name"] },
        { model: User, as: "respDp", attributes: ["id", "name"] },
        { model: User, as: "respContabil", attributes: ["id", "name"] },
        { model: ContactMode, as: "contactMode", attributes: ["id", "name"] },
      ],
    });
    return JSON.parse(JSON.stringify(companies));
  };

  const myCompanies = await fetchMyCompanies();
  cache.set("my_companies_" + user.id, myCompanies);
  return myCompanies;
}

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

      if (!num || !name || !cnpj || !rule || !classi || !email) {
        logger.warn("Adição de empresa falhou: Campos obrigatórios faltando.");
        return res
          .status(400)
          .json({ message: "Campos obrigatórios faltando." });
      }

      const existingCompany = await Company.findOne({ where: { cnpj } });
      if (existingCompany) {
        logger.warn(
          `Adição de empresa falhou: Empresa com CNPJ ${cnpj} já existe.`
        );
        return res
          .status(400)
          .json({ message: "Já existe uma empresa com este CNPJ." });
      }

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
        status: "ATIVA",
        statusUpdatedAt: new Date(),
        obs,
      });

      await StatusHistory.create({
        date: new Date(),
        status: "ATIVA",
        companyId: newCompany.id,
      });

      logger.info(
        `Empresa criada com sucesso: ${name} (ID: ${newCompany.id}) por ${req.user.email}`
      );

      await CompanyController.sendCompanyRegisteredEmails(newCompany);

      // Invalida caches
      invalidateCache([
        "companies_all",
        "recent_companies",
        "recent_active_companies",
        "recent_status_changes",
      ]);
      // Recarrega cache
      await reloadAllCompanies();
      await reloadRecentCompanies();
      await reloadRecentActiveCompanies();
      await reloadRecentStatusChanges();

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
      const users = await User.findAll({ attributes: ["email"] });
      const userEmails = users.map((user) => user.email);

      const companyData = company.get({ plain: true });
      if (companyData.contractInit) {
        companyData.contractInit = formatDate(companyData.contractInit);
      }

      const emailContent = newCompanyTemplate({ company: companyData });
      const emailSubject = `Nova empresa cadastrada: ${company.name}`;

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

      await company.update(companyData);

      if (companyData.automationIds) {
        await company.setAutomations(companyData.automationIds);
      }

      logger.info(
        `Empresa atualizada com sucesso: ${company.name} (ID: ${id})`
      );

      invalidateCache([
        "companies_all",
        "recent_companies",
        "my_companies_" + req.user.id,
        "recent_status_changes",
        "recent_active_companies",
      ]);
      await reloadAllCompanies();
      await reloadRecentCompanies();
      await reloadRecentActiveCompanies();
      await reloadRecentStatusChanges();
      await reloadMyCompanies(req.user.id);

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

      const fetchAllCompanies = async () => {
        const companies = await Company.findAll({
          include: [
            { model: User, as: "respFiscal", attributes: ["id", "name"] },
            { model: User, as: "respDp", attributes: ["id", "name"] },
            { model: User, as: "respContabil", attributes: ["id", "name"] },
            {
              model: ContactMode,
              as: "contactMode",
              attributes: ["id", "name"],
            },
          ],
        });
        return JSON.parse(JSON.stringify(companies));
      };

      let allCompanies = cache.get("companies_all");
      if (!allCompanies) {
        allCompanies = await fetchAllCompanies();
        cache.set("companies_all", allCompanies);
      }

      return res.status(200).json(allCompanies);
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
          { model: Automation, as: "automations", attributes: ["id", "name"] },
        ],
      });

      if (!company) {
        logger.warn(
          `Obtenção de empresa falhou: Empresa não encontrada (ID: ${id})`
        );
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      return res.status(200).json(JSON.parse(JSON.stringify(company)));
    } catch (error) {
      logger.error(`Erro ao obter empresa: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async changeStatus(req, res) {
    const companyId = req.params.id;
    const { newStatus, statusDate } = req.body;

    try {
      const company = await Company.findByPk(companyId);
      if (!company) {
        logger.warn(
          `Alteração de status falhou: Empresa não encontrada (ID: ${companyId})`
        );
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      company.status = newStatus;
      company.statusUpdatedAt = statusDate;
      await company.save();

      await StatusHistory.create({
        date: statusDate,
        status: newStatus,
        companyId: companyId,
      });

      logger.info(
        `Status da empresa alterado: ${company.name} para ${newStatus} por ${req.user.email}`
      );

      await CompanyController.sendStatusChangeEmails(
        company,
        newStatus,
        statusDate
      );

      invalidateCache([
        "companies_all",
        "recent_companies",
        "my_companies_" + req.user.id,
        "recent_status_changes",
        "recent_active_companies",
      ]);
      await reloadAllCompanies();
      await reloadRecentCompanies();
      await reloadRecentActiveCompanies();
      await reloadRecentStatusChanges();
      await reloadMyCompanies(req.user.id);

      return res
        .status(200)
        .json({ message: "Status da empresa atualizado com sucesso." });
    } catch (error) {
      logger.error(`Erro ao alterar status da empresa: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

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

      const users = await User.findAll({ attributes: ["email"] });
      const userEmails = users.map((user) => user.email);

      await transporter.sendMail({
        from: '"Contask" <naoresponda@contelb.com.br>',
        to: userEmails.join(","),
        subject: emailSubject,
        html: emailContent,
      });

      logger.info(
        `Emails de alteração de status enviados para ${userEmails.length} usuários.`
      );

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
    const { id } = req.params;

    try {
      logger.info(
        `Usuário (${req.user.email}) solicitou histórico de status para a empresa ID: ${id}`
      );
      const history = await StatusHistory.findAll({
        where: { companyId: id },
        order: [["date", "DESC"]],
      });

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

      const fetchRecentStatusChanges = async () => {
        const companies = await Company.findAll({
          where: {
            status: {
              [Op.in]: ["SUSPENSA", "BAIXADA", "DISTRATO"],
            },
          },
          order: [["statusUpdatedAt", "DESC"]],
          limit: 10,
          attributes: ["id", "name", "status", "statusUpdatedAt"],
        });
        return JSON.parse(JSON.stringify(companies));
      };

      let recentCompanies = cache.get("recent_status_changes");
      if (!recentCompanies) {
        recentCompanies = await fetchRecentStatusChanges();
        cache.set("recent_status_changes", recentCompanies);
      }
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

      const fetchRecentActive = async () => {
        const companies = await Company.findAll({
          where: {
            status: "ATIVA",
          },
          order: [["statusUpdatedAt", "DESC"]],
          limit: 10,
          attributes: ["id", "name", "status", "statusUpdatedAt"],
        });
        return JSON.parse(JSON.stringify(companies));
      };

      let recentActive = cache.get("recent_active_companies");
      if (!recentActive) {
        recentActive = await fetchRecentActive();
        cache.set("recent_active_companies", recentActive);
      }
      return res.status(200).json(recentActive);
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

      const fetchRecent = async () => {
        const companies = await Company.findAll({
          include: [
            { model: User, as: "respFiscal", attributes: ["id", "name"] },
            { model: User, as: "respDp", attributes: ["id", "name"] },
            { model: User, as: "respContabil", attributes: ["id", "name"] },
          ],
          order: [["createdAt", "DESC"]],
          limit: 10,
          attributes: ["id", "name", "contractInit"],
        });
        return JSON.parse(JSON.stringify(companies));
      };

      let recent = cache.get("recent_companies");
      if (!recent) {
        recent = await fetchRecent();
        cache.set("recent_companies", recent);
      }
      return res.status(200).json(recent);
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

      const fetchMyCompanies = async () => {
        const companies = await Company.findAll({
          where: whereClause,
          include: [
            { model: User, as: "respFiscal", attributes: ["id", "name"] },
            { model: User, as: "respDp", attributes: ["id", "name"] },
            { model: User, as: "respContabil", attributes: ["id", "name"] },
            {
              model: ContactMode,
              as: "contactMode",
              attributes: ["id", "name"],
            },
          ],
        });
        return JSON.parse(JSON.stringify(companies));
      };

      const myCompaniesKey = "my_companies_" + user.id;
      let companies = cache.get(myCompaniesKey);
      if (!companies) {
        companies = await fetchMyCompanies();
        cache.set(myCompaniesKey, companies);
      }

      return res.status(200).json(companies);
    } catch (error) {
      logger.error(`Erro ao buscar empresas do usuário: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }
};

const { Op } = require("sequelize");
const cleanCNPJ = require("./../helpers/clean-cnpj");
const Company = require("../models/Company");
const StatusHistory = require("../models/StatusHistory");
const User = require("../models/User");
const {
  activeTemplate,
  closedTemplate,
  terminatedTemplate,
  suspendedEmailClient,
  suspendedEmailInternal,
  newCompanyTemplate,
} = require("../emails/templates");
const ContactMode = require("../models/ContactMode");
const Grupo = require("../models/Grupo");
const Automation = require("../models/Automation");
const getToken = require("../helpers/get-token");
const formatDate = require("../helpers/format-date");
const getUserByToken = require("../helpers/get-user-by-token");
const logger = require("../logger/logger");
const cacheManager = require("../utils/CacheManager");
const ObligationController = require("./ObligationController");
const TaxController = require("./TaxController");
const { sendToAllUsers, sendToRecipients } = require("../utils/emailSender");
const {
  getDeptConfig,
  getAllDeptConfigs,
} = require("../config/departmentConfig");
const CompanyTaxStatus = require("../models/CompanyTaxStatus");
const CompanyObligationStatus = require("../models/CompanyObligationStatus");
const { checkAndUpdateCompletion } = require("../utils/completionChecker");
const CompanyTax = require("../models/CompanyTax");
const AccessoryObligation = require("../models/AccessoryObligation");
const CompanyPeriodNote = require("../models/CompanyPeriodNote");

// Retorna o período do mês anterior no formato YYYY-MM
// Na contabilidade, sempre trabalhamos com a competência anterior (mês passado)
function getCurrentMonthPeriod() {
  const d = new Date();
  d.setDate(1); // evita erro em dias 29-31 ao retroceder mês
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Lista completa de atributos da Company para uso em findAll/findOne
const COMPANY_ATTRIBUTES = [
  "id",
  "num",
  "name",
  "cnpj",
  "ie",
  "rule",
  "classi",
  "contractInit",
  "contact",
  "email",
  "phone",
  "status",
  "statusUpdatedAt",
  "respFiscalId",
  "respDpId",
  "respContabilId",
  "contactModeId",
  "important_info",
  "openedByUs",
  "uf",
  "obs",
  "isArchived",
  "branchNumber",
  "bonusValue",
  "employeesCount",
  "isHeadquarters",
  "grupoId",
  "accountingMonthsCount",
  "isZeroedFiscal",
  "sentToClientFiscal",
  "isZeroedDp",
  "sentToClientDp",
  "declarationsCompletedDp",
  "fiscalCompletedAt",
  "dpCompletedAt",
  "hasNoDpObligations",
  "isZeroedContabil",
  "contabilCompletedAt",
];

// Includes padrão para queries de Company
const STANDARD_INCLUDES = [
  { model: User, as: "respFiscal", attributes: ["id", "name"] },
  { model: User, as: "respDp", attributes: ["id", "name"] },
  { model: User, as: "respContabil", attributes: ["id", "name"] },
  { model: ContactMode, as: "contactMode", attributes: ["id", "name"] },
  { model: Grupo, as: "grupo", attributes: ["id", "name"] },
];

const USER_ONLY_INCLUDES = [
  { model: User, as: "respFiscal", attributes: ["id", "name"] },
  { model: User, as: "respDp", attributes: ["id", "name"] },
  { model: User, as: "respContabil", attributes: ["id", "name"] },
];

// ===================== REGISTRO DOS CACHES =====================

cacheManager.register("companies_all", async () => {
  return Company.findAll({
    include: STANDARD_INCLUDES,
    attributes: COMPANY_ATTRIBUTES,
  });
});

cacheManager.register("recent_companies", async () => {
  return Company.findAll({
    where: { isArchived: false },
    include: USER_ONLY_INCLUDES,
    order: [["createdAt", "DESC"]],
    limit: 10,
    attributes: ["id", "name", "contractInit"],
  });
});

cacheManager.register("recent_active_companies", async () => {
  return Company.findAll({
    where: { status: "ATIVA", isArchived: false },
    order: [["statusUpdatedAt", "DESC"]],
    limit: 10,
    attributes: ["id", "name", "status", "statusUpdatedAt"],
  });
});

cacheManager.register("recent_status_changes", async () => {
  return Company.findAll({
    where: { status: { [Op.in]: ["SUSPENSA", "BAIXADA", "DISTRATO"] } },
    order: [["statusUpdatedAt", "DESC"]],
    limit: 10,
    attributes: ["id", "name", "status", "statusUpdatedAt"],
  });
});

function registerMyCompaniesCache(user) {
  const key = `my_companies_${user.id}`;
  const config = getDeptConfig(user.department);
  if (!config) return key;

  const whereClause = {
    [config.responsibleField]: user.id,
    isArchived: false,
  };

  cacheManager.register(key, async () => {
    return Company.findAll({
      where: whereClause,
      include: STANDARD_INCLUDES,
      attributes: COMPANY_ATTRIBUTES,
    });
  });

  return key;
}

// ===================== CONTROLLER =====================

module.exports = class CompanyController {
  // ==================== CRUD ====================

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
        branchNumber,
        isHeadquarters,
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
        branchNumber,
        isHeadquarters: isHeadquarters || false,
        sentToClient: false,
        declarationsCompleted: false,
        isZeroed: false,
        sentToClientFiscal: false,
        isZeroedFiscal: false,
        sentToClientDp: false,
        declarationsCompletedDp: false,
        isZeroedDp: false,
        bonusValue: null,
        employeesCount: null,
        accountingMonthsCount: null,
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
      await cacheManager.reloadAllGlobal();
      cacheManager.invalidateByPrefix("dashboard_general_");
      cacheManager.invalidateByPrefix("dashboard_my_companies_");
      // Aplica automaticamente obrigações e impostos que se encaixam nos filtros
      ObligationController.applyObligationsToCompany(newCompany).catch(() => {});
      TaxController.applyTaxesToCompany(newCompany).catch(() => {});

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
      const companyData = company.get({ plain: true });
      if (companyData.contractInit) {
        companyData.contractInit = formatDate(companyData.contractInit);
      }
      const emailContent = newCompanyTemplate({ company: companyData });
      await sendToAllUsers(
        `Nova empresa cadastrada: ${company.name}`,
        emailContent
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

      await cacheManager.reloadAllGlobal();
      cacheManager.invalidateByPrefix("my_companies_");
      cacheManager.invalidateByPrefix("dashboard_general_");
      cacheManager.invalidateByPrefix("dashboard_my_companies_");
      registerMyCompaniesCache(req.user);
      await cacheManager.reloadMyCompanies(req.user.id);

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
      const allCompanies = await cacheManager.getOrFetch("companies_all");
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
        where: { id, isArchived: false },
        include: [
          ...USER_ONLY_INCLUDES,
          { model: ContactMode, as: "contactMode", attributes: ["id", "name"] },
          {
            model: Automation,
            as: "automations",
            attributes: ["id", "name"],
          },
        ],
        attributes: COMPANY_ATTRIBUTES,
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

  // ==================== STATUS ====================

  static async changeStatus(req, res) {
    const companyId = req.params.id;
    const { newStatus, statusDate, serviceEndDate } = req.body;
    let debitValue = null;
    if (newStatus === "SUSPENSA") {
      debitValue = req.body.debitValue;
    }

    try {
      const company = await Company.findByPk(companyId);
      if (!company) {
        logger.warn(
          `Alteração de status falhou: Empresa não encontrada (ID: ${companyId})`
        );
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      if (newStatus === "ATIVA") {
        company.isArchived = false;
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
        statusDate,
        serviceEndDate || null,
        debitValue
      );

      await cacheManager.reloadAllGlobal();
      cacheManager.invalidateByPrefix("my_companies_");
      cacheManager.invalidateByPrefix("dashboard_general_");
      cacheManager.invalidateByPrefix("dashboard_my_companies_");
      registerMyCompaniesCache(req.user);
      await cacheManager.reloadMyCompanies(req.user.id);

      return res
        .status(200)
        .json({ message: "Status da empresa atualizado com sucesso." });
    } catch (error) {
      logger.error(`Erro ao alterar status da empresa: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async sendStatusChangeEmails(
    company,
    newStatus,
    date,
    serviceEndDate,
    debitValue
  ) {
    try {
      const companyName = company.name;
      const emailSubject = `${companyName} - Atualização de Status`;
      const formattedDate = formatDate(date);

      if (newStatus === "ATIVA") {
        const emailContent = activeTemplate({
          companyName,
          newStatus,
          formatedDate: formattedDate,
        });
        await sendToAllUsers(emailSubject, emailContent);
      } else if (newStatus === "BAIXADA") {
        const emailContent = closedTemplate({
          companyName,
          newStatus,
          formatedDate: formattedDate,
        });
        await sendToAllUsers(emailSubject, emailContent);
      } else if (newStatus === "DISTRATO") {
        const emailContent = terminatedTemplate({
          companyName,
          contractEndDate: formattedDate,
          serviceEndDate: formatDate(serviceEndDate),
        });
        await sendToAllUsers(emailSubject, emailContent);
      } else if (newStatus === "SUSPENSA") {
        // Email interno para os usuários
        const internalContent = suspendedEmailInternal({
          companyName,
          suspensionDate: formattedDate,
        });
        await sendToAllUsers(emailSubject, internalContent);

        // Email para o cliente
        if (company.email && company.email.trim() !== "") {
          const clientContent = suspendedEmailClient({
            companyName,
            debitValue,
            suspensionDate: formattedDate,
          });
          await sendToRecipients(company.email, emailSubject, clientContent);
        } else {
          logger.warn(
            "Email da empresa não informado para envio de notificação ao cliente."
          );
        }
      } else {
        const emailContent = `<p>O novo status da empresa <strong>${companyName}</strong> é <strong>${newStatus}</strong>.</p>`;
        await sendToAllUsers(emailSubject, emailContent);
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

  // ==================== RECENT DATA ====================

  static async getRecentStatusChanges(req, res) {
    try {
      logger.info(
        `Usuário (${req.user.email}) solicitou as últimas mudanças de status.`
      );
      const data = await cacheManager.getOrFetch("recent_status_changes");
      return res.status(200).json(data);
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
      const data = await cacheManager.getOrFetch("recent_active_companies");
      return res.status(200).json(data);
    } catch (error) {
      logger.error(
        `Erro ao buscar empresas ativas recentes: ${error.message}`
      );
      return res.status(500).json({ message: error.message });
    }
  }

  static async getRecentCompanies(req, res) {
    try {
      logger.info(
        `Usuário (${req.user.email}) solicitou as últimas empresas adicionadas.`
      );
      const data = await cacheManager.getOrFetch("recent_companies");
      return res.status(200).json(data);
    } catch (error) {
      logger.error(`Erro ao buscar empresas recentes: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  // ==================== MY COMPANIES ====================

  static async getMyCompanies(req, res) {
    try {
      const token = await getToken(req);
      const user = await getUserByToken(token);

      const config = getDeptConfig(user.department);
      if (!config) {
        logger.warn(
          `Usuário (${user.email}) não pertence a nenhum departamento específico.`
        );
        return res.status(200).json([]);
      }

      const whereClause = {
        [config.responsibleField]: user.id,
        isArchived: false,
        // status não filtrado aqui — filtragem temporal por período feita no frontend
      };

      const myCompaniesKey = registerMyCompaniesCache(user);

      // Registrar empresas do agente (ATIVA + SUSPENSA/BAIXADA/DISTRATO até o mês do status)
      cacheManager.register(myCompaniesKey, async () => {
        return Company.findAll({
          where: whereClause,
          include: STANDARD_INCLUDES,
          attributes: COMPANY_ATTRIBUTES,
        });
      });

      const companies = await cacheManager.getOrFetch(myCompaniesKey);
      return res.status(200).json(companies);
    } catch (error) {
      logger.error(`Erro ao buscar empresas do usuário: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  // ==================== AGENT DATA ====================

  static async updateAgentData(req, res) {
    const companyId = req.params.id;
    const agentData = req.body;
    const user = req.user;

    try {
      const company = await Company.findByPk(companyId);

      if (!company) {
        logger.warn(
          `Atualização de dados do agente falhou: Empresa não encontrada (ID: ${companyId})`
        );
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      logger.info(
        `Usuário (${user.email}) atualizando dados do agente para empresa ID: ${companyId}`
      );

      const updatePayload = {};
      const previousState = company.get({ plain: true });

      // Loop genérico por departamento usando departmentConfig
      for (const [deptName, config] of Object.entries(getAllDeptConfigs())) {
        if (user.department !== deptName && user.role !== "admin") continue;

        // Bonus field (todos os departamentos)
        if (config.bonusField && config.bonusField in agentData) {
          updatePayload[config.bonusField] =
            agentData[config.bonusField] === ""
              ? null
              : parseInt(agentData[config.bonusField], 10);
        }

        // isZeroed (todos os departamentos com obligationsEnabled)
        if (config.obligationsEnabled && config.isZeroed && config.isZeroed in agentData) {
          updatePayload[config.isZeroed] = agentData[config.isZeroed];
        }

        // Campos legados que ainda existem no DB (ex: sentToClientFiscal)
        if (config.sentToClient && config.sentToClient in agentData) {
          updatePayload[config.sentToClient] = agentData[config.sentToClient];
        }
        if (config.declarationsCompleted && config.declarationsCompleted in agentData) {
          updatePayload[config.declarationsCompleted] = agentData[config.declarationsCompleted];
        }
        if (config.hasNoObligations && config.hasNoObligations in agentData) {
          updatePayload[config.hasNoObligations] = agentData[config.hasNoObligations];
        }
      }

      // Lógica de timestamp de conclusão — apenas para departamentos SEM obligationsEnabled
      // (os que têm obligationsEnabled usam o checker assíncrono via impostos/obrigações)
      const potentialNewState = { ...previousState, ...updatePayload };

      for (const [, config] of Object.entries(getAllDeptConfigs())) {
        if (config.obligationsEnabled) continue; // usa checker, não calcular aqui
        if (!config.completedAt || !config.sentToClient) continue;

        const isNormallyCompleted =
          potentialNewState[config.sentToClient] &&
          potentialNewState[config.declarationsCompleted];
        const isZeroedAndCompleted =
          potentialNewState[config.isZeroed] &&
          potentialNewState[config.declarationsCompleted];
        const isComplete = isNormallyCompleted || isZeroedAndCompleted;

        if (isComplete && !previousState[config.completedAt]) {
          updatePayload[config.completedAt] = new Date();
        } else if (!isComplete && previousState[config.completedAt]) {
          updatePayload[config.completedAt] = null;
        }
      }

      await company.update(updatePayload);

      // Processar toggles de isZeroed para todos os departamentos com obligationsEnabled
      const currentMonth = getCurrentMonthPeriod();
      const currentYear = currentMonth.substring(0, 4);

      for (const [deptName, cfg] of Object.entries(getAllDeptConfigs())) {
        if (!cfg.obligationsEnabled || !cfg.isZeroed) continue;
        const field = cfg.isZeroed;
        if (!(field in agentData)) continue;

        const wasZeroed = previousState[field];
        const nowZeroed = agentData[field];

        if (!nowZeroed && wasZeroed) {
          // Desmarcado: reativar impostos e obrigações desabilitados para esse departamento
          const [taxIds, oblIds] = await Promise.all([
            CompanyTax.findAll({ where: { department: deptName }, attributes: ["id"], raw: true }).then((r) => r.map((t) => t.id)),
            AccessoryObligation.findAll({ where: { department: deptName }, attributes: ["id"], raw: true }).then((r) => r.map((o) => o.id)),
          ]);
          const ops = [];
          if (taxIds.length) {
            ops.push(CompanyTaxStatus.update(
              { status: "pending" },
              { where: { companyId, taxId: taxIds, period: currentMonth, status: "disabled", isManuallyExcluded: false } }
            ));
          }
          if (oblIds.length) {
            ops.push(
              CompanyObligationStatus.update(
                { status: "pending" },
                { where: { companyId, obligationId: oblIds, period: { [Op.like]: `${currentMonth}%` }, status: "disabled", isManuallyExcluded: false } }
              ),
              CompanyObligationStatus.update(
                { status: "pending" },
                { where: { companyId, obligationId: oblIds, period: currentYear, status: "disabled", isManuallyExcluded: false } }
              )
            );
          }
          if (ops.length) await Promise.all(ops);
        }

        if (nowZeroed && !wasZeroed) {
          // Marcado: executar checker para atualizar conclusão
          checkAndUpdateCompletion(companyId, currentMonth, deptName).catch(() => {});
        }
      }

      logger.info(
        `Dados do agente para empresa ${company.name} (ID: ${companyId}) atualizados por ${user.email}.`
      );

      cacheManager.invalidate(["my_companies_" + user.id]);
      cacheManager.invalidateByPrefix("dashboard_my_companies_");
      registerMyCompaniesCache(user);
      await cacheManager.reloadMyCompanies(user.id);

      return res
        .status(200)
        .json({ message: "Dados do agente atualizados com sucesso.", company });
    } catch (error) {
      logger.error(
        `Erro ao atualizar dados do agente para empresa (ID: ${companyId}): ${error.message}`,
        { stack: error.stack }
      );
      return res
        .status(500)
        .json({ message: "Erro ao atualizar dados do agente." });
    }
  }

  // ==================== DASHBOARDS ====================

  // Método privado unificado — Dashboard General (Fiscal e Pessoal)
  static async _getDashboardGeneralData(req, res, departmentName) {
    const config = getDeptConfig(departmentName);

    try {
      const user = req.user;
      if (user.role !== "admin" && user.department !== departmentName) {
        logger.warn(
          `Usuário (${user.email}) tentou acessar dashboard ${departmentName} geral sem permissão.`
        );
        return res.status(403).json({
          message: `Acesso restrito ao departamento ${departmentName} ou administradores.`,
        });
      }

      const cacheKey = `dashboard_general_${departmentName}`;
      const cachedData = await cacheManager.getOrFetch(cacheKey, async () => {

      const absoluteTotalForDept = await Company.count({
        where: { status: "ATIVA", isArchived: false },
      });

      const deptUsers = await User.findAll({
        where: { department: departmentName },
        attributes: ["id", "name"],
      });

      const usersDataMap = new Map();
      const deptUserIds = deptUsers.map((u) => u.id);

      const allActiveCompaniesForUsers = await Company.findAll({
        where: {
          status: "ATIVA",
          isArchived: false,
          [config.responsibleField]: { [Op.in]: deptUserIds },
        },
        attributes: [config.responsibleField, config.completedAt],
        raw: true,
      });

      const userStats = {};
      allActiveCompaniesForUsers.forEach((company) => {
        const userId = company[config.responsibleField];
        if (!userStats[userId]) {
          userStats[userId] = { absoluteTotal: 0, lastCompletion: null };
        }
        userStats[userId].absoluteTotal++;
        if (company[config.completedAt]) {
          if (
            !userStats[userId].lastCompletion ||
            new Date(company[config.completedAt]) >
              new Date(userStats[userId].lastCompletion)
          ) {
            userStats[userId].lastCompletion = company[config.completedAt];
          }
        }
      });

      deptUsers.forEach((u) => {
        usersDataMap.set(u.id, {
          id: u.id,
          name: u.name,
          totalCompaniesAssigned: 0,
          completedCompanies: 0,
          nonCompletedCompanies: 0,
          zeroedCompanies: 0,
          absoluteTotalAssigned: userStats[u.id]?.absoluteTotal || 0,
          lastCompletionDate: userStats[u.id]?.lastCompletion || null,
        });
      });

      // Para Fiscal, declarationsCompleted e hasNoObligations foram removidos.
      // Completion = sentToClient. Filtra undefined do array de attributes.
      const isFiscalDept = config.obligationsEnabled === true;
      const queryAttributes = [
        config.isZeroed,
        config.sentToClient,
        !isFiscalDept && config.declarationsCompleted,
        !isFiscalDept && config.hasNoObligations,
        config.responsibleField,
      ].filter(Boolean);

      const allCompaniesForUsers = await Company.findAll({
        where: {
          status: "ATIVA",
          isArchived: false,
          [config.responsibleField]: { [Op.in]: deptUserIds },
        },
        attributes: queryAttributes,
        raw: true,
      });

      let totalForCalculation = 0;
      let completedCompanies = 0;

      const zeroedCompaniesCount = await Company.count({
        where: {
          status: "ATIVA",
          isArchived: false,
          [config.isZeroed]: true,
        },
      });

      const sentCompaniesCount = config.sentToClient
        ? await Company.count({
            where: {
              status: "ATIVA",
              isArchived: false,
              [config.sentToClient]: true,
            },
          })
        : 0;

      for (const company of allCompaniesForUsers) {
        const responsibleUser = usersDataMap.get(
          company[config.responsibleField]
        );
        if (responsibleUser) {
          if (company[config.isZeroed]) {
            responsibleUser.zeroedCompanies++;
          }

          // Para Fiscal: toda empresa é parte da carga de trabalho
          // Para outros: exclui zeradas sem obrigações
          const isPartOfWorkload = isFiscalDept
            ? true
            : !(company[config.isZeroed] && company[config.hasNoObligations]);

          if (isPartOfWorkload) {
            totalForCalculation++;
            responsibleUser.totalCompaniesAssigned++;

            let isCompleted = false;
            if (isFiscalDept) {
              // Fiscal: concluído = enviado ao cliente
              isCompleted = !!company[config.sentToClient];
            } else if (company[config.isZeroed]) {
              isCompleted = !!company[config.declarationsCompleted];
            } else {
              isCompleted =
                !!company[config.sentToClient] &&
                !!company[config.declarationsCompleted];
            }

            if (isCompleted) {
              completedCompanies++;
              responsibleUser.completedCompanies++;
            }
          }
        }
      }

      const usersData = Array.from(usersDataMap.values()).map((ud) => {
        ud.nonCompletedCompanies =
          ud.totalCompaniesAssigned - ud.completedCompanies;
        return ud;
      });

      return {
        totalCompanies: totalForCalculation,
        absoluteTotalForDept,
        zeroedCompanies: zeroedCompaniesCount,
        completedCompanies,
        sentCompanies: sentCompaniesCount,
        isFiscal: isFiscalDept,
        usersData,
      };
      }); // end cacheManager.getOrFetch

      res.status(200).json(cachedData);
    } catch (error) {
      logger.error(
        `Erro ao buscar dados gerais do dashboard ${departmentName}: ${error.message}`,
        { stack: error.stack }
      );
      res.status(500).json({
        message: `Erro ao buscar dados gerais do dashboard ${departmentName}.`,
      });
    }
  }

  // Método privado unificado — Dashboard My Companies (Fiscal e Pessoal)
  static async _getDashboardMyCompaniesData(req, res, departmentName) {
    const config = getDeptConfig(departmentName);
    const targetUserId = req.params.userId;
    const user = req.user;

    if (user.id != targetUserId && user.role !== "admin") {
      logger.warn(
        `Usuário (${user.email}) tentou acessar dashboard de 'Minhas Empresas' de outro usuário (${targetUserId}) sem permissão.`
      );
      return res.status(403).json({
        message:
          "Você não tem permissão para acessar os dados de outro usuário.",
      });
    }

    if (user.department !== departmentName && user.role !== "admin") {
      logger.warn(
        `Usuário (${user.email}) tentou acessar dashboard 'Minhas Empresas' mas não é do departamento ${departmentName}.`
      );
      return res.status(403).json({
        message: `Esta visualização é restrita a usuários do departamento ${departmentName} ou administradores.`,
      });
    }

    try {
      const isFiscalDept = config.obligationsEnabled === true;
      const cacheKey = `dashboard_my_companies_${departmentName}_${targetUserId}`;

      const result = await cacheManager.getOrFetch(cacheKey, async () => {
        const whereClause = {
          status: "ATIVA",
          isArchived: false,
          [config.responsibleField]: targetUserId,
        };

        // Para DP/Contábil: exclui zeradas sem obrigações
        if (!isFiscalDept && config.hasNoObligations) {
          whereClause[Op.not] = {
            [Op.and]: [
              { [config.isZeroed]: true },
              { [config.hasNoObligations]: true },
            ],
          };
        }

        const queryAttributes = [
          config.isZeroed,
          config.sentToClient,
          !isFiscalDept && config.declarationsCompleted,
        ].filter(Boolean);

        const userCompanies = await Company.findAll({
          where: whereClause,
          attributes: queryAttributes,
          raw: true,
        });

        const totalCompanies = userCompanies.length;
        let completedCompanies = 0;
        let zeroedCompanies = 0;

        for (const company of userCompanies) {
          if (company[config.isZeroed]) zeroedCompanies++;

          let isCompleted = false;
          if (isFiscalDept) {
            isCompleted = !!company[config.sentToClient];
          } else if (company[config.isZeroed]) {
            isCompleted = !!company[config.declarationsCompleted];
          } else {
            isCompleted =
              !!company[config.sentToClient] &&
              !!company[config.declarationsCompleted];
          }

          if (isCompleted) completedCompanies++;
        }

        return {
          totalCompanies,
          zeroedCompanies,
          completedCompanies,
          sentCompanies: isFiscalDept
            ? userCompanies.filter((c) => c[config.sentToClient]).length
            : undefined,
          isFiscal: isFiscalDept,
        };
      });

      res.status(200).json(result);
    } catch (error) {
      logger.error(
        `Erro ao buscar dados de 'Minhas Empresas' para o dashboard ${departmentName} (User ID: ${targetUserId}): ${error.message}`,
        { stack: error.stack }
      );
      res.status(500).json({
        message: "Erro ao carregar dados do dashboard de 'Minhas Empresas'.",
      });
    }
  }

  // Wrappers públicos — mantêm os endpoints existentes
  static async getFiscalDashboardGeneralData(req, res) {
    return CompanyController._getDashboardGeneralData(req, res, "Fiscal");
  }

  static async getDpDashboardGeneralData(req, res) {
    return CompanyController._getDashboardGeneralData(req, res, "Pessoal");
  }

  static async getFiscalDashboardMyCompaniesData(req, res) {
    return CompanyController._getDashboardMyCompaniesData(req, res, "Fiscal");
  }

  static async getDpDashboardMyCompaniesData(req, res) {
    return CompanyController._getDashboardMyCompaniesData(req, res, "Pessoal");
  }

  // Contábil tem lógica diferente (sem sentToClient/declarations)
  static async getContabilDashboardGeneralData(req, res) {
    try {
      const user = req.user;
      if (user.role !== "admin" && user.department !== "Contábil") {
        logger.warn(
          `Usuário (${user.email}) tentou acessar dashboard Contábil geral sem permissão.`
        );
        return res.status(403).json({
          message:
            "Acesso restrito ao departamento Contábil ou administradores.",
        });
      }

      const cachedData = await cacheManager.getOrFetch("dashboard_general_Contábil", async () => {
        const contabilUsers = await User.findAll({
          where: { department: "Contábil" },
          attributes: ["id", "name"],
        });

        const usersDataMap = new Map();
        contabilUsers.forEach((cu) => {
          usersDataMap.set(cu.id, {
            id: cu.id,
            name: cu.name,
            totalAccountingMonths: 0,
            totalCompaniesAssigned: 0,
          });
        });

        const relevantCompanies = await Company.findAll({
          where: {
            status: "ATIVA",
            isArchived: false,
            respContabilId: { [Op.in]: contabilUsers.map((u) => u.id) },
          },
          attributes: ["respContabilId", "accountingMonthsCount"],
          raw: true,
        });

        for (const company of relevantCompanies) {
          const responsibleUser = usersDataMap.get(company.respContabilId);
          if (responsibleUser) {
            responsibleUser.totalCompaniesAssigned++;
            responsibleUser.totalAccountingMonths +=
              company.accountingMonthsCount || 0;
          }
        }

        return { usersData: Array.from(usersDataMap.values()) };
      });

      res.status(200).json(cachedData);
    } catch (error) {
      logger.error(
        `Erro ao buscar dados gerais do dashboard contábil: ${error.message}`,
        { stack: error.stack }
      );
      res.status(500).json({
        message: "Erro ao buscar dados gerais do dashboard contábil.",
      });
    }
  }

  /**
   * GET /company/period-completion?period=YYYY-MM&department=Fiscal&companyIds=1,2,3
   *
   * Retorna o estado de conclusão de cada empresa para um período específico,
   * calculado exclusivamente a partir dos registros de status (CompanyTaxStatus +
   * CompanyObligationStatus). Nunca escreve na tabela Company.
   *
   * Resposta: { [companyId]: { isComplete, total, completed, pending } }
   */
  static async getPeriodCompletion(req, res) {
    try {
      const { period, department, companyIds: companyIdsParam } = req.query;

      if (!period || !department || !companyIdsParam) {
        return res.status(400).json({ message: "Parâmetros obrigatórios: period, department, companyIds." });
      }

      const companyIds = companyIdsParam.split(",").map((id) => parseInt(id, 10)).filter(Boolean);
      if (companyIds.length === 0) return res.json({});

      const cfg = getDeptConfig(department);
      if (!cfg) return res.status(400).json({ message: "Departamento inválido." });

      // Busca todos os impostos e obrigações do departamento
      const [deptTaxes, deptObligations] = await Promise.all([
        CompanyTax.findAll({ where: { department }, attributes: ["id", "periodicity"], raw: true }),
        AccessoryObligation.findAll({ where: { department }, attributes: ["id", "periodicity", "deadlineMonth"], raw: true }),
      ]);

      const taxIds = deptTaxes
        .filter((t) => {
          // Impostos trimestrais: só visíveis em meses de fechamento
          if (t.periodicity !== "trimestral") return true;
          const month = parseInt(period.split("-")[1], 10);
          return [3, 6, 9, 12].includes(month);
        })
        .map((t) => t.id);

      // Obrigações visíveis: anuais aparecem no mês ANTERIOR ao vencimento
      const [displayYear, displayMonthNum] = period.split("-").map(Number);
      const visibleObligations = deptObligations.filter((obl) => {
        if (obl.periodicity !== "annual") return true;
        if (!obl.deadlineMonth) return true;
        const expectedDisplay = obl.deadlineMonth === 1 ? 12 : obl.deadlineMonth - 1;
        return expectedDisplay === displayMonthNum;
      });

      // Resolve períodos de banco para cada obrigação
      const oblPeriodMap = {}; // obligationId -> string[]
      const oblPeriodSet = new Set();
      for (const obl of visibleObligations) {
        let periods;
        if (obl.periodicity === "biweekly") {
          periods = [`${period}-1`, `${period}-2`];
        } else if (obl.periodicity === "annual") {
          // Se vence em janeiro e exibimos em dezembro → DB pertence ao próximo ano
          const dbYear = obl.deadlineMonth === 1 && displayMonthNum === 12 ? displayYear + 1 : displayYear;
          periods = [String(dbYear)];
        } else {
          periods = [period];
        }
        oblPeriodMap[obl.id] = periods;
        periods.forEach((p) => oblPeriodSet.add(p));
      }
      const oblIds = visibleObligations.map((o) => o.id);

      // Queries em batch para status existentes
      const [taxStatuses, oblStatuses] = await Promise.all([
        taxIds.length
          ? CompanyTaxStatus.findAll({
              where: {
                companyId: companyIds,
                taxId: taxIds,
                period,
                isManuallyExcluded: false,
                status: { [Op.ne]: "disabled" },
              },
              attributes: ["companyId", "status"],
              raw: true,
            })
          : [],
        oblIds.length && oblPeriodSet.size
          ? CompanyObligationStatus.findAll({
              where: {
                companyId: companyIds,
                obligationId: oblIds,
                period: { [Op.in]: [...oblPeriodSet] },
                isManuallyExcluded: false,
                status: { [Op.notIn]: ["disabled", "not_applicable"] },
              },
              attributes: ["companyId", "status"],
              raw: true,
            })
          : [],
      ]);

      // Agrega por empresa
      const totals = {}; // companyId -> { total, pending }
      for (const id of companyIds) totals[id] = { total: 0, pending: 0 };

      for (const s of taxStatuses) {
        if (!totals[s.companyId]) continue;
        totals[s.companyId].total++;
        if (s.status === "pending") totals[s.companyId].pending++;
      }
      for (const s of oblStatuses) {
        if (!totals[s.companyId]) continue;
        totals[s.companyId].total++;
        if (s.status === "pending") totals[s.companyId].pending++;
      }

      const result = {};
      for (const id of companyIds) {
        const { total, pending } = totals[id];
        const completed = total - pending;
        result[id] = {
          isComplete: total > 0 && pending === 0,
          total,
          completed,
          pending,
        };
      }

      return res.json(result);
    } catch (error) {
      logger.error(`CompanyController.getPeriodCompletion: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  // ==================== NOTAS POR PERÍODO ====================

  static async getPeriodNote(req, res) {
    const { id } = req.params;
    const { period } = req.query;
    if (!period) return res.status(400).json({ message: "Parâmetro 'period' obrigatório." });
    try {
      const record = await CompanyPeriodNote.findOne({ where: { companyId: id, period } });
      return res.status(200).json({ note: record?.note ?? "" });
    } catch (error) {
      logger.error(`CompanyController.getPeriodNote: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async savePeriodNote(req, res) {
    const { id } = req.params;
    const { period, note } = req.body;
    if (!period) return res.status(400).json({ message: "Campo 'period' obrigatório." });
    try {
      await CompanyPeriodNote.upsert({ companyId: id, period, note: note ?? null, updatedById: req.user.id });
      return res.status(200).json({ note: note ?? "" });
    } catch (error) {
      logger.error(`CompanyController.savePeriodNote: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async getPeriodNotesBulk(req, res) {
    const { period } = req.query;
    const companyIds = req.query.companyIds ? req.query.companyIds.split(",").map(Number) : [];
    if (!period || companyIds.length === 0)
      return res.status(400).json({ message: "Parâmetros 'period' e 'companyIds' obrigatórios." });
    try {
      const records = await CompanyPeriodNote.findAll({
        where: { period, companyId: { [Op.in]: companyIds } },
        attributes: ["companyId", "note"],
      });
      const result = {};
      records.forEach((r) => { result[r.companyId] = r.note ?? ""; });
      return res.status(200).json(result);
    } catch (error) {
      logger.error(`CompanyController.getPeriodNotesBulk: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }
};

// Exporta utilitários de cache para uso em outros controllers (AdminController, schedulers)
module.exports.cacheUtils = {
  cacheManager,
  registerMyCompaniesCache,
};

const User = require("../models/User");
const Company = require("../models/Company");
const UserActivity = require("../models/UserActivity");
const { Op } = require("sequelize");
const { suspendedCompaniesListTemplate, adminChangedPasswordEmailTemplate } = require("../emails/templates");
const formatDate = require("../helpers/format-date");
const logger = require("../logger/logger");
const cacheManager = require("../utils/CacheManager");
const { sendToAllUsers, sendToRecipients } = require("../utils/emailSender");
const { getDeptConfig } = require("../config/departmentConfig");
const { cacheUtils: { registerMyCompaniesCache } } = require("./CompanyController");
const bcrypt = require("bcrypt");
const transporter = require("../services/emailService");

module.exports = {
  getAllUsers: async (req, res) => {
    try {
      logger.info(`Admin (${req.user.email}) solicitou todos os usuários.`);
      const users = await User.findAll({
        attributes: ["id", "name", "department", "role", "hasBonus"],
      });
      res.status(200).json({ users });
    } catch (error) {
      logger.error(`Erro ao buscar todos os usuários: ${error.message}`);
      res.status(500).json({ message: "Erro ao buscar usuários." });
    }
  },

  changeUserRole: async (req, res) => {
    const userId = req.params.id;
    const { role } = req.body;

    if (!["user", "admin", "not-validated"].includes(role)) {
      logger.warn(`Tentativa de atribuição de nível inválido: ${role}`);
      return res.status(400).json({ message: "Nível de usuário inválido." });
    }

    try {
      const user = await User.findByPk(userId);

      if (!user) {
        logger.warn(
          `Alteração de nível falhou: Usuário não encontrado (ID: ${userId})`
        );
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      const previousRole = user.role;
      user.role = role;
      await user.save();

      logger.info(
        `Nível de usuário alterado: ${user.email} de ${previousRole} para ${role} por Admin (${req.user.email})`
      );

      res
        .status(200)
        .json({ message: "Nível de usuário atualizado com sucesso." });
    } catch (error) {
      logger.error(`Erro ao alterar nível de usuário: ${error.message}`);
      res.status(500).json({ message: "Erro ao atualizar nível do usuário." });
    }
  },

  deleteUser: async (req, res) => {
    const userId = req.params.id;

    try {
      const user = await User.findByPk(userId);

      if (!user) {
        logger.warn(
          `Deleção de usuário falhou: Usuário não encontrado (ID: ${userId})`
        );
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      await user.destroy();

      logger.info(
        `Usuário deletado: ${user.email} por Admin (${req.user.email})`
      );

      res.status(200).json({ message: "Usuário deletado com sucesso." });
    } catch (error) {
      logger.error(`Erro ao deletar usuário: ${error.message}`);
      res.status(500).json({ message: "Erro ao deletar usuário." });
    }
  },

  sendSuspendedCompaniesEmailManual: async (req, res) => {
    try {
      const suspendedCompanies = await Company.findAll({
        where: { status: "SUSPENSA", isArchived: false },
        attributes: ["name", "statusUpdatedAt"],
      });

      const companiesData = suspendedCompanies.map((company) => ({
        name: company.name,
        statusUpdatedAt: formatDate(company.statusUpdatedAt),
      }));

      const currentDate = new Date().toLocaleDateString("pt-BR");

      const emailContent = suspendedCompaniesListTemplate({
        companies: companiesData,
        currentDate,
      });

      const count = await sendToAllUsers(
        "Lista de Empresas Suspensas - " + currentDate,
        emailContent
      );

      if (count === 0) {
        return res
          .status(400)
          .json({ message: "Nenhum usuário encontrado para envio." });
      }

      return res.status(200).json({ message: "Email enviado com sucesso." });
    } catch (error) {
      logger.error(
        `Erro ao enviar email manual de empresas suspensas: ${error.message}`
      );
      return res.status(500).json({ message: "Erro ao enviar email." });
    }
  },

  archiveCompanyManually: async (req, res) => {
    const companyId = req.params.id;
    try {
      logger.info(
        `Admin (${req.user.email}) solicitou o arquivamento manual da empresa ID: ${companyId}.`
      );

      const company = await Company.findByPk(companyId);

      if (!company) {
        logger.warn(
          `Arquivamento manual falhou: Empresa não encontrada (ID: ${companyId})`
        );
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      if (company.isArchived) {
        logger.info(
          `Empresa (ID: ${companyId}) já está arquivada. Nenhuma ação tomada.`
        );
        return res
          .status(200)
          .json({ message: "Empresa já se encontra arquivada." });
      }

      company.isArchived = true;
      await company.save();

      logger.info(
        `Empresa ${company.name} (ID: ${companyId}) arquivada manualmente por Admin (${req.user.email}).`
      );

      cacheManager.invalidateByPrefix("my_companies_");
      await cacheManager.reloadAllGlobal();

      if (req.user && req.user.id) {
        registerMyCompaniesCache(req.user);
        await cacheManager.reloadMyCompanies(req.user.id);
        logger.info(
          `Cache 'my_companies_${req.user.id}' recarregado para o admin.`
        );
      }

      logger.info(
        `Caches recarregados após arquivamento manual da empresa ID: ${companyId}`
      );

      return res
        .status(200)
        .json({ message: "Empresa arquivada com sucesso." });
    } catch (error) {
      logger.error(
        `Erro ao arquivar manualmente a empresa (ID: ${companyId}): ${error.message}`,
        { stack: error.stack }
      );
      return res.status(500).json({ message: "Erro ao arquivar a empresa." });
    }
  },

  changeUserPasswordByAdmin: async (req, res) => {
    const userId = req.params.id;
    const { newPassword } = req.body;
    const adminUser = req.user;

    if (!newPassword || newPassword.trim() === "") {
      logger.warn(
        `Admin (${adminUser.email}) tentou alterar senha do usuário ID ${userId} sem fornecer uma nova senha.`
      );
      return res.status(400).json({ message: "A nova senha é obrigatória." });
    }

    try {
      const userToChange = await User.findByPk(userId);

      if (!userToChange) {
        logger.warn(
          `Admin (${adminUser.email}) falhou ao tentar alterar senha: Usuário não encontrado (ID: ${userId})`
        );
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      userToChange.password = passwordHash;
      await userToChange.save();

      logger.info(
        `Senha do usuário ${userToChange.email} (ID: ${userId}) alterada com sucesso por Admin (${adminUser.email}).`
      );

      // Enviar email para o usuário com a nova senha
      try {
        const emailContent = adminChangedPasswordEmailTemplate({
          userName: userToChange.name,
          newPassword: newPassword,
        });

        await transporter.sendMail({
          from: '"Contask" <naoresponda@contelb.com.br>',
          to: userToChange.email,
          subject: "Sua senha no Contask foi alterada",
          html: emailContent,
        });
        logger.info(
          `Email de notificação de alteração de senha enviado para ${userToChange.email}.`
        );
      } catch (emailError) {
        logger.error(
          `Erro ao enviar email de notificação de alteração de senha para ${userToChange.email}: ${emailError.message}`
        );
      }

      res
        .status(200)
        .json({ message: "Senha do usuário atualizada com sucesso." });
    } catch (error) {
      logger.error(
        `Erro ao alterar senha do usuário (ID: ${userId}) por Admin (${adminUser.email}): ${error.message}`,
        { stack: error.stack }
      );
      res.status(500).json({ message: "Erro ao atualizar senha do usuário." });
    }
  },

  toggleUserBonusStatus: async (req, res) => {
    const userId = req.params.id;
    const adminUser = req.user;

    try {
      const userToUpdate = await User.findByPk(userId);

      if (!userToUpdate) {
        logger.warn(
          `Admin (${adminUser.email}) falhou ao tentar alterar status de bônus: Usuário não encontrado (ID: ${userId})`
        );
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      const allowedDepartments = ["Fiscal", "Pessoal", "Contábil"];
      if (!allowedDepartments.includes(userToUpdate.department)) {
        logger.warn(
          `Admin (${adminUser.email}) tentou alterar status de bônus para usuário de departamento não elegível (${userToUpdate.department})`
        );
        return res.status(400).json({
          message:
            "A elegibilidade de bônus só se aplica a usuários dos departamentos Fiscal, Pessoal ou Contábil.",
        });
      }

      userToUpdate.hasBonus = !userToUpdate.hasBonus;
      await userToUpdate.save();

      logger.info(
        `Status de bônus do usuário ${userToUpdate.email} (ID: ${userId}) alterado para ${userToUpdate.hasBonus} por Admin (${adminUser.email}).`
      );

      res.status(200).json({
        message: "Status de elegibilidade de bônus atualizado com sucesso.",
        user: { id: userToUpdate.id, hasBonus: userToUpdate.hasBonus },
      });
    } catch (error) {
      logger.error(
        `Erro ao alterar status de bônus do usuário (ID: ${userId}) por Admin (${adminUser.email}): ${error.message}`,
        { stack: error.stack }
      );
      res
        .status(500)
        .json({ message: "Erro ao atualizar o status de bônus do usuário." });
    }
  },

  getTeamViewData: async (req, res) => {
    try {
      const { department, userId } = req.query;
      const whereClause = {
        status: "ATIVA",
        isArchived: false,
      };

      // Usa departmentConfig para mapear departamento → campo
      const config = getDeptConfig(department);
      if (config) {
        if (userId && userId !== "all") {
          whereClause[config.responsibleField] = userId;
        } else {
          whereClause[config.responsibleField] = { [Op.ne]: null };
        }
      }

      const includeClause = [
        { model: User, as: "respFiscal", attributes: ["id", "name"] },
        { model: User, as: "respDp", attributes: ["id", "name"] },
        { model: User, as: "respContabil", attributes: ["id", "name"] },
      ];

      // Se um departamento específico foi selecionado, adiciona o filtro de nome "N/A"
      if (config && department !== "all") {
        const targetInclude = includeClause.find(
          (inc) => inc.as === config.responsibleAlias
        );

        if (targetInclude) {
          targetInclude.where = { name: { [Op.ne]: "N/A" } };
          targetInclude.required = true;
        }
      }

      const companies = await Company.findAll({
        where: whereClause,
        include: includeClause,
        order: [["name", "ASC"]],
      });

      res.status(200).json(companies);
    } catch (error) {
      logger.error(
        `Erro ao buscar dados para a Visão de Equipes: ${error.message}`,
        { stack: error.stack }
      );
      res
        .status(500)
        .json({ message: "Ocorreu um erro ao buscar os dados das equipes." });
    }
  },

  getActivityMonitor: async (req, res) => {
    const allowedIds = [1, 4];
    if (!allowedIds.includes(req.user.id)) {
      return res.status(403).json({ message: "Acesso não autorizado." });
    }

    try {
      const allUsers = await User.findAll({
        where: { role: { [Op.ne]: "not-validated" } },
        attributes: ["id", "name", "department"],
        order: [["name", "ASC"]],
      });

      const today = new Date();
      const days = [];

      for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().split("T")[0]; // YYYY-MM-DD

        const activities = await UserActivity.findAll({
          where: { date: dateStr },
          attributes: ["userId"],
        });

        const usedIds = new Set(activities.map((a) => a.userId));
        const usedBy = allUsers.filter((u) => usedIds.has(u.id)).map((u) => ({ id: u.id, name: u.name }));
        const notUsedBy = allUsers.filter((u) => !usedIds.has(u.id)).map((u) => ({ id: u.id, name: u.name }));

        days.push({ date: dateStr, usedBy, notUsedBy });
      }

      // Ranking: conta quantos dias cada usuário usou nos últimos 30 dias
      const activityCounts = await UserActivity.findAll({
        where: {
          date: { [Op.gte]: new Date(new Date().setDate(today.getDate() - 29)).toISOString().split("T")[0] },
        },
        attributes: ["userId"],
      });

      const countMap = {};
      for (const a of activityCounts) {
        countMap[a.userId] = (countMap[a.userId] || 0) + 1;
      }

      const ranking = allUsers
        .map((u) => ({ id: u.id, name: u.name, department: u.department, daysUsed: countMap[u.id] || 0 }))
        .sort((a, b) => b.daysUsed - a.daysUsed);

      return res.status(200).json({ days, ranking });
    } catch (error) {
      logger.error(`Erro ao buscar monitor de atividade: ${error.message}`);
      return res.status(500).json({ message: "Erro ao buscar dados de atividade." });
    }
  },

  resetMonthlyAgentData: async (req, res) => {
    try {
      const adminUser = req.user;
      logger.info(
        `Admin (${adminUser.email}) iniciou o reset mensal dos dados de agentes.`
      );

      const fieldsToReset = {
        // Fiscal
        sentToClientFiscal: false,
        isZeroedFiscal: false,
        fiscalCompletedAt: null,
        // DP
        sentToClientDp: false,
        declarationsCompletedDp: false,
        isZeroedDp: false,
        hasNoDpObligations: false,
        dpCompletedAt: null,
        // Contábil
        sentToClientContabil: false,
        declarationsCompletedContabil: false,
        isZeroedContabil: false,
        hasNoContabilObligations: false,
        contabilCompletedAt: null,
      };

      const [affectedRows] = await Company.update(fieldsToReset, {
        where: { isArchived: false },
      });

      logger.info(
        `Reset mensal concluído. ${affectedRows} empresas foram atualizadas.`
      );

      logger.info("Invalidando todos os caches 'my_companies_*' e dashboards.");
      cacheManager.invalidateByPrefix("my_companies_");
      cacheManager.invalidateByPrefix("dashboard_");

      await cacheManager.reload("companies_all");

      res.status(200).json({
        message: `Ciclo mensal resetado com sucesso. ${affectedRows} empresas foram atualizadas.`,
      });
    } catch (error) {
      logger.error(
        `Erro ao executar o reset mensal dos dados de agentes: ${error.message}`,
        { stack: error.stack }
      );
      res.status(500).json({ message: "Ocorreu um erro ao resetar os dados." });
    }
  },
};

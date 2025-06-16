// D:\ContHub\contask_api\controllers\AdminController.js
const User = require("../models/User");
const Company = require("../models/Company"); // Importa o modelo Company
const transporter = require("../services/emailService");
const { suspendedCompaniesListTemplate } = require("../emails/templates");
const formatDate = require("../helpers/format-date");
const logger = require("../logger/logger");
const { cacheUtils } = require("./CompanyController");
const bcrypt = require("bcrypt");

module.exports = {
  getAllUsers: async (req, res) => {
    try {
      logger.info(`Admin (${req.user.email}) solicitou todos os usuários.`);
      const users = await User.findAll({
        attributes: ["id", "name", "department", "role"],
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
      // Buscar empresas com status "SUSPENSA"
      const suspendedCompanies = await Company.findAll({
        where: { status: "SUSPENSA", isArchived: false },
        attributes: ["name", "statusUpdatedAt"],
      });

      const companiesData = suspendedCompanies.map((company) => ({
        name: company.name,
        statusUpdatedAt: formatDate(company.statusUpdatedAt),
      }));

      // Obter a data atual formatada no padrão brasileiro
      const currentDate = new Date().toLocaleDateString("pt-BR");

      const emailContent = suspendedCompaniesListTemplate({
        companies: companiesData,
        currentDate,
      });

      // Buscar todos os emails dos usuários cadastrados
      const users = await User.findAll({ attributes: ["email"] });
      const userEmails = users
        .map((user) => user.email)
        .filter((email) => email);

      if (userEmails.length === 0) {
        return res
          .status(400)
          .json({ message: "Nenhum usuário encontrado para envio." });
      }

      await transporter.sendMail({
        from: '"Contask" <naoresponda@contelb.com.br>',
        to: userEmails.join(","),
        subject: "Lista de Empresas Suspensas - " + currentDate,
        html: emailContent,
      });

      logger.info(
        `Email manual de empresas suspensas enviado para ${userEmails.length} usuários.`
      );
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

      // Opcional: Restringir o arquivamento manual apenas para status 'BAIXADA' ou 'DISTRATO'
      // if (!['BAIXADA', 'DISTRATO'].includes(company.status)) {
      //   logger.warn(`Arquivamento manual falhou: Status da empresa (ID: <span class="math-inline">\{companyId\}\) é '</span>{company.status}', não BAIXADA ou DISTRATO.`);
      //   return res.status(400).json({ message: "A empresa precisa estar com status BAIXADA ou DISTRATO para ser arquivada manualmente desta forma." });
      // }

      company.isArchived = true;
      await company.save();

      logger.info(
        `Empresa ${company.name} (ID: <span class="math-inline">\{companyId\}\) arquivada manualmente por Admin \(</span>{req.user.email}).`
      );

      // INVALIDAR E RECARREGAR CACHES RELEVANTES
      logger.info(
        `Invalidando caches após arquivamento manual da empresa ID: ${companyId} por Admin (${req.user.email})`
      );
      const globalCacheKeys = [
        "companies_all",
        "recent_companies",
        "recent_active_companies",
        "recent_status_changes",
      ];
      cacheUtils.invalidateCache(globalCacheKeys);
      logger.info(`Caches globais invalidados: ${globalCacheKeys.join(", ")}`);

      // Invalida todos os caches de "my_companies_*"
      cacheUtils.invalidateCachesByPrefix("my_companies_");

      // Recarrega caches globais
      await cacheUtils.reloadAllCompanies();
      await cacheUtils.reloadRecentCompanies();
      await cacheUtils.reloadRecentActiveCompanies();
      await cacheUtils.reloadRecentStatusChanges();

      // Recarrega o cache "my_companies" do admin que realizou a ação, se ele tiver um ID de usuário
      if (req.user && req.user.id) {
        await cacheUtils.reloadMyCompanies(req.user.id);
        logger.info(
          `Cache 'my_companies_${req.user.id}' recarregado para o admin.`
        );
      }
      // Os caches "my_companies_USERID" de outros usuários serão recarregados sob demanda (quando eles acessarem a página),
      // pois seus caches específicos para essa chave foram deletados.

      logger.info(
        `Caches principais recarregados e caches 'my_companies_*' invalidados após arquivamento manual da empresa ID: ${companyId}`
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
    const adminUser = req.user; // Usuário admin que está realizando a ação

    if (!newPassword || newPassword.trim() === "") {
      logger.warn(
        `Admin (${adminUser.email}) tentou alterar senha do usuário ID ${userId} sem fornecer uma nova senha.`
      );
      return res.status(400).json({ message: "A nova senha é obrigatória." });
    }

    // Opcional: Adicionar validação de complexidade da senha aqui, se desejado.
    // Ex: if (newPassword.length < 8) return res.status(400).json({ message: "Senha muito curta."})

    try {
      const userToChange = await User.findByPk(userId);

      if (!userToChange) {
        logger.warn(
          `Admin (${adminUser.email}) falhou ao tentar alterar senha: Usuário não encontrado (ID: ${userId})`
        );
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      // Gerar hash da nova senha
      const bcrypt = require("bcrypt"); // Certifique-se que bcrypt está importado no topo do arquivo se já não estiver
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(newPassword, salt);

      userToChange.password = passwordHash;
      await userToChange.save();

      logger.info(
        `Senha do usuário ${userToChange.email} (ID: <span class="math-inline">\{userId\}\) alterada com sucesso por Admin \(</span>{adminUser.email}).`
      );

      // Enviar email para o usuário com a nova senha
      try {
        const {
          adminChangedPasswordEmailTemplate,
        } = require("../emails/templates"); // Certifique-se que está importado no topo do arquivo
        const emailContent = adminChangedPasswordEmailTemplate({
          userName: userToChange.name,
          newPassword: newPassword, // Enviando a senha em texto plano como solicitado
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
        // Não retornar erro para o admin aqui, pois a senha JÁ FOI alterada.
        // Apenas logar o erro do email.
      }

      res
        .status(200)
        .json({ message: "Senha do usuário atualizada com sucesso." });
    } catch (error) {
      logger.error(
        `Erro ao alterar senha do usuário (ID: <span class="math-inline">\{userId\}\) por Admin \(</span>{adminUser.email}): ${error.message}`,
        { stack: error.stack }
      );
      res.status(500).json({ message: "Erro ao atualizar senha do usuário." });
    }
  },
};

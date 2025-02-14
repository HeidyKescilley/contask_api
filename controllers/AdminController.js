// D:\ContHub\contask_api\controllers\AdminController.js
const User = require("../models/User");
const Company = require("../models/Company"); // Importa o modelo Company
const transporter = require("../services/emailService");
const { suspendedCompaniesListTemplate } = require("../emails/templates");
const formatDate = require("../helpers/format-date");
const logger = require("../logger/logger");

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
        where: { status: "SUSPENSA" },
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
        return res.status(400).json({ message: "Nenhum usuário encontrado para envio." });
      }

      await transporter.sendMail({
        from: '"Contask" <naoresponda@contelb.com.br>',
        to: userEmails.join(","),
        subject: "Lista de Empresas Suspensas - " + currentDate,
        html: emailContent,
      });

      logger.info(`Email manual de empresas suspensas enviado para ${userEmails.length} usuários.`);
      return res.status(200).json({ message: "Email enviado com sucesso." });
    } catch (error) {
      logger.error(`Erro ao enviar email manual de empresas suspensas: ${error.message}`);
      return res.status(500).json({ message: "Erro ao enviar email." });
    }
  },
};

// /controllers/AdminController.js
const User = require("../models/User");
const logger = require("../logger/logger"); // Importa o logger do Winston

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
};

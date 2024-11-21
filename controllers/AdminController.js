// /controllers/AdminController.js
const User = require("../models/User");

module.exports = {
  getAllUsers: async (req, res) => {
    try {
      const users = await User.findAll({
        attributes: ["id", "name", "department", "role"],
      });
      res.status(200).json({ users });
    } catch (error) {
      res.status(500).json({ message: "Erro ao buscar usuários." });
    }
  },

  changeUserRole: async (req, res) => {
    const userId = req.params.id;
    const { role } = req.body;

    if (!["user", "admin", "not-validated"].includes(role)) {
      return res.status(400).json({ message: "Nível de usuário inválido." });
    }

    try {
      const user = await User.findByPk(userId);

      if (!user) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      user.role = role;
      await user.save();

      res
        .status(200)
        .json({ message: "Nível de usuário atualizado com sucesso." });
    } catch (error) {
      res.status(500).json({ message: "Erro ao atualizar nível do usuário." });
    }
  },

  deleteUser: async (req, res) => {
    const userId = req.params.id;

    try {
      const user = await User.findByPk(userId);

      if (!user) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      await user.destroy();

      res.status(200).json({ message: "Usuário deletado com sucesso." });
    } catch (error) {
      res.status(500).json({ message: "Erro ao deletar usuário." });
    }
  },
};

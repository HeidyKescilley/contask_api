// /controllers/GrupoController.js
const Grupo = require("../models/Grupo");
const logger = require("../logger/logger");

module.exports = class GrupoController {
  static async createGrupo(req, res) {
    try {
      const { name } = req.body;

      logger.info(`Usuário (${req.user.email}) está criando o grupo: ${name}`);

      if (!name) {
        logger.warn("Criação de grupo falhou: Nome não fornecido.");
        return res.status(400).json({ message: "O nome é obrigatório." });
      }

      const existingGrupo = await Grupo.findOne({ where: { name } });
      if (existingGrupo) {
        logger.warn(`Criação de grupo falhou: Grupo já existe - ${name}`);
        return res.status(400).json({ message: "Já existe um grupo com este nome." });
      }

      const newGrupo = await Grupo.create({ name });

      logger.info(`Grupo criado com sucesso: ${name} (ID: ${newGrupo.id})`);

      return res.status(201).json({
        message: "Grupo criado com sucesso.",
        grupo: newGrupo,
      });
    } catch (error) {
      logger.error(`Erro ao criar grupo: ${error.message}`);
      return res.status(500).json({ message: "Erro ao criar grupo." });
    }
  }

  static async getAllGrupos(req, res) {
    try {
      logger.info(`Usuário (${req.user.email}) solicitou todos os grupos.`);
      const grupos = await Grupo.findAll({ order: [["name", "ASC"]] });
      return res.status(200).json(grupos);
    } catch (error) {
      logger.error(`Erro ao buscar grupos: ${error.message}`);
      return res.status(500).json({ message: "Erro ao buscar grupos." });
    }
  }
};

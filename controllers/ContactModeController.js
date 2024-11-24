// /controllers/ContactModeController.js
const ContactMode = require("../models/ContactMode");
const logger = require("../logger/logger"); // Importa o logger do Winston

module.exports = class ContactModeController {
  static async createContactMode(req, res) {
    try {
      const { name } = req.body;

      logger.info(
        `Usuário (${req.user.email}) está criando a forma de envio: ${name}`
      );

      if (!name) {
        logger.warn("Criação de forma de envio falhou: Nome não fornecido.");
        return res.status(400).json({ message: "O nome é obrigatório." });
      }

      // Verificar se já existe uma forma com o mesmo nome
      const existingMode = await ContactMode.findOne({ where: { name } });
      if (existingMode) {
        logger.warn(
          `Criação de forma de envio falhou: Forma já existe - ${name}`
        );
        return res
          .status(400)
          .json({ message: "Já existe uma forma de envio com este nome." });
      }

      const newContactMode = await ContactMode.create({ name });

      logger.info(
        `Forma de envio criada com sucesso: ${name} (ID: ${newContactMode.id})`
      );

      return res.status(201).json({
        message: "Forma de envio criada com sucesso.",
        contactMode: newContactMode,
      });
    } catch (error) {
      logger.error(`Erro ao criar forma de envio: ${error.message}`);
      return res.status(500).json({ message: "Erro ao criar forma de envio." });
    }
  }

  static async getAllContactModes(req, res) {
    try {
      logger.info(
        `Usuário (${req.user.email}) solicitou todas as formas de envio.`
      );
      const contactModes = await ContactMode.findAll();
      return res.status(200).json(contactModes);
    } catch (error) {
      logger.error(`Erro ao buscar formas de envio: ${error.message}`);
      return res
        .status(500)
        .json({ message: "Erro ao buscar formas de envio." });
    }
  }
};

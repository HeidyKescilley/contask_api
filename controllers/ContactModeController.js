// /controllers/ContactModeController.js
const ContactMode = require("../models/ContactMode");

module.exports = class ContactModeController {
  static async createContactMode(req, res) {
    try {
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ message: "O nome é obrigatório." });
      }

      // Verificar se já existe uma forma com o mesmo nome
      const existingMode = await ContactMode.findOne({ where: { name } });
      if (existingMode) {
        return res
          .status(400)
          .json({ message: "Já existe uma forma de envio com este nome." });
      }

      const newContactMode = await ContactMode.create({ name });

      return res.status(201).json({
        message: "Forma de envio criada com sucesso.",
        contactMode: newContactMode,
      });
    } catch (error) {
      console.error("Erro ao criar forma de envio:", error);
      return res.status(500).json({ message: "Erro ao criar forma de envio." });
    }
  }

  static async getAllContactModes(req, res) {
    try {
      const contactModes = await ContactMode.findAll();
      return res.status(200).json(contactModes);
    } catch (error) {
      console.error("Erro ao buscar formas de envio:", error);
      return res
        .status(500)
        .json({ message: "Erro ao buscar formas de envio." });
    }
  }
};

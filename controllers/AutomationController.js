// /controllers/AutomationController.js
const Automation = require("../models/Automation");

module.exports = class AutomationController {
  static async createAutomation(req, res) {
    try {
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ message: "O nome é obrigatório." });
      }

      const existingAutomation = await Automation.findOne({ where: { name } });
      if (existingAutomation) {
        return res.status(400).json({ message: "Esta automação já existe." });
      }

      const newAutomation = await Automation.create({ name });

      return res.status(201).json({
        message: "Automação criada com sucesso.",
        automation: newAutomation,
      });
    } catch (error) {
      console.error("Erro ao criar automação:", error);
      return res.status(500).json({ message: "Erro ao criar automação." });
    }
  }

  static async getAllAutomations(req, res) {
    try {
      const automations = await Automation.findAll();
      return res.status(200).json(automations);
    } catch (error) {
      console.error("Erro ao buscar automações:", error);
      return res.status(500).json({ message: "Erro ao buscar automações." });
    }
  }
};

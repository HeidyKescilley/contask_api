// /controllers/OrientationController.js
const CompanyOrientation = require("../models/CompanyOrientation");
const Company = require("../models/Company");
const User = require("../models/User");
const logger = require("../logger/logger");

module.exports = class OrientationController {

  // GET /orientation/company/:companyId
  // Retorna todas as orientações da empresa (cliente filtra por departamento se quiser)
  static async getByCompany(req, res) {
    try {
      const { companyId } = req.params;
      const { department } = req.query;

      const where = { companyId };
      if (department) where.department = department;

      const orientations = await CompanyOrientation.findAll({
        where,
        include: [{ model: User, as: "createdBy", attributes: ["id", "name", "department"] }],
        order: [["createdAt", "DESC"]],
      });

      return res.json(orientations);
    } catch (err) {
      logger.error(`OrientationController.getByCompany: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // POST /orientation/company/:companyId
  // Cria uma nova orientação para a empresa
  static async create(req, res) {
    try {
      const { companyId } = req.params;
      const { department, content, reminderDate } = req.body;

      if (!department) return res.status(400).json({ message: "Departamento é obrigatório." });
      if (!content?.trim()) return res.status(400).json({ message: "Conteúdo é obrigatório." });

      const validDepts = ["Fiscal", "Pessoal", "Contábil"];
      if (!validDepts.includes(department)) {
        return res.status(400).json({ message: `Departamento inválido. Use: ${validDepts.join(", ")}.` });
      }

      const company = await Company.findByPk(companyId);
      if (!company) return res.status(404).json({ message: "Empresa não encontrada." });

      const orientation = await CompanyOrientation.create({
        companyId: Number(companyId),
        department,
        content: content.trim(),
        reminderDate: reminderDate || null,
        createdById: req.user?.id || null,
      });

      // Reload com include para retornar dados do criador
      const created = await CompanyOrientation.findByPk(orientation.id, {
        include: [{ model: User, as: "createdBy", attributes: ["id", "name", "department"] }],
      });

      logger.info(`Orientação criada para empresa ${company.name} (dept: ${department}) por ${req.user?.name}`);
      return res.status(201).json(created);
    } catch (err) {
      logger.error(`OrientationController.create: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // PATCH /orientation/:id
  // Atualiza conteúdo e/ou data de lembrete (apenas criador ou admin)
  static async update(req, res) {
    try {
      const orientation = await CompanyOrientation.findByPk(req.params.id);
      if (!orientation) return res.status(404).json({ message: "Orientação não encontrada." });

      const isCreator = orientation.createdById === req.user?.id;
      const isAdmin = req.user?.role === "admin";
      if (!isCreator && !isAdmin) {
        return res.status(403).json({ message: "Sem permissão para editar esta orientação." });
      }

      const updates = {};
      if (req.body.content !== undefined) updates.content = req.body.content.trim();
      if (req.body.reminderDate !== undefined) updates.reminderDate = req.body.reminderDate || null;

      await orientation.update(updates);

      const updated = await CompanyOrientation.findByPk(orientation.id, {
        include: [{ model: User, as: "createdBy", attributes: ["id", "name", "department"] }],
      });

      return res.json(updated);
    } catch (err) {
      logger.error(`OrientationController.update: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // DELETE /orientation/:id
  // Remove uma orientação (apenas criador ou admin)
  static async remove(req, res) {
    try {
      const orientation = await CompanyOrientation.findByPk(req.params.id);
      if (!orientation) return res.status(404).json({ message: "Orientação não encontrada." });

      const isCreator = orientation.createdById === req.user?.id;
      const isAdmin = req.user?.role === "admin";
      if (!isCreator && !isAdmin) {
        return res.status(403).json({ message: "Sem permissão para excluir esta orientação." });
      }

      await orientation.destroy();
      logger.info(`Orientação ${orientation.id} excluída por ${req.user?.name}`);
      return res.json({ message: "Orientação excluída com sucesso." });
    } catch (err) {
      logger.error(`OrientationController.remove: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }
};

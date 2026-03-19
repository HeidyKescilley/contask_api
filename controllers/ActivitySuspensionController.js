// /controllers/ActivitySuspensionController.js
const { Op } = require("sequelize");
const ActivitySuspension = require("../models/ActivitySuspension");
const Company = require("../models/Company");
const User = require("../models/User");
const logger = require("../logger/logger");
const { sendToAllUsers } = require("../utils/emailSender");
const {
  activitySuspensionNotificationTemplate,
  activitySuspensionReminderTemplate,
  activitySuspensionExtensionTemplate,
} = require("../emails/templates");

// Helper: format YYYY-MM-DD → DD/MM/YYYY
function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

// Helper: get today as YYYY-MM-DD
function todayString() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = class ActivitySuspensionController {
  // POST /activity-suspension
  static async create(req, res) {
    try {
      const { companyId, startDate, endDate, reason } = req.body;

      if (!companyId || !startDate || !endDate) {
        return res.status(400).json({
          message: "Campos obrigatórios: companyId, startDate, endDate.",
        });
      }

      if (endDate <= startDate) {
        return res.status(400).json({
          message: "A data de fim deve ser posterior à data de início.",
        });
      }

      const company = await Company.findByPk(companyId);
      if (!company) {
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      // Check for existing active suspension
      const existing = await ActivitySuspension.findOne({
        where: { companyId, isActive: true },
      });
      if (existing) {
        return res.status(409).json({
          message: "Esta empresa já possui uma paralisação ativa.",
        });
      }

      const suspension = await ActivitySuspension.create({
        companyId,
        startDate,
        endDate,
        reason: reason || null,
        isActive: true,
        createdById: req.user.id,
      });

      // Send notification email
      try {
        const createdByUser = await User.findByPk(req.user.id, {
          attributes: ["name"],
        });
        const htmlContent = activitySuspensionNotificationTemplate({
          companyName: company.name,
          cnpj: company.cnpj,
          startDate: fmtDate(startDate),
          endDate: fmtDate(endDate),
          reason: reason || null,
          createdBy: createdByUser ? createdByUser.name : "Sistema",
        });
        const subject = `⚠️ Atividade Suspensa — ${company.name}`;
        await sendToAllUsers(subject, htmlContent);
      } catch (emailErr) {
        logger.warn(
          `ActivitySuspensionController.create: falha ao enviar email: ${emailErr.message}`
        );
      }

      logger.info(
        `Paralisação criada para empresa ${company.name} por ${req.user?.name}`
      );
      return res.status(201).json(suspension);
    } catch (err) {
      logger.error(`ActivitySuspensionController.create: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // GET /activity-suspension?filter=active|ended|all
  static async getAll(req, res) {
    try {
      const { filter = "active" } = req.query;

      let where = {};
      let order = [];

      if (filter === "active") {
        where.isActive = true;
        order = [["endDate", "ASC"]];
      } else if (filter === "ended") {
        where.isActive = false;
        order = [["endDate", "DESC"]];
      } else {
        // "all"
        order = [["endDate", "DESC"]];
      }

      const suspensions = await ActivitySuspension.findAll({
        where,
        order,
        include: [
          {
            model: Company,
            as: "company",
            attributes: ["id", "name", "cnpj"],
          },
          {
            model: User,
            as: "createdBy",
            attributes: ["id", "name"],
          },
        ],
      });

      return res.json(suspensions);
    } catch (err) {
      logger.error(`ActivitySuspensionController.getAll: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // GET /activity-suspension/company/:companyId
  static async getByCompany(req, res) {
    try {
      const { companyId } = req.params;

      const company = await Company.findByPk(companyId);
      if (!company) {
        return res.status(404).json({ message: "Empresa não encontrada." });
      }

      const suspensions = await ActivitySuspension.findAll({
        where: { companyId },
        order: [["createdAt", "DESC"]],
        include: [
          {
            model: Company,
            as: "company",
            attributes: ["id", "name", "cnpj"],
          },
          {
            model: User,
            as: "createdBy",
            attributes: ["id", "name"],
          },
        ],
      });

      return res.json(suspensions);
    } catch (err) {
      logger.error(
        `ActivitySuspensionController.getByCompany: ${err.message}`
      );
      return res.status(500).json({ message: err.message });
    }
  }

  // PATCH /activity-suspension/:id/extend
  static async extend(req, res) {
    try {
      const { id } = req.params;
      const { newEndDate, reason } = req.body;

      if (!newEndDate) {
        return res
          .status(400)
          .json({ message: "O campo newEndDate é obrigatório." });
      }

      const suspension = await ActivitySuspension.findByPk(id, {
        include: [
          {
            model: Company,
            as: "company",
            attributes: ["id", "name", "cnpj"],
          },
        ],
      });

      if (!suspension) {
        return res
          .status(404)
          .json({ message: "Paralisação não encontrada." });
      }

      if (!suspension.isActive) {
        return res
          .status(400)
          .json({ message: "Esta paralisação já foi encerrada." });
      }

      if (newEndDate <= suspension.endDate) {
        return res.status(400).json({
          message:
            "A nova data de fim deve ser posterior à data de fim atual.",
        });
      }

      const previousEndDate = suspension.endDate;

      // Build extension record
      const extendedByUser = await User.findByPk(req.user.id, {
        attributes: ["id", "name"],
      });

      const exts = suspension.extensions || [];
      exts.push({
        extendedAt: todayString(),
        previousEndDate,
        newEndDate,
        reason: reason || null,
        extendedById: req.user.id,
        extendedByName: extendedByUser ? extendedByUser.name : "Sistema",
      });

      suspension.extensions = exts;
      suspension.endDate = newEndDate;
      suspension.reminderSent = false;
      suspension.changed("extensions", true);
      await suspension.save();

      // Send extension email
      try {
        const htmlContent = activitySuspensionExtensionTemplate({
          companyName: suspension.company.name,
          cnpj: suspension.company.cnpj,
          previousEndDate: fmtDate(previousEndDate),
          newEndDate: fmtDate(newEndDate),
          reason: reason || null,
          extendedBy: extendedByUser ? extendedByUser.name : "Sistema",
        });
        const subject = `🔄 Prazo de Suspensão Prorrogado — ${suspension.company.name}`;
        await sendToAllUsers(subject, htmlContent);
      } catch (emailErr) {
        logger.warn(
          `ActivitySuspensionController.extend: falha ao enviar email: ${emailErr.message}`
        );
      }

      logger.info(
        `Paralisação ${id} prorrogada até ${newEndDate} por ${req.user?.name}`
      );
      return res.json(suspension);
    } catch (err) {
      logger.error(`ActivitySuspensionController.extend: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // PATCH /activity-suspension/:id/end
  static async end(req, res) {
    try {
      const { id } = req.params;

      const suspension = await ActivitySuspension.findByPk(id);
      if (!suspension) {
        return res
          .status(404)
          .json({ message: "Paralisação não encontrada." });
      }

      if (!suspension.isActive) {
        return res
          .status(400)
          .json({ message: "Esta paralisação já foi encerrada." });
      }

      suspension.isActive = false;
      suspension.endedAt = todayString();
      suspension.endedById = req.user.id;
      await suspension.save();

      logger.info(`Paralisação ${id} encerrada por ${req.user?.name}`);
      return res.json(suspension);
    } catch (err) {
      logger.error(`ActivitySuspensionController.end: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // Called by cron — not an HTTP handler
  static async checkReminders() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + 15);
      const targetDateStr = targetDate.toISOString().slice(0, 10);

      const suspensions = await ActivitySuspension.findAll({
        where: {
          isActive: true,
          reminderSent: false,
          endDate: { [Op.lte]: targetDateStr },
        },
        include: [
          {
            model: Company,
            as: "company",
            attributes: ["id", "name", "cnpj"],
          },
        ],
      });

      for (const suspension of suspensions) {
        try {
          const endDateObj = new Date(suspension.endDate + "T00:00:00");
          const daysRemaining = Math.ceil(
            (endDateObj - today) / (1000 * 60 * 60 * 24)
          );

          const htmlContent = activitySuspensionReminderTemplate({
            companyName: suspension.company.name,
            cnpj: suspension.company.cnpj,
            endDate: fmtDate(suspension.endDate),
            daysRemaining,
          });

          const subject = `⏰ Lembrete: Suspensão Expirando em ${daysRemaining} dias — ${suspension.company.name}`;
          await sendToAllUsers(subject, htmlContent);

          suspension.reminderSent = true;
          await suspension.save();

          logger.info(
            `Lembrete de paralisação enviado para ${suspension.company.name} (${daysRemaining} dias restantes)`
          );
        } catch (innerErr) {
          logger.error(
            `checkReminders: erro ao processar suspension ${suspension.id}: ${innerErr.message}`
          );
        }
      }

      logger.info(
        `checkReminders: ${suspensions.length} lembrete(s) processado(s).`
      );
    } catch (err) {
      logger.error(`ActivitySuspensionController.checkReminders: ${err.message}`);
    }
  }
};

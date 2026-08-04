// /controllers/EmailDispatchController.js
const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");
const EmailDispatch = require("../models/EmailDispatch");
const EmailDispatchRun = require("../models/EmailDispatchRun");
const EmailDispatchRunRecipient = require("../models/EmailDispatchRunRecipient");
const Company = require("../models/Company");
const User = require("../models/User");
const { encrypt } = require("../helpers/crypto");
const { computeNextRun } = require("../utils/nextRun");
const { executeDispatch } = require("../services/emailDispatchSender");
const logger = require("../logger/logger");

// Pixel PNG 1x1 transparente, servido pelo endpoint de rastreio de abertura
const TRACKING_PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64"
);

function serializeDispatch(dispatch) {
  const json = dispatch.toJSON();
  delete json.fromPasswordEncrypted;
  return json;
}

function toIntOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? null : n;
}

function removeSignatureFile(filename) {
  if (!filename) return;
  const filePath = path.join(__dirname, "..", "public", "signatures", filename);
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      logger.error(`[EmailDispatch] Falha ao remover imagem de assinatura ${filename}: ${err.message}`);
    }
  });
}

function validateScheduleFields(body) {
  if (body.mode !== "automatic") return null;
  if (!body.scheduleFrequency) return "Periodicidade é obrigatória para automações automáticas.";
  if (body.scheduleHour === null || body.scheduleHour === undefined) {
    return "Horário é obrigatório para automações automáticas.";
  }
  if (body.scheduleFrequency === "weekly" && body.scheduleDayOfWeek === null) {
    return "Dia da semana é obrigatório para periodicidade semanal.";
  }
  if (
    (body.scheduleFrequency === "monthly" || body.scheduleFrequency === "yearly") &&
    body.scheduleDayOfMonth === null
  ) {
    return "Dia do mês é obrigatório para periodicidade mensal/anual.";
  }
  if (body.scheduleFrequency === "yearly" && body.scheduleMonth === null) {
    return "Mês é obrigatório para periodicidade anual.";
  }
  return null;
}

module.exports = class EmailDispatchController {
  static async create(req, res) {
    try {
      const {
        name,
        mode,
        subject,
        bodyFormat,
        bodyContent,
        fromEmail,
        fromPassword,
        fromName,
      } = req.body;

      if (!name || !mode || !subject || !bodyFormat || !bodyContent || !fromEmail || !fromPassword || !fromName) {
        return res.status(400).json({ message: "Preencha todos os campos obrigatórios." });
      }

      const payload = {
        name,
        mode,
        subject,
        bodyFormat,
        bodyContent,
        fromEmail,
        fromName,
        fromPasswordEncrypted: encrypt(fromPassword),
        signatureImagePath: req.file ? req.file.filename : null,
        bodySourceMode: req.body.bodySourceMode === "import" ? "import" : "editor",
        scheduleFrequency: mode === "automatic" ? req.body.scheduleFrequency : null,
        scheduleDayOfWeek: toIntOrNull(req.body.scheduleDayOfWeek),
        scheduleDayOfMonth: toIntOrNull(req.body.scheduleDayOfMonth),
        scheduleMonth: toIntOrNull(req.body.scheduleMonth),
        scheduleHour: toIntOrNull(req.body.scheduleHour),
        scheduleMinute: toIntOrNull(req.body.scheduleMinute) ?? 0,
        createdById: req.user.id,
      };

      const validationError = validateScheduleFields(payload);
      if (validationError) {
        if (req.file) removeSignatureFile(req.file.filename);
        return res.status(400).json({ message: validationError });
      }

      if (payload.mode === "automatic") {
        payload.nextRunAt = computeNextRun(payload, new Date());
      }

      const dispatch = await EmailDispatch.create(payload);

      if (req.body.companyIds) {
        const companyIds = JSON.parse(req.body.companyIds);
        await dispatch.setCompanies(companyIds);
      }

      logger.info(`[EmailDispatch] Automação "${dispatch.name}" (id ${dispatch.id}) criada por ${req.user.email}.`);
      return res.status(201).json(serializeDispatch(dispatch));
    } catch (error) {
      logger.error(`[EmailDispatch] Erro ao criar automação: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async update(req, res) {
    try {
      const dispatch = await EmailDispatch.findByPk(req.params.id);
      if (!dispatch) return res.status(404).json({ message: "Automação não encontrada." });

      const {
        name,
        mode,
        subject,
        bodyFormat,
        bodyContent,
        fromEmail,
        fromPassword,
        fromName,
        isActive,
      } = req.body;

      const payload = {
        name: name ?? dispatch.name,
        mode: mode ?? dispatch.mode,
        subject: subject ?? dispatch.subject,
        bodyFormat: bodyFormat ?? dispatch.bodyFormat,
        bodyContent: bodyContent ?? dispatch.bodyContent,
        bodySourceMode: req.body.bodySourceMode === "import" ? "import" : "editor",
        fromEmail: fromEmail ?? dispatch.fromEmail,
        fromName: fromName ?? dispatch.fromName,
        scheduleFrequency: (mode ?? dispatch.mode) === "automatic"
          ? req.body.scheduleFrequency ?? dispatch.scheduleFrequency
          : null,
        scheduleDayOfWeek: req.body.scheduleDayOfWeek !== undefined ? toIntOrNull(req.body.scheduleDayOfWeek) : dispatch.scheduleDayOfWeek,
        scheduleDayOfMonth: req.body.scheduleDayOfMonth !== undefined ? toIntOrNull(req.body.scheduleDayOfMonth) : dispatch.scheduleDayOfMonth,
        scheduleMonth: req.body.scheduleMonth !== undefined ? toIntOrNull(req.body.scheduleMonth) : dispatch.scheduleMonth,
        scheduleHour: req.body.scheduleHour !== undefined ? toIntOrNull(req.body.scheduleHour) : dispatch.scheduleHour,
        scheduleMinute: req.body.scheduleMinute !== undefined ? toIntOrNull(req.body.scheduleMinute) : dispatch.scheduleMinute,
      };

      if (isActive !== undefined) payload.isActive = isActive === "true" || isActive === true;

      if (fromPassword) payload.fromPasswordEncrypted = encrypt(fromPassword);

      if (req.file) {
        removeSignatureFile(dispatch.signatureImagePath);
        payload.signatureImagePath = req.file.filename;
      }

      const validationError = validateScheduleFields(payload);
      if (validationError) {
        if (req.file) removeSignatureFile(req.file.filename);
        return res.status(400).json({ message: validationError });
      }

      payload.nextRunAt = payload.mode === "automatic" ? computeNextRun(payload, new Date()) : null;

      // Toda edição exige nova aprovação de um administrador antes de voltar a rodar
      // (manual ou automaticamente) — evita que uma alteração (credenciais, empresas,
      // conteúdo, agendamento) passe a valer sem revisão.
      payload.isApproved = false;
      payload.approvedById = null;
      payload.approvedAt = null;

      await dispatch.update(payload);

      if (req.body.companyIds) {
        const companyIds = JSON.parse(req.body.companyIds);
        await dispatch.setCompanies(companyIds);
      }

      logger.info(`[EmailDispatch] Automação "${dispatch.name}" (id ${dispatch.id}) atualizada por ${req.user.email}.`);
      return res.status(200).json(serializeDispatch(dispatch));
    } catch (error) {
      logger.error(`[EmailDispatch] Erro ao atualizar automação ${req.params.id}: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async list(req, res) {
    try {
      const dispatches = await EmailDispatch.findAll({
        include: [
          { model: Company, as: "companies", attributes: ["id"], through: { attributes: [] } },
          { model: User, as: "approvedBy", attributes: ["id", "name"] },
          {
            model: EmailDispatchRun,
            as: "runs",
            attributes: ["id", "status", "startedAt", "finishedAt", "successCount", "failureCount", "totalRecipients"],
            separate: true,
            limit: 1,
            order: [["startedAt", "DESC"]],
          },
        ],
        order: [["createdAt", "DESC"]],
      });
      return res.status(200).json(dispatches.map(serializeDispatch));
    } catch (error) {
      logger.error(`[EmailDispatch] Erro ao listar automações: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async getOne(req, res) {
    try {
      const dispatch = await EmailDispatch.findByPk(req.params.id, {
        include: [
          { model: Company, as: "companies", attributes: ["id"], through: { attributes: [] } },
          { model: User, as: "approvedBy", attributes: ["id", "name"] },
        ],
      });
      if (!dispatch) return res.status(404).json({ message: "Automação não encontrada." });
      return res.status(200).json(serializeDispatch(dispatch));
    } catch (error) {
      logger.error(`[EmailDispatch] Erro ao obter automação ${req.params.id}: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async remove(req, res) {
    try {
      const dispatch = await EmailDispatch.findByPk(req.params.id);
      if (!dispatch) return res.status(404).json({ message: "Automação não encontrada." });

      removeSignatureFile(dispatch.signatureImagePath);
      await dispatch.setCompanies([]);
      await dispatch.destroy();

      logger.info(`[EmailDispatch] Automação ${req.params.id} excluída por ${req.user.email}.`);
      return res.status(200).json({ message: "Automação excluída com sucesso." });
    } catch (error) {
      logger.error(`[EmailDispatch] Erro ao excluir automação ${req.params.id}: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async setCompanies(req, res) {
    try {
      const { companyIds } = req.body;
      if (!Array.isArray(companyIds)) {
        return res.status(400).json({ message: "companyIds deve ser um array." });
      }
      const dispatch = await EmailDispatch.findByPk(req.params.id);
      if (!dispatch) return res.status(404).json({ message: "Automação não encontrada." });

      await dispatch.setCompanies(companyIds);
      return res.status(200).json({ message: "Empresas atualizadas com sucesso.", count: companyIds.length });
    } catch (error) {
      logger.error(`[EmailDispatch] Erro ao atualizar empresas da automação ${req.params.id}: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async approve(req, res) {
    try {
      const dispatch = await EmailDispatch.findByPk(req.params.id);
      if (!dispatch) return res.status(404).json({ message: "Automação não encontrada." });

      await dispatch.update({
        isApproved: true,
        approvedById: req.user.id,
        approvedAt: new Date(),
      });

      logger.info(`[EmailDispatch] Automação "${dispatch.name}" (id ${dispatch.id}) aprovada por ${req.user.email}.`);
      return res.status(200).json(serializeDispatch(dispatch));
    } catch (error) {
      logger.error(`[EmailDispatch] Erro ao aprovar automação ${req.params.id}: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async runNow(req, res) {
    try {
      const dispatch = await EmailDispatch.findByPk(req.params.id);
      if (!dispatch) return res.status(404).json({ message: "Automação não encontrada." });

      if (!dispatch.isApproved) {
        return res.status(403).json({
          message: "Esta automação ainda não foi aprovada por um administrador e não pode ser executada.",
        });
      }

      executeDispatch(dispatch.id, { triggerType: "manual", triggeredById: req.user.id }).catch((err) => {
        logger.error(`[EmailDispatch] Erro ao rodar manualmente a automação ${dispatch.id}: ${err.message}`);
      });

      logger.info(`[EmailDispatch] Execução manual da automação "${dispatch.name}" (id ${dispatch.id}) disparada por ${req.user.email}.`);
      return res.status(202).json({ message: "Execução iniciada. Acompanhe o andamento no histórico desta automação." });
    } catch (error) {
      logger.error(`[EmailDispatch] Erro ao iniciar execução manual ${req.params.id}: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async listRuns(req, res) {
    try {
      const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

      const { rows, count } = await EmailDispatchRun.findAndCountAll({
        where: { dispatchId: req.params.id },
        include: [{ model: User, as: "triggeredBy", attributes: ["id", "name"] }],
        order: [["startedAt", "DESC"]],
        limit,
        offset: (page - 1) * limit,
      });

      return res.status(200).json({ runs: rows, total: count, page, limit });
    } catch (error) {
      logger.error(`[EmailDispatch] Erro ao listar histórico da automação ${req.params.id}: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async getRunDetail(req, res) {
    try {
      const run = await EmailDispatchRun.findByPk(req.params.runId, {
        include: [
          { model: EmailDispatch, as: "dispatch", attributes: ["id", "name", "subject", "fromEmail", "fromName"] },
          { model: User, as: "triggeredBy", attributes: ["id", "name"] },
          {
            model: EmailDispatchRunRecipient,
            as: "recipients",
            include: [{ model: Company, as: "company", attributes: ["id", "name", "num", "email"] }],
            separate: true,
            order: [["id", "ASC"]],
          },
        ],
      });
      if (!run) return res.status(404).json({ message: "Execução não encontrada." });
      return res.status(200).json(run);
    } catch (error) {
      logger.error(`[EmailDispatch] Erro ao obter detalhe da execução ${req.params.runId}: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async trackOpen(req, res) {
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    try {
      const recipient = await EmailDispatchRunRecipient.findOne({
        where: { trackingToken: req.params.token },
      });
      if (recipient) {
        await recipient.update({
          openedAt: recipient.openedAt || new Date(),
          lastOpenedAt: new Date(),
          openCount: recipient.openCount + 1,
          lastOpenIp: req.ip,
          lastOpenUserAgent: req.headers["user-agent"] || null,
        });
      }
    } catch (error) {
      logger.error(`[EmailDispatch] Erro ao registrar abertura (token ${req.params.token}): ${error.message}`);
    }
    return res.status(200).send(TRACKING_PIXEL);
  }
};

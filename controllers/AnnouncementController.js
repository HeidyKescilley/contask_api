const Announcement = require("../models/Announcement");
const AnnouncementSeen = require("../models/AnnouncementSeen");
const User = require("../models/User");
const transporter = require("../services/emailService");
const logger = require("../logger/logger");

const REPLY_RECIPIENT = "heidy.franca@contelb.com.br";

module.exports = {
  // GET /announcements/pending — ativos e ainda não dispensados pelo usuário logado
  getPending: async (req, res) => {
    try {
      const userId = req.user.id;

      const activeAnnouncements = await Announcement.findAll({
        where: { isActive: true },
        order: [["createdAt", "ASC"]],
      });

      if (activeAnnouncements.length === 0) {
        return res.status(200).json({ announcements: [] });
      }

      const seenRecords = await AnnouncementSeen.findAll({
        where: {
          userId,
          announcementId: activeAnnouncements.map((a) => a.id),
        },
        attributes: ["announcementId"],
      });

      const seenIds = new Set(seenRecords.map((r) => r.announcementId));
      const pending = activeAnnouncements.filter((a) => !seenIds.has(a.id));

      return res.status(200).json({ announcements: pending });
    } catch (error) {
      logger.error(`AnnouncementController.getPending: ${error.message}`);
      return res.status(500).json({ message: "Erro ao buscar avisos." });
    }
  },

  // GET /announcements — todos os avisos (admin)
  getAll: async (req, res) => {
    try {
      const announcements = await Announcement.findAll({
        order: [["createdAt", "DESC"]],
        include: [
          {
            model: User,
            as: "creator",
            attributes: ["id", "name"],
          },
        ],
      });
      return res.status(200).json({ announcements });
    } catch (error) {
      logger.error(`AnnouncementController.getAll: ${error.message}`);
      return res.status(500).json({ message: "Erro ao buscar avisos." });
    }
  },

  // POST /announcements — criar aviso (admin)
  create: async (req, res) => {
    try {
      const { title, content, allowReply } = req.body;
      const createdById = req.user.id;

      if (!title || !title.trim()) {
        return res.status(400).json({ message: "O título é obrigatório." });
      }
      if (!content || !content.trim()) {
        return res.status(400).json({ message: "O conteúdo é obrigatório." });
      }

      const announcement = await Announcement.create({
        title: title.trim(),
        content,
        allowReply: allowReply === true || allowReply === "true",
        createdById,
      });

      logger.info(`Aviso criado por ${req.user.email}: "${announcement.title}" (id=${announcement.id})`);
      return res.status(201).json({ message: "Aviso criado com sucesso.", announcement });
    } catch (error) {
      logger.error(`AnnouncementController.create: ${error.message}`);
      return res.status(500).json({ message: "Erro ao criar aviso." });
    }
  },

  // PATCH /announcements/:id — atualizar título, conteúdo e allowReply (admin)
  update: async (req, res) => {
    try {
      const { id } = req.params;
      const { title, content, allowReply } = req.body;

      const announcement = await Announcement.findByPk(id);
      if (!announcement) {
        return res.status(404).json({ message: "Aviso não encontrado." });
      }

      if (title !== undefined) {
        if (!title.trim()) {
          return res.status(400).json({ message: "O título não pode ser vazio." });
        }
        announcement.title = title.trim();
      }
      if (content !== undefined) {
        if (!content.trim()) {
          return res.status(400).json({ message: "O conteúdo não pode ser vazio." });
        }
        announcement.content = content;
      }
      if (allowReply !== undefined) {
        announcement.allowReply = allowReply === true || allowReply === "true";
      }

      await announcement.save();
      logger.info(`Aviso atualizado por ${req.user.email}: id=${id}`);
      return res.status(200).json({ message: "Aviso atualizado com sucesso.", announcement });
    } catch (error) {
      logger.error(`AnnouncementController.update: ${error.message}`);
      return res.status(500).json({ message: "Erro ao atualizar aviso." });
    }
  },

  // PATCH /announcements/:id/toggle — ativar/desativar (admin)
  toggleActive: async (req, res) => {
    try {
      const { id } = req.params;

      const announcement = await Announcement.findByPk(id);
      if (!announcement) {
        return res.status(404).json({ message: "Aviso não encontrado." });
      }

      announcement.isActive = !announcement.isActive;
      await announcement.save();

      const status = announcement.isActive ? "ativado" : "desativado";
      logger.info(`Aviso ${status} por ${req.user.email}: id=${id}`);
      return res.status(200).json({
        message: `Aviso ${status} com sucesso.`,
        announcement,
      });
    } catch (error) {
      logger.error(`AnnouncementController.toggleActive: ${error.message}`);
      return res.status(500).json({ message: "Erro ao alterar status do aviso." });
    }
  },

  // DELETE /announcements/:id — remover aviso (admin)
  remove: async (req, res) => {
    try {
      const { id } = req.params;

      const announcement = await Announcement.findByPk(id);
      if (!announcement) {
        return res.status(404).json({ message: "Aviso não encontrado." });
      }

      const title = announcement.title;
      await announcement.destroy();

      logger.info(`Aviso removido por ${req.user.email}: id=${id}, título="${title}"`);
      return res.status(200).json({ message: "Aviso removido com sucesso." });
    } catch (error) {
      logger.error(`AnnouncementController.remove: ${error.message}`);
      return res.status(500).json({ message: "Erro ao remover aviso." });
    }
  },

  // POST /announcements/:id/seen — dispensar permanentemente (usuário logado)
  markSeen: async (req, res) => {
    try {
      const userId = req.user.id;
      const announcementId = parseInt(req.params.id, 10);

      if (!announcementId) {
        return res.status(400).json({ message: "ID do aviso inválido." });
      }

      await AnnouncementSeen.findOrCreate({
        where: { userId, announcementId },
      });

      return res.status(200).json({ message: "Aviso dispensado permanentemente." });
    } catch (error) {
      logger.error(`AnnouncementController.markSeen: ${error.message}`);
      return res.status(500).json({ message: "Erro ao registrar dispense." });
    }
  },

  // POST /announcements/:id/reply — enviar resposta por email
  reply: async (req, res) => {
    try {
      const { id } = req.params;
      const { replyText } = req.body;
      const userId = req.user.id;

      if (!replyText || !replyText.trim()) {
        return res.status(400).json({ message: "A resposta não pode ser vazia." });
      }

      const announcement = await Announcement.findByPk(id);
      if (!announcement) {
        return res.status(404).json({ message: "Aviso não encontrado." });
      }
      if (!announcement.allowReply) {
        return res.status(403).json({ message: "Este aviso não permite respostas." });
      }

      const user = await User.findByPk(userId, { attributes: ["id", "name", "email", "department"] });

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: REPLY_RECIPIENT,
        subject: `Resposta ao aviso: "${announcement.title}"`,
        html: `
          <h3>Resposta ao aviso: ${announcement.title}</h3>
          <hr>
          <p><strong>Usuário:</strong> ${user.name} (${user.email})</p>
          <p><strong>Departamento:</strong> ${user.department || "—"}</p>
          <p><strong>Mensagem:</strong></p>
          <blockquote style="border-left: 3px solid #ccc; padding-left: 12px; color: #444;">
            ${replyText.replace(/\n/g, "<br>")}
          </blockquote>
          <hr>
          <p style="color: #888; font-size: 12px;">Aviso enviado via Contask</p>
        `,
      };

      await transporter.sendMail(mailOptions);
      logger.info(`Resposta ao aviso id=${id} enviada por ${user.email}`);

      return res.status(200).json({ message: "Resposta enviada com sucesso." });
    } catch (error) {
      logger.error(`AnnouncementController.reply: ${error.message}`);
      return res.status(500).json({ message: "Erro ao enviar resposta." });
    }
  },
};

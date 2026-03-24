const { Op, fn, col, where } = require("sequelize");
const User = require("../models/User");
const BirthdayNotificationSeen = require("../models/BirthdayNotificationSeen");
const logger = require("../logger/logger");

module.exports = {
  getTodayBirthdays: async (req, res) => {
    try {
      const today = new Date();
      const currentDay = today.getDate();
      const currentMonth = today.getMonth() + 1;
      const currentYear = today.getFullYear();
      const adminId = req.user.id;

      // Busca usuários que fazem aniversário hoje, exceto o próprio admin logado
      const birthdayUsers = await User.findAll({
        where: {
          [Op.and]: [
            where(fn("DAY", col("birthday")), currentDay),
            where(fn("MONTH", col("birthday")), currentMonth),
            { id: { [Op.ne]: adminId } },
          ],
        },
        attributes: ["id", "name", "department"],
      });

      if (birthdayUsers.length === 0) {
        return res.status(200).json({ birthdayUsers: [] });
      }

      // Filtra os que o admin já dispensou este ano
      const seenRecords = await BirthdayNotificationSeen.findAll({
        where: {
          adminId,
          birthdayUserId: { [Op.in]: birthdayUsers.map((u) => u.id) },
          year: currentYear,
        },
        attributes: ["birthdayUserId"],
      });

      const seenIds = new Set(seenRecords.map((r) => r.birthdayUserId));
      const pendingUsers = birthdayUsers.filter((u) => !seenIds.has(u.id));

      return res.status(200).json({ birthdayUsers: pendingUsers });
    } catch (error) {
      logger.error(`Erro ao buscar aniversariantes do dia: ${error.message}`);
      return res.status(500).json({ message: "Erro ao buscar aniversariantes." });
    }
  },

  markBirthdaySeen: async (req, res) => {
    try {
      const adminId = req.user.id;
      const { birthdayUserId } = req.body;
      const year = new Date().getFullYear();

      if (!birthdayUserId) {
        return res.status(400).json({ message: "birthdayUserId é obrigatório." });
      }

      await BirthdayNotificationSeen.findOrCreate({
        where: { adminId, birthdayUserId, year },
      });

      return res.status(200).json({ message: "Notificação marcada como vista." });
    } catch (error) {
      logger.error(`Erro ao marcar aniversário como visto: ${error.message}`);
      return res.status(500).json({ message: "Erro ao registrar notificação." });
    }
  },
};

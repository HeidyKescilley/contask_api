// D:\projetos\contask_v2\contask_api\scheduler\birthdayScheduler.js

const cron = require("node-cron");
const { Op, fn, col } = require("sequelize");
const User = require("../models/User");
const transporter = require("../services/emailService");
const { birthdayNotificationTemplate } = require("../emails/templates");
const logger = require("../logger/logger");

const sendBirthdayNotifications = async () => {
  logger.info("Executando tarefa agendada: verificação de aniversários.");
  try {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth() + 1; // getMonth() é 0-11, então adicionamos 1

    // 1. Encontrar todos os usuários que fazem aniversário hoje
    const birthdayUsers = await User.findAll({
      where: {
        [Op.and]: [
          fn('DAY', col('birthday')) = currentDay,
          fn('MONTH', col('birthday')) = currentMonth
        ]
      },
      attributes: ["id", "name", "department", "email", "role"],
    });

    if (birthdayUsers.length === 0) {
      logger.info("Nenhum aniversariante hoje.");
      return;
    }

    // 2. Encontrar todos os administradores
    const admins = await User.findAll({
      where: { role: "admin" },
      attributes: ["id", "email"],
    });

    if (admins.length === 0) {
      logger.warn("Nenhum administrador encontrado para notificar sobre aniversários.");
      return;
    }

    // 3. Para cada aniversariante, enviar e-mail para os admins (exceto o próprio aniversariante)
    for (const birthdayUser of birthdayUsers) {
      logger.info(`Hoje é aniversário de ${birthdayUser.name}. Preparando notificação.`);

      const recipients = admins
        .filter(admin => admin.id !== birthdayUser.id) // Exclui o aniversariante, caso seja admin
        .map(admin => admin.email);

      if (recipients.length > 0) {
        const emailContent = birthdayNotificationTemplate({
          userName: birthdayUser.name,
          department: birthdayUser.department,
        });

        await transporter.sendMail({
          from: '"Contask" <naoresponda@contelb.com.br>',
          to: recipients.join(","),
          subject: `Lembrete: Hoje é aniversário de ${birthdayUser.name}!`,
          html: emailContent,
        });

        logger.info(`E-mail de aniversário para ${birthdayUser.name} enviado para ${recipients.length} administradores.`);
      } else {
        logger.info(`Nenhum administrador para notificar sobre o aniversário de ${birthdayUser.name}.`);
      }
    }

  } catch (error) {
    logger.error(`Erro ao enviar e-mails de aniversário: ${error.message}`, {
      stack: error.stack,
    });
  }
};

// Agendar para rodar todo dia às 08:00 da manhã
cron.schedule(
  "0 8 * * *", // "0 8 * * *" = Às 08:00, todos os dias
  () => {
    sendBirthdayNotifications();
  },
  {
    timezone: "America/Sao_Paulo",
  }
);

logger.info("Scheduler de aniversários configurado para rodar diariamente às 08:00.");
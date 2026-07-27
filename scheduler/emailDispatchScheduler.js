// /scheduler/emailDispatchScheduler.js
const cron = require("node-cron");
const { Op } = require("sequelize");
const EmailDispatch = require("../models/EmailDispatch");
const { executeDispatch } = require("../services/emailDispatchSender");
const logger = require("../logger/logger");

const runDueDispatches = async () => {
  try {
    const now = new Date();
    const dueDispatches = await EmailDispatch.findAll({
      where: {
        mode: "automatic",
        isActive: true,
        nextRunAt: { [Op.lte]: now },
      },
    });

    for (const dispatch of dueDispatches) {
      logger.info(`[EmailDispatch] Cron disparando automação agendada "${dispatch.name}" (id ${dispatch.id}).`);
      try {
        await executeDispatch(dispatch.id, { triggerType: "automatic" });
      } catch (err) {
        logger.error(`[EmailDispatch] Erro ao executar automação agendada ${dispatch.id}: ${err.message}`);
      }
    }
  } catch (error) {
    logger.error(`[EmailDispatch] Erro no scheduler de disparo de e-mails: ${error.message}`);
  }
};

// Verifica a cada minuto se alguma automação automática está no horário (horário de São Paulo)
cron.schedule("* * * * *", runDueDispatches, {
  timezone: "America/Sao_Paulo",
});

module.exports = runDueDispatches;

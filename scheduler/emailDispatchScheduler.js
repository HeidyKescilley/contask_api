// /scheduler/emailDispatchScheduler.js
const cron = require("node-cron");
const { Op } = require("sequelize");
const EmailDispatch = require("../models/EmailDispatch");
const { enqueueDispatch, processQueue, recoverInterruptedSends } = require("../services/emailDispatchSender");
const { computeNextRun } = require("../utils/nextRun");
const logger = require("../logger/logger");

let checking = false;

const runDueDispatches = async () => {
  if (checking) return;
  checking = true;
  try {
    const now = new Date();
    const dueDispatches = await EmailDispatch.findAll({
      where: {
        mode: "automatic",
        isActive: true,
        isApproved: true,
        isArchived: false,
        nextRunAt: { [Op.lte]: now },
      },
    });

    for (const dispatch of dueDispatches) {
      // "Claim" atômico: avança nextRunAt ANTES de enfileirar, com a condição nextRunAt <= now no
      // próprio UPDATE. Só quem conseguir alterar a linha prossegue — garante uma única execução por
      // agendamento mesmo com ticks sobrepostos, reinício ou mais de uma instância da API.
      const nextRunAt = computeNextRun(dispatch, now);
      const [claimed] = await EmailDispatch.update(
        { nextRunAt },
        {
          where: {
            id: dispatch.id,
            mode: "automatic",
            isActive: true,
            isApproved: true,
            isArchived: false,
            nextRunAt: { [Op.lte]: now },
          },
        }
      );
      if (claimed !== 1) continue;

      logger.info(`[EmailDispatch] Cron enfileirando automação agendada "${dispatch.name}" (id ${dispatch.id}). Próxima: ${nextRunAt ? nextRunAt.toISOString() : "nenhuma"}.`);
      try {
        await enqueueDispatch(dispatch.id, { triggerType: "automatic" });
      } catch (err) {
        const level = err.code === "ALREADY_RUNNING" || err.code === "ARCHIVED" ? "warn" : "error";
        logger[level](`[EmailDispatch] Agendamento da automação ${dispatch.id} não enfileirado: ${err.message}`);
      }
    }
  } catch (error) {
    logger.error(`[EmailDispatch] Erro no scheduler de disparo de e-mails: ${error.message}`);
  } finally {
    checking = false;
  }
};

let started = false;

// Deve ser chamado DEPOIS do sequelize.sync (as colunas novas precisam existir).
async function startEmailDispatchScheduler() {
  if (started) return;
  started = true;
  try {
    await recoverInterruptedSends();
  } catch (err) {
    logger.error(`[EmailDispatch] Erro ao recuperar envios interrompidos: ${err.message}`);
  }

  // A cada minuto (horário de São Paulo): enfileira o que venceu e envia o próximo lote da fila
  cron.schedule(
    "* * * * *",
    async () => {
      await runDueDispatches();
      await processQueue();
    },
    { timezone: "America/Sao_Paulo" }
  );
}

module.exports = { startEmailDispatchScheduler, runDueDispatches };

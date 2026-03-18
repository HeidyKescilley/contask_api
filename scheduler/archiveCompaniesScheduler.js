// D:\contask_v2\contask_api\scheduler\archiveCompaniesScheduler.js
const cron = require("node-cron");
const { Op } = require("sequelize");
const Company = require("../models/Company");
const logger = require("../logger/logger");
const { subDays } = require("date-fns");
const cacheManager = require("../utils/CacheManager");

const archiveOldCompanies = async () => {
  logger.info(
    "Executando tarefa agendada: arquivamento de empresas BAIXADA/DISTRATO antigas."
  );
  try {
    const fortyFiveDaysAgo = subDays(new Date(), 45);

    const companiesToArchive = await Company.findAll({
      where: {
        status: {
          [Op.in]: ["BAIXADA", "DISTRATO"],
        },
        isArchived: false,
        statusUpdatedAt: {
          [Op.lt]: fortyFiveDaysAgo,
        },
      },
    });

    if (companiesToArchive.length === 0) {
      logger.info("Nenhuma empresa para arquivar hoje.");
      return;
    }

    for (const company of companiesToArchive) {
      company.isArchived = true;
      await company.save();
      logger.info(`Empresa ${company.name} (ID: ${company.id}) foi arquivada.`);
    }

    logger.info(
      `${companiesToArchive.length} empresa(s) arquivada(s) com sucesso.`
    );

    if (companiesToArchive.length > 0) {
      logger.info(
        "Invalidando caches após arquivamento automático de empresas."
      );

      cacheManager.invalidateByPrefix("my_companies_");
      await cacheManager.reloadAllGlobal();

      logger.info(
        "Caches principais recarregados e todos os caches 'my_companies_*' invalidados após arquivamento automático."
      );
    }
  } catch (error) {
    logger.error(`Erro ao arquivar empresas antigas: ${error.message}`, {
      stack: error.stack,
    });
  }
};

// Agendar para rodar uma vez por dia, por exemplo, à 01:00 da manhã
cron.schedule(
  "0 1 * * *",
  () => {
    archiveOldCompanies();
  },
  {
    timezone: "America/Sao_Paulo",
  }
);

logger.info(
  "Scheduler de arquivamento de empresas configurado para rodar diariamente à 01:00."
);

module.exports = archiveOldCompanies;

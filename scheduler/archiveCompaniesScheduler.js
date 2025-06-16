// D:\contask_v2\contask_api\scheduler\archiveCompaniesScheduler.js
const cron = require("node-cron");
const { Op } = require("sequelize");
const Company = require("../models/Company");
const logger = require("../logger/logger");
const { subDays } = require("date-fns"); // Para cálculo de datas
const { cacheUtils } = require("../controllers/CompanyController");

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
          [Op.lt]: fortyFiveDaysAgo, // statusUpdatedAt é MENOR QUE (mais antigo que) 45 dias atrás
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

    // INVALIDAR E RECARREGAR CACHES RELEVANTES
    if (companiesToArchive.length > 0) {
      logger.info(
        "Invalidando caches após arquivamento automático de empresas."
      );
      const globalCacheKeys = [
        "companies_all",
        "recent_companies",
        "recent_active_companies",
        "recent_status_changes",
      ];
      cacheUtils.invalidateCache(globalCacheKeys);
      logger.info(`Caches globais invalidados: ${globalCacheKeys.join(", ")}`);

      // Invalida todos os caches de "my_companies_*"
      // Isso garante que qualquer usuário que acesse "Minhas Empresas" buscará dados frescos.
      cacheUtils.invalidateCachesByPrefix("my_companies_");

      // Recarrega caches globais
      await cacheUtils.reloadAllCompanies();
      await cacheUtils.reloadRecentCompanies();
      await cacheUtils.reloadRecentActiveCompanies();
      await cacheUtils.reloadRecentStatusChanges();
      // Os caches "my_companies_USERID" individuais serão recarregados sob demanda pelos respectivos usuários.

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
  "0 1 * * *", // "0 1 * * *" significa: à 01:00 (1 da manhã) todos os dias
  () => {
    archiveOldCompanies();
  },
  {
    timezone: "America/Sao_Paulo", // Ajuste o timezone conforme necessário
  }
);

logger.info(
  "Scheduler de arquivamento de empresas configurado para rodar diariamente à 01:00."
);

module.exports = archiveOldCompanies; // Exportar a função pode ser útil para chamadas manuais ou testes

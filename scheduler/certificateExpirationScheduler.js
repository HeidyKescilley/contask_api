// /scheduler/certificateExpirationScheduler.js
const cron = require("node-cron");
const Certificate = require("../models/Certificate");
const Company = require("../models/Company");
const { sendToRecipients } = require("../utils/emailSender");
const {
  certificateExpiring15DaysTemplate,
  certificateExpiring1DayTemplate,
} = require("../emails/templates");
const logger = require("../logger/logger");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function diasRestantes(validUntil) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validoAte = new Date(validUntil);
  validoAte.setHours(0, 0, 0, 0);
  return Math.ceil((validoAte.getTime() - hoje.getTime()) / MS_PER_DAY);
}

const checkCertificateReminders = async () => {
  try {
    const certificates = await Certificate.findAll({
      where: {},
      include: [{ model: Company, as: "company", attributes: ["id", "name", "cnpj", "email"] }],
    });

    let sent15 = 0;
    let sent1 = 0;

    for (const certificate of certificates) {
      if (!certificate.company || !certificate.company.email) continue;

      try {
        const dias = diasRestantes(certificate.validUntil);
        const { company } = certificate;

        if (dias <= 15 && !certificate.reminder15Sent) {
          const html = certificateExpiring15DaysTemplate({
            companyName: company.name,
            cnpj: company.cnpj,
            validUntil: new Date(certificate.validUntil).toLocaleDateString("pt-BR"),
            daysRemaining: dias,
          });
          await sendToRecipients(
            company.email,
            `⚠️ Certificado Digital vencendo em ${dias} dia(s) — ${company.name}`,
            html
          );
          certificate.reminder15Sent = true;
          await certificate.save();
          sent15++;
          logger.info(
            `Lembrete de certificado (15 dias) enviado para ${company.name} (${dias} dia(s) restante(s)).`
          );
        }

        if (dias <= 1 && !certificate.reminder1Sent) {
          const html = certificateExpiring1DayTemplate({
            companyName: company.name,
            cnpj: company.cnpj,
            validUntil: new Date(certificate.validUntil).toLocaleDateString("pt-BR"),
            daysRemaining: dias,
          });
          await sendToRecipients(
            company.email,
            `🚨 Certificado Digital vence amanhã — ${company.name}`,
            html
          );
          certificate.reminder1Sent = true;
          await certificate.save();
          sent1++;
          logger.info(`Lembrete de certificado (1 dia) enviado para ${company.name}.`);
        }
      } catch (innerErr) {
        logger.error(
          `checkCertificateReminders: erro ao processar certificado ${certificate.id}: ${innerErr.message}`
        );
      }
    }

    logger.info(
      `checkCertificateReminders: ${sent15} lembrete(s) de 15 dias e ${sent1} lembrete(s) de 1 dia enviados.`
    );
  } catch (error) {
    logger.error(`checkCertificateReminders: ${error.message}`);
  }
};

// Diariamente às 8h30 (horário de São Paulo) — logo após o cron de paralisações.
cron.schedule(
  "30 8 * * *",
  () => {
    logger.info("Executando tarefa agendada: verificação de vencimento de certificados digitais.");
    checkCertificateReminders();
  },
  {
    timezone: "America/Sao_Paulo",
  }
);

module.exports = checkCertificateReminders;

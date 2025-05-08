// D:\ContHub\contask_api\scheduler\suspendedCompaniesEmailScheduler.js
const cron = require("node-cron");
const Company = require("../models/Company");
const User = require("../models/User");
const transporter = require("../services/emailService");
const { suspendedCompaniesListTemplate } = require("../emails/templates");
const formatDate = require("../helpers/format-date");
const logger = require("../logger/logger");

const sendSuspendedCompaniesEmail = async () => {
  try {
    // Buscar empresas com status "SUSPENSA"
    const suspendedCompanies = await Company.findAll({
      where: { status: "SUSPENSA",
        isArchived: false },
      attributes: ["name", "statusUpdatedAt"],
    });

    // Formata a data de suspensão para cada empresa
    const companiesData = suspendedCompanies.map((company) => ({
      name: company.name,
      statusUpdatedAt: formatDate(company.statusUpdatedAt),
    }));

    // Obter a data atual formatada no padrão brasileiro
    const currentDate = new Date().toLocaleDateString("pt-BR");

    // Compilar o conteúdo do email usando o template, passando currentDate
    const emailContent = suspendedCompaniesListTemplate({
      companies: companiesData,
      currentDate,
    });

    // Buscar todos os emails dos usuários cadastrados
    const users = await User.findAll({ attributes: ["email"] });
    const userEmails = users
      .map((user) => user.email)
      .filter((email) => email);

    if (userEmails.length === 0) {
      logger.warn("Nenhum usuário encontrado para envio do email de empresas suspensas.");
      return;
    }

    await transporter.sendMail({
      from: '"Contask" <naoresponda@contelb.com.br>',
      to: userEmails.join(","),
      subject: "Lista de Empresas Suspensas - " + currentDate,
      html: emailContent,
    });

    logger.info(`Email de empresas suspensas enviado para ${userEmails.length} usuários.`);
  } catch (error) {
    logger.error(`Erro ao enviar email de empresas suspensas: ${error.message}`);
  }
};

// Agendar para toda segunda-feira às 00:01 (horário de São Paulo)
cron.schedule(
  "1 0 * * 1",
  () => {
    logger.info("Executando tarefa agendada: envio de email com empresas suspensas.");
    sendSuspendedCompaniesEmail();
  },
  {
    timezone: "America/Sao_Paulo",
  }
);



module.exports = sendSuspendedCompaniesEmail;

const User = require("../models/User");
const transporter = require("../services/emailService");
const logger = require("../logger/logger");

const FROM_ADDRESS = '"Contask" <naoresponda@contelb.com.br>';

async function sendToAllUsers(subject, htmlContent) {
  const users = await User.findAll({ attributes: ["email"] });
  const userEmails = users.map((u) => u.email).filter((e) => e);
  if (userEmails.length === 0) {
    logger.warn("Nenhum email de usuário encontrado para envio.");
    return 0;
  }
  await transporter.sendMail({
    from: FROM_ADDRESS,
    to: userEmails.join(","),
    subject,
    html: htmlContent,
  });
  logger.info(`Email enviado para ${userEmails.length} usuários: "${subject}"`);
  return userEmails.length;
}

async function sendToRecipients(recipients, subject, htmlContent) {
  const emails = (
    Array.isArray(recipients) ? recipients : recipients.split(",")
  )
    .map((e) => e.trim())
    .filter((e) => e);
  if (emails.length === 0) {
    logger.warn("Nenhum destinatário válido para email.");
    return 0;
  }
  await transporter.sendMail({
    from: FROM_ADDRESS,
    to: emails.join(","),
    subject,
    html: htmlContent,
  });
  return emails.length;
}

module.exports = { sendToAllUsers, sendToRecipients, FROM_ADDRESS };

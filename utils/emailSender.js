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

function normalizeEmails(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : String(value).split(","))
    .map((e) => e.trim())
    .filter((e) => e);
}

// cc é opcional (string "a@x,b@y" ou array). Endereços que já estão em "to" são removidos do cc.
async function sendToRecipients(recipients, subject, htmlContent, cc = null) {
  const emails = normalizeEmails(recipients);
  if (emails.length === 0) {
    logger.warn("Nenhum destinatário válido para email.");
    return 0;
  }
  const toSet = new Set(emails.map((e) => e.toLowerCase()));
  const ccEmails = normalizeEmails(cc).filter((e) => !toSet.has(e.toLowerCase()));

  const mailOptions = {
    from: FROM_ADDRESS,
    to: emails.join(","),
    subject,
    html: htmlContent,
  };
  if (ccEmails.length > 0) mailOptions.cc = ccEmails.join(",");
  await transporter.sendMail(mailOptions);
  return emails.length;
}

module.exports = { sendToAllUsers, sendToRecipients, FROM_ADDRESS };

// /services/emailDispatchSender.js
// Motor de envio das automações de e-mail. Usado tanto pelo endpoint manual
// ("Enviar agora") quanto pelo cron (contask_api/scheduler/emailDispatchScheduler.js).
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const path = require("path");
const EmailDispatch = require("../models/EmailDispatch");
const EmailDispatchRun = require("../models/EmailDispatchRun");
const EmailDispatchRunRecipient = require("../models/EmailDispatchRunRecipient");
const Company = require("../models/Company");
const { decrypt } = require("../helpers/crypto");
const { computeNextRun } = require("../utils/nextRun");
const logger = require("../logger/logger");

function parseRecipientEmails(company) {
  return (company.email || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

function buildSignatureAttachment(dispatch) {
  if (!dispatch.signatureImagePath) return null;
  return {
    filename: path.basename(dispatch.signatureImagePath),
    path: path.join(__dirname, "..", "public", "signatures", dispatch.signatureImagePath),
    cid: "signature-image",
  };
}

function buildHtmlBody(dispatch, hasSignature, trackingToken) {
  let html = dispatch.bodyContent || "";
  if (hasSignature) {
    html += `<br/><img src="cid:signature-image" alt="Assinatura" />`;
  }
  if (trackingToken) {
    html += `<img src="${process.env.PUBLIC_API_URL}/email-dispatch/track/${trackingToken}.png" width="1" height="1" style="display:none" alt="" />`;
  }
  return html;
}

async function executeDispatch(dispatchId, { triggerType, triggeredById = null } = {}) {
  const dispatch = await EmailDispatch.findByPk(dispatchId, {
    include: [{ model: Company, as: "companies" }],
  });
  if (!dispatch) {
    throw new Error(`EmailDispatch ${dispatchId} não encontrada.`);
  }

  const companies = dispatch.companies || [];
  const run = await EmailDispatchRun.create({
    dispatchId: dispatch.id,
    triggerType,
    triggeredById,
    startedAt: new Date(),
    status: "running",
    totalRecipients: companies.length,
  });

  logger.info(
    `[EmailDispatch] Iniciando execução #${run.id} da automação "${dispatch.name}" (${triggerType}) para ${companies.length} empresa(s).`
  );

  let transporter;
  try {
    const password = decrypt(dispatch.fromPasswordEncrypted);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_SERVER,
      port: Number(process.env.SMTP_PORT),
      secure: false,
      auth: { user: dispatch.fromEmail, pass: password },
      tls: { rejectUnauthorized: false },
    });
    await transporter.verify();
  } catch (err) {
    logger.error(`[EmailDispatch] Execução #${run.id} falhou na autenticação SMTP: ${err.message}`);
    await run.update({
      status: "failed",
      errorMessage: `Falha ao autenticar no servidor SMTP: ${err.message}`,
      finishedAt: new Date(),
    });
    return run;
  }

  const signatureAttachment = buildSignatureAttachment(dispatch);
  let successCount = 0;
  let failureCount = 0;

  for (const company of companies) {
    const emails = parseRecipientEmails(company);
    if (emails.length === 0) {
      failureCount++;
      await EmailDispatchRunRecipient.create({
        runId: run.id,
        companyId: company.id,
        emailTo: "",
        status: "failed",
        errorMessage: "Empresa sem e-mail cadastrado.",
      });
      logger.warn(`[EmailDispatch] Execução #${run.id}: empresa ${company.id} (${company.name}) sem e-mail cadastrado.`);
      continue;
    }

    const trackingToken =
      dispatch.bodyFormat === "html" ? crypto.randomBytes(16).toString("hex") : null;

    const mailOptions = {
      from: `"${dispatch.fromName}" <${dispatch.fromEmail}>`,
      to: emails.join(","),
      subject: dispatch.subject,
    };
    if (dispatch.bodyFormat === "html") {
      mailOptions.html = buildHtmlBody(dispatch, !!signatureAttachment, trackingToken);
      if (signatureAttachment) mailOptions.attachments = [signatureAttachment];
    } else {
      mailOptions.text = dispatch.bodyContent || "";
    }

    try {
      const info = await transporter.sendMail(mailOptions);
      successCount++;
      await EmailDispatchRunRecipient.create({
        runId: run.id,
        companyId: company.id,
        emailTo: emails.join(","),
        status: "sent",
        smtpResponse: info.response || info.messageId || null,
        sentAt: new Date(),
        trackingToken,
      });
      logger.info(`[EmailDispatch] Execução #${run.id}: enviado para empresa ${company.id} (${company.name}).`);
    } catch (err) {
      failureCount++;
      await EmailDispatchRunRecipient.create({
        runId: run.id,
        companyId: company.id,
        emailTo: emails.join(","),
        status: "failed",
        errorMessage: err.message,
      });
      logger.error(`[EmailDispatch] Execução #${run.id}: falha ao enviar para empresa ${company.id} (${company.name}): ${err.message}`);
    }
  }

  await run.update({
    finishedAt: new Date(),
    successCount,
    failureCount,
    status: failureCount === 0 ? "completed" : "completed_with_errors",
  });

  if (dispatch.mode === "automatic") {
    const nextRunAt = computeNextRun(dispatch, new Date());
    await dispatch.update({ nextRunAt });
  }

  logger.info(
    `[EmailDispatch] Execução #${run.id} finalizada: ${successCount} sucesso(s), ${failureCount} falha(s).`
  );

  return run;
}

module.exports = { executeDispatch };

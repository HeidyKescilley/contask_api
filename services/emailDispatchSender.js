// /services/emailDispatchSender.js
// Motor de envio das automações de e-mail.
//
// Fluxo: "Enviar agora" e o cron só ENFILEIRAM (enqueueDispatch): criam a execução (run) e um
// registro "pending" por destinatário. Quem realmente envia é a fila global (processQueue),
// chamada a cada minuto pelo scheduler, que respeita:
//   - limite de envios por hora (rolante, somando TODAS as automações);
//   - lotes pequenos, com intervalo mínimo entre lotes e pausa entre e-mails.
// Assim, várias automações no mesmo horário entram na mesma fila em vez de disparar juntas,
// e a fila sobrevive a reinício do servidor (os pendentes continuam no banco).
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const path = require("path");
const { Op } = require("sequelize");
const db = require("../db/conn");
const EmailDispatch = require("../models/EmailDispatch");
const EmailDispatchRun = require("../models/EmailDispatchRun");
const EmailDispatchRunRecipient = require("../models/EmailDispatchRunRecipient");
const Company = require("../models/Company");
const { decrypt } = require("../helpers/crypto");
const { resolveDispatchVariables, substituteVariables } = require("../utils/templateVariables");
const logger = require("../logger/logger");

const HOURLY_LIMIT = Number(process.env.EMAIL_DISPATCH_HOURLY_LIMIT) || 100;
const BATCH_SIZE = Number(process.env.EMAIL_DISPATCH_BATCH_SIZE) || 10;
const BATCH_INTERVAL_MS = (Number(process.env.EMAIL_DISPATCH_BATCH_INTERVAL_MINUTES) || 5) * 60 * 1000;
const DELAY_BETWEEN_EMAILS_MS = (Number(process.env.EMAIL_DISPATCH_DELAY_SECONDS) || 3) * 1000;
const HOUR_MS = 60 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function buildHtmlBody(bodyContent, hasSignature, trackingToken) {
  let extras = "";
  if (hasSignature) {
    extras += `<br/><img src="cid:signature-image" alt="Assinatura" />`;
  }
  if (trackingToken) {
    extras += `<img src="${process.env.PUBLIC_API_URL}/email-dispatch/track/${trackingToken}.png" width="1" height="1" style="display:none" alt="" />`;
  }

  const html = bodyContent || "";
  if (!extras) return html;

  // Se for um documento HTML completo (importado, com <html>/<body>), insere antes
  // de </body> — colar depois de </html> deixaria a assinatura/pixel fora do documento.
  const bodyCloseIndex = html.search(/<\/body\s*>/i);
  if (bodyCloseIndex !== -1) {
    return html.slice(0, bodyCloseIndex) + extras + html.slice(bodyCloseIndex);
  }
  return html + extras;
}

// ── Enfileirar ───────────────────────────────────────────────────────────────

const enqueuing = new Set();

// Cria a execução e os destinatários pendentes. Não envia nada.
// Lança erro com .code = "ALREADY_RUNNING" | "ARCHIVED" quando não pode enfileirar.
async function enqueueDispatch(dispatchId, { triggerType, triggeredById = null } = {}) {
  if (enqueuing.has(dispatchId)) {
    const err = new Error("Esta automação já está sendo enfileirada.");
    err.code = "ALREADY_RUNNING";
    throw err;
  }
  enqueuing.add(dispatchId);
  try {
    const dispatch = await EmailDispatch.findByPk(dispatchId, {
      include: [{ model: Company, as: "companies" }],
    });
    if (!dispatch) throw new Error(`EmailDispatch ${dispatchId} não encontrada.`);
    if (dispatch.isArchived) {
      const err = new Error("Automação arquivada não pode ser executada.");
      err.code = "ARCHIVED";
      throw err;
    }

    const openRun = await EmailDispatchRun.findOne({
      where: { dispatchId: dispatch.id, status: "running" },
      attributes: ["id"],
    });
    if (openRun) {
      const err = new Error(`Já existe uma execução em andamento (#${openRun.id}) para esta automação.`);
      err.code = "ALREADY_RUNNING";
      throw err;
    }

    const companies = dispatch.companies || [];
    const rows = [];
    for (const company of companies) {
      const emails = parseRecipientEmails(company);
      if (emails.length === 0) {
        rows.push({
          companyId: company.id,
          emailTo: "",
          status: "failed",
          errorMessage: "Empresa sem e-mail cadastrado.",
        });
        continue;
      }
      for (const email of emails) {
        rows.push({
          companyId: company.id,
          emailTo: email,
          status: "pending",
          trackingToken: dispatch.bodyFormat === "html" ? crypto.randomBytes(16).toString("hex") : null,
        });
      }
    }

    const immediateFailures = rows.filter((r) => r.status === "failed").length;
    const run = await db.transaction(async (transaction) => {
      const created = await EmailDispatchRun.create(
        {
          dispatchId: dispatch.id,
          triggerType,
          triggeredById,
          startedAt: new Date(),
          status: "running",
          totalRecipients: rows.length,
          failureCount: immediateFailures,
        },
        { transaction }
      );
      if (rows.length > 0) {
        await EmailDispatchRunRecipient.bulkCreate(
          rows.map((r) => ({ ...r, runId: created.id })),
          { transaction }
        );
      }
      return created;
    });

    logger.info(
      `[EmailDispatch] Execução #${run.id} da automação "${dispatch.name}" (${triggerType}) enfileirada: ${rows.length - immediateFailures} envio(s) na fila, ${immediateFailures} falha(s) imediata(s).`
    );

    await finalizeFinishedRuns();
    return run;
  } finally {
    enqueuing.delete(dispatchId);
  }
}

// ── Fila ─────────────────────────────────────────────────────────────────────

// Fecha execuções "running" que não têm mais destinatários pendentes/em envio.
async function finalizeFinishedRuns() {
  const runs = await EmailDispatchRun.findAll({ where: { status: "running" }, attributes: ["id"] });
  for (const { id } of runs) {
    const open = await EmailDispatchRunRecipient.count({
      where: { runId: id, status: { [Op.in]: ["pending", "sending"] } },
    });
    if (open > 0) continue;

    const [successCount, failureCount, cancelledCount] = await Promise.all([
      EmailDispatchRunRecipient.count({ where: { runId: id, status: "sent" } }),
      EmailDispatchRunRecipient.count({ where: { runId: id, status: "failed" } }),
      EmailDispatchRunRecipient.count({ where: { runId: id, status: "cancelled" } }),
    ]);
    const status = cancelledCount > 0 ? "cancelled" : failureCount === 0 ? "completed" : "completed_with_errors";
    // Update condicional: só um worker fecha a execução
    await EmailDispatchRun.update(
      { finishedAt: new Date(), successCount, failureCount, status },
      { where: { id, status: "running" } }
    );
    logger.info(`[EmailDispatch] Execução #${id} finalizada: ${successCount} sucesso(s), ${failureCount} falha(s).`);
  }
}

// Falha de autenticação SMTP: encerra a execução inteira sem tentar de novo.
async function failRunAuth(runId, message) {
  const errorMessage = `Falha ao autenticar no servidor SMTP: ${message}`;
  await EmailDispatchRunRecipient.update(
    { status: "failed", errorMessage },
    { where: { runId, status: { [Op.in]: ["pending", "sending"] } } }
  );
  const [successCount, failureCount] = await Promise.all([
    EmailDispatchRunRecipient.count({ where: { runId, status: "sent" } }),
    EmailDispatchRunRecipient.count({ where: { runId, status: "failed" } }),
  ]);
  await EmailDispatchRun.update(
    { status: "failed", errorMessage, finishedAt: new Date(), successCount, failureCount },
    { where: { id: runId } }
  );
  logger.error(`[EmailDispatch] Execução #${runId} falhou na autenticação SMTP: ${message}`);
}

async function createTransporter(dispatch) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_SERVER,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: { user: dispatch.fromEmail, pass: decrypt(dispatch.fromPasswordEncrypted) },
    tls: { rejectUnauthorized: false },
  });
  await transporter.verify();
  return transporter;
}

async function sendRecipient(transporter, dispatch, recipient, signatureAttachment) {
  const company = recipient.company;
  // Variáveis calculadas com a data de início da execução (consistente mesmo se a fila atravessar a virada do mês)
  const vars = resolveDispatchVariables(company, recipient.run.startedAt);
  const subject = substituteVariables(dispatch.subject, vars);
  const bodyContent = substituteVariables(dispatch.bodyContent, vars);

  // Um e-mail separado por endereço — é a única forma de saber depois QUAL
  // endereço especificamente abriu a mensagem.
  const mailOptions = {
    from: `"${dispatch.fromName}" <${dispatch.fromEmail}>`,
    to: recipient.emailTo,
    subject,
  };
  if (dispatch.ccEmail) {
    const cc = dispatch.ccEmail.split(",").map((e) => e.trim()).filter(Boolean);
    if (cc.length > 0) mailOptions.cc = cc.join(",");
  }
  if (dispatch.bodyFormat === "html") {
    mailOptions.html = buildHtmlBody(bodyContent, !!signatureAttachment, recipient.trackingToken);
    if (signatureAttachment) mailOptions.attachments = [signatureAttachment];
  } else {
    mailOptions.text = bodyContent || "";
  }

  return transporter.sendMail(mailOptions);
}

let processing = false;

// Envia UM lote (respeitando limite/hora e intervalo entre lotes). Seguro contra chamadas
// concorrentes: flag em memória + reserva atômica de cada destinatário no banco.
async function processQueue() {
  if (processing) return;
  processing = true;
  const transporters = new Map();
  try {
    await finalizeFinishedRuns();

    const now = new Date();
    const windowStart = new Date(now.getTime() - HOUR_MS);
    const usedInWindow = await EmailDispatchRunRecipient.count({
      where: { [Op.or]: [{ attemptedAt: { [Op.gte]: windowStart } }, { sentAt: { [Op.gte]: windowStart } }] },
    });
    const budget = HOURLY_LIMIT - usedInWindow;
    if (budget <= 0) return;

    const [lastAttempt, lastSent] = await Promise.all([
      EmailDispatchRunRecipient.max("attemptedAt"),
      EmailDispatchRunRecipient.max("sentAt"),
    ]);
    const last = Math.max(lastAttempt ? new Date(lastAttempt).getTime() : 0, lastSent ? new Date(lastSent).getTime() : 0);
    if (last && now.getTime() - last < BATCH_INTERVAL_MS) return;

    const batch = await EmailDispatchRunRecipient.findAll({
      where: { status: "pending" },
      include: [
        {
          model: EmailDispatchRun,
          as: "run",
          required: true,
          where: { status: "running" },
          include: [
            {
              model: EmailDispatch,
              as: "dispatch",
              required: true,
              where: { isArchived: false, isActive: true },
            },
          ],
        },
        { model: Company, as: "company", required: true },
      ],
      order: [
        [{ model: EmailDispatchRun, as: "run" }, "startedAt", "ASC"],
        ["id", "ASC"],
      ],
      limit: Math.min(BATCH_SIZE, budget),
    });
    if (batch.length === 0) return;

    logger.info(`[EmailDispatch] Fila: enviando lote de ${batch.length} e-mail(s) (usados na última hora: ${usedInWindow}/${HOURLY_LIMIT}).`);

    let sentInBatch = 0;
    for (const recipient of batch) {
      const dispatch = recipient.run.dispatch;

      const [claimed] = await EmailDispatchRunRecipient.update(
        { status: "sending" },
        { where: { id: recipient.id, status: "pending" } }
      );
      if (claimed !== 1) continue; // outro worker já pegou

      if (!transporters.has(dispatch.id)) {
        try {
          transporters.set(dispatch.id, await createTransporter(dispatch));
        } catch (err) {
          transporters.set(dispatch.id, null);
          await failRunAuth(recipient.runId, err.message);
          continue;
        }
      }
      const transporter = transporters.get(dispatch.id);
      if (!transporter) {
        // autenticação já falhou nesta rodada para esta automação
        await EmailDispatchRunRecipient.update(
          { status: "failed", errorMessage: "Falha ao autenticar no servidor SMTP." },
          { where: { id: recipient.id } }
        );
        continue;
      }

      if (sentInBatch > 0) await sleep(DELAY_BETWEEN_EMAILS_MS);
      sentInBatch++;

      const attemptedAt = new Date();
      try {
        const info = await sendRecipient(transporter, dispatch, recipient, buildSignatureAttachment(dispatch));
        await recipient.update({
          status: "sent",
          attemptedAt,
          sentAt: new Date(),
          smtpResponse: info.response || info.messageId || null,
        });
        logger.info(`[EmailDispatch] Execução #${recipient.runId}: enviado para ${recipient.emailTo} (empresa ${recipient.companyId} - ${recipient.company.name}).`);
      } catch (err) {
        await recipient.update({ status: "failed", attemptedAt, errorMessage: err.message });
        logger.error(`[EmailDispatch] Execução #${recipient.runId}: falha ao enviar para ${recipient.emailTo} (empresa ${recipient.companyId}): ${err.message}`);
      }
    }

    await finalizeFinishedRuns();
  } catch (err) {
    logger.error(`[EmailDispatch] Erro ao processar a fila de envios: ${err.message}`);
  } finally {
    for (const t of transporters.values()) {
      if (t) t.close();
    }
    processing = false;
  }
}

// Chamado no boot: destinatários que estavam "sending" quando o processo caiu podem ou não
// ter sido entregues. Não reenviamos automaticamente (evita duplicidade) — ficam como falha
// para conferência no histórico.
async function recoverInterruptedSends() {
  const [count] = await EmailDispatchRunRecipient.update(
    {
      status: "failed",
      errorMessage: "Envio interrompido por reinício do servidor. Não foi reenviado automaticamente para evitar duplicidade; confira no servidor de e-mail.",
    },
    { where: { status: "sending" } }
  );
  if (count > 0) logger.warn(`[EmailDispatch] ${count} envio(s) interrompido(s) por reinício foram marcados como falha para conferência.`);
  await finalizeFinishedRuns();
}

// Cancela o que ainda está na fila de uma automação (usado ao arquivar).
async function cancelPendingForDispatch(dispatchId) {
  const runs = await EmailDispatchRun.findAll({ where: { dispatchId, status: "running" }, attributes: ["id"] });
  for (const { id } of runs) {
    await EmailDispatchRunRecipient.update(
      { status: "cancelled", errorMessage: "Automação arquivada antes do envio." },
      { where: { runId: id, status: "pending" } }
    );
    await finalizeFinishedRuns();
  }
}

module.exports = {
  enqueueDispatch,
  processQueue,
  recoverInterruptedSends,
  cancelPendingForDispatch,
  finalizeFinishedRuns,
};

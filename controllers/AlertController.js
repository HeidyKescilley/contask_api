// /controllers/AlertController.js

const Alert = require("../models/Alert");
const User = require("../models/User");
const Company = require("../models/Company");
const transporter = require("../services/emailService");
const { Op } = require("sequelize");
const getToken = require("../helpers/get-token");
const getUserByToken = require("../helpers/get-user-by-token");
const path = require("path");
const cheerio = require("cheerio");
const logger = require("../logger/logger");

// Corrige encoding de nomes de arquivo enviados pelo browser (latin1 → utf8)
const fixFilename = (name) => {
  try {
    return Buffer.from(name, "latin1").toString("utf8");
  } catch {
    return name;
  }
};

module.exports = class AlertController {
  static async createAlert(req, res) {
    try {
      const { title, content, type } = req.body;
      let { departments, companyIds } = req.body;
      const files = req.files || [];

      logger.info(
        `Usuário (${req.user.email}) está criando um alerta do tipo: ${type} com título: "${title}"`
      );

      // Parse departments e companyIds se vierem como string (FormData)
      if (typeof departments === "string") {
        departments = JSON.parse(departments);
      }
      if (typeof companyIds === "string") {
        companyIds = JSON.parse(companyIds);
      }

      // Validação de campos obrigatórios
      if (!title || !content || !type) {
        logger.warn("Criação de alerta falhou: Campos obrigatórios faltando.");
        return res
          .status(400)
          .json({ message: "Título, conteúdo e tipo são obrigatórios." });
      }

      // Usuário autenticado
      const token = getToken(req);
      const user = await getUserByToken(token);

      // Dados base do alerta
      let alertData = { title, content, type, userId: user.id };

      if (type === "internal") {
        if (!departments || departments.length === 0) {
          logger.warn("Criação de alerta falhou: Departamentos obrigatórios.");
          return res.status(400).json({
            message: "Departamentos são obrigatórios para alertas internos.",
          });
        }
        alertData.departments = departments;
      } else if (type === "external") {
        if (!companyIds || companyIds.length === 0) {
          logger.warn("Criação de alerta falhou: Empresas obrigatórias.");
          return res.status(400).json({
            message: "Empresas são obrigatórias para alertas externos.",
          });
        }
        alertData.companyIds = companyIds;
      } else {
        logger.warn(`Criação de alerta falhou: Tipo inválido - ${type}`);
        return res.status(400).json({ message: "Tipo de alerta inválido." });
      }

      // Monta lista de anexos para nodemailer
      // file.filename = nome seguro no disco (timestamp + ext)
      // file.originalname = nome original do usuário (pode ter caracteres especiais)
      let attachments = [];
      if (files.length > 0) {
        attachments = files.map((file) => ({
          filename: fixFilename(file.originalname), // nome exibido no e-mail
          path: path.join(
            __dirname,
            "..",
            "public",
            "attachments",
            file.filename  // nome real no disco (seguro)
          ),
          cid: file.filename,
        }));
        alertData.attachments = files.map((file) => file.filename);
      }

      // Processa conteúdo para substituir src de imagens por CID (somente se houver anexos)
      let processedContent = content;
      if (files.length > 0) {
        const $ = cheerio.load(content);
        $("img").each(function () {
          const src = $(this).attr("src");
          const file = files.find(
            (f) => fixFilename(f.originalname) === path.basename(src)
          );
          if (file) {
            $(this).attr("src", "cid:" + file.filename);
          }
        });
        processedContent = $("body").html() || content;
      }

      // Salva o alerta no banco (sempre, independente do envio de e-mail)
      alertData.content = processedContent;
      const newAlert = await Alert.create(alertData);
      logger.info(`Alerta criado com sucesso: ${newAlert.id} por ${user.email}`);

      // Envia e-mails em segundo plano (falha não impede a resposta de sucesso)
      const sendEmailsSafely = async () => {
        try {
          if (type === "internal") {
            const users = await User.findAll({
              where: { department: { [Op.in]: departments } },
            });
            const userEmails = users.map((u) => u.email);
            await AlertController.sendEmails(userEmails, title, processedContent, attachments, type);
            logger.info(
              `Emails enviados para ${userEmails.length} usuários nos departamentos: ${departments.join(", ")}`
            );
          } else if (type === "external") {
            const companies = await Company.findAll({
              where: { id: { [Op.in]: companyIds } },
            });
            let companyEmails = [];
            companies.forEach((company) => {
              if (company.email) {
                companyEmails.push(
                  ...company.email.split(",").map((e) => e.trim()).filter(Boolean)
                );
              }
            });
            await AlertController.sendEmails(companyEmails, title, processedContent, attachments, type);
            logger.info(`Emails enviados para ${companyEmails.length} emails das empresas selecionadas`);
          }
        } catch (emailError) {
          logger.error(`Erro ao enviar emails do alerta ${newAlert.id}: ${emailError.message}`);
        }
      };

      // Dispara envio sem aguardar (responde imediatamente ao cliente)
      sendEmailsSafely();

      return res.status(201).json({
        message: "Alerta criado com sucesso. Os e-mails estão sendo enviados.",
        newAlert,
      });
    } catch (error) {
      logger.error(`Erro ao criar alerta: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async sendEmails(recipients, subject, htmlContent, attachments, type) {
    if (!recipients || recipients.length === 0) {
      logger.warn("sendEmails chamado com lista de destinatários vazia.");
      return;
    }

    const chunkSize = 100;
    for (let i = 0; i < recipients.length; i += chunkSize) {
      const chunk = recipients.slice(i, i + chunkSize);
      const mailOptions = {
        from: '"Contask" <naoresponda@contelb.com.br>',
        subject,
        html: htmlContent,
        attachments,
      };

      if (type === "external") {
        mailOptions.to = "naoresponda@contelb.com.br"; // remetente visível no BCC
        mailOptions.bcc = chunk;
      } else {
        mailOptions.to = chunk;
      }

      await transporter.sendMail(mailOptions);
    }
    logger.info(`Emails enviados para ${recipients.length} destinatários.`);
  }
};

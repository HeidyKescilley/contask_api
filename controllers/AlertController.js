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
const logger = require("../logger/logger"); // Importa o logger do Winston

module.exports = class AlertController {
  static async createAlert(req, res) {
    try {
      const { title, content, type } = req.body;
      let { departments, companyIds } = req.body;
      const files = req.files;

      logger.info(
        `Usuário (${req.user.email}) está criando um alerta do tipo: ${type} com título: "${title}"`
      );

      // Parse departments and companyIds if they are strings
      if (typeof departments === "string") {
        departments = JSON.parse(departments);
      }
      if (typeof companyIds === "string") {
        companyIds = JSON.parse(companyIds);
      }

      // Validate required fields
      if (!title || !content || !type) {
        logger.warn("Criação de alerta falhou: Campos obrigatórios faltando.");
        return res
          .status(400)
          .json({ message: "Título, conteúdo e tipo são obrigatórios." });
      }

      // Get the user from the token
      const token = getToken(req);
      const user = await getUserByToken(token);

      // Prepare data to save
      let alertData = {
        title,
        content,
        type,
        userId: user.id,
      };

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

      // Handle attachments
      let attachments = [];
      if (files && files.length > 0) {
        attachments = files.map((file) => ({
          filename: file.originalname,
          path: path.join(
            __dirname,
            "..",
            "public",
            "attachments",
            file.filename
          ),
          cid: file.filename, // Use the filename as CID
        }));
        alertData.attachments = files.map((file) => file.filename);
      }

      // Process content to replace image src with cid
      let processedContent = content;
      const $ = cheerio.load(content);
      $("img").each(function () {
        const src = $(this).attr("src");
        const file = files.find((f) => f.originalname === path.basename(src));
        if (file) {
          $(this).attr("src", "cid:" + file.filename);
        }
      });
      processedContent = $.html();

      // Save the alert in the database
      alertData.content = processedContent;
      const newAlert = await Alert.create(alertData);

      logger.info(
        `Alerta criado com sucesso: ${newAlert.id} por ${user.email}`
      );

      // Send emails
      if (type === "internal") {
        // Send to users in the selected departments
        const users = await User.findAll({
          where: {
            department: {
              [Op.in]: departments,
            },
          },
        });
        const userEmails = users.map((user) => user.email);

        await AlertController.sendEmails(
          userEmails,
          title,
          processedContent,
          attachments,
          type // Passa o tipo para a função sendEmails
        );
        logger.info(
          `Emails enviados para ${
            userEmails.length
          } usuários nas departamentos ${departments.join(", ")}`
        );
      } else if (type === "external") {
        // Send to companies with the selected IDs
        const companies = await Company.findAll({
          where: {
            id: {
              [Op.in]: companyIds,
            },
          },
        });

        // Collect all emails, handling multiple emails per company
        let companyEmails = [];
        companies.forEach((company) => {
          if (company.email) {
            const emails = company.email
              .split(",")
              .map((email) => email.trim());
            companyEmails.push(...emails);
          }
        });

        await AlertController.sendEmails(
          companyEmails,
          title,
          processedContent,
          attachments,
          type // Passa o tipo para a função sendEmails
        );
        logger.info(
          `Emails enviados para ${companyEmails.length} emails das empresas selecionadas`
        );
      }

      return res.status(201).json({
        message: "Alerta criado e emails enviados com sucesso.",
        newAlert,
      });
    } catch (error) {
      logger.error(`Erro ao criar alerta: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async sendEmails(recipients, subject, htmlContent, attachments, type) {
    try {
      // Chunk recipients to avoid exceeding SMTP limits
      const chunkSize = 100;
      for (let i = 0; i < recipients.length; i += chunkSize) {
        const chunk = recipients.slice(i, i + chunkSize);
        let mailOptions = {
          from: '"Contask" <naoresponda@contelb.com.br>',
          subject: subject,
          html: htmlContent,
          attachments: attachments,
        };

        if (type === "external") {
          // Enviar como BCC
          mailOptions.to = ""; // Deixe o campo 'to' vazio ou coloque um endereço padrão
          mailOptions.bcc = chunk;
        } else {
          // Enviar normalmente
          mailOptions.to = chunk;
        }

        await transporter.sendMail(mailOptions);
      }
      logger.info(`Emails enviados para ${recipients.length} destinatários.`);
    } catch (error) {
      logger.error(`Erro ao enviar emails: ${error.message}`);
      throw error;
    }
  }
};

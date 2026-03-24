// /index.js
const express = require("express");
const cors = require("cors");
const morgan = require("morgan"); // Importa Morgan
const logger = require("./logger/logger"); // Importa o logger do Winston
const activityLogger = require("./middlewares/activityLogger"); // Importa o middleware de activity logger
require("./scheduler/suspendedCompaniesEmailScheduler");
require("./scheduler/archiveCompaniesScheduler");
require("./scheduler/birthdayScheduler");

const app = express();

require("dotenv").config();

// Importando sequelize
const sequelize = require("./db/conn");

// Importando modelos para garantir que eles sejam registrados no Sequelize
const User = require("./models/User");
const Company = require("./models/Company");
const AccessoryObligation = require("./models/AccessoryObligation");
const CompanyObligationStatus = require("./models/CompanyObligationStatus");
const CompanyTax = require("./models/CompanyTax");
const CompanyTaxStatus = require("./models/CompanyTaxStatus");
const ActivitySuspension = require("./models/ActivitySuspension");
const BirthdayNotificationSeen = require("./models/BirthdayNotificationSeen");
const UserActivity = require("./models/UserActivity");
const Announcement = require("./models/Announcement");
const AnnouncementSeen = require("./models/AnnouncementSeen");

// Importando associações
require("./models/associations");

// Config JSON response
app.use(express.json());

// Solve CORS
// Solve CORS
app.use(
  cors({
    origin: "*",
  }),
);

/*const allowedOrigins = ["http://localhost:3000", "http://localhost:5173"];
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);*/

// Public folder
app.use(express.static("public"));

// Setup Morgan para usar o stream do Winston
app.use(morgan("combined", { stream: logger.stream }));

// Middleware para logar atividades do usuário
// app.use(activityLogger);

// Routes
const UserRoutes = require("./routes/UserRoutes");
const CompanyRoutes = require("./routes/CompanyRoutes");
const AlertRoutes = require("./routes/AlertRoutes");
const automationRoutes = require("./routes/AutomationRoutes");
const AdminRoutes = require("./routes/AdminRoutes");
const BonusRoutes = require("./routes/BonusRoutes");
const ObligationRoutes = require("./routes/ObligationRoutes");
const TaxRoutes = require("./routes/TaxRoutes");
const ActivitySuspensionRoutes = require("./routes/ActivitySuspensionRoutes");
const BirthdayRoutes = require("./routes/BirthdayRoutes");
const AnnouncementRoutes = require("./routes/AnnouncementRoutes");

app.use("/", UserRoutes);
app.use("/company", CompanyRoutes);
app.use("/alerts", AlertRoutes);
app.use("/automation", automationRoutes);
app.use("/admin", AdminRoutes);
app.use("/bonus", BonusRoutes);
app.use("/obligation", ObligationRoutes);
app.use("/tax", TaxRoutes);
app.use("/activity-suspension", ActivitySuspensionRoutes);
app.use("/", BirthdayRoutes);
app.use("/", AnnouncementRoutes);

const errorHandler = require("./middlewares/errorHandler");
app.use(errorHandler);

const DEFAULT_TAXES = [
  {
    name: "DAS",
    department: "Fiscal",
    applicableRegimes: ["Simples", "MEI"],
    applicableClassificacoes: null,
    applicableUFs: null,
  },
  {
    name: "ICMS",
    department: "Fiscal",
    applicableRegimes: ["Simples", "Presumido", "Real"],
    applicableClassificacoes: ["ICMS", "ICMS/ISS"],
    applicableUFs: null,
  },
  {
    name: "ISS",
    department: "Fiscal",
    applicableRegimes: ["Simples", "Presumido", "Real"],
    applicableClassificacoes: ["ISS", "ICMS/ISS"],
    applicableUFs: null,
  },
  {
    name: "PIS/COFINS",
    department: "Fiscal",
    applicableRegimes: ["Presumido", "Real"],
    applicableClassificacoes: null,
    applicableUFs: null,
  },
  {
    name: "IRPJ/CSLL",
    department: "Fiscal",
    applicableRegimes: ["Presumido", "Real"],
    applicableClassificacoes: null,
    applicableUFs: null,
  },
  {
    name: "IPI",
    department: "Fiscal",
    applicableRegimes: ["Real"],
    applicableClassificacoes: null,
    applicableUFs: null,
  },
  {
    name: "IRRF",
    department: "Fiscal",
    applicableRegimes: ["Presumido", "Real"],
    applicableClassificacoes: null,
    applicableUFs: null,
  },
];

// Remove índices duplicados acumulados pelo alter:true (MySQL limite: 64 por tabela)
async function cleanupDuplicateIndexes() {
  try {
    const [rows] = await sequelize.query(`
      SELECT TABLE_NAME, INDEX_NAME
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND INDEX_NAME != 'PRIMARY'
      GROUP BY TABLE_NAME, INDEX_NAME
    `);

    for (const { TABLE_NAME, INDEX_NAME } of rows) {
      try {
        await sequelize.query(
          `ALTER TABLE \`${TABLE_NAME}\` DROP INDEX \`${INDEX_NAME}\``,
        );
      } catch (_) {
        // Ignora se o índice já não existir
      }
    }
    logger.info(`Índices limpos: ${rows.length} removidos antes do sync.`);
  } catch (err) {
    logger.warn(`cleanupDuplicateIndexes: ${err.message}`);
  }
}

cleanupDuplicateIndexes().then(() =>
  sequelize
    .sync({ alter: true })
    .then(async () => {
      // Seed impostos padrão (findOrCreate — não duplica em restart)
      for (const tax of DEFAULT_TAXES) {
        await CompanyTax.findOrCreate({
          where: { name: tax.name },
          defaults: tax,
        });
      }
      app.listen(process.env.PORT, process.env.HOST, () => {
        logger.info(
          `Servidor rodando em http://${process.env.HOST}:${process.env.PORT}`,
        );
      });

      // Cron: verificar lembretes de paralisações diariamente às 8h
      const cron = require("node-cron");
      const ActivitySuspensionController = require("./controllers/ActivitySuspensionController");
      cron.schedule("0 8 * * *", async () => {
        logger.info("Cron: verificando lembretes de paralisações...");
        await ActivitySuspensionController.checkReminders();
      });
    })
    .catch((err) =>
      logger.error(`Erro ao sincronizar o banco de dados: ${err}`),
    ),
);

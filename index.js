// /index.js
const express = require("express");
const cors = require("cors");
const morgan = require("morgan"); // Importa Morgan
const logger = require("./logger/logger"); // Importa o logger do Winston
const activityLogger = require("./middlewares/activityLogger"); // Importa o middleware de activity logger

const app = express();

require("dotenv").config();

// Importando sequelize
const sequelize = require("./db/conn");

// Importando modelos para garantir que eles sejam registrados no Sequelize
const User = require("./models/User");
const Company = require("./models/Company");
// ... importe outros modelos se necessário

// Importando associações
require("./models/associations");

// Config JSON response
app.use(express.json());

// Solve CORS
const allowedOrigins = ["http://localhost:3000", "http://localhost:5173"];
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
);

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

app.use("/", UserRoutes);
app.use("/company", CompanyRoutes);
app.use("/alerts", AlertRoutes);
app.use("/automation", automationRoutes);
app.use("/admin", AdminRoutes);

const errorHandler = require("./middlewares/errorHandler");
app.use(errorHandler);

sequelize
  .sync({ force: false, alter: false })
  .then(() => {
    app.listen(process.env.PORT, () => {
      logger.info(
        `Servidor rodando em http://${process.env.HOST}:${process.env.PORT}`
      );
    });
  })
  .catch((err) => logger.error(`Erro ao sincronizar o banco de dados: ${err}`));

// /index.js
const express = require("express");
const cors = require("cors");

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

sequelize
  .sync({ force: false, alter: false })
  .then(() => {
    app.listen(process.env.PORT, () => {
      console.log(
        `Server is running on http://${process.env.HOST}:${process.env.PORT}`
      );
    });
  })
  .catch((err) => console.log(err));

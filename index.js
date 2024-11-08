// /index.js
const express = require("express");
const cors = require("cors");

const app = express();

require("dotenv").config();

// Importando sequelize
const sequelize = require("./db/conn");

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

app.use("/", UserRoutes);
app.use("/company", CompanyRoutes);

sequelize
  .sync({ force: false })
  .then(() => {
    app.listen(5000, () => {
      console.log(`Server is running on http://localhost:5000`);
    });
  })
  .catch((err) => console.log(err));

// /model/FiscalHistory.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const FiscalHistory = db.define("FiscalHistory", {
  date: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "Users",
      key: "id",
    },
  },
  companyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "Companies",
      key: "id",
    },
  },
});

module.exports = FiscalHistory;

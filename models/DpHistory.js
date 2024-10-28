// /models/DpHistory.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const DpHistory = db.define("DpHistory", {
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

module.exports = DpHistory;

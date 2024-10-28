// /models/StatusHistory.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const StatusHistory = db.define("StatusHistory", {
  date: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
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

module.exports = StatusHistory;

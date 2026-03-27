// /models/CompanyPeriodNote.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const CompanyPeriodNote = db.define("CompanyPeriodNote", {
  companyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "Companies", key: "id" },
  },
  period: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: "YYYY-MM",
  },
  note: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  updatedById: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: "Users", key: "id" },
  },
}, {
  indexes: [
    { unique: true, fields: ["companyId", "period"] },
    { fields: ["companyId"] },
    { fields: ["period"] },
  ],
});

module.exports = CompanyPeriodNote;

// /models/CompanyOrientation.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const CompanyOrientation = db.define("CompanyOrientation", {
  companyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  department: {
    type: DataTypes.ENUM("Fiscal", "Pessoal", "Contábil", "Geral"),
    allowNull: false,
    comment: "Departamento a que se refere a orientação",
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: "Texto da orientação ou lembrete",
  },
  reminderDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    comment: "Data de lembrete opcional (ex: prazo para verificar crédito)",
  },
  createdById: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Usuário que criou a orientação",
  },
}, {
  indexes: [
    { fields: ["companyId", "department"] },
    { fields: ["reminderDate"] },
  ],
});

module.exports = CompanyOrientation;

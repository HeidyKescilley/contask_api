// /models/CompanyPhone.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

// Telefone de uma empresa com o nome do contato associado (uma empresa pode ter vários).
const CompanyPhone = db.define(
  "CompanyPhone",
  {
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "Companies", key: "id" },
    },
    number: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Número como digitado (com máscara, se houver)",
    },
    numberDigits: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Somente dígitos — usado para busca e para evitar duplicados",
    },
    contactName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    indexes: [
      { unique: true, fields: ["companyId", "numberDigits"] },
      { fields: ["numberDigits"] },
    ],
  }
);

module.exports = CompanyPhone;

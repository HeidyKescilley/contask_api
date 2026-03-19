// /models/CompanyTaxStatus.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const CompanyTaxStatus = db.define("CompanyTaxStatus", {
  companyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "Companies", key: "id" },
  },
  taxId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "CompanyTaxes", key: "id" },
  },
  period: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: "YYYY-MM (sempre mensal)",
  },
  status: {
    type: DataTypes.ENUM("pending", "completed", "disabled"),
    allowNull: false,
    defaultValue: "pending",
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  completedById: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: "Users", key: "id" },
  },
  isManuallyAssigned: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: "true = adicionado manualmente para esta empresa",
  },
  isManuallyExcluded: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: "true = excluído manualmente para esta empresa (exceção)",
  },
}, {
  indexes: [
    { fields: ["companyId", "period"] },
    { fields: ["taxId", "period"] },
    { fields: ["companyId", "isManuallyExcluded"] },
    { fields: ["companyId", "isManuallyAssigned"] },
    { unique: true, fields: ["companyId", "taxId", "period"] },
  ],
});

module.exports = CompanyTaxStatus;

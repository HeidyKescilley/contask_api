// /models/CompanyObligationStatus.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const CompanyObligationStatus = db.define("CompanyObligationStatus", {
  companyId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "Companies", key: "id" },
  },
  obligationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "AccessoryObligations", key: "id" },
  },
  period: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: "YYYY-MM (mensal), YYYY-MM-1 ou YYYY-MM-2 (quinzenal), YYYY (anual)",
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
    comment: "true = adicionado manualmente para esta empresa (fora dos filtros automáticos)",
  },
  isManuallyExcluded: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: "true = excluída manualmente para esta empresa (exceção à regra dos filtros)",
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
});

// Índice único: uma empresa não pode ter dois status para a mesma obrigação no mesmo período
CompanyObligationStatus.addHook("beforeCreate", async (record) => {
  // Validação feita via findOrCreate no controller — índice único no DB
});

module.exports = CompanyObligationStatus;

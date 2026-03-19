// /models/AccessoryObligation.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const AccessoryObligation = db.define("AccessoryObligation", {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  department: {
    type: DataTypes.ENUM("Fiscal", "Pessoal", "Contábil"),
    allowNull: false,
  },
  deadline: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: "Dia do mês (1-31) ou número de dias úteis, dependendo de deadlineType",
  },
  deadlineType: {
    type: DataTypes.ENUM("calendar_day", "business_days", "last_business_day"),
    allowNull: false,
    defaultValue: "calendar_day",
  },
  periodicity: {
    type: DataTypes.ENUM("monthly", "biweekly", "annual"),
    allowNull: false,
    defaultValue: "monthly",
  },
  deadlineMonth: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 1, max: 12 },
    comment: "Mês de vencimento (1-12), usado apenas quando periodicity=annual",
  },
  sendWhenZeroed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: "Se false, obrigação é desabilitada para empresas zeradas",
  },
  applicableRegimes: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "Array de regimes (ex: [\"Simples\",\"Presumido\"]) ou null para todos",
  },
  applicableClassificacoes: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "Array de classificações ou null para todas",
  },
  applicableUFs: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "Array de UFs (ex: [\"SP\",\"RJ\"]) ou null para todas",
  },
});

module.exports = AccessoryObligation;

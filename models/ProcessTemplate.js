// /models/ProcessTemplate.js — padrão de processo (ex.: "Abertura de Empresa")
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const ProcessTemplate = db.define("ProcessTemplate", {
  name: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  department: { type: DataTypes.STRING, allowNull: false },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  seedKey: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: "Identifica padrões criados pelo sistema (evita recriar em restart)",
  },
  createdById: { type: DataTypes.INTEGER, allowNull: true },
});

module.exports = ProcessTemplate;

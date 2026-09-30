// /models/ProcessEvent.js — histórico do processo (auditoria + anotações)
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const ProcessEvent = db.define("ProcessEvent", {
  instanceId: { type: DataTypes.INTEGER, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: true },
  type: { type: DataTypes.STRING, allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: true },
  meta: { type: DataTypes.JSON, allowNull: true },
});

module.exports = ProcessEvent;

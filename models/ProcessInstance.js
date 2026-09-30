// /models/ProcessInstance.js — processo em andamento, iniciado a partir de um padrão
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const ProcessInstance = db.define("ProcessInstance", {
  templateId: { type: DataTypes.INTEGER, allowNull: true },
  templateName: { type: DataTypes.STRING, allowNull: true, comment: "Snapshot do nome do padrão" },
  department: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  clientName: { type: DataTypes.STRING, allowNull: true },
  clientDoc: { type: DataTypes.STRING, allowNull: true, comment: "CNPJ/CPF (livre)" },
  notes: { type: DataTypes.TEXT, allowNull: true },
  dueDate: { type: DataTypes.DATEONLY, allowNull: true },
  responsibleUserId: { type: DataTypes.INTEGER, allowNull: true },
  status: {
    type: DataTypes.ENUM("in_progress", "paused", "completed", "canceled"),
    allowNull: false,
    defaultValue: "in_progress",
  },
  pauseReason: { type: DataTypes.TEXT, allowNull: true },
  pauseOrigin: { type: DataTypes.ENUM("office", "client"), allowNull: true },
  pausedAt: { type: DataTypes.DATE, allowNull: true },
  completedAt: { type: DataTypes.DATE, allowNull: true },
  createdById: { type: DataTypes.INTEGER, allowNull: true },
});

module.exports = ProcessInstance;

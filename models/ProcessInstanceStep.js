// /models/ProcessInstanceStep.js — cópia (snapshot) dos passos do padrão, editável por processo
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const ProcessInstanceStep = db.define("ProcessInstanceStep", {
  instanceId: { type: DataTypes.INTEGER, allowNull: false },
  position: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  responsible: {
    type: DataTypes.ENUM("office", "client"),
    allowNull: false,
    defaultValue: "office",
  },
  checklist: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "Array de { text, done }",
  },
  status: {
    type: DataTypes.ENUM("pending", "done", "skipped"),
    allowNull: false,
    defaultValue: "pending",
  },
  note: { type: DataTypes.TEXT, allowNull: true },
  completedAt: { type: DataTypes.DATE, allowNull: true },
  completedById: { type: DataTypes.INTEGER, allowNull: true },
});

module.exports = ProcessInstanceStep;

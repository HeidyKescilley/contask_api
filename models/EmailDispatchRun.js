// /models/EmailDispatchRun.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const EmailDispatchRun = db.define(
  "EmailDispatchRun",
  {
    dispatchId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "EmailDispatches",
        key: "id",
      },
    },
    triggerType: {
      type: DataTypes.ENUM("manual", "automatic"),
      allowNull: false,
    },
    triggeredById: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    finishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("running", "completed", "completed_with_errors", "failed"),
      allowNull: false,
      defaultValue: "running",
    },
    totalRecipients: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    successCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    failureCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Falha de topo (ex: autenticação SMTP) que impediu a execução antes de qualquer envio",
    },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["dispatchId", "startedAt"] },
      { fields: ["status"] },
    ],
  }
);

module.exports = EmailDispatchRun;

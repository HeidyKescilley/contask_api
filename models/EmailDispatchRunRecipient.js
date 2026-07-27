// /models/EmailDispatchRunRecipient.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const EmailDispatchRunRecipient = db.define(
  "EmailDispatchRunRecipient",
  {
    runId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "EmailDispatchRuns",
        key: "id",
      },
    },
    companyId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "Companies",
        key: "id",
      },
    },
    emailTo: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: "Snapshot do(s) e-mail(s) usados no momento do envio",
    },
    status: {
      type: DataTypes.ENUM("sent", "failed"),
      allowNull: false,
    },
    smtpResponse: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    trackingToken: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Só é gerado quando bodyFormat = html (texto puro não suporta pixel de rastreio)",
    },
    openedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastOpenedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    openCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastOpenIp: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastOpenUserAgent: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["runId"] },
      { fields: ["companyId"] },
      { unique: true, fields: ["trackingToken"] },
    ],
  }
);

module.exports = EmailDispatchRunRecipient;

// /models/EmailDispatch.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const EmailDispatch = db.define(
  "EmailDispatch",
  {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    mode: {
      type: DataTypes.ENUM("manual", "automatic"),
      allowNull: false,
      defaultValue: "manual",
    },
    scheduleFrequency: {
      type: DataTypes.ENUM("weekly", "monthly", "yearly"),
      allowNull: true,
    },
    scheduleDayOfWeek: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "0 (domingo) a 6 (sábado) — usado quando scheduleFrequency = weekly",
    },
    scheduleDayOfMonth: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "1-31 — usado quando scheduleFrequency = monthly ou yearly",
    },
    scheduleMonth: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "1-12 — usado quando scheduleFrequency = yearly",
    },
    scheduleHour: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    scheduleMinute: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
    },
    nextRunAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    fromEmail: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    fromPasswordEncrypted: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    fromName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    ccEmail: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "E-mail(s) em cópia visível (Cc), separados por vírgula — aparece no cabeçalho pro destinatário.",
    },
    signatureImagePath: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    bodyFormat: {
      type: DataTypes.ENUM("text", "html"),
      allowNull: false,
      defaultValue: "html",
    },
    bodyContent: {
      type: DataTypes.TEXT("long"),
      allowNull: false,
    },
    bodySourceMode: {
      type: DataTypes.ENUM("editor", "import"),
      allowNull: false,
      defaultValue: "editor",
      comment: "Como o bodyContent foi produzido — 'import' evita jogar HTML completo importado de volta no editor rico (Quill reformata e perde estilos/layout).",
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "Precisa ser aprovada por um admin antes de rodar (manual ou automaticamente). Reseta a cada criação/edição.",
    },
    approvedById: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdById: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
    },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["mode", "isActive", "isApproved", "nextRunAt"] },
      { fields: ["createdById"] },
    ],
  }
);

module.exports = EmailDispatch;

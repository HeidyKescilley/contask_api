// /models/ProcessTemplateStep.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const ProcessTemplateStep = db.define("ProcessTemplateStep", {
  templateId: { type: DataTypes.INTEGER, allowNull: false },
  position: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  responsible: {
    type: DataTypes.ENUM("office", "client"),
    allowNull: false,
    defaultValue: "office",
    comment: "office = responsabilidade do escritório; client = aguarda ação do cliente",
  },
  checklist: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "Array de strings (itens do checklist do passo)",
  },
});

module.exports = ProcessTemplateStep;

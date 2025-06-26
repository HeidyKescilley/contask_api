// D:\projetos\contask_v2\contask_api\models\BonusFactor.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const BonusFactor = db.define(
  "BonusFactor",
  {
    factorKey: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    factorValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.0,
    },
  },
  {
    timestamps: false, // Não precisamos de createdAt/updatedAt para esta tabela
  }
);

module.exports = BonusFactor;

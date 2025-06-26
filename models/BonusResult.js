// D:\projetos\contask_v2\contask_api\models\BonusResult.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const BonusResult = db.define("BonusResult", {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "Users", key: "id" },
  },
  userName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  department: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  totalBonus: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.0,
  },
  details: {
    type: DataTypes.JSON,
    allowNull: true, // Detalhes podem ser nulos se não houver empresas
  },
  calculationDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
});

module.exports = BonusResult;

// /models/Alert.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const Alert = db.define("Alert", {
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "Users", // Nome do modelo referenciado (tabela)
      key: "id",
    },
  },
});

module.exports = Alert;

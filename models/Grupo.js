// /models/Grupo.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const Grupo = db.define(
  "Grupo",
  {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    timestamps: false,
  }
);

module.exports = Grupo;

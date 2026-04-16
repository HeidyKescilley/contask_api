// /models/ApiKey.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const ApiKey = db.define("ApiKey", {
  key: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  lastUsedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

module.exports = ApiKey;

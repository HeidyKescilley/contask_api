// /models/User.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const User = db.define("User", {
  name: {
    type: DataTypes.STRING,
    require: true,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    require: true,
    allowNull: false,
    unique: true,
  },
  birthday: {
    type: DataTypes.DATE,
    require: true,
    allowNull: false,
  },
  department: {
    type: DataTypes.STRING,
    require: true,
    allowNull: false,
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "not-validated",
  },
  password: {
    type: DataTypes.STRING,
    require: true,
    allowNull: false,
  },
  ramal: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  hasBonus: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
});

module.exports = User;

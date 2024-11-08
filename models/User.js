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
  administrator: {
    type: DataTypes.BOOLEAN,
  },
  password: {
    type: DataTypes.STRING,
    require: true,
    allowNull: false,
  },
});

module.exports = User;

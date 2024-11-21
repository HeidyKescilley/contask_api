// /models/Automation.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const Automation = db.define("Automation", {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
});

module.exports = Automation;

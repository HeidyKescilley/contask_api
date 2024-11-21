// /models/ContactMode.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const ContactMode = db.define(
  "ContactMode",
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

module.exports = ContactMode;

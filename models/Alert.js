// /models/Alert.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const Alert = db.define("Alert", {
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  content: {
    type: DataTypes.TEXT("long"), // To store longer content
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "Users", // Name of the referenced model (table)
      key: "id",
    },
  },
  type: {
    type: DataTypes.ENUM("internal", "external"),
    allowNull: false,
  },
  departments: {
    type: DataTypes.JSON, // Array of department names
    allowNull: true,
  },
  companyIds: {
    type: DataTypes.JSON, // Array of company IDs
    allowNull: true,
  },
  attachments: {
    type: DataTypes.JSON, // Array of attachment filenames
    allowNull: true,
  },
});

module.exports = Alert;

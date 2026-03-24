const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const UserActivity = db.define("UserActivity", {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
}, {
  indexes: [
    {
      unique: true,
      fields: ["userId", "date"],
    },
  ],
});

module.exports = UserActivity;

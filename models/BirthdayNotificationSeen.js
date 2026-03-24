const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const BirthdayNotificationSeen = db.define("BirthdayNotificationSeen", {
  adminId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  birthdayUserId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  indexes: [
    {
      unique: true,
      fields: ["adminId", "birthdayUserId", "year"],
    },
  ],
});

module.exports = BirthdayNotificationSeen;

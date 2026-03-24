const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const AnnouncementSeen = db.define("AnnouncementSeen", {
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  announcementId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  indexes: [
    { unique: true, fields: ["userId", "announcementId"] },
  ],
});

module.exports = AnnouncementSeen;

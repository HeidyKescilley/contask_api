// /models/Company.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const Company = db.define("Company", {
  num: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  cnpj: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  ie: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  rule: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  classi: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  contractInit: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  contact: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  respFiscalId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "Users",
      key: "id",
    },
  },
  respDpId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "Users",
      key: "id",
    },
  },
  respContabilId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: "Users",
      key: "id",
    },
  },
  zen: {
    type: DataTypes.BOOLEAN,
  },
  openedByUs: {
    type: DataTypes.BOOLEAN,
  },
  uf: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  obs: {
    type: DataTypes.STRING,
    allowNull: true,
  },
});

module.exports = Company;
// D:\contask_v2\contask_api\models\Company.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const Company = db.define(
  "Company",
  {
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
    statusUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    respFiscalId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "Users",
        key: "id",
      },
    },
    respDpId: {
      type: DataTypes.INTEGER,
      allowNull: true,
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
    contactModeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "ContactModes",
        key: "id",
      },
    },
    important_info: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    isArchived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    branchNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bonusValue: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    isHeadquarters: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    }, // --- NOVOS CAMPOS PARA SETORES INDEPENDENTES ---
    isZeroedFiscal: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sentToClientFiscal: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    declarationsCompletedFiscal: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    isZeroedDp: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sentToClientDp: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    declarationsCompletedDp: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    fiscalCompletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    dpCompletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    hasNoFiscalObligations: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    hasNoDpObligations: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = Company;

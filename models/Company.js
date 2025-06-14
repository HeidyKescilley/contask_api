// /models/Company.js
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
      allowNull: true, // Permitir nulo para responsáveis opcionais
      references: {
        model: "Users",
        key: "id",
      },
    },
    respDpId: {
      type: DataTypes.INTEGER,
      allowNull: true, // Permitir nulo para responsáveis opcionais
      references: {
        model: "Users",
        key: "id",
      },
    },
    respContabilId: {
      type: DataTypes.INTEGER,
      allowNull: true, // Permitir nulo para responsáveis opcionais
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
      type: DataTypes.STRING, // Ou DataTypes.INTEGER se for sempre número
      allowNull: true,
    },
    sentToClient: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    declarationsCompleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    bonusValue: {
      type: DataTypes.INTEGER, // Para nota Fiscal (0-5)
      allowNull: true,
    },
    employeesCount: {
      type: DataTypes.INTEGER, // Para contagem de funcionários do Pessoal
      allowNull: true,
    },
    isZeroed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    }, // NOVO CAMPO: isHeadquarters
    isHeadquarters: {
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

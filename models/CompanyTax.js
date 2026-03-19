// /models/CompanyTax.js
const { DataTypes } = require("sequelize");
const db = require("../db/conn.js");

const CompanyTax = db.define("CompanyTax", {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: "Ex: ICMS, ISS, DAS, PIS/COFINS, IRPJ/CSLL, IPI, IRRF",
  },
  department: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Fiscal",
    comment: "Fiscal | Pessoal | Contábil",
  },
  applicableRegimes: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "null = aplica a todos os regimes",
  },
  applicableClassificacoes: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "null = aplica a todas as classificações",
  },
  applicableUFs: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "null = aplica a todas as UFs",
  },
});

module.exports = CompanyTax;

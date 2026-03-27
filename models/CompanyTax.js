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
  periodicity: {
    type: DataTypes.ENUM("decendial", "quinzenal", "mensal", "trimestral"),
    allowNull: false,
    defaultValue: "mensal",
    comment:
      "Frequência de apuração. 'trimestral' = apenas meses 3,6,9,12. 'decendial'/'quinzenal' = mensal com subdivisões de pagamento.",
  },
});

module.exports = CompanyTax;

// /models/association.js
const User = require("./User");
const Company = require("./Company");
const Alert = require("./Alert");
const StatusHistory = require("./StatusHistory");
const DpHistory = require("./DpHistory");
const FiscalHistory = require("./FiscalHistory");

// Associações entre User e Company
User.hasMany(Company, {
  as: "responsibleForFiscal",
  foreignKey: "respFiscalId",
});
User.hasMany(Company, { as: "responsibleForDp", foreignKey: "respDpId" });
User.hasMany(Company, {
  as: "responsibleForContabil",
  foreignKey: "respContabilId",
});

Company.belongsTo(User, { as: "respFiscal", foreignKey: "respFiscalId" });
Company.belongsTo(User, { as: "respDp", foreignKey: "respDpId" });
Company.belongsTo(User, { as: "respContabil", foreignKey: "respContabilId" });

// Associações entre User e Alert
User.hasMany(Alert, { foreignKey: "userId", as: "alerts" });
Alert.belongsTo(User, { foreignKey: "userId", as: "user" });

// Associações para StatusHistory
Company.hasMany(StatusHistory, {
  foreignKey: "companyId",
  as: "statusHistories",
});
StatusHistory.belongsTo(Company, { foreignKey: "companyId", as: "company" });

// Associações para DpHistory
Company.hasMany(DpHistory, {
  foreignKey: "companyId",
  as: "dpResponsibleHistories",
});
DpHistory.belongsTo(Company, {
  foreignKey: "companyId",
  as: "company",
});
User.hasMany(DpHistory, {
  foreignKey: "userId",
  as: "dpResponsibleHistories",
});
DpHistory.belongsTo(User, { foreignKey: "userId", as: "user" });

// Associações para FiscalHistory
Company.hasMany(FiscalHistory, {
  foreignKey: "companyId",
  as: "fiscalResponsibleHistories",
});
FiscalHistory.belongsTo(Company, {
  foreignKey: "companyId",
  as: "company",
});
User.hasMany(FiscalHistory, {
  foreignKey: "userId",
  as: "fiscalResponsibleHistories",
});
FiscalHistory.belongsTo(User, { foreignKey: "userId", as: "user" });

// /models/association.js
const User = require("./User");
const BirthdayNotificationSeen = require("./BirthdayNotificationSeen");
const UserActivity = require("./UserActivity");
const Company = require("./Company");
const Alert = require("./Alert");
const StatusHistory = require("./StatusHistory");
const DpHistory = require("./DpHistory");
const FiscalHistory = require("./FiscalHistory");
const ContactMode = require("./ContactMode");
const Grupo = require("./Grupo");
const Automation = require("./Automation");
const BonusResult = require("./BonusResult");
const AccessoryObligation = require("./AccessoryObligation");
const CompanyObligationStatus = require("./CompanyObligationStatus");
const CompanyTax = require("./CompanyTax");
const CompanyTaxStatus = require("./CompanyTaxStatus");

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

// Associação entre Company e ContactMode
ContactMode.hasMany(Company, { foreignKey: "contactModeId", as: "companies" });
Company.belongsTo(ContactMode, {
  foreignKey: "contactModeId",
  as: "contactMode",
});

// Associação entre Company e Grupo
Grupo.hasMany(Company, { foreignKey: "grupoId", as: "companies" });
Company.belongsTo(Grupo, { foreignKey: "grupoId", as: "grupo" });

// Associação Many-to-Many entre Company e Automation
Company.belongsToMany(Automation, {
  through: "CompanyAutomations",
  as: "automations",
  foreignKey: "companyId",
});

Automation.belongsToMany(Company, {
  through: "CompanyAutomations",
  as: "companies",
  foreignKey: "automationId",
});

// Associação entre User e BonusResult
User.hasMany(BonusResult, { foreignKey: "userId", as: "bonusResults" });
BonusResult.belongsTo(User, { foreignKey: "userId", as: "user" });

// Associações para ObrigaçõesAcessórias
AccessoryObligation.hasMany(CompanyObligationStatus, {
  foreignKey: "obligationId",
  as: "statuses",
  onDelete: "CASCADE",
});
CompanyObligationStatus.belongsTo(AccessoryObligation, {
  foreignKey: "obligationId",
  as: "obligation",
});

Company.hasMany(CompanyObligationStatus, {
  foreignKey: "companyId",
  as: "obligationStatuses",
  onDelete: "CASCADE",
});
CompanyObligationStatus.belongsTo(Company, {
  foreignKey: "companyId",
  as: "company",
});

User.hasMany(CompanyObligationStatus, {
  foreignKey: "completedById",
  as: "completedObligations",
});
CompanyObligationStatus.belongsTo(User, {
  foreignKey: "completedById",
  as: "completedBy",
});

// Associações para Impostos
CompanyTax.hasMany(CompanyTaxStatus, {
  foreignKey: "taxId",
  as: "statuses",
  onDelete: "CASCADE",
});
CompanyTaxStatus.belongsTo(CompanyTax, { foreignKey: "taxId", as: "tax" });

Company.hasMany(CompanyTaxStatus, {
  foreignKey: "companyId",
  as: "taxStatuses",
  onDelete: "CASCADE",
});
CompanyTaxStatus.belongsTo(Company, { foreignKey: "companyId", as: "company" });

User.hasMany(CompanyTaxStatus, {
  foreignKey: "completedById",
  as: "completedTaxes",
});
CompanyTaxStatus.belongsTo(User, { foreignKey: "completedById", as: "completedBy" });

// Associações para BirthdayNotificationSeen
User.hasMany(BirthdayNotificationSeen, { foreignKey: "adminId", as: "birthdaysSeen" });
BirthdayNotificationSeen.belongsTo(User, { foreignKey: "adminId", as: "admin" });
User.hasMany(BirthdayNotificationSeen, { foreignKey: "birthdayUserId", as: "birthdayNotifications" });
BirthdayNotificationSeen.belongsTo(User, { foreignKey: "birthdayUserId", as: "birthdayUser" });

// Associações para UserActivity
User.hasMany(UserActivity, { foreignKey: "userId", as: "activities" });
UserActivity.belongsTo(User, { foreignKey: "userId", as: "user" });

// Associações para Avisos Globais
const Announcement = require("./Announcement");
const AnnouncementSeen = require("./AnnouncementSeen");

User.hasMany(Announcement, { foreignKey: "createdById", as: "announcements" });
Announcement.belongsTo(User, { foreignKey: "createdById", as: "creator" });

User.hasMany(AnnouncementSeen, { foreignKey: "userId", as: "announcementsSeen" });
AnnouncementSeen.belongsTo(User, { foreignKey: "userId", as: "user" });

Announcement.hasMany(AnnouncementSeen, { foreignKey: "announcementId", onDelete: "CASCADE" });
AnnouncementSeen.belongsTo(Announcement, { foreignKey: "announcementId" });

// Associações para Paralisações de Atividades
const ActivitySuspension = require("./ActivitySuspension");
Company.hasMany(ActivitySuspension, { foreignKey: "companyId", as: "suspensions", onDelete: "CASCADE" });
ActivitySuspension.belongsTo(Company, { foreignKey: "companyId", as: "company" });
User.hasMany(ActivitySuspension, { foreignKey: "createdById", as: "createdSuspensions" });
ActivitySuspension.belongsTo(User, { foreignKey: "createdById", as: "createdBy" });
User.hasMany(ActivitySuspension, { foreignKey: "endedById", as: "endedSuspensions" });
ActivitySuspension.belongsTo(User, { foreignKey: "endedById", as: "endedBy" });

// Associações para Orientações de Empresa
const CompanyOrientation = require("./CompanyOrientation");
Company.hasMany(CompanyOrientation, { foreignKey: "companyId", as: "orientations", onDelete: "CASCADE" });
CompanyOrientation.belongsTo(Company, { foreignKey: "companyId", as: "company" });
User.hasMany(CompanyOrientation, { foreignKey: "createdById", as: "createdOrientations" });
CompanyOrientation.belongsTo(User, { foreignKey: "createdById", as: "createdBy" });

// Associações para Notas por Período
const CompanyPeriodNote = require("./CompanyPeriodNote");
Company.hasMany(CompanyPeriodNote, { foreignKey: "companyId", as: "periodNotes", onDelete: "CASCADE" });
CompanyPeriodNote.belongsTo(Company, { foreignKey: "companyId", as: "company" });
User.hasMany(CompanyPeriodNote, { foreignKey: "updatedById", as: "periodNotes" });
CompanyPeriodNote.belongsTo(User, { foreignKey: "updatedById", as: "updatedBy" });

// Associações para ApiKey
const ApiKey = require("./ApiKey");
User.hasMany(ApiKey, { foreignKey: "userId", as: "apiKeys" });
ApiKey.belongsTo(User, { foreignKey: "userId", as: "user" });

// Associações para Disparo Automático de E-mails
const EmailDispatch = require("./EmailDispatch");
const EmailDispatchRun = require("./EmailDispatchRun");
const EmailDispatchRunRecipient = require("./EmailDispatchRunRecipient");

EmailDispatch.belongsToMany(Company, {
  through: "EmailDispatchCompanies",
  as: "companies",
  foreignKey: "dispatchId",
});
Company.belongsToMany(EmailDispatch, {
  through: "EmailDispatchCompanies",
  as: "emailDispatches",
  foreignKey: "companyId",
});

User.hasMany(EmailDispatch, { foreignKey: "createdById", as: "emailDispatches" });
EmailDispatch.belongsTo(User, { foreignKey: "createdById", as: "createdBy" });

User.hasMany(EmailDispatch, { foreignKey: "approvedById", as: "approvedEmailDispatches" });
EmailDispatch.belongsTo(User, { foreignKey: "approvedById", as: "approvedBy" });

EmailDispatch.hasMany(EmailDispatchRun, { foreignKey: "dispatchId", as: "runs", onDelete: "CASCADE" });
EmailDispatchRun.belongsTo(EmailDispatch, { foreignKey: "dispatchId", as: "dispatch" });

User.hasMany(EmailDispatchRun, { foreignKey: "triggeredById", as: "triggeredEmailRuns" });
EmailDispatchRun.belongsTo(User, { foreignKey: "triggeredById", as: "triggeredBy" });

EmailDispatchRun.hasMany(EmailDispatchRunRecipient, { foreignKey: "runId", as: "recipients", onDelete: "CASCADE" });
EmailDispatchRunRecipient.belongsTo(EmailDispatchRun, { foreignKey: "runId", as: "run" });

Company.hasMany(EmailDispatchRunRecipient, { foreignKey: "companyId", as: "emailDispatchRecipients" });
EmailDispatchRunRecipient.belongsTo(Company, { foreignKey: "companyId", as: "company" });

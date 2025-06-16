// /routes/CompanyRoutes.js
const router = require("express").Router();

const CompanyController = require("../controllers/CompanyController");
const ContactModeController = require("../controllers/ContactModeController");

// Middleware
const verifyToken = require("../helpers/verify-token");
const activityLogger = require("../middlewares/activityLogger"); // Importa o middleware de logging

router.post("/add", verifyToken, activityLogger, CompanyController.addCompany);
router.patch(
  "/edit/:id",
  verifyToken,
  activityLogger,
  CompanyController.editCompany
);
router.get("/all", verifyToken, activityLogger, CompanyController.getAll);
router.post(
  "/change-status/:id",
  verifyToken,
  activityLogger,
  CompanyController.changeStatus
);
router.get(
  "/status-history/:id",
  verifyToken,
  activityLogger,
  CompanyController.getStatusHistory
);
router.get(
  "/recent/status-changes",
  verifyToken,
  activityLogger,
  CompanyController.getRecentStatusChanges
);
router.get(
  "/recent/active-companies",
  verifyToken,
  activityLogger,
  CompanyController.getRecentActiveCompanies
);
router.get(
  "/recent/companies",
  verifyToken,
  activityLogger,
  CompanyController.getRecentCompanies
);
router.get(
  "/my-companies",
  verifyToken,
  activityLogger,
  CompanyController.getMyCompanies
);

// NOVA ROTA: Atualizar dados específicos da visualização Agente
router.patch(
  "/update-agent-data/:id",
  verifyToken,
  activityLogger,
  CompanyController.updateAgentData
);

// Rotas para ContactMode
router.post(
  "/contact-modes",
  verifyToken,
  activityLogger,
  ContactModeController.createContactMode
);
router.get(
  "/contact-modes",
  verifyToken,
  activityLogger,
  ContactModeController.getAllContactModes
);

// Rota parametrizada deve ser a última
router.get("/:id", verifyToken, activityLogger, CompanyController.getOne);

// Rotas para Dashboard Fiscal
router.get(
  "/dashboard/fiscal/general",
  verifyToken,
  activityLogger,
  CompanyController.getFiscalDashboardGeneralData
);

router.get(
  "/dashboard/fiscal/my-companies/:userId",
  verifyToken,
  activityLogger,
  CompanyController.getFiscalDashboardMyCompaniesData
);

// Rotas para Dashboard DP
router.get(
  "/dashboard/dp/general",
  verifyToken,
  activityLogger,
  CompanyController.getDpDashboardGeneralData
);

router.get(
  "/dashboard/dp/my-companies/:userId",
  verifyToken,
  activityLogger,
  CompanyController.getDpDashboardMyCompaniesData
);

module.exports = router;

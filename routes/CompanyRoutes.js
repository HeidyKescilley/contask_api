// /routes/CompanyRoutes.js
const router = require("express").Router();

const CompanyController = require("../controllers/CompanyController");

// Middleware
const verifyToken = require("../helpers/verify-token");

router.post("/add", verifyToken, CompanyController.addCompany);
router.patch("/edit/:id", verifyToken, CompanyController.editCompany);
router.get("/all", verifyToken, CompanyController.getAll);
router.post("/change-status/:id", verifyToken, CompanyController.changeStatus);
router.get(
  "/status-history/:id",
  verifyToken,
  CompanyController.getStatusHistory
);
router.get(
  "/recent/status-changes",
  verifyToken,
  CompanyController.getRecentStatusChanges
);
router.get(
  "/recent/active-companies",
  verifyToken,
  CompanyController.getRecentActiveCompanies
);
router.get(
  "/recent/companies",
  verifyToken,
  CompanyController.getRecentCompanies
);
router.get("/my-companies", verifyToken, CompanyController.getMyCompanies);

// Nova rota para obter todas as formas de envio
const ContactModeController = require("../controllers/ContactModeController");
router.post(
  "/contact-modes",
  verifyToken,
  ContactModeController.createContactMode
);
router.get(
  "/contact-modes",
  verifyToken,
  ContactModeController.getAllContactModes
);

// Place the parameterized route last
router.get("/:id", verifyToken, CompanyController.getOne);

module.exports = router;

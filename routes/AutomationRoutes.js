// /routes/AutomationRoutes.js
const router = require("express").Router();
const AutomationController = require("../controllers/AutomationController");
const verifyToken = require("../helpers/verify-token");
const activityLogger = require("../middlewares/activityLogger"); // Importa o middleware de logging

router.post(
  "/create",
  verifyToken,
  activityLogger,
  AutomationController.createAutomation
);
router.get(
  "/all",
  verifyToken,
  activityLogger,
  AutomationController.getAllAutomations
);

// Geração de DAR (1317) — executa no servidor
router.post("/dar/jobs", verifyToken, activityLogger, AutomationController.createDarJob);
router.get("/dar/jobs/:jobId", verifyToken, AutomationController.getDarJob);
router.get("/dar/jobs/:jobId/zip", verifyToken, AutomationController.downloadDarZip);
router.get("/dar/jobs/:jobId/items/:itemId/pdf", verifyToken, AutomationController.downloadDarPdf);

module.exports = router;

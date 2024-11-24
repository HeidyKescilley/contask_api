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

module.exports = router;

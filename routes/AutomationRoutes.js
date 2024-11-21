// /routes/AutomationRoutes.js
const router = require("express").Router();
const AutomationController = require("../controllers/AutomationController");
const verifyToken = require("../helpers/verify-token");

router.post("/create", verifyToken, AutomationController.createAutomation);
router.get("/all", verifyToken, AutomationController.getAllAutomations);

module.exports = router;

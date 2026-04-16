// /routes/DataApiRoutes.js
const router = require("express").Router();
const verifyApiKey = require("../helpers/verify-api-key");
const DataApiController = require("../controllers/DataApiController");

router.get("/companies", verifyApiKey, DataApiController.getCompanies);
router.get("/companies/:id", verifyApiKey, DataApiController.getCompanyById);
router.get("/users", verifyApiKey, DataApiController.getUsers);
router.get("/automations", verifyApiKey, DataApiController.getAutomations);
router.get("/taxes", verifyApiKey, DataApiController.getTaxes);
router.get("/obligations", verifyApiKey, DataApiController.getObligations);

module.exports = router;

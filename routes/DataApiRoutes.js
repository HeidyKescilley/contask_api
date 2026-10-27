// /routes/DataApiRoutes.js
const router = require("express").Router();
const verifyApiKey = require("../helpers/verify-api-key");
const DataApiController = require("../controllers/DataApiController");
const CompanyPhoneController = require("../controllers/CompanyPhoneController");

router.get("/companies", verifyApiKey, DataApiController.getCompanies);
router.patch("/companies/bulk", verifyApiKey, DataApiController.bulkUpdateCompanies);
router.get("/companies/:id/phones", verifyApiKey, CompanyPhoneController.list);
router.post("/companies/:id/phones", verifyApiKey, CompanyPhoneController.add);
router.put("/companies/:id/phones", verifyApiKey, CompanyPhoneController.replace);
router.patch("/companies/:id/phones/:phoneId", verifyApiKey, CompanyPhoneController.update);
router.delete("/companies/:id/phones/:phoneId", verifyApiKey, CompanyPhoneController.remove);
router.get("/companies/:id",verifyApiKey, DataApiController.getCompanyById);
router.get("/users", verifyApiKey, DataApiController.getUsers);
router.get("/automations", verifyApiKey, DataApiController.getAutomations);
router.get("/taxes", verifyApiKey, DataApiController.getTaxes);
router.get("/obligations", verifyApiKey, DataApiController.getObligations);

module.exports = router;

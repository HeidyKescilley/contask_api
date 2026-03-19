// /routes/TaxRoutes.js
const router = require("express").Router();
const TaxController = require("../controllers/TaxController");
const verifyToken = require("../helpers/verify-token");
const verifyAdmin = require("../helpers/verify-admin");

router.get("/all", verifyToken, TaxController.getAll);
router.post("/create", verifyToken, verifyAdmin, TaxController.create);
router.patch("/:id", verifyToken, verifyAdmin, TaxController.update);
router.delete("/:id", verifyToken, verifyAdmin, TaxController.remove);

router.get("/company/:companyId", verifyToken, TaxController.getCompanyTaxes);
router.post("/company/:companyId/toggle", verifyToken, verifyAdmin, TaxController.toggleManual);

router.patch("/status/:statusId", verifyToken, TaxController.updateStatus);
router.get("/period-summary", verifyToken, TaxController.getPeriodSummary);
router.get("/dashboard", verifyToken, TaxController.getDashboard);
router.get("/companies/:taxId", verifyToken, TaxController.getCompaniesByTax);

module.exports = router;

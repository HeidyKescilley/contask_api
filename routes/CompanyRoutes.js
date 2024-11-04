// /routes/CompanyRoutes.js
const router = require("express").Router();

const CompanyController = require("../controllers/CompanyController");

// middlewate
const verifyToken = require("../helpers/verify-token");

router.post("/add", verifyToken, CompanyController.addCompany);
router.patch("/edit/:id", verifyToken, CompanyController.editCompany);
router.get("/all", verifyToken, CompanyController.getAll);
router.get("/:id", verifyToken, CompanyController.getOne);
router.post("/change-status/:id", verifyToken, CompanyController.changeStatus);
router.get(
  "/status-history/:id",
  verifyToken,
  CompanyController.getStatusHistory
);

module.exports = router;

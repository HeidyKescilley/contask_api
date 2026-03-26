// /routes/OrientationRoutes.js
const router = require("express").Router();
const OrientationController = require("../controllers/OrientationController");
const verifyToken = require("../helpers/verify-token");

router.get("/company/:companyId", verifyToken, OrientationController.getByCompany);
router.post("/company/:companyId", verifyToken, OrientationController.create);
router.patch("/:id", verifyToken, OrientationController.update);
router.delete("/:id", verifyToken, OrientationController.remove);

module.exports = router;

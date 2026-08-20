// /routes/CertificateRoutes.js
const router = require("express").Router();
const multer = require("multer");
const CertificateController = require("../controllers/CertificateController");
const verifyToken = require("../helpers/verify-token");
const activityLogger = require("../middlewares/activityLogger");

// memoryStorage: precisamos do buffer em memória para o node-forge ler o
// certificado antes de decidir onde/como gravá-lo em disco.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.post(
  "/import",
  verifyToken,
  upload.single("certificate"),
  activityLogger,
  CertificateController.importCertificate
);
router.get("/monitor", verifyToken, CertificateController.monitor);
router.get("/export", verifyToken, CertificateController.exportValidCertificates);
router.get("/company/:companyId", verifyToken, CertificateController.getByCompany);
router.get("/download/:companyId", verifyToken, CertificateController.download);

module.exports = router;

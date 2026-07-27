// /routes/EmailDispatchRoutes.js
const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const EmailDispatchController = require("../controllers/EmailDispatchController");
const verifyToken = require("../helpers/verify-token");
const verifyAdmin = require("../helpers/verify-admin");
const activityLogger = require("../middlewares/activityLogger");

const signaturesDir = path.join(__dirname, "..", "public", "signatures");
if (!fs.existsSync(signaturesDir)) {
  fs.mkdirSync(signaturesDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, signaturesDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(Buffer.from(file.originalname, "latin1").toString("utf8"));
    cb(null, Date.now() + "-" + Math.random().toString(36).slice(2) + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("A imagem de assinatura deve ser um arquivo de imagem."));
    }
    cb(null, true);
  },
});

// Endpoint público — precisa ser acessível pelo cliente de e-mail do destinatário, sem token.
router.get("/track/:token.png", EmailDispatchController.trackOpen);

router.post("/create", verifyToken, upload.single("signatureImage"), activityLogger, EmailDispatchController.create);
router.get("/all", verifyToken, activityLogger, EmailDispatchController.list);
router.get("/runs/:runId", verifyToken, activityLogger, EmailDispatchController.getRunDetail);
router.get("/:id", verifyToken, activityLogger, EmailDispatchController.getOne);
router.patch("/:id", verifyToken, upload.single("signatureImage"), activityLogger, EmailDispatchController.update);
router.delete("/:id", verifyToken, activityLogger, EmailDispatchController.remove);
router.patch("/:id/companies", verifyToken, activityLogger, EmailDispatchController.setCompanies);
router.post("/:id/approve", verifyToken, verifyAdmin, activityLogger, EmailDispatchController.approve);
router.post("/:id/run", verifyToken, activityLogger, EmailDispatchController.runNow);
router.get("/:id/runs", verifyToken, activityLogger, EmailDispatchController.listRuns);

module.exports = router;

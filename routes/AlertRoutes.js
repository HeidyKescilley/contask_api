// /routes/AlertRoutes.js
const router = require("express").Router();
const AlertController = require("../controllers/AlertController");
const verifyToken = require("../helpers/verify-token");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const activityLogger = require("../middlewares/activityLogger");

// Garante que o diretório de anexos existe (cria se necessário)
const attachmentsDir = path.join(__dirname, "..", "public", "attachments");
if (!fs.existsSync(attachmentsDir)) {
  fs.mkdirSync(attachmentsDir, { recursive: true });
}

// Configuração do Multer com caminho absoluto e nome seguro (sem caracteres especiais)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, attachmentsDir);
  },
  filename: function (req, file, cb) {
    // Preserva apenas a extensão original; usa timestamp como nome para evitar
    // problemas de encoding em sistemas Windows
    const ext = path.extname(
      Buffer.from(file.originalname, "latin1").toString("utf8")
    );
    cb(null, Date.now() + "-" + Math.random().toString(36).slice(2) + ext);
  },
});

const upload = multer({ storage });

// Route for creating an alert
router.post(
  "/create",
  verifyToken,
  upload.array("attachments"),
  activityLogger,
  AlertController.createAlert
);

module.exports = router;

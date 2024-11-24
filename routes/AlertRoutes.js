// /routes/AlertRoutes.js
const router = require("express").Router();
const AlertController = require("../controllers/AlertController");
const verifyToken = require("../helpers/verify-token");
const multer = require("multer");
const path = require("path");
const activityLogger = require("../middlewares/activityLogger"); // Importa o middleware de logging

// Set up Multer storage for attachments
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/attachments"); // Salva os arquivos em public/attachments
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

// Route for creating an alert
router.post(
  "/create",
  verifyToken,
  upload.array("attachments"),
  activityLogger,
  AlertController.createAlert
);

module.exports = router;

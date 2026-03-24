const router = require("express").Router();
const AnnouncementController = require("../controllers/AnnouncementController");
const verifyToken = require("../helpers/verify-token");
const verifyAdmin = require("../helpers/verify-admin");
const activityLogger = require("../middlewares/activityLogger");

// Usuário autenticado: buscar avisos pendentes
router.get("/announcements/pending", verifyToken, AnnouncementController.getPending);

// Usuário autenticado: dispensar aviso permanentemente
router.post("/announcements/:id/seen", verifyToken, AnnouncementController.markSeen);

// Usuário autenticado: enviar resposta por e-mail
router.post("/announcements/:id/reply", verifyToken, AnnouncementController.reply);

// Admin: listar todos os avisos
router.get("/announcements", verifyAdmin, AnnouncementController.getAll);

// Admin: criar aviso
router.post("/announcements", verifyAdmin, activityLogger, AnnouncementController.create);

// Admin: atualizar aviso
router.patch("/announcements/:id", verifyAdmin, activityLogger, AnnouncementController.update);

// Admin: ativar/desativar aviso
router.patch("/announcements/:id/toggle", verifyAdmin, activityLogger, AnnouncementController.toggleActive);

// Admin: remover aviso
router.delete("/announcements/:id", verifyAdmin, activityLogger, AnnouncementController.remove);

module.exports = router;

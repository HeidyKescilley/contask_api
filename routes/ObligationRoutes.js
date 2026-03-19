// /routes/ObligationRoutes.js
const router = require("express").Router();
const ObligationController = require("../controllers/ObligationController");
const verifyToken = require("../helpers/verify-token");
const verifyAdmin = require("../helpers/verify-admin");

// Listagem (qualquer usuário autenticado)
router.get("/all", verifyToken, ObligationController.getAll);

// Criação, edição e exclusão (admin only)
router.post("/create", verifyToken, verifyAdmin, ObligationController.create);
router.patch("/:id", verifyToken, verifyAdmin, ObligationController.update);
router.delete("/:id", verifyToken, verifyAdmin, ObligationController.remove);

// Obrigações de uma empresa específica (autenticado)
router.get("/company/:companyId", verifyToken, ObligationController.getCompanyObligations);
router.post("/company/:companyId/toggle", verifyToken, verifyAdmin, ObligationController.toggleManual);

// Atualizar status de uma obrigação (agente fiscal)
router.patch("/status/:statusId", verifyToken, ObligationController.updateStatus);

// Resumo do período (agente fiscal)
router.get("/period-summary", verifyToken, ObligationController.getPeriodSummary);

// Dashboard de obrigações (admin / fiscal)
router.get("/dashboard", verifyToken, ObligationController.getDashboard);

// Lista de empresas por obrigação (para modal do dashboard)
router.get("/companies/:obligationId", verifyToken, ObligationController.getCompaniesByObligation);

module.exports = router;

// /routes/ProcessRoutes.js — Acompanhamento de processos
// A restrição por departamento é aplicada no controller (admin vê tudo; demais só o próprio).
const router = require("express").Router();
const ProcessController = require("../controllers/ProcessController");
const verifyToken = require("../helpers/verify-token");

router.use(verifyToken);

router.get("/departments", ProcessController.getDepartments);
router.get("/users", ProcessController.listDepartmentUsers);

// Padrões
router.get("/templates", ProcessController.listTemplates);
router.post("/templates", ProcessController.createTemplate);
router.put("/templates/:id", ProcessController.updateTemplate);
router.delete("/templates/:id", ProcessController.deleteTemplate);

// Processos
router.get("/instances", ProcessController.listInstances);
router.post("/instances", ProcessController.createInstance);
router.get("/instances/:id", ProcessController.getInstance);
router.patch("/instances/:id", ProcessController.updateInstance);
router.delete("/instances/:id", ProcessController.deleteInstance);
router.put("/instances/:id/steps", ProcessController.replaceInstanceSteps);
router.patch("/instances/:id/steps/:stepId", ProcessController.updateStep);
router.post("/instances/:id/steps/:stepId/complete", ProcessController.completeStep);
router.post("/instances/:id/steps/:stepId/skip", ProcessController.skipStep);
router.post("/instances/:id/steps/:stepId/reopen", ProcessController.reopenStep);
router.post("/instances/:id/pause", ProcessController.pauseInstance);
router.post("/instances/:id/resume", ProcessController.resumeInstance);
router.post("/instances/:id/cancel", ProcessController.cancelInstance);
router.post("/instances/:id/notes", ProcessController.addNote);

module.exports = router;

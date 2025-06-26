// D:\projetos\contask_v2\contask_api\routes\BonusRoutes.js
const router = require("express").Router();
const BonusController = require("../controllers/BonusController");
const verifyAdmin = require("../helpers/verify-admin"); // Usaremos o verify-admin
const activityLogger = require("../middlewares/activityLogger");

// Todas as rotas de bônus são apenas para administradores
router.use(verifyAdmin, activityLogger);

// Rota para buscar os fatores de cálculo
router.get("/factors", BonusController.getBonusFactors);

// Rota para atualizar os fatores de cálculo
router.post("/factors", BonusController.updateBonusFactors);

// Rota para buscar os resultados de bônus já calculados
router.get("/results", BonusController.getBonusResults);

// Rota para acionar um novo cálculo completo de bônus
router.post("/calculate", BonusController.runFullBonusCalculation);

module.exports = router;

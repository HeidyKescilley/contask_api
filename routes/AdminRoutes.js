// D:\ContHub\contask_api\routes\AdminRoutes.js
const router = require("express").Router();
const AdminController = require("../controllers/AdminController");
const verifyAdmin = require("../helpers/verify-admin");
const activityLogger = require("../middlewares/activityLogger");

// Rota para obter todos os usuários
router.get("/users", verifyAdmin, activityLogger, AdminController.getAllUsers);

// Rota para alterar o nível (role) de um usuário
router.patch(
  "/user/:id/role",
  verifyAdmin,
  activityLogger,
  AdminController.changeUserRole
);

// Rota para deletar um usuário
router.delete(
  "/user/:id",
  verifyAdmin,
  activityLogger,
  AdminController.deleteUser
);

// NOVA ROTA: Enviar manualmente a lista de empresas suspensas
router.post(
  "/send-suspended-companies",
  verifyAdmin,
  activityLogger,
  AdminController.sendSuspendedCompaniesEmailManual
);

// ROTA PARA ARQUIVAR EMPRESA MANUALMENTE (ADMIN)
router.patch(
  "/company/:id/archive",
  verifyAdmin,
  activityLogger,
  AdminController.archiveCompanyManually
);

router.patch(
  "/user/:id/change-password",
  verifyAdmin,
  activityLogger,
  AdminController.changeUserPasswordByAdmin
);

router.patch(
  "/user/:id/toggle-bonus",
  verifyAdmin,
  activityLogger,
  AdminController.toggleUserBonusStatus
);

module.exports = router;

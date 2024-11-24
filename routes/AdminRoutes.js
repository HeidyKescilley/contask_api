// /routes/AdminRoutes.js
const router = require("express").Router();
const AdminController = require("../controllers/AdminController");
const verifyAdmin = require("../helpers/verify-admin");
const activityLogger = require("../middlewares/activityLogger"); // Importa o middleware de logging

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

module.exports = router;

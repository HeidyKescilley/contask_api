// /routes/AdminRoutes.js
const router = require("express").Router();
const AdminController = require("../controllers/AdminController");
const verifyAdmin = require("../helpers/verify-admin");

// Rota para obter todos os usuários
router.get("/users", verifyAdmin, AdminController.getAllUsers);

// Rota para alterar o nível (role) de um usuário
router.patch("/user/:id/role", verifyAdmin, AdminController.changeUserRole);

// Rota para deletar um usuário
router.delete("/user/:id", verifyAdmin, AdminController.deleteUser);

module.exports = router;

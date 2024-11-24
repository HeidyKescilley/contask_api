// /routes/UserRoutes.js
const router = require("express").Router();

const UserController = require("../controllers/UserController");

// middleware
const verifyToken = require("../helpers/verify-token");
const activityLogger = require("../middlewares/activityLogger"); // Importa o middleware de logging

router.post("/register", UserController.register);
router.post("/login", UserController.login);
router.get("/checkUser", UserController.checkUser);

// Aplicar activityLogger após verifyToken
router.get("/users", verifyToken, activityLogger, UserController.getAllUsers);
router.get(
  "/department/:department",
  verifyToken,
  activityLogger,
  UserController.getUsersByDepartment
);
router.get(
  "/user/:id",
  verifyToken,
  activityLogger,
  UserController.getUserById
);
router.patch(
  "/user/edit/:id",
  verifyToken,
  activityLogger,
  UserController.editUser
);

module.exports = router;

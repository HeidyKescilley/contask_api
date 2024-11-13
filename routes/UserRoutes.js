// /routes/UserRoutes.js
const router = require("express").Router();

const UserController = require("../controllers/UserController");

// middleware
const verifyToken = require("../helpers/verify-token");

router.post("/register", UserController.register);
router.post("/login", UserController.login);
router.get("/checkUser", UserController.checkUser);
router.get("/users", verifyToken, UserController.getAllUsers);
router.get(
  "/department/:department",
  verifyToken,
  UserController.getUsersByDepartment
);
router.get("/user/:id", verifyToken, UserController.getUserById);
router.patch("/user/edit/:id", verifyToken, UserController.editUser);

module.exports = router;

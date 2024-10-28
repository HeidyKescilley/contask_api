// /routes/UserRoutes.js
const router = require("express").Router();

const UserController = require("../controllers/UserController");

// middlewate
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
router.get("/:id", UserController.getUserById);
router.patch("/edit/:id", verifyToken, UserController.editUser);

module.exports = router;

// /routes/ApiKeyRoutes.js
const router = require("express").Router();
const verifyToken = require("../helpers/verify-token");
const ApiKeyController = require("../controllers/ApiKeyController");

router.post("/", verifyToken, ApiKeyController.create);
router.get("/", verifyToken, ApiKeyController.list);
router.delete("/:id", verifyToken, ApiKeyController.revoke);

module.exports = router;

// /routes/ActivitySuspensionRoutes.js
const router = require("express").Router();
const ActivitySuspensionController = require("../controllers/ActivitySuspensionController");
const verifyToken = require("../helpers/verify-token");
const verifyAdmin = require("../helpers/verify-admin");

// GET /activity-suspension?filter=active|ended|all
router.get("/", verifyToken, ActivitySuspensionController.getAll);

// GET /activity-suspension/company/:id
router.get(
  "/company/:companyId",
  verifyToken,
  ActivitySuspensionController.getByCompany
);

// POST /activity-suspension
router.post(
  "/",
  verifyToken,
  verifyAdmin,
  ActivitySuspensionController.create
);

// PATCH /activity-suspension/:id/extend
router.patch(
  "/:id/extend",
  verifyToken,
  verifyAdmin,
  ActivitySuspensionController.extend
);

// PATCH /activity-suspension/:id/end
router.patch(
  "/:id/end",
  verifyToken,
  verifyAdmin,
  ActivitySuspensionController.end
);

module.exports = router;

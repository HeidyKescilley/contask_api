const router = require("express").Router();
const BirthdayController = require("../controllers/BirthdayController");
const verifyToken = require("../helpers/verify-token");

router.get("/birthday/today", verifyToken, BirthdayController.getTodayBirthdays);
router.post("/birthday/seen", verifyToken, BirthdayController.markBirthdaySeen);

module.exports = router;

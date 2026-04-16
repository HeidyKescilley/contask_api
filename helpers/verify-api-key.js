// /helpers/verify-api-key.js
const ApiKey = require("../models/ApiKey");

const verifyApiKey = async (req, res, next) => {
  const key = req.headers["x-api-key"];

  if (!key) {
    return res.status(401).json({ message: "API Key não fornecida." });
  }

  const apiKey = await ApiKey.findOne({ where: { key, active: true } });

  if (!apiKey) {
    return res.status(401).json({ message: "API Key inválida ou revogada." });
  }

  apiKey.lastUsedAt = new Date();
  await apiKey.save();

  req.apiUserId = apiKey.userId;
  next();
};

module.exports = verifyApiKey;

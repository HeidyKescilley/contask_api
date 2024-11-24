// /middlewares/activityLogger.js
const logger = require("../logger/logger");
const getUserByToken = require("../helpers/get-user-by-token");
const getToken = require("../helpers/get-token");

const activityLogger = async (req, res, next) => {
  try {
    const token = getToken(req);
    if (token) {
      const user = await getUserByToken(token);
      if (user) {
        logger.info(
          `Ação do Usuário: ${user.email} (ID: ${user.id}) realizou ${req.method} em ${req.originalUrl}`
        );
      }
    } else {
      logger.info(`Ação não autenticada: ${req.method} em ${req.originalUrl}`);
    }
  } catch (error) {
    logger.error(`Erro no Activity Logger: ${error.message}`);
  }
  next();
};

module.exports = activityLogger;

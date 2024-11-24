// /middlewares/errorHandler.js
const logger = require("../logger/logger");

const errorHandler = (err, req, res, next) => {
  logger.error(`Error: ${err.message}\nStack: ${err.stack}`);

  res.status(500).json({
    message: "Ocorreu um erro inesperado.",
  });
};

module.exports = errorHandler;

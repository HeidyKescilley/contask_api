// /logger/logger.js
const { createLogger, format, transports } = require("winston");
require("winston-daily-rotate-file");

// Definição de níveis de log
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Definição de cores para os níveis de log (opcional)
const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  http: "magenta",
  debug: "white",
};

// Adiciona cores ao Winston (opcional)
const winston = require("winston");
winston.addColors(colors);

// Definição do formato dos logs
const formatLog = format.combine(
  format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  format.printf(
    (info) => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
  )
);

// Transportador para logs de erro com rotação diária
const errorTransport = new transports.DailyRotateFile({
  level: "error",
  filename: "logs/error-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "14d", // Mantém logs por 14 dias
});

// Transportador para logs combinados com rotação diária
const combinedTransport = new transports.DailyRotateFile({
  level: "info",
  filename: "logs/combined-%DATE%.log",
  datePattern: "YYYY-MM-DD",
  zippedArchive: true,
  maxSize: "20m",
  maxFiles: "30d", // Mantém logs por 30 dias
});

// Transportador para console (útil para desenvolvimento)
const consoleTransport = new transports.Console({
  level: "debug",
  format: format.combine(format.colorize(), formatLog),
});

// Criação do logger
const logger = createLogger({
  levels,
  format: formatLog,
  transports: [
    errorTransport,
    combinedTransport,
    consoleTransport, // Apenas ativo em desenvolvimento
  ],
  exitOnError: false,
});

// Objeto de stream para integração com Morgan
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

module.exports = logger;

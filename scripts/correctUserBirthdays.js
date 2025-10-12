// D:\projetos\contask_v2\contask_api\scripts\correctUserBirthdays.js

require("dotenv").config();
const { Sequelize, DataTypes } = require("sequelize");
const winston = require("winston");
require("winston-daily-rotate-file");

// --- Configuração do Logger ---
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const colors = { error: "red", warn: "yellow", info: "green", debug: "white" };
winston.addColors(colors);
const formatLog = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`
  )
);
const scriptLogger = winston.createLogger({
  levels,
  format: formatLog,
  transports: [
    new winston.transports.Console({
      level: "debug",
      format: winston.format.combine(winston.format.colorize(), formatLog),
    }),
    new winston.transports.DailyRotateFile({
      level: "info",
      filename: "logs/script-birthday-correction-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "10m",
      maxFiles: "7d",
    }),
  ],
  exitOnError: false,
});

// --- Configuração do Banco de Dados ---
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT,
    logging: (msg) => scriptLogger.debug(msg),
  }
);

// --- Definição do Modelo User ---
const User = sequelize.define(
  "User",
  {
    name: { type: DataTypes.STRING, require: true, allowNull: false },
    email: {
      type: DataTypes.STRING,
      require: true,
      allowNull: false,
      unique: true,
    },
    birthday: { type: DataTypes.DATE, require: true, allowNull: false },
    department: { type: DataTypes.STRING, require: true, allowNull: false },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "not-validated",
    },
    password: { type: DataTypes.STRING, require: true, allowNull: false },
    ramal: { type: DataTypes.STRING, allowNull: true },
    hasBonus: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    timestamps: false, // Ignora colunas createdAt e updatedAt para este script
  }
);

// --- Lógica Principal do Script ---
const correctBirthdays = async () => {
  scriptLogger.info(
    "Iniciando a correção de datas de aniversário dos usuários."
  );
  let updatedCount = 0;
  let errorCount = 0;

  try {
    await sequelize.authenticate();
    scriptLogger.info("Conexão com o banco de dados estabelecida.");

    const users = await User.findAll();
    scriptLogger.info(`Encontrados ${users.length} usuários para verificação.`);

    for (const user of users) {
      try {
        const originalBirthday = user.birthday;
        if (!originalBirthday) {
          scriptLogger.warn(
            `Usuário ID ${user.id} (${user.name}) não possui data de aniversário. Pulando.`
          );
          continue;
        }

        // Adiciona 1 dia à data
        const correctedDate = new Date(originalBirthday);
        correctedDate.setDate(correctedDate.getDate() + 1);

        // Formata para YYYY-MM-DD para evitar problemas de fuso na atualização
        const year = correctedDate.getFullYear();
        const month = String(correctedDate.getMonth() + 1).padStart(2, "0");
        const day = String(correctedDate.getDate()).padStart(2, "0");
        const finalDateString = `${year}-${month}-${day}`;

        await User.update(
          { birthday: finalDateString },
          { where: { id: user.id } }
        );

        scriptLogger.info(
          `Usuário ID ${user.id} (${user.name}) atualizado. Aniversário: ${
            originalBirthday.toISOString().split("T")[0]
          } -> ${finalDateString}`
        );
        updatedCount++;
      } catch (innerError) {
        errorCount++;
        scriptLogger.error(
          `Erro ao processar usuário ID ${user.id} (${user.name}): ${innerError.message}`
        );
      }
    }

    scriptLogger.info("--- Processo de correção de aniversários concluído ---");
    scriptLogger.info(`Usuários atualizados: ${updatedCount}`);
    scriptLogger.info(`Usuários com erro: ${errorCount}`);
  } catch (mainError) {
    scriptLogger.error(
      `Erro fatal no script de correção: ${mainError.message}`,
      {
        stack: mainError.stack,
      }
    );
  } finally {
    await sequelize.close();
    scriptLogger.info("Conexão com o banco de dados fechada.");
    process.exit(0);
  }
};

// Executar o script
correctBirthdays();

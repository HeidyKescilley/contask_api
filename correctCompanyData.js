// D:\contask_v2\contask_api\correctCompanyData.js

require("dotenv").config(); // Carrega as variáveis de ambiente

const { Sequelize, DataTypes, Op } = require("sequelize");
const axios = require("axios");
const path = require("path");

// --- Configuração do Logger (copiado e adaptado de logger/logger.js) ---
const winston = require("winston");
require("winston-daily-rotate-file");

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3, // Usaremos debug para logs mais detalhados do script
};

const colors = {
  error: "red",
  warn: "yellow",
  info: "green",
  debug: "white",
};
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
      level: "debug", // Mostrar tudo no console
      format: winston.format.combine(winston.format.colorize(), formatLog),
    }),
    new winston.transports.DailyRotateFile({
      // Opcional: logar para arquivo também
      level: "info",
      filename: "logs/script-correction-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "10m",
      maxFiles: "7d",
    }),
    new winston.transports.DailyRotateFile({
      level: "error",
      filename: "logs/script-correction-error-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true,
      maxSize: "10m",
      maxFiles: "7d",
    }),
  ],
  exitOnError: false,
});
// --- Fim da Configuração do Logger ---

// --- Configuração do Banco de Dados (copiado e adaptado de db/conn.js) ---
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT,
    logging: (msg) => scriptLogger.debug(msg), // Opcional: logar as queries do Sequelize
  }
);

try {
  sequelize.authenticate();
  scriptLogger.info("Conexão com o banco de dados realizada com sucesso.");
} catch (err) {
  scriptLogger.error(
    `Ocorreu um erro ao conectar no banco de dados: ${err.message}`,
    { stack: err.stack }
  );
  process.exit(1); // Encerra o script se não conseguir conectar ao DB
}

// --- Definição do Modelo Company (essencial para o script) ---
// Copie apenas o modelo Company, já que é o único que o script precisa interagir diretamente.
const Company = sequelize.define(
  "Company",
  {
    num: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    cnpj: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    ie: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    rule: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    classi: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    contractInit: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    contact: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    statusUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    respFiscalId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    respDpId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    respContabilId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    contactModeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    important_info: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    openedByUs: {
      type: DataTypes.BOOLEAN,
    },
    uf: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    obs: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isArchived: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    branchNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sentToClient: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    declarationsCompleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    bonusValue: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    employeesCount: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    isZeroed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
  }
);
// --- Fim da Definição do Modelo Company ---

// --- Função para consultar Brasil API (copiada de services/brasilApi.js) ---
const BRASIL_API_BASE_URL = "https://brasilapi.com.br/api";

const getCnpjData = async (cnpj) => {
  try {
    const cleanCnpj = cnpj.replace(/[^\d]/g, "");
    if (cleanCnpj.length !== 14) {
      scriptLogger.warn(`CNPJ inválido para consulta na Brasil API: ${cnpj}`);
      return null;
    }

    const url = `${BRASIL_API_BASE_URL}/cnpj/v1/${cleanCnpj}`;
    scriptLogger.debug(`Consultando Brasil API para CNPJ: ${cleanCnpj}`);
    const response = await axios.get(url, { timeout: 15000 }); // Aumentei o timeout para 15s por segurança

    if (response.status === 200) {
      scriptLogger.debug(`Dados do CNPJ ${cleanCnpj} consultados com sucesso.`);
      return response.data;
    } else {
      scriptLogger.warn(
        `Erro na Brasil API para CNPJ ${cleanCnpj}: Status ${response.status}`
      );
      return null;
    }
  } catch (error) {
    if (error.response) {
      scriptLogger.error(
        `Erro na resposta da Brasil API para CNPJ ${cnpj}: Status ${
          error.response.status
        }, Data: ${JSON.stringify(error.response.data)}`
      );
    } else if (error.request) {
      scriptLogger.error(
        `Nenhuma resposta da Brasil API para CNPJ ${cnpj} dentro do tempo limite: ${error.message}`
      );
    } else {
      scriptLogger.error(
        `Erro ao configurar requisição para Brasil API (CNPJ: ${cnpj}): ${error.message}`
      );
    }
    return null;
  }
};
// --- Fim da Função para consultar Brasil API ---

// --- Lógica Principal do Script ---
const correctCompanyData = async () => {
  scriptLogger.info(
    "Iniciando a correção em massa de dados de empresas via Brasil API."
  );

  let updatedCount = 0;
  let errorCount = 0;
  let skippedCount = 0;
  const errors = [];
  const updatedCompaniesDetails = [];

  try {
    // Sincroniza o modelo com o banco de dados (garante que a tabela existe)
    // Usar force: false e alter: true com cautela em produção, mas para um script único pode ser útil para garantir o modelo
    await sequelize.sync({ force: false, alter: false });

    // Buscar todas as empresas que não estão arquivadas
    const companies = await Company.findAll({
      where: { isArchived: false },
      attributes: ["id", "name", "cnpj", "uf"], // Selecionar apenas os campos necessários
    });

    if (companies.length === 0) {
      scriptLogger.info("Nenhuma empresa encontrada para correção de dados.");
      return {
        updatedCount: 0,
        errorCount: 0,
        skippedCount: 0,
        updatedCompaniesDetails: [],
        errors: [],
      };
    }

    scriptLogger.info(
      `Total de ${companies.length} empresas não arquivadas encontradas para processamento.`
    );

    for (const company of companies) {
      try {
        scriptLogger.debug(
          `Processando empresa ID: ${company.id}, CNPJ: ${company.cnpj}`
        );
        const cnpjData = await getCnpjData(company.cnpj);

        if (cnpjData) {
          const newUf = cnpjData.uf;
          const newName = cnpjData.razao_social;

          let needsUpdate = false;
          const updates = {};
          const oldValues = {};

          if (newUf && company.uf !== newUf) {
            updates.uf = newUf;
            oldValues.uf = company.uf;
            needsUpdate = true;
          }
          if (newName && company.name !== newName) {
            updates.name = newName;
            oldValues.name = company.name;
            needsUpdate = true;
          }

          if (needsUpdate) {
            await Company.update(updates, { where: { id: company.id } });
            updatedCount++;
            updatedCompaniesDetails.push({
              id: company.id,
              cnpj: company.cnpj,
              oldName: oldValues.name || company.name,
              newName: updates.name || company.name,
              oldUf: oldValues.uf || company.uf,
              newUf: updates.uf || company.uf,
            });
            scriptLogger.info(
              `Empresa ID ${company.id} (${
                company.cnpj
              }) atualizada. Mudanças: ${JSON.stringify(updates)}`
            );
          } else {
            skippedCount++;
            scriptLogger.debug(
              `Empresa ID ${company.id} (${company.cnpj}): Nenhuma atualização necessária.`
            );
          }
        } else {
          errorCount++;
          errors.push({
            companyId: company.id,
            cnpj: company.cnpj,
            message: "Não foi possível obter dados da Brasil API.",
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 200)); // Pequeno delay para não sobrecarregar a API
      } catch (innerError) {
        errorCount++;
        errors.push({
          companyId: company.id,
          cnpj: company.cnpj,
          message: innerError.message,
        });
        scriptLogger.error(
          `Erro ao processar empresa ID ${company.id} (${company.cnpj}): ${innerError.message}`
        );
      }
    }

    scriptLogger.info(`--- Processo de correção em massa concluído ---`);
    scriptLogger.info(`Empresas atualizadas: ${updatedCount}`);
    scriptLogger.info(`Empresas com erro: ${errorCount}`);
    scriptLogger.info(`Empresas puladas (já corretas): ${skippedCount}`);

    if (updatedCount > 0) {
      scriptLogger.info("Detalhes das empresas atualizadas:");
      updatedCompaniesDetails.forEach((detail) => {
        scriptLogger.info(
          `  ID: ${detail.id}, CNPJ: ${detail.cnpj}, Nome: '${detail.oldName}' -> '${detail.newName}', UF: '${detail.oldUf}' -> '${detail.newUf}'`
        );
      });
    }

    if (errorCount > 0) {
      scriptLogger.warn("Detalhes dos erros:");
      errors.forEach((err) => {
        scriptLogger.error(
          `  Empresa ID: ${err.companyId}, CNPJ: ${err.cnpj}, Erro: ${err.message}`
        );
      });
    }

    return {
      updatedCount,
      errorCount,
      skippedCount,
      updatedCompaniesDetails,
      errors,
    };
  } catch (mainError) {
    scriptLogger.error(
      `Erro fatal no script de correção de dados: ${mainError.message}`,
      { stack: mainError.stack }
    );
    return {
      updatedCount,
      errorCount,
      skippedCount,
      updatedCompaniesDetails,
      errors,
      fatalError: mainError.message,
    };
  } finally {
    await sequelize.close(); // Fechar a conexão com o banco de dados
    scriptLogger.info("Conexão com o banco de dados fechada.");
    process.exit(0); // Encerra o processo Node.js
  }
};

// Executar o script
correctCompanyData();

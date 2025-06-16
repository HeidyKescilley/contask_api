require("dotenv").config(); // Carrega as variáveis do arquivo .env
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT,
    timezone: "-03:00",
  }
);

try {
  sequelize.authenticate();
  console.log("Conexão com o banco realizada com sucesso");
} catch (err) {
  console.log("Ocorreu um erro ao conectar no banco de dados: ", err);
}

module.exports = sequelize;

// /db/conn.js
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize("contask_v2", "root", "admin", {
  host: "localhost",
  dialect: "mysql",
});

try {
  sequelize.authenticate();
  console.log("Conexão com o banco realizada com sucesso");
} catch (err) {
  console.log("Ocorreu um erro ao conectar no banco de dados: ", err);
}

module.exports = sequelize;

// /helpers/create-user-token.js
const jwt = require("jsonwebtoken");

const createUserToken = async (user, req, res) => {
  // create a token
  const token = jwt.sign(
    {
      name: user.name,
      id: user.id,
    },
    "aquicolocaosecret"
  );

  // return token
  res.status(200).json({
    message: "Você está autenticado",
    token,
    userId: user.id,
    isAdministrator: user.administrator,
    department: user.department,
    userName: user.name,
  });
};

module.exports = createUserToken;

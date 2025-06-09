// /helpers/create-user-token.js
const jwt = require("jsonwebtoken");

const createUserToken = async (user, req, res) => {
  const secret = process.env.JWT_SECRET;
  const expiresIn = "3d";

  const token = jwt.sign(
    {
      name: user.name,
      id: user.id,
      role: user.role,
      department: user.department, // <-- ADICIONADO AQUI
    },
    secret,
    { expiresIn }
  );

  res.status(200).json({
    message: "Você está autenticado",
    token,
    userId: user.id,
    role: user.role,
    department: user.department,
    userName: user.name,
    expiresIn,
  });
};

module.exports = createUserToken;

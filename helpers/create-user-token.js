// /helpers/create-user-token.js
const jwt = require("jsonwebtoken");

const createUserToken = async (user, req, res) => {
  // use your environment variable or a consistent secret key
  const secret = process.env.JWT_SECRET;

  // create a token
  const token = jwt.sign(
    {
      name: user.name,
      id: user.id,
      role: user.role,
    },
    secret
  );

  // return token
  res.status(200).json({
    message: "Você está autenticado",
    token,
    userId: user.id,
    role: user.role,
    department: user.department,
    userName: user.name,
  });
};

module.exports = createUserToken;

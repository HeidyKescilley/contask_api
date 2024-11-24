// /helpers/get-user-by-token.js
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// get user by jwt token
const getUserByToken = async (token) => {
  const secret = process.env.JWT_SECRET;

  if (!token) {
    throw new Error("Acesso Negado! Token não fornecido.");
  }

  try {
    const decoded = jwt.verify(token, secret);
    const userId = decoded.id;
    const user = await User.findOne({ where: { id: userId } });

    if (!user) {
      throw new Error("Usuário não encontrado.");
    }

    return user;
  } catch (error) {
    throw new Error("Token inválido ou expirado.");
  }
};

module.exports = getUserByToken;

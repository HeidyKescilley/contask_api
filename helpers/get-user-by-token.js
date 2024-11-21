// /helpers/get-user-by-token.js
const jwt = require("jsonwebtoken");

const User = require("../models/User");

const secret = process.env.JWT_SECRET;

// get user by jwt token
const getUserByToken = async (token) => {
  if (!token) {
    return res.status(400).json({ message: "Acesso Negado!" });
  }
  const decoded = jwt.verify(token, secret);

  const userId = decoded.id;

  const user = await User.findOne({ where: { id: userId } });

  return user;
};

module.exports = getUserByToken;

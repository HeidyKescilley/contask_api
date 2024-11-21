// /helpers/verify-admin.js
const jwt = require("jsonwebtoken");
const getToken = require("./get-token");

// use your environment variable or a consistent secret key
const secret = process.env.JWT_SECRET || "seu-segredo-aqui";

// middleware to validate admin role
const checkAdmin = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).json({ message: "Acesso Negado!" });
  }

  const token = getToken(req);

  if (!token) {
    return res.status(401).json({ message: "Acesso Negado!" });
  }

  try {
    const verified = jwt.verify(token, secret);
    if (verified.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Acesso restrito a administradores." });
    }
    req.user = verified;
    next();
  } catch (err) {
    return res.status(400).json({ message: "Token inválido!" });
  }
};

module.exports = checkAdmin;

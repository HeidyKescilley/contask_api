// /helpers/get-token.js
const getToken = (req) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) return null;

  const parts = authHeader.split(" ");

  if (parts.length !== 2) return null;

  const scheme = parts[0];
  const token = parts[1];

  if (!/^Bearer$/i.test(scheme)) return null;

  return token;
};

module.exports = getToken;

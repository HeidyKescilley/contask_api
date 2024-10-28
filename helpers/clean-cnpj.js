function cleanCNPJ(cnpj) {
  return cnpj.replace(/[.\-\/]/g, "");
}

module.exports = cleanCNPJ;

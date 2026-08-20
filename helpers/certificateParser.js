// /helpers/certificateParser.js
// Extrai CNPJ, razão social e datas de validade de um certificado digital
// A1 (.pfx/.p12), portado de MonitorDeCertificados/src/services/pkcs12.js.
const forge = require("node-forge");

function validarCnpj(cnpj) {
  const d = String(cnpj || "").replace(/\D/g, "");
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;

  const calcDigit = (str, weights) => {
    const sum = str
      .split("")
      .reduce((acc, ch, i) => acc + parseInt(ch, 10) * weights[i], 0);
    const rem = sum % 11;
    return rem < 2 ? 0 : 11 - rem;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  return (
    calcDigit(d.slice(0, 12), w1) === parseInt(d[12], 10) &&
    calcDigit(d.slice(0, 13), w2) === parseInt(d[13], 10)
  );
}

function getAttr(subject, shortName) {
  const campo = subject.getField(shortName);
  return campo ? campo.value : "";
}

function extrairCnpjDeTexto(texto) {
  const candidatos = String(texto || "").match(/\d{14}/g) || [];
  return candidatos.find((c) => validarCnpj(c)) || candidatos[0] || "";
}

function interpretarSubject(cert) {
  const cn = getAttr(cert.subject, "CN");

  if (cn.includes(":")) {
    const partes = cn.split(":");
    const possivelCnpj = partes[partes.length - 1].replace(/\D/g, "");
    if (possivelCnpj.length === 14) {
      return {
        razaoSocial: partes.slice(0, -1).join(":").trim(),
        cnpj: possivelCnpj,
      };
    }
  }

  const textoCompleto = cert.subject.attributes.map((a) => a.value).join(" ");
  const cnpj = extrairCnpjDeTexto(textoCompleto);
  return { razaoSocial: cn || "", cnpj };
}

function escolherCertificadoFolha(certBags) {
  const folha = certBags.find((bag) => {
    const ext = bag.cert.getExtension("basicConstraints");
    return !ext || !ext.cA;
  });
  return folha || certBags[0];
}

/**
 * Extrai dados de um certificado PKCS#12 (.pfx/.p12).
 * @param {Buffer} buffer conteúdo binário do arquivo
 * @param {string} senha senha do certificado
 * @returns {{ razaoSocial: string, cnpj: string, validoDe: Date, validoAte: Date }}
 */
function extrairCertificado(buffer, senha) {
  let p12Asn1;
  try {
    const der = forge.util.createBuffer(buffer.toString("binary"));
    p12Asn1 = forge.asn1.fromDer(der);
  } catch {
    throw new Error("Arquivo de certificado inválido ou corrompido.");
  }

  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);
  } catch {
    throw new Error("Senha incorreta ou arquivo de certificado inválido.");
  }

  const bagsPorTipo = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBags = bagsPorTipo[forge.pki.oids.certBag] || [];
  if (certBags.length === 0) {
    throw new Error("Nenhum certificado foi encontrado dentro do arquivo.");
  }

  const certBag = escolherCertificadoFolha(certBags);
  const cert = certBag.cert;
  const { razaoSocial, cnpj } = interpretarSubject(cert);

  if (!cnpj) {
    throw new Error("Não foi possível identificar o CNPJ no certificado.");
  }

  return {
    razaoSocial,
    cnpj,
    validoDe: cert.validity.notBefore,
    validoAte: cert.validity.notAfter,
  };
}

module.exports = { extrairCertificado, validarCnpj };

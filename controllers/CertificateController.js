// /controllers/CertificateController.js
const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");
const Certificate = require("../models/Certificate");
const Company = require("../models/Company");
const cleanCNPJ = require("../helpers/clean-cnpj");
const { extrairCertificado } = require("../helpers/certificateParser");
const logger = require("../logger/logger");
const cacheManager = require("../utils/CacheManager");

const CERTIFICATES_DIR = path.join(__dirname, "..", "certificates");
if (!fs.existsSync(CERTIFICATES_DIR)) {
  fs.mkdirSync(CERTIFICATES_DIR, { recursive: true });
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ALERT_DAYS = 15;

function calcularStatus(validUntil) {
  if (!validUntil) return { status: "sem_certificado", diasRestantes: null };
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const validoAte = new Date(validUntil);
  validoAte.setHours(0, 0, 0, 0);
  const diasRestantes = Math.ceil((validoAte.getTime() - hoje.getTime()) / MS_PER_DAY);

  if (diasRestantes < 0) return { status: "vencido", diasRestantes };
  if (diasRestantes <= ALERT_DAYS) return { status: "vencendo", diasRestantes };
  return { status: "vigente", diasRestantes };
}

async function findCompanyByCnpj(cnpjDigits) {
  let company = await Company.findOne({ where: { cnpj: cnpjDigits } });
  if (company) return company;

  // Fallback: dados legados podem ter o CNPJ salvo com máscara.
  const candidates = await Company.findAll({ attributes: ["id", "cnpj"] });
  const match = candidates.find((c) => cleanCNPJ(String(c.cnpj)) === cnpjDigits);
  return match ? Company.findByPk(match.id) : null;
}

function invalidateCompanyCaches() {
  return cacheManager
    .reloadAllGlobal()
    .then(() => cacheManager.invalidateByPrefix("my_companies_"))
    .catch((err) => logger.error(`CertificateController: erro ao invalidar cache de empresas: ${err.message}`));
}

module.exports = class CertificateController {
  static async importCertificate(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "Nenhum arquivo de certificado enviado." });
      }

      const { password, companyId } = req.body;
      if (!password) {
        return res.status(400).json({ message: "Informe a senha do certificado." });
      }

      let extraido;
      try {
        extraido = extrairCertificado(req.file.buffer, password);
      } catch (parseError) {
        return res.status(400).json({ message: parseError.message });
      }

      const cnpjDigits = extraido.cnpj;

      let company;
      if (companyId) {
        company = await Company.findByPk(companyId);
        if (!company) {
          return res.status(404).json({ message: "Empresa selecionada não encontrada." });
        }
        if (cleanCNPJ(String(company.cnpj)) !== cnpjDigits) {
          return res.status(400).json({
            message: `O CNPJ do certificado (${cnpjDigits}) não corresponde ao CNPJ da empresa selecionada (${cleanCNPJ(
              String(company.cnpj)
            )}).`,
          });
        }
      } else {
        company = await findCompanyByCnpj(cnpjDigits);
        if (!company) {
          logger.warn(
            `Importação de certificado: nenhuma empresa cadastrada com o CNPJ ${cnpjDigits}.`
          );
          return res.status(404).json({
            message: "Nenhuma empresa cadastrada com o CNPJ deste certificado.",
            cnpj: cnpjDigits,
            razaoSocial: extraido.razaoSocial,
          });
        }
      }

      const extensaoOriginal = path.extname(req.file.originalname || "").toLowerCase();
      const extensao = [".pfx", ".p12"].includes(extensaoOriginal) ? extensaoOriginal : ".pfx";

      // Remove arquivo(s) anterior(es) desse CNPJ, em qualquer extensão suportada.
      for (const ext of [".pfx", ".p12"]) {
        const antigo = path.join(CERTIFICATES_DIR, `${cnpjDigits}${ext}`);
        if (fs.existsSync(antigo)) fs.unlinkSync(antigo);
      }

      const fileName = `${cnpjDigits}${extensao}`;
      await fs.promises.writeFile(path.join(CERTIFICATES_DIR, fileName), req.file.buffer);

      const [certificate] = await Certificate.upsert(
        {
          companyId: company.id,
          cnpj: cnpjDigits,
          certificateRazaoSocial: extraido.razaoSocial,
          password,
          fileName,
          validFrom: extraido.validoDe,
          validUntil: extraido.validoAte,
          importedAt: new Date(),
          importedById: req.user.id,
          reminder15Sent: false,
          reminder1Sent: false,
        },
        { returning: true }
      );

      logger.info(
        `Certificado importado para a empresa ${company.name} (CNPJ: ${cnpjDigits}) por ${req.user.email}.`
      );

      await invalidateCompanyCaches();

      return res.status(200).json({
        message: "Certificado importado com sucesso.",
        certificate,
        company: { id: company.id, name: company.name, cnpj: company.cnpj },
      });
    } catch (error) {
      logger.error(`CertificateController.importCertificate: ${error.message}`);
      return res.status(500).json({ message: "Erro ao importar o certificado." });
    }
  }

  static async getByCompany(req, res) {
    try {
      const { companyId } = req.params;
      const certificate = await Certificate.findOne({ where: { companyId } });
      if (!certificate) {
        return res.status(200).json({ certificate: null });
      }
      const plain = certificate.get({ plain: true });
      const { status, diasRestantes } = calcularStatus(plain.validUntil);
      return res.status(200).json({ certificate: { ...plain, status, diasRestantes } });
    } catch (error) {
      logger.error(`CertificateController.getByCompany: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async download(req, res) {
    try {
      const { companyId } = req.params;
      const certificate = await Certificate.findOne({ where: { companyId } });
      if (!certificate) {
        return res.status(404).json({ message: "Nenhum certificado encontrado para esta empresa." });
      }
      const filePath = path.join(CERTIFICATES_DIR, certificate.fileName);
      if (!fs.existsSync(filePath)) {
        logger.error(`Arquivo de certificado ausente em disco: ${filePath}`);
        return res.status(404).json({ message: "Arquivo do certificado não encontrado no servidor." });
      }
      return res.download(filePath, certificate.fileName);
    } catch (error) {
      logger.error(`CertificateController.download: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async monitor(req, res) {
    try {
      const companies = await Company.findAll({
        where: { isArchived: false },
        attributes: ["id", "name", "cnpj", "email"],
        include: [{ model: Certificate, as: "certificate" }],
        order: [["name", "ASC"]],
      });

      const result = companies.map((c) => {
        const plain = c.get({ plain: true });
        const { status, diasRestantes } = calcularStatus(plain.certificate?.validUntil || null);
        return {
          id: plain.id,
          name: plain.name,
          cnpj: plain.cnpj,
          email: plain.email,
          certificate: plain.certificate
            ? {
                id: plain.certificate.id,
                validFrom: plain.certificate.validFrom,
                validUntil: plain.certificate.validUntil,
                importedAt: plain.certificate.importedAt,
              }
            : null,
          status,
          diasRestantes,
        };
      });

      return res.status(200).json(result);
    } catch (error) {
      logger.error(`CertificateController.monitor: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  static async exportValidCertificates(req, res) {
    try {
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);

      const certificates = await Certificate.findAll({
        where: { validUntil: { [Op.gte]: hoje } },
        include: [{ model: Company, as: "company", attributes: ["id", "name"] }],
      });

      const data = certificates
        .filter((c) => c.company)
        .map((c) => ({
          razaoSocial: c.company.name,
          cnpj: c.cnpj,
          senha: c.password,
        }));

      const dataStr = new Date().toISOString().slice(0, 10);
      logger.info(
        `Usuário (${req.user.email}) exportou ${data.length} certificado(s) válido(s) em JSON.`
      );

      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="certificados_validos_${dataStr}.json"`
      );
      return res.send(JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error(`CertificateController.exportValidCertificates: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }
};

module.exports.calcularStatus = calcularStatus;
module.exports.CERTIFICATES_DIR = CERTIFICATES_DIR;

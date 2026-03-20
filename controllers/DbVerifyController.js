// /controllers/DbVerifyController.js
// Verificação e correção de inconsistências no banco de dados (admin only)

const Company = require("../models/Company");
const cacheManager = require("../utils/CacheManager");
const logger = require("../logger/logger");

// ── Validadores ───────────────────────────────────────────────────────────────

function validateCNPJ(cnpj) {
  if (!cnpj) return false;
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false; // sequência repetida

  let sum = 0;
  let weight = 5;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(digits[i]) * weight--;
    if (weight < 2) weight = 9;
  }
  let r = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (parseInt(digits[12]) !== r) return false;

  sum = 0;
  weight = 6;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(digits[i]) * weight--;
    if (weight < 2) weight = 9;
  }
  r = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return parseInt(digits[13]) === r;
}

function validateCPF(cpf) {
  if (!cpf) return false;
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (parseInt(digits[9]) !== r) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return parseInt(digits[10]) === r;
}

function validateEmail(email) {
  if (!email || email.trim() === "") return true; // email vazio é ok (campo opcional)
  // Aceita múltiplos emails separados por vírgula ou ponto-e-vírgula
  const separators = /[,;]/;
  const emails = email.split(separators).map((e) => e.trim()).filter(Boolean);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emails.every((e) => emailRegex.test(e));
}

function detectEmailIssues(email) {
  const issues = [];
  if (!email) return issues;
  if (/\s{2,}/.test(email)) issues.push("espaços duplicados");
  if (/ [,;] /.test(email) || / [,;]/.test(email) || /[,;] /.test(email)) {
    // Espaços ao redor dos separadores são permitidos, não é problema
  }
  // Separador incomum: espaço simples entre emails sem vírgula/ponto-e-vírgula
  if (/ /.test(email.replace(/[,;]/g, "").replace(/[^\s@.]+@[^\s@.]+\.[^\s@.]+/g, "").trim())) {
    // Há espaço fora de email address (possível separador incorreto)
    const hasCommaOrSemicolon = /[,;]/.test(email);
    if (!hasCommaOrSemicolon && / /.test(email)) {
      issues.push("possível separador incorreto (use vírgula ou ponto-e-vírgula)");
    }
  }
  return issues;
}

// ── Controller ────────────────────────────────────────────────────────────────

module.exports = class DbVerifyController {

  // GET /admin/db-verify
  static async verify(req, res) {
    try {
      const companies = await Company.findAll({
        attributes: ["id", "num", "name", "cnpj", "email", "phone", "branchNumber", "isArchived"],
        raw: true,
      });

      const issues = [];

      // Mapa para detectar duplicatas de num+branchNumber
      const numBranchMap = new Map();
      for (const c of companies) {
        const key = `${c.num}_${c.branchNumber || "0"}`;
        if (!numBranchMap.has(key)) numBranchMap.set(key, []);
        numBranchMap.get(key).push(c);
      }

      for (const company of companies) {
        const { id, num, name, cnpj, email, phone, branchNumber } = company;

        // Validação do CNPJ
        if (cnpj) {
          const digits = cnpj.replace(/\D/g, "");
          const isMEI = digits.length === 11; // CPF para MEI/individual

          if (digits.length !== 14 && digits.length !== 11) {
            issues.push({
              companyId: id, companyName: name, num,
              field: "cnpj", value: cnpj,
              errorType: "CNPJ com comprimento inválido",
              suggestion: "Verifique se o CNPJ está completo (14 dígitos) ou é CPF (11 dígitos)",
            });
          } else if (/[a-zA-Z]/.test(cnpj)) {
            issues.push({
              companyId: id, companyName: name, num,
              field: "cnpj", value: cnpj,
              errorType: "CNPJ com caracteres inválidos (letras)",
              suggestion: "Remova letras do CNPJ",
            });
          } else if (digits.length === 14 && !validateCNPJ(cnpj)) {
            issues.push({
              companyId: id, companyName: name, num,
              field: "cnpj", value: cnpj,
              errorType: "CNPJ com dígitos verificadores inválidos",
              suggestion: "Verifique se o número do CNPJ está correto",
            });
          } else if (digits.length === 11 && !validateCPF(cnpj)) {
            issues.push({
              companyId: id, companyName: name, num,
              field: "cnpj", value: cnpj,
              errorType: "CPF com dígitos verificadores inválidos",
              suggestion: "Verifique se o número do CPF está correto",
            });
          }
        }

        // Validação do email
        if (email) {
          if (!validateEmail(email)) {
            issues.push({
              companyId: id, companyName: name, num,
              field: "email", value: email,
              errorType: "E-mail com formato inválido",
              suggestion: "Use endereços válidos separados por vírgula ou ponto-e-vírgula",
            });
          }
          const emailIssues = detectEmailIssues(email);
          for (const issue of emailIssues) {
            issues.push({
              companyId: id, companyName: name, num,
              field: "email", value: email,
              errorType: `E-mail: ${issue}`,
              suggestion: "Corrija a formatação do campo de e-mail",
            });
          }
        }

        // Validação do telefone (presença de letras)
        if (phone && /[a-zA-Z]/.test(phone)) {
          issues.push({
            companyId: id, companyName: name, num,
            field: "phone", value: phone,
            errorType: "Telefone com caracteres inválidos (letras)",
            suggestion: "Remova letras do número de telefone",
          });
        }

        // Duplicatas de num+branchNumber
        const key = `${num}_${branchNumber || "0"}`;
        const dups = numBranchMap.get(key) || [];
        if (dups.length > 1 && dups[0].id === id) {
          // Reporta apenas uma vez por grupo (no primeiro da lista)
          issues.push({
            companyId: id, companyName: name, num,
            field: "num+branchNumber",
            value: `Número ${num} / Filial ${branchNumber || "0"}`,
            errorType: `Número e filial duplicados (${dups.length} empresas)`,
            suggestion: `IDs duplicados: ${dups.map((d) => `${d.name} (${d.id})`).join(", ")}`,
          });
        }
      }

      return res.json({ total: companies.length, issues, issueCount: issues.length });
    } catch (err) {
      logger.error(`DbVerifyController.verify: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }

  // PATCH /admin/db-verify/fix
  // Body: { companyId, field, newValue }
  static async fix(req, res) {
    try {
      const { companyId, field, newValue } = req.body;

      const allowedFields = ["cnpj", "email", "phone", "num", "branchNumber", "name"];
      if (!allowedFields.includes(field)) {
        return res.status(400).json({ message: "Campo não permitido para correção." });
      }

      const company = await Company.findByPk(companyId);
      if (!company) return res.status(404).json({ message: "Empresa não encontrada." });

      await company.update({ [field]: newValue });

      cacheManager.invalidateByPrefix("my_companies_");
      cacheManager.invalidateByPrefix("dashboard_my_companies_");

      logger.info(`DbVerify fix: campo "${field}" da empresa ${company.name} (ID ${companyId}) atualizado por ${req.user?.email}`);

      return res.json({ message: "Campo corrigido com sucesso.", company });
    } catch (err) {
      logger.error(`DbVerifyController.fix: ${err.message}`);
      return res.status(500).json({ message: err.message });
    }
  }
};

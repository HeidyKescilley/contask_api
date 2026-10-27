// /controllers/CompanyPhoneController.js
const { Op } = require("sequelize");
const Company = require("../models/Company");
const CompanyPhone = require("../models/CompanyPhone");
const cacheManager = require("../utils/CacheManager");
const logger = require("../logger/logger");

const MIN_DIGITS = 8;
const MAX_DIGITS = 15;
const ATTRIBUTES = ["id", "companyId", "number", "contactName"];

const digitsOf = (n) => String(n ?? "").replace(/\D/g, "");

/** Normaliza { number, contactName } de entrada. Retorna { value } ou { error }. */
function parsePhone(input, { partial = false } = {}) {
  if (!input || typeof input !== "object") return { error: "Telefone inválido." };
  const value = {};

  if (input.number !== undefined || !partial) {
    const number = String(input.number ?? "").trim();
    const digits = digitsOf(number);
    if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) {
      return { error: `Número inválido: informe de ${MIN_DIGITS} a ${MAX_DIGITS} dígitos (com DDD).` };
    }
    value.number = number;
    value.numberDigits = digits;
  }
  if (input.contactName !== undefined) {
    const name = input.contactName === null ? "" : String(input.contactName).trim();
    value.contactName = name || null;
  }
  return { value };
}

// O dado já foi gravado: falha de cache não deve virar erro na resposta.
async function refreshCaches() {
  try {
    await cacheManager.reloadAllGlobal();
    cacheManager.invalidateByPrefix("my_companies_");
  } catch (error) {
    logger.warn(`Falha ao atualizar cache após alterar telefones: ${error.message}`);
  }
}

/** Valida a lista completa (formato do PUT). Retorna { items } ou { error }. */
async function prepareReplace(companyId, phones) {
  const current = await CompanyPhone.findAll({ where: { companyId }, attributes: ["id"] });
  const currentIds = new Set(current.map((p) => p.id));

  const items = [];
  for (const item of phones) {
    const { value, error } = parsePhone(item);
    if (error) return { error };
    if (item.id !== undefined && item.id !== null && !currentIds.has(Number(item.id))) {
      return { error: `Telefone id ${item.id} não pertence a esta empresa.` };
    }
    items.push({ id: item.id !== undefined && item.id !== null ? Number(item.id) : null, ...value });
  }
  const digits = items.map((i) => i.numberDigits);
  if (new Set(digits).size !== digits.length) return { error: "Há números repetidos na lista." };
  return { items };
}

/** Grava a lista validada: atualiza os com id, cria os sem id e remove os ausentes. */
async function applyReplace(companyId, items, transaction) {
  const keep = items.filter((i) => i.id).map((i) => i.id);
  await CompanyPhone.destroy({
    where: { companyId, ...(keep.length ? { id: { [Op.notIn]: keep } } : {}) },
    transaction,
  });
  // Passo intermediário evita colisão do índice único quando números são trocados entre itens.
  for (const i of items.filter((x) => x.id)) {
    await CompanyPhone.update({ numberDigits: `tmp-${i.id}` }, { where: { id: i.id }, transaction });
  }
  for (const i of items.filter((x) => x.id)) {
    await CompanyPhone.update(
      { number: i.number, numberDigits: i.numberDigits, contactName: i.contactName ?? null },
      { where: { id: i.id }, transaction }
    );
  }
  const fresh = items
    .filter((x) => !x.id)
    .map(({ id, ...v }) => ({ ...v, companyId, contactName: v.contactName ?? null }));
  if (fresh.length) await CompanyPhone.bulkCreate(fresh, { transaction });
}

const listFor = (companyId) =>
  CompanyPhone.findAll({ where: { companyId }, attributes: ATTRIBUTES, order: [["id", "ASC"]] });

module.exports = class CompanyPhoneController {
  /** GET /:id/phones */
  static async list(req, res) {
    try {
      const company = await Company.findByPk(req.params.id, { attributes: ["id"] });
      if (!company) return res.status(404).json({ message: "Empresa não encontrada." });
      return res.status(200).json(await listFor(company.id));
    } catch (error) {
      logger.error(`Erro ao listar telefones: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  /** POST /:id/phones — body: { number, contactName } ou { phones: [{ number, contactName }, ...] } */
  static async add(req, res) {
    try {
      const company = await Company.findByPk(req.params.id, { attributes: ["id", "name"] });
      if (!company) return res.status(404).json({ message: "Empresa não encontrada." });

      const items = Array.isArray(req.body?.phones) ? req.body.phones : [req.body];
      if (!items.length) return res.status(400).json({ message: "Informe ao menos um telefone." });

      const rows = [];
      for (const item of items) {
        const { value, error } = parsePhone(item);
        if (error) return res.status(400).json({ message: error });
        rows.push({ ...value, companyId: company.id });
      }

      const digits = rows.map((r) => r.numberDigits);
      if (new Set(digits).size !== digits.length) {
        return res.status(400).json({ message: "Há números repetidos na requisição." });
      }
      const existing = await CompanyPhone.findOne({
        where: { companyId: company.id, numberDigits: { [Op.in]: digits } },
      });
      if (existing) {
        return res.status(409).json({ message: `O número ${existing.number} já está cadastrado nesta empresa.` });
      }

      await CompanyPhone.bulkCreate(rows);
      await refreshCaches();
      logger.info(`${rows.length} telefone(s) adicionado(s) à empresa ${company.name} (ID: ${company.id})`);
      return res.status(201).json({ message: "Telefone(s) adicionado(s).", phones: await listFor(company.id) });
    } catch (error) {
      logger.error(`Erro ao adicionar telefone: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  /** PATCH /:id/phones/:phoneId — body: { number?, contactName? } (o contato continua ligado ao número) */
  static async update(req, res) {
    try {
      const phone = await CompanyPhone.findOne({
        where: { id: req.params.phoneId, companyId: req.params.id },
      });
      if (!phone) return res.status(404).json({ message: "Telefone não encontrado." });

      const { value, error } = parsePhone(req.body, { partial: true });
      if (error) return res.status(400).json({ message: error });
      if (!Object.keys(value).length) {
        return res.status(400).json({ message: "Informe 'number' e/ou 'contactName'." });
      }

      if (value.numberDigits && value.numberDigits !== phone.numberDigits) {
        const dup = await CompanyPhone.findOne({
          where: { companyId: phone.companyId, numberDigits: value.numberDigits, id: { [Op.ne]: phone.id } },
        });
        if (dup) return res.status(409).json({ message: `O número ${dup.number} já está cadastrado nesta empresa.` });
      }

      await phone.update(value);
      await refreshCaches();
      return res.status(200).json({ message: "Telefone atualizado.", phone: await phone.reload({ attributes: ATTRIBUTES }) });
    } catch (error) {
      logger.error(`Erro ao atualizar telefone: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  /**
   * PUT /:id/phones — substitui a lista inteira (como as tags de e-mail do formulário).
   * body: { phones: [{ id?, number, contactName }] }. Itens com id existente são atualizados;
   * sem id são criados; os que não vierem na lista são removidos.
   */
  static async replace(req, res) {
    try {
      const company = await Company.findByPk(req.params.id, { attributes: ["id", "name"] });
      if (!company) return res.status(404).json({ message: "Empresa não encontrada." });
      if (!Array.isArray(req.body?.phones)) {
        return res.status(400).json({ message: "Informe 'phones' como lista." });
      }

      const prepared = await prepareReplace(company.id, req.body.phones);
      if (prepared.error) return res.status(400).json({ message: prepared.error });
      const items = prepared.items;

      await CompanyPhone.sequelize.transaction((transaction) =>
        applyReplace(company.id, items, transaction)
      );

      await refreshCaches();
      logger.info(`Telefones da empresa ${company.name} (ID: ${company.id}) substituídos (${items.length}).`);
      return res.status(200).json({ message: "Telefones atualizados.", phones: await listFor(company.id) });
    } catch (error) {
      logger.error(`Erro ao substituir telefones: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  /** DELETE /:id/phones/:phoneId */
  static async remove(req, res) {
    try {
      const deleted = await CompanyPhone.destroy({
        where: { id: req.params.phoneId, companyId: req.params.id },
      });
      if (!deleted) return res.status(404).json({ message: "Telefone não encontrado." });
      await refreshCaches();
      return res.status(200).json({ message: "Telefone removido." });
    } catch (error) {
      logger.error(`Erro ao remover telefone: ${error.message}`);
      return res.status(500).json({ message: error.message });
    }
  }

  /** Usado por /company/add e /company/edit: valida a lista antes de gravar a empresa. */
  static prepareReplace = prepareReplace;
  /** Grava a lista (dentro da transação informada). */
  static applyReplace = applyReplace;
  static refreshCaches = refreshCaches;
};

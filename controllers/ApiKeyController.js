// /controllers/ApiKeyController.js
const crypto = require("crypto");
const ApiKey = require("../models/ApiKey");

module.exports = class ApiKeyController {
  // Gerar nova API Key (apenas user ID 1)
  static async create(req, res) {
    if (req.user.id !== 1) {
      return res.status(403).json({ message: "Acesso restrito ao desenvolvedor." });
    }

    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(422).json({ message: "O campo 'name' é obrigatório." });
    }

    const key = crypto.randomBytes(32).toString("hex");

    const apiKey = await ApiKey.create({ key, name: name.trim(), userId: 1 });

    // Retorna a key completa apenas uma vez
    return res.status(201).json({
      id: apiKey.id,
      name: apiKey.name,
      key: apiKey.key,
      createdAt: apiKey.createdAt,
    });
  }

  // Listar chaves do user 1
  static async list(req, res) {
    if (req.user.id !== 1) {
      return res.status(403).json({ message: "Acesso restrito ao desenvolvedor." });
    }

    const keys = await ApiKey.findAll({
      where: { userId: 1 },
      attributes: ["id", "name", "active", "lastUsedAt", "createdAt"],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json(keys);
  }

  // Revogar chave (active = false)
  static async revoke(req, res) {
    if (req.user.id !== 1) {
      return res.status(403).json({ message: "Acesso restrito ao desenvolvedor." });
    }

    const { id } = req.params;
    const apiKey = await ApiKey.findOne({ where: { id, userId: 1 } });

    if (!apiKey) {
      return res.status(404).json({ message: "Chave não encontrada." });
    }

    apiKey.active = false;
    await apiKey.save();

    return res.status(200).json({ message: "Chave revogada com sucesso." });
  }
};

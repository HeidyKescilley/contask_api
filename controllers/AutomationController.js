// /controllers/AutomationController.js
const archiver = require("archiver");
const Automation = require("../models/Automation");
const Company = require("../models/Company");
const dar = require("../services/darAutomation");

module.exports = class AutomationController {
  static async createAutomation(req, res) {
    try {
      const { name } = req.body;

      if (!name) {
        return res.status(400).json({ message: "O nome é obrigatório." });
      }

      const existingAutomation = await Automation.findOne({ where: { name } });
      if (existingAutomation) {
        return res.status(400).json({ message: "Esta automação já existe." });
      }

      const newAutomation = await Automation.create({ name });

      return res.status(201).json({
        message: "Automação criada com sucesso.",
        automation: newAutomation,
      });
    } catch (error) {
      console.error("Erro ao criar automação:", error);
      return res.status(500).json({ message: "Erro ao criar automação." });
    }
  }

  static async getAllAutomations(req, res) {
    try {
      const automations = await Automation.findAll();
      return res.status(200).json(automations);
    } catch (error) {
      console.error("Erro ao buscar automações:", error);
      return res.status(500).json({ message: "Erro ao buscar automações." });
    }
  }

  // ==================== GERAÇÃO DE DAR (1317) ====================

  static async createDarJob(req, res) {
    try {
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Informe ao menos uma empresa." });
      }
      if (items.length > 100) {
        return res.status(400).json({ message: "Máximo de 100 empresas por execução." });
      }

      const companies = await Company.findAll({
        where: { id: items.map((i) => i.companyId) },
        attributes: ["id", "name", "cnpj"],
      });
      const byId = new Map(companies.map((c) => [c.id, c]));

      const prepared = [];
      for (const it of items) {
        const company = byId.get(Number(it.companyId));
        if (!company) {
          return res.status(404).json({ message: `Empresa ${it.companyId} não encontrada.` });
        }
        const cnpj = dar.soDigitos(company.cnpj);
        if (cnpj.length !== 14) {
          return res.status(400).json({ message: `CNPJ inválido para ${company.name}.` });
        }
        let valor;
        try {
          valor = dar.formatarValor(it.valor);
        } catch {
          return res.status(400).json({ message: `Valor inválido para ${company.name}.` });
        }
        prepared.push({ companyId: company.id, nome: company.name, cnpj, valor });
      }

      const job = dar.criarJob(req.user.id, prepared);
      return res.status(202).json(dar.serializar(job));
    } catch (error) {
      console.error("Erro ao criar job de DAR:", error);
      return res.status(500).json({ message: "Erro ao iniciar a geração de DAR." });
    }
  }

  static getDarJob(req, res) {
    const job = AutomationController._ownJob(req, res);
    if (!job) return;
    return res.status(200).json(dar.serializar(job));
  }

  static downloadDarPdf(req, res) {
    const job = AutomationController._ownJob(req, res);
    if (!job) return;
    const item = job.items.find((i) => i.id === Number(req.params.itemId));
    if (!item || !item.file) {
      return res.status(404).json({ message: "PDF não disponível." });
    }
    return res.download(item.file, AutomationController._pdfName(item));
  }

  static downloadDarZip(req, res) {
    const job = AutomationController._ownJob(req, res);
    if (!job) return;
    const ready = job.items.filter((i) => i.file);
    if (ready.length === 0) {
      return res.status(404).json({ message: "Nenhum PDF disponível." });
    }
    res.attachment("DARs.zip");
    const zip = archiver("zip");
    zip.on("error", () => res.end());
    zip.pipe(res);
    const used = new Set();
    for (const item of ready) {
      let name = AutomationController._pdfName(item);
      for (let n = 2; used.has(name); n++) name = name.replace(/( \(\d+\))?\.pdf$/, ` (${n}).pdf`);
      used.add(name);
      zip.file(item.file, { name });
    }
    zip.finalize();
  }

  static _ownJob(req, res) {
    const job = dar.obterJob(req.params.jobId);
    if (!job || job.userId !== req.user.id) {
      res.status(404).json({ message: "Execução não encontrada." });
      return null;
    }
    return job;
  }

  static _pdfName(item) {
    const nome = item.nome.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 50);
    return `DAR ${nome} ${item.valor}.pdf`;
  }
};

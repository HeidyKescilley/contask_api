// Cria os padrões de processo do sistema (por seedKey) e limpa os da versão anterior.
const logger = require("../logger/logger");

async function seedProcessTemplates() {
  try {
    const ProcessTemplate = require("../models/ProcessTemplate");
    const ProcessTemplateStep = require("../models/ProcessTemplateStep");
    const ProcessInstance = require("../models/ProcessInstance");
    const { PROCESS_TEMPLATES, LEGACY_SEED_KEYS } = require("./processTemplates");

    // "Administrativo" era um nome informal: o departamento é Processual
    await ProcessTemplate.update({ department: "Processual" }, { where: { department: "Administrativo" } });
    await ProcessInstance.update({ department: "Processual" }, { where: { department: "Administrativo" } });

    // Remove os padrões da versão anterior (arquiva os que já têm processos iniciados)
    const legacy = await ProcessTemplate.findAll({ where: { seedKey: LEGACY_SEED_KEYS } });
    for (const old of legacy) {
      const used = await ProcessInstance.count({ where: { templateId: old.id } });
      if (used > 0) await old.update({ active: false });
      else await old.destroy();
    }

    for (const tpl of PROCESS_TEMPLATES) {
      const exists = await ProcessTemplate.findOne({ where: { seedKey: tpl.seedKey } });
      if (exists) continue;
      const created = await ProcessTemplate.create({
        seedKey: tpl.seedKey,
        name: tpl.name,
        description: tpl.description,
        department: tpl.department,
      });
      await ProcessTemplateStep.bulkCreate(
        tpl.steps.map((s, i) => ({
          templateId: created.id,
          position: i + 1,
          title: s.title,
          description: s.description,
          responsible: s.responsible,
          checklist: s.checklist,
        })),
      );
      logger.info(`Padrão de processo criado: ${tpl.name}`);
    }
  } catch (err) {
    logger.error(`seedProcessTemplates: ${err.message}`);
  }
}

module.exports = seedProcessTemplates;

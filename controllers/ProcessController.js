// /controllers/ProcessController.js — Acompanhamento de processos
const { Op, fn, col } = require("sequelize");
const sequelize = require("../db/conn");
const logger = require("../logger/logger");
const ProcessTemplate = require("../models/ProcessTemplate");
const ProcessTemplateStep = require("../models/ProcessTemplateStep");
const ProcessInstance = require("../models/ProcessInstance");
const ProcessInstanceStep = require("../models/ProcessInstanceStep");
const ProcessEvent = require("../models/ProcessEvent");
const User = require("../models/User");
require("../models/associations");

const PROCESS_DEPARTMENTS = [
  "Administrativo",
  "Fiscal",
  "Pessoal",
  "Contábil",
  "Processual",
  "Financeiro",
  "Outros",
];

const RESPONSIBLES = ["office", "client"];
const STATUSES = ["in_progress", "paused", "completed", "canceled"];

// ── Helpers ───────────────────────────────────────────────────────────────────

const isAdmin = (user) => user?.role === "admin";

// Usuário não validado não acessa; admin acessa tudo; demais só o próprio departamento.
const canAccessDept = (user, dept) => {
  if (!user || user.role === "not-validated") return false;
  return isAdmin(user) || user.department === dept;
};

const forbidden = (res) =>
  res.status(403).json({ message: "Você não tem acesso a este departamento." });

const str = (v) => (typeof v === "string" ? v.trim() : "");

const normalizeResponsible = (v) => (RESPONSIBLES.includes(v) ? v : "office");

const checklistText = (item) => str(typeof item === "string" ? item : item?.text);

// Template: lista de strings
const normalizeTemplateChecklist = (list) =>
  (Array.isArray(list) ? list : []).map(checklistText).filter(Boolean);

// Instância: lista de { text, done }
const normalizeInstanceChecklist = (list) =>
  (Array.isArray(list) ? list : [])
    .map((item) => ({ text: checklistText(item), done: !!(item && item.done) }))
    .filter((item) => item.text);

const parseSteps = (steps) => {
  if (!Array.isArray(steps)) return { error: "Informe a lista de passos." };
  const parsed = [];
  for (const s of steps) {
    const title = str(s?.title);
    if (!title) return { error: "Todos os passos precisam de um título." };
    parsed.push({
      id: s?.id,
      title,
      description: str(s?.description) || null,
      responsible: normalizeResponsible(s?.responsible),
      checklist: s?.checklist,
    });
  }
  return { steps: parsed };
};

const logEvent = (instanceId, userId, type, message, meta, transaction) =>
  ProcessEvent.create(
    { instanceId, userId, type, message: message || null, meta: meta || null },
    { transaction },
  );

const sortSteps = (steps) => [...steps].sort((a, b) => a.position - b.position);

const serializeStep = (s) => ({
  id: s.id,
  position: s.position,
  title: s.title,
  description: s.description,
  responsible: s.responsible,
  checklist: s.checklist || [],
  status: s.status,
  note: s.note,
  completedAt: s.completedAt,
  completedBy: s.completedBy ? { id: s.completedBy.id, name: s.completedBy.name } : null,
});

const serializeInstance = (inst, { full = false } = {}) => {
  const steps = sortSteps(inst.steps || []);
  const doneCount = steps.filter((s) => s.status !== "pending").length;
  const current = steps.find((s) => s.status === "pending") || null;
  const out = {
    id: inst.id,
    templateId: inst.templateId,
    templateName: inst.templateName,
    department: inst.department,
    name: inst.name,
    clientName: inst.clientName,
    clientDoc: inst.clientDoc,
    notes: inst.notes,
    dueDate: inst.dueDate,
    status: inst.status,
    pauseReason: inst.pauseReason,
    pauseOrigin: inst.pauseOrigin,
    pausedAt: inst.pausedAt,
    completedAt: inst.completedAt,
    createdAt: inst.createdAt,
    updatedAt: inst.updatedAt,
    responsibleUser: inst.responsibleUser
      ? { id: inst.responsibleUser.id, name: inst.responsibleUser.name }
      : null,
    createdBy: inst.createdBy ? { id: inst.createdBy.id, name: inst.createdBy.name } : null,
    progress: { done: doneCount, total: steps.length },
    currentStep: current
      ? {
          id: current.id,
          position: current.position,
          title: current.title,
          responsible: current.responsible,
        }
      : null,
  };
  if (full) {
    out.steps = steps.map(serializeStep);
    out.events = [...(inst.events || [])]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((e) => ({
        id: e.id,
        type: e.type,
        message: e.message,
        meta: e.meta,
        createdAt: e.createdAt,
        user: e.user ? { id: e.user.id, name: e.user.name } : null,
      }));
  } else {
    out.steps = steps.map((s) => ({
      id: s.id,
      position: s.position,
      title: s.title,
      responsible: s.responsible,
      status: s.status,
    }));
  }
  return out;
};

const userInclude = (as) => ({ model: User, as, attributes: ["id", "name"], required: false });

const instanceIncludeFull = () => [
  { model: ProcessInstanceStep, as: "steps", include: [userInclude("completedBy")] },
  { model: ProcessEvent, as: "events", include: [userInclude("user")] },
  userInclude("responsibleUser"),
  userInclude("createdBy"),
];

const instanceIncludeList = () => [
  { model: ProcessInstanceStep, as: "steps" },
  userInclude("responsibleUser"),
  userInclude("createdBy"),
];

const loadInstance = (id, opts = {}) =>
  ProcessInstance.findByPk(id, { include: instanceIncludeFull(), ...opts });

// Carrega a instância e valida o acesso; responde erro e retorna null quando negado.
const getAuthorizedInstance = async (req, res) => {
  const inst = await loadInstance(req.params.id);
  if (!inst) {
    res.status(404).json({ message: "Processo não encontrado." });
    return null;
  }
  if (!canAccessDept(req.user, inst.department)) {
    forbidden(res);
    return null;
  }
  return inst;
};

// Recalcula concluído/em andamento conforme os passos pendentes.
const syncCompletion = async (instanceId, transaction) => {
  const inst = await ProcessInstance.findByPk(instanceId, { transaction });
  if (!inst || !["in_progress", "completed"].includes(inst.status)) return;
  const pending = await ProcessInstanceStep.count({
    where: { instanceId, status: "pending" },
    transaction,
  });
  const total = await ProcessInstanceStep.count({ where: { instanceId }, transaction });
  const shouldComplete = total > 0 && pending === 0;
  if (shouldComplete && inst.status !== "completed") {
    await inst.update({ status: "completed", completedAt: new Date() }, { transaction });
    await logEvent(instanceId, null, "completed", "Todos os passos foram concluídos.", null, transaction);
  } else if (!shouldComplete && inst.status === "completed") {
    await inst.update({ status: "in_progress", completedAt: null }, { transaction });
  }
};

const respondInstance = async (res, id, status = 200) => {
  const fresh = await loadInstance(id);
  return res.status(status).json({ instance: serializeInstance(fresh, { full: true }) });
};

const handleError = (res, err, label) => {
  logger.error(`ProcessController.${label}: ${err.message}`);
  return res.status(500).json({ message: "Erro interno ao processar a solicitação." });
};

// ── Departamentos ─────────────────────────────────────────────────────────────

exports.getDepartments = (req, res) => {
  const user = req.user;
  if (user.role === "not-validated") return forbidden(res);
  const departments = isAdmin(user)
    ? PROCESS_DEPARTMENTS
    : [user.department];
  return res.json({ departments, isAdmin: isAdmin(user), userDepartment: user.department });
};

// ── Padrões (templates) ───────────────────────────────────────────────────────

const serializeTemplate = (t, counts = {}) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  department: t.department,
  active: t.active,
  isSystem: !!t.seedKey,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
  steps: sortSteps(t.steps || []).map((s) => ({
    id: s.id,
    position: s.position,
    title: s.title,
    description: s.description,
    responsible: s.responsible,
    checklist: s.checklist || [],
  })),
  instanceCounts: {
    in_progress: counts.in_progress || 0,
    paused: counts.paused || 0,
    completed: counts.completed || 0,
    canceled: counts.canceled || 0,
  },
});

exports.listTemplates = async (req, res) => {
  try {
    const user = req.user;
    if (user.role === "not-validated") return forbidden(res);

    const where = {};
    if (isAdmin(user)) {
      if (str(req.query.department)) where.department = str(req.query.department);
    } else {
      where.department = user.department;
    }
    if (req.query.includeArchived !== "true") where.active = true;

    const templates = await ProcessTemplate.findAll({
      where,
      include: [{ model: ProcessTemplateStep, as: "steps" }],
      order: [["department", "ASC"], ["name", "ASC"]],
    });

    const countRows = await ProcessInstance.findAll({
      attributes: ["templateId", "status", [fn("COUNT", col("id")), "total"]],
      where: { templateId: { [Op.in]: templates.map((t) => t.id) } },
      group: ["templateId", "status"],
      raw: true,
    });
    const countsByTemplate = {};
    for (const row of countRows) {
      (countsByTemplate[row.templateId] ||= {})[row.status] = Number(row.total);
    }

    return res.json({
      templates: templates.map((t) => serializeTemplate(t, countsByTemplate[t.id])),
    });
  } catch (err) {
    return handleError(res, err, "listTemplates");
  }
};

const loadTemplate = (id) =>
  ProcessTemplate.findByPk(id, { include: [{ model: ProcessTemplateStep, as: "steps" }] });

exports.createTemplate = async (req, res) => {
  try {
    const user = req.user;
    const name = str(req.body.name);
    if (!name) return res.status(400).json({ message: "Informe o nome do padrão." });

    const department = isAdmin(user) ? str(req.body.department) : user.department;
    if (!department) return res.status(400).json({ message: "Informe o departamento." });
    if (!canAccessDept(user, department)) return forbidden(res);

    const { steps, error } = parseSteps(req.body.steps || []);
    if (error) return res.status(400).json({ message: error });

    const created = await sequelize.transaction(async (t) => {
      const template = await ProcessTemplate.create(
        {
          name,
          description: str(req.body.description) || null,
          department,
          createdById: user.id,
        },
        { transaction: t },
      );
      await ProcessTemplateStep.bulkCreate(
        steps.map((s, i) => ({
          templateId: template.id,
          position: i + 1,
          title: s.title,
          description: s.description,
          responsible: s.responsible,
          checklist: normalizeTemplateChecklist(s.checklist),
        })),
        { transaction: t },
      );
      return template;
    });

    return res.status(201).json({ template: serializeTemplate(await loadTemplate(created.id)) });
  } catch (err) {
    return handleError(res, err, "createTemplate");
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const user = req.user;
    const template = await loadTemplate(req.params.id);
    if (!template) return res.status(404).json({ message: "Padrão não encontrado." });
    if (!canAccessDept(user, template.department)) return forbidden(res);

    const updates = {};
    if (req.body.name !== undefined) {
      const name = str(req.body.name);
      if (!name) return res.status(400).json({ message: "Informe o nome do padrão." });
      updates.name = name;
    }
    if (req.body.description !== undefined) updates.description = str(req.body.description) || null;
    if (req.body.active !== undefined) updates.active = !!req.body.active;
    // Apenas admin move um padrão de departamento
    if (req.body.department !== undefined && isAdmin(user)) {
      const department = str(req.body.department);
      if (!department) return res.status(400).json({ message: "Informe o departamento." });
      updates.department = department;
    }

    let steps = null;
    if (req.body.steps !== undefined) {
      const parsed = parseSteps(req.body.steps);
      if (parsed.error) return res.status(400).json({ message: parsed.error });
      steps = parsed.steps;
    }

    await sequelize.transaction(async (t) => {
      await template.update(updates, { transaction: t });
      if (steps) {
        await ProcessTemplateStep.destroy({ where: { templateId: template.id }, transaction: t });
        await ProcessTemplateStep.bulkCreate(
          steps.map((s, i) => ({
            templateId: template.id,
            position: i + 1,
            title: s.title,
            description: s.description,
            responsible: s.responsible,
            checklist: normalizeTemplateChecklist(s.checklist),
          })),
          { transaction: t },
        );
      }
    });

    return res.json({ template: serializeTemplate(await loadTemplate(template.id)) });
  } catch (err) {
    return handleError(res, err, "updateTemplate");
  }
};

// Padrões do sistema ou com processos iniciados são arquivados; os demais são excluídos.
exports.deleteTemplate = async (req, res) => {
  try {
    const template = await ProcessTemplate.findByPk(req.params.id);
    if (!template) return res.status(404).json({ message: "Padrão não encontrado." });
    if (!canAccessDept(req.user, template.department)) return forbidden(res);

    const instances = await ProcessInstance.count({ where: { templateId: template.id } });
    if (template.seedKey || instances > 0) {
      await template.update({ active: false });
      return res.json({ archived: true, message: "Padrão arquivado." });
    }
    await template.destroy();
    return res.json({ archived: false, message: "Padrão excluído." });
  } catch (err) {
    return handleError(res, err, "deleteTemplate");
  }
};

// ── Processos (instâncias) ────────────────────────────────────────────────────

exports.listInstances = async (req, res) => {
  try {
    const user = req.user;
    if (user.role === "not-validated") return forbidden(res);

    const where = {};
    if (isAdmin(user)) {
      if (str(req.query.department)) where.department = str(req.query.department);
    } else {
      where.department = user.department;
    }
    if (req.query.templateId) where.templateId = Number(req.query.templateId);
    if (STATUSES.includes(req.query.status)) where.status = req.query.status;
    const q = str(req.query.q);
    if (q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { clientName: { [Op.like]: `%${q}%` } },
        { clientDoc: { [Op.like]: `%${q}%` } },
      ];
    }

    const instances = await ProcessInstance.findAll({
      where,
      include: instanceIncludeList(),
      order: [["updatedAt", "DESC"]],
    });

    return res.json({ instances: instances.map((i) => serializeInstance(i)) });
  } catch (err) {
    return handleError(res, err, "listInstances");
  }
};

exports.getInstance = async (req, res) => {
  try {
    const inst = await getAuthorizedInstance(req, res);
    if (!inst) return;
    return res.json({ instance: serializeInstance(inst, { full: true }) });
  } catch (err) {
    return handleError(res, err, "getInstance");
  }
};

exports.createInstance = async (req, res) => {
  try {
    const user = req.user;
    const template = await loadTemplate(req.body.templateId);
    if (!template) return res.status(404).json({ message: "Padrão não encontrado." });
    if (!canAccessDept(user, template.department)) return forbidden(res);
    if (!template.active) {
      return res.status(409).json({ message: "Este padrão está arquivado." });
    }

    const name = str(req.body.name);
    if (!name) return res.status(400).json({ message: "Informe um nome para identificar o processo." });

    const responsibleUserId = req.body.responsibleUserId ? Number(req.body.responsibleUserId) : null;

    const created = await sequelize.transaction(async (t) => {
      const inst = await ProcessInstance.create(
        {
          templateId: template.id,
          templateName: template.name,
          department: template.department,
          name,
          clientName: str(req.body.clientName) || null,
          clientDoc: str(req.body.clientDoc) || null,
          notes: str(req.body.notes) || null,
          dueDate: req.body.dueDate || null,
          responsibleUserId,
          createdById: user.id,
        },
        { transaction: t },
      );
      await ProcessInstanceStep.bulkCreate(
        sortSteps(template.steps).map((s, i) => ({
          instanceId: inst.id,
          position: i + 1,
          title: s.title,
          description: s.description,
          responsible: s.responsible,
          checklist: normalizeInstanceChecklist(s.checklist),
        })),
        { transaction: t },
      );
      await logEvent(inst.id, user.id, "started", `Processo iniciado a partir de "${template.name}".`, null, t);
      return inst;
    });

    return respondInstance(res, created.id, 201);
  } catch (err) {
    return handleError(res, err, "createInstance");
  }
};

exports.updateInstance = async (req, res) => {
  try {
    const inst = await getAuthorizedInstance(req, res);
    if (!inst) return;

    const updates = {};
    if (req.body.name !== undefined) {
      const name = str(req.body.name);
      if (!name) return res.status(400).json({ message: "Informe um nome para o processo." });
      updates.name = name;
    }
    if (req.body.clientName !== undefined) updates.clientName = str(req.body.clientName) || null;
    if (req.body.clientDoc !== undefined) updates.clientDoc = str(req.body.clientDoc) || null;
    if (req.body.notes !== undefined) updates.notes = str(req.body.notes) || null;
    if (req.body.dueDate !== undefined) updates.dueDate = req.body.dueDate || null;
    if (req.body.responsibleUserId !== undefined) {
      updates.responsibleUserId = req.body.responsibleUserId ? Number(req.body.responsibleUserId) : null;
    }

    await sequelize.transaction(async (t) => {
      await inst.update(updates, { transaction: t });
      await logEvent(inst.id, req.user.id, "edited", "Dados do processo editados.", null, t);
    });
    return respondInstance(res, inst.id);
  } catch (err) {
    return handleError(res, err, "updateInstance");
  }
};

exports.deleteInstance = async (req, res) => {
  try {
    const inst = await getAuthorizedInstance(req, res);
    if (!inst) return;
    await inst.destroy();
    return res.json({ message: "Processo excluído." });
  } catch (err) {
    return handleError(res, err, "deleteInstance");
  }
};

// Substitui/reordena os passos de um processo, preservando o andamento dos passos existentes.
exports.replaceInstanceSteps = async (req, res) => {
  try {
    const inst = await getAuthorizedInstance(req, res);
    if (!inst) return;

    const { steps, error } = parseSteps(req.body.steps);
    if (error) return res.status(400).json({ message: error });

    const existing = new Map(inst.steps.map((s) => [s.id, s]));
    const keepIds = new Set();

    await sequelize.transaction(async (t) => {
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        const current = s.id ? existing.get(Number(s.id)) : null;
        const checklist = normalizeInstanceChecklist(s.checklist);
        if (current) {
          keepIds.add(current.id);
          await current.update(
            {
              position: i + 1,
              title: s.title,
              description: s.description,
              responsible: s.responsible,
              checklist,
            },
            { transaction: t },
          );
        } else {
          await ProcessInstanceStep.create(
            {
              instanceId: inst.id,
              position: i + 1,
              title: s.title,
              description: s.description,
              responsible: s.responsible,
              checklist,
            },
            { transaction: t },
          );
        }
      }
      const removeIds = inst.steps.filter((s) => !keepIds.has(s.id)).map((s) => s.id);
      if (removeIds.length) {
        await ProcessInstanceStep.destroy({ where: { id: removeIds }, transaction: t });
      }
      await logEvent(inst.id, req.user.id, "steps_edited", "Passos do processo editados.", null, t);
      await syncCompletion(inst.id, t);
    });

    return respondInstance(res, inst.id);
  } catch (err) {
    return handleError(res, err, "replaceInstanceSteps");
  }
};

// ── Ações sobre passos ────────────────────────────────────────────────────────

const getStep = (inst, stepId) => inst.steps.find((s) => s.id === Number(stepId));

exports.updateStep = async (req, res) => {
  try {
    const inst = await getAuthorizedInstance(req, res);
    if (!inst) return;
    const step = getStep(inst, req.params.stepId);
    if (!step) return res.status(404).json({ message: "Passo não encontrado." });

    const updates = {};
    if (req.body.title !== undefined) {
      const title = str(req.body.title);
      if (!title) return res.status(400).json({ message: "O passo precisa de um título." });
      updates.title = title;
    }
    if (req.body.description !== undefined) updates.description = str(req.body.description) || null;
    if (req.body.responsible !== undefined) updates.responsible = normalizeResponsible(req.body.responsible);
    if (req.body.note !== undefined) updates.note = str(req.body.note) || null;
    if (req.body.checklist !== undefined) updates.checklist = normalizeInstanceChecklist(req.body.checklist);

    await step.update(updates);
    await ProcessInstance.update({ updatedAt: new Date() }, { where: { id: inst.id } });
    return respondInstance(res, inst.id);
  } catch (err) {
    return handleError(res, err, "updateStep");
  }
};

exports.completeStep = async (req, res) => {
  try {
    const inst = await getAuthorizedInstance(req, res);
    if (!inst) return;
    const step = getStep(inst, req.params.stepId);
    if (!step) return res.status(404).json({ message: "Passo não encontrado." });

    if (inst.status === "paused") {
      return res.status(409).json({ message: "O processo está pausado. Retome-o para concluir passos." });
    }
    if (inst.status === "canceled") {
      return res.status(409).json({ message: "O processo está cancelado." });
    }
    if (step.status !== "pending") {
      return res.status(409).json({ message: "Este passo já foi finalizado." });
    }

    const openItems = (step.checklist || []).filter((c) => !c.done).length;
    if (openItems > 0 && !req.body.force) {
      return res.status(409).json({
        code: "CHECKLIST_INCOMPLETE",
        message: `Há ${openItems} item(ns) do checklist pendente(s).`,
      });
    }

    await sequelize.transaction(async (t) => {
      await step.update(
        {
          status: "done",
          completedAt: new Date(),
          completedById: req.user.id,
          note: req.body.note !== undefined ? str(req.body.note) || null : step.note,
        },
        { transaction: t },
      );
      await logEvent(
        inst.id,
        req.user.id,
        "step_completed",
        `Passo concluído: ${step.title}`,
        { stepId: step.id, forced: openItems > 0 },
        t,
      );
      await syncCompletion(inst.id, t);
    });
    return respondInstance(res, inst.id);
  } catch (err) {
    return handleError(res, err, "completeStep");
  }
};

exports.skipStep = async (req, res) => {
  try {
    const inst = await getAuthorizedInstance(req, res);
    if (!inst) return;
    const step = getStep(inst, req.params.stepId);
    if (!step) return res.status(404).json({ message: "Passo não encontrado." });
    if (["paused", "canceled"].includes(inst.status)) {
      return res.status(409).json({ message: "Processo pausado ou cancelado." });
    }
    if (step.status !== "pending") {
      return res.status(409).json({ message: "Este passo já foi finalizado." });
    }

    await sequelize.transaction(async (t) => {
      await step.update(
        {
          status: "skipped",
          completedAt: new Date(),
          completedById: req.user.id,
          note: req.body.note !== undefined ? str(req.body.note) || null : step.note,
        },
        { transaction: t },
      );
      await logEvent(inst.id, req.user.id, "step_skipped", `Passo dispensado: ${step.title}`, { stepId: step.id }, t);
      await syncCompletion(inst.id, t);
    });
    return respondInstance(res, inst.id);
  } catch (err) {
    return handleError(res, err, "skipStep");
  }
};

exports.reopenStep = async (req, res) => {
  try {
    const inst = await getAuthorizedInstance(req, res);
    if (!inst) return;
    const step = getStep(inst, req.params.stepId);
    if (!step) return res.status(404).json({ message: "Passo não encontrado." });
    if (inst.status === "canceled") {
      return res.status(409).json({ message: "O processo está cancelado." });
    }
    if (step.status === "pending") {
      return res.status(409).json({ message: "Este passo já está pendente." });
    }

    await sequelize.transaction(async (t) => {
      await step.update(
        { status: "pending", completedAt: null, completedById: null },
        { transaction: t },
      );
      await logEvent(inst.id, req.user.id, "step_reopened", `Passo reaberto: ${step.title}`, { stepId: step.id }, t);
      await syncCompletion(inst.id, t);
    });
    return respondInstance(res, inst.id);
  } catch (err) {
    return handleError(res, err, "reopenStep");
  }
};

// ── Pausa / retomada / cancelamento ──────────────────────────────────────────

exports.pauseInstance = async (req, res) => {
  try {
    const inst = await getAuthorizedInstance(req, res);
    if (!inst) return;
    if (inst.status !== "in_progress") {
      return res.status(409).json({ message: "Só é possível pausar um processo em andamento." });
    }
    const reason = str(req.body.reason);
    const origin = req.body.origin;
    if (!reason) return res.status(400).json({ message: "Informe o motivo da pausa." });
    if (!RESPONSIBLES.includes(origin)) {
      return res.status(400).json({ message: "Informe se o motivo é do escritório ou do cliente." });
    }

    await sequelize.transaction(async (t) => {
      await inst.update(
        { status: "paused", pauseReason: reason, pauseOrigin: origin, pausedAt: new Date() },
        { transaction: t },
      );
      const current = sortSteps(inst.steps).find((s) => s.status === "pending");
      await logEvent(
        inst.id,
        req.user.id,
        "paused",
        reason,
        { origin, stepId: current?.id || null, stepTitle: current?.title || null },
        t,
      );
    });
    return respondInstance(res, inst.id);
  } catch (err) {
    return handleError(res, err, "pauseInstance");
  }
};

exports.resumeInstance = async (req, res) => {
  try {
    const inst = await getAuthorizedInstance(req, res);
    if (!inst) return;
    if (!["paused", "canceled"].includes(inst.status)) {
      return res.status(409).json({ message: "O processo não está pausado nem cancelado." });
    }

    const wasCanceled = inst.status === "canceled";
    await sequelize.transaction(async (t) => {
      await inst.update(
        { status: "in_progress", pauseReason: null, pauseOrigin: null, pausedAt: null },
        { transaction: t },
      );
      await logEvent(
        inst.id,
        req.user.id,
        wasCanceled ? "reactivated" : "resumed",
        str(req.body.note) || (wasCanceled ? "Processo reativado." : "Processo retomado."),
        null,
        t,
      );
      await syncCompletion(inst.id, t);
    });
    return respondInstance(res, inst.id);
  } catch (err) {
    return handleError(res, err, "resumeInstance");
  }
};

exports.cancelInstance = async (req, res) => {
  try {
    const inst = await getAuthorizedInstance(req, res);
    if (!inst) return;
    if (!["in_progress", "paused"].includes(inst.status)) {
      return res.status(409).json({ message: "Este processo não pode ser cancelado." });
    }
    const reason = str(req.body.reason);
    if (!reason) return res.status(400).json({ message: "Informe o motivo do cancelamento." });

    await sequelize.transaction(async (t) => {
      await inst.update(
        { status: "canceled", pauseReason: null, pauseOrigin: null, pausedAt: null },
        { transaction: t },
      );
      await logEvent(inst.id, req.user.id, "canceled", reason, null, t);
    });
    return respondInstance(res, inst.id);
  } catch (err) {
    return handleError(res, err, "cancelInstance");
  }
};

exports.addNote = async (req, res) => {
  try {
    const inst = await getAuthorizedInstance(req, res);
    if (!inst) return;
    const message = str(req.body.message);
    if (!message) return res.status(400).json({ message: "Escreva a anotação." });
    await logEvent(inst.id, req.user.id, "note", message);
    return respondInstance(res, inst.id, 201);
  } catch (err) {
    return handleError(res, err, "addNote");
  }
};

// Usuários do departamento (para escolher o responsável do processo)
exports.listDepartmentUsers = async (req, res) => {
  try {
    const user = req.user;
    const department = isAdmin(user) ? str(req.query.department) : user.department;
    if (!department) return res.json({ users: [] });
    if (!canAccessDept(user, department)) return forbidden(res);
    const users = await User.findAll({
      where: { department, role: { [Op.ne]: "not-validated" } },
      attributes: ["id", "name"],
      order: [["name", "ASC"]],
    });
    return res.json({ users });
  } catch (err) {
    return handleError(res, err, "listDepartmentUsers");
  }
};

exports.PROCESS_DEPARTMENTS = PROCESS_DEPARTMENTS;

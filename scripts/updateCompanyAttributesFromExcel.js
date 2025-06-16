// scripts/updateCompanyAttributesFromExcel.js
require('dotenv').config();                // carrega variáveis .env
const path     = require('path');
const xlsx     = require('xlsx');
const winston  = require('winston');
require('winston-daily-rotate-file');

const sequelize = require('../db/conn');   // usa a mesma instância já configurada
const Company   = require('../models/Company');

// ---------- Logger (mesma “cara” do restante do projeto) -------------
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const colors = { error: 'red', warn: 'yellow', info: 'green', debug: 'white' };
winston.addColors(colors);

const formatLog = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message }) =>
    `${timestamp} [${level.toUpperCase()}]: ${message}`),
);

const log = winston.createLogger({
  levels,
  format: formatLog,
  transports: [
    new winston.transports.Console({ level: 'info', format: winston.format.combine(winston.format.colorize(), formatLog) }),
    new winston.transports.DailyRotateFile({
      level: 'info',
      filename: 'logs/update-companies-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '10m',
      maxFiles: '14d',
    }),
  ],
});
// ---------------------------------------------------------------------

/**
 * Converte valores vindos do Excel para boolean / number quando útil.
 * Boas heurísticas para os tipos usados no teu modelo (pode ajustar se quiser).
 */
function normalizeValue(attr, val) {
  if (val === null || val === undefined || val === '') return null;

  // Booleans tratados como 1/0, TRUE/FALSE, Sim/Não, etc.
  if (['boolean'].includes(typeof val) ||
      (typeof val === 'number' && (val === 0 || val === 1))) {
    return Boolean(val);
  }
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    if (['1', 'true', 'sim', 'yes'].includes(s))  return true;
    if (['0', 'false', 'nao', 'não', 'no'].includes(s)) return false;
    // números?
    if (!Number.isNaN(Number(s))) return Number(s);
  }
  return val;  // string original
}

/**
 * Lê o arquivo XLSX e devolve um array de objetos: { id: 1, attr1: <valor>, ... }
 */
function loadRows(excelPath) {
  const wb = xlsx.readFile(excelPath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });  // mantém células vazias como null
  if (!rows.length) throw new Error('Nenhuma linha encontrada na planilha.');
  if (!('id' in rows[0])) throw new Error("Cabeçalho deve conter a coluna 'id'.");
  return rows;
}

async function run(excelPath) {
  await sequelize.authenticate();
  log.info('Conectado ao banco.');

  const rows = loadRows(excelPath);
  log.info(`Linhas lidas: ${rows.length}`);

  let updated = 0, skipped = 0, erros = 0;

  for (const row of rows) {
    const { id, ...attrs } = row;
    if (!id) { log.warn('Linha ignorada (id ausente).'); skipped++; continue; }

    // remove atributos vazios e normaliza valores
    Object.keys(attrs).forEach((attr) => {
      attrs[attr] = normalizeValue(attr, attrs[attr]);
      if (attrs[attr] === null) delete attrs[attr];
    });

    if (!Object.keys(attrs).length) { skipped++; continue; }

    try {
      const [count] = await Company.update(attrs, { where: { id } });
      if (count) { updated++; log.info(`Empresa ID ${id} atualizada => ${JSON.stringify(attrs)}`); }
      else { skipped++; log.warn(`Empresa ID ${id} não encontrada.`); }
    } catch (err) {
      erros++;
      log.error(`Erro ao atualizar empresa ID ${id}: ${err.message}`);
    }
  }

  log.info(`Processo concluído. Atualizadas: ${updated}, Puladas: ${skipped}, Erros: ${erros}`);
  await sequelize.close();
}

// ---------- Execução direta pela CLI ----------
if (require.main === module) {
  const excel = process.argv[2] || path.join(__dirname, '..', 'zeradas.xlsx');
  run(excel).catch((err) => { log.error(`Falha inesperada: ${err.message}`); process.exit(1); });
}

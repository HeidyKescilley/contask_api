// /utils/businessDays.js
// Utilitário para cálculo de dias úteis com integração de feriados nacionais (BrasilAPI)

const https = require("https");

// Cache em memória: { "2025": Set<"2025-01-01", ...> }
const holidayCache = {};

/**
 * Busca feriados nacionais de um ano via BrasilAPI
 * @param {number} year
 * @returns {Promise<Set<string>>} Set de datas no formato "YYYY-MM-DD"
 */
async function getHolidays(year) {
  if (holidayCache[year]) return holidayCache[year];

  return new Promise((resolve) => {
    const url = `https://brasilapi.com.br/api/feriados/v1/${year}`;
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const holidays = JSON.parse(data);
            const dateSet = new Set(holidays.map((h) => h.date));
            holidayCache[year] = dateSet;
            resolve(dateSet);
          } catch {
            // Falha silenciosa: usa apenas finais de semana
            holidayCache[year] = new Set();
            resolve(new Set());
          }
        });
      })
      .on("error", () => {
        holidayCache[year] = new Set();
        resolve(new Set());
      });
  });
}

/**
 * Verifica se uma data é dia útil (não é fim de semana nem feriado)
 * @param {Date} date
 * @param {Set<string>} holidays
 * @returns {boolean}
 */
function isBusinessDay(date, holidays) {
  const day = date.getDay(); // 0 = domingo, 6 = sábado
  if (day === 0 || day === 6) return false;
  const iso = date.toISOString().slice(0, 10);
  return !holidays.has(iso);
}

/**
 * Adiciona N dias úteis a uma data
 * @param {Date} startDate
 * @param {number} n
 * @param {Set<string>} holidays
 * @returns {Date}
 */
function addBusinessDays(startDate, n, holidays) {
  let count = 0;
  let current = new Date(startDate);
  while (count < n) {
    current.setDate(current.getDate() + 1);
    if (isBusinessDay(current, holidays)) count++;
  }
  return current;
}

/**
 * Retorna o último dia útil de um dado mês/ano.
 * @param {number} year
 * @param {number} month - 0-indexed (0=Jan, 11=Dec)
 * @param {Set<string>} holidays
 * @returns {Date}
 */
function getLastBusinessDay(year, month, holidays) {
  // Último dia do mês: dia 0 do mês seguinte
  let current = new Date(year, month + 1, 0);
  while (!isBusinessDay(current, holidays)) {
    current.setDate(current.getDate() - 1);
  }
  return current;
}

/**
 * Calcula a data limite de uma obrigação para um período.
 * @param {object} obligation - { deadline, deadlineType, periodicity, deadlineMonth }
 * @param {string} period - "YYYY-MM" | "YYYY-MM-1" | "YYYY-MM-2" | "YYYY"
 * @returns {Promise<Date>}
 */
async function getDeadlineDate(obligation, period) {
  const { deadline, deadlineType, periodicity, deadlineMonth } = obligation;

  let referenceDate;

  if (periodicity === "annual") {
    // Usa deadlineMonth se definido, senão janeiro
    const month = deadlineMonth ? String(deadlineMonth).padStart(2, "0") : "01";
    referenceDate = new Date(`${period}-${month}-01`);
  } else if (periodicity === "biweekly") {
    // Período "YYYY-MM-1" ou "YYYY-MM-2"
    const parts = period.split("-");
    const half = parts[parts.length - 1];
    const monthPart = parts.slice(0, 2).join("-");
    if (half === "1") {
      referenceDate = new Date(`${monthPart}-01`);
    } else {
      referenceDate = new Date(`${monthPart}-16`);
    }
  } else {
    // Monthly: "YYYY-MM"
    referenceDate = new Date(`${period}-01`);
  }

  if (deadlineType === "last_business_day") {
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const holidays = await getHolidays(year);
    return getLastBusinessDay(year, month, holidays);
  } else if (deadlineType === "calendar_day") {
    // Dia fixo do mês
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    return new Date(year, month, deadline);
  } else {
    // Dias úteis a partir do início do período
    const year = referenceDate.getFullYear();
    const holidays = await getHolidays(year);
    return addBusinessDays(referenceDate, deadline, holidays);
  }
}

/**
 * Retorna o período atual no formato correto para uma obrigação.
 * @param {object} obligation - { periodicity }
 * @param {Date} [date] - data de referência (padrão: hoje)
 * @returns {string}
 */
function getCurrentPeriod(obligation, date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = date.getDate();

  if (obligation.periodicity === "annual") return `${year}`;
  if (obligation.periodicity === "biweekly") {
    const half = day <= 15 ? "1" : "2";
    return `${year}-${month}-${half}`;
  }
  return `${year}-${month}`;
}

/**
 * Formata data limite para exibição (DD/MM/YYYY)
 * @param {Date} date
 * @returns {string}
 */
function formatDeadline(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

module.exports = {
  getHolidays,
  isBusinessDay,
  addBusinessDays,
  getLastBusinessDay,
  getDeadlineDate,
  getCurrentPeriod,
  formatDeadline,
};

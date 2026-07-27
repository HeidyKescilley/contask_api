// /utils/nextRun.js
// Calcula a próxima data/hora (America/Sao_Paulo) em que uma EmailDispatch
// automática deve rodar, a partir das colunas scheduleFrequency/scheduleDayOfWeek/
// scheduleDayOfMonth/scheduleMonth/scheduleHour/scheduleMinute.
const { getDaysInMonth, isAfter } = require("date-fns");

function atTime(date, hour, minute) {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function monthlyCandidate(year, monthIndex, dayOfMonth, hour, minute) {
  const daysInTarget = getDaysInMonth(new Date(year, monthIndex, 1));
  const clampedDay = Math.min(dayOfMonth, daysInTarget);
  return atTime(new Date(year, monthIndex, clampedDay), hour, minute);
}

function computeNextRun(dispatch, fromDate = new Date()) {
  const { scheduleFrequency, scheduleDayOfWeek, scheduleDayOfMonth, scheduleMonth } = dispatch;
  const hour = dispatch.scheduleHour ?? 0;
  const minute = dispatch.scheduleMinute ?? 0;

  if (scheduleFrequency === "weekly") {
    let candidate = atTime(fromDate, hour, minute);
    const diff = (scheduleDayOfWeek - candidate.getDay() + 7) % 7;
    candidate.setDate(candidate.getDate() + diff);
    if (!isAfter(candidate, fromDate)) {
      candidate.setDate(candidate.getDate() + 7);
    }
    return candidate;
  }

  if (scheduleFrequency === "monthly") {
    let candidate = monthlyCandidate(fromDate.getFullYear(), fromDate.getMonth(), scheduleDayOfMonth, hour, minute);
    if (!isAfter(candidate, fromDate)) {
      const nextMonthDate = new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 1);
      candidate = monthlyCandidate(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), scheduleDayOfMonth, hour, minute);
    }
    return candidate;
  }

  if (scheduleFrequency === "yearly") {
    const monthIndex = (scheduleMonth ?? 1) - 1;
    let candidate = monthlyCandidate(fromDate.getFullYear(), monthIndex, scheduleDayOfMonth, hour, minute);
    if (!isAfter(candidate, fromDate)) {
      candidate = monthlyCandidate(fromDate.getFullYear() + 1, monthIndex, scheduleDayOfMonth, hour, minute);
    }
    return candidate;
  }

  return null;
}

module.exports = { computeNextRun };

// D:\projetos\contask_v2\contask_api\helpers\format-date.js
function formatDate(dateInput) {
  const date = new Date(dateInput);
  if (isNaN(date)) return "";

  // Ajusta a data para neutralizar o efeito do fuso horário
  date.setMinutes(date.getMinutes() + date.getTimezoneOffset());

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

module.exports = formatDate;

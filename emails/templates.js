// /emails/templates.js
const fs = require("fs");
const path = require("path");
const Handlebars = require("handlebars");

// Função auxiliar para carregar e compilar o template
function loadTemplate(templateName) {
  const templatePath = path.join(
    __dirname,
    "emailTemplates",
    `${templateName}.html`
  );
  const templateContent = fs.readFileSync(templatePath, "utf-8");
  return Handlebars.compile(templateContent);
}

const activeTemplate = loadTemplate("activeEmail");
const closedTemplate = loadTemplate("closedEmail");
const terminatedTemplate = loadTemplate("terminatedEmail");
const suspendedTemplate = loadTemplate("suspendedEmail");
const newCompanyTemplate = loadTemplate("newCompany");

module.exports = {
  activeTemplate,
  closedTemplate,
  terminatedTemplate,
  suspendedTemplate,
  newCompanyTemplate,
};

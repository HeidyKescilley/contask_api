// /emails/templates.js
const Handlebars = require("handlebars");

const templateSource = `
  <p>O novo status da empresa <strong>{{companyName}}</strong> é <strong>{{newStatus}}</strong>.</p>
`;

const templateSuspensio = `
  <p><strong>{{companyName}}</strong> suspenso.</p>
`;

const template = Handlebars.compile(templateSource);

const suspesionTemplate = Handlebars.compile(templateSuspensio);

module.exports = {
  template,
  suspesionTemplate,
};

// /emails/templates.js
const Handlebars = require("handlebars");

const templateSource = `
  <p>O novo status da empresa <strong>{{companyName}}</strong> é <strong>{{newStatus}}</strong>.</p>
`;

const emailSuspensio = `
  <p><strong>{{companyName}}</strong> suspenso.</p>
`;

const emailNewCompany = `
  <p><strong>{{companyName}}</strong> nova empresa.</p>
`;

const template = Handlebars.compile(templateSource);

const suspesionTemplate = Handlebars.compile(emailSuspensio);

const templateNewCompany = Handlebars.compile(emailNewCompany);

module.exports = {
  template,
  suspesionTemplate,
  templateNewCompany,
};

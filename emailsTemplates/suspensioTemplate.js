// /emailsTemplates/suspensionTemplate.js
const Handlebars = require("handlebars");

const templateSource = `
  <p>O novo status da empresa <strong>{{companyName}}</strong> é <strong>{{newStatus}}</strong>.</p>
`;

const template = Handlebars.compile(templateSource);

module.exports = template;

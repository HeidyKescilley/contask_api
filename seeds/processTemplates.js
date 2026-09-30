// Padrões de processo do Manual de Procedimentos – Dep. Administrativo.
// responsible: "office" = responsabilidade do escritório | "client" = aguarda ação do cliente
const O = "office";
const C = "client";

const step = (title, responsible, checklist = [], description = null) => ({
  title,
  responsible,
  checklist,
  description,
});

const DEPT = "Administrativo";

const PROCESS_TEMPLATES = [
  {
    seedKey: "abertura-jcdf",
    name: "Abertura de Empresa – JCDF (Sociedade Mercantil / Requerimento de Empresário)",
    department: DEPT,
    description:
      "Observações do manual: se o CPF ou outro documento do cliente contiver erro (nome), consultar o cliente antes de realizar qualquer serviço. O capital da empresa deve ser acordado entre os sócios e registrado na O.S. Se houver profissional liberal na sociedade, enviar o contrato ao Conselho responsável para vistoria antes de enviá-lo ao cliente.",
    steps: [
      step(
        "Combinar condições e valor do serviço",
        O,
        [
          "Nome empresarial",
          "Nome fantasia",
          "Capital social",
          "Administrador",
          "Endereço da empresa",
          "Empresa Normal ou Simples Nacional (se Simples: nº do recibo do IRPF do sócio administrador ou nº do título de eleitor)",
        ],
        "Verificar condições e valor acertado para o serviço.",
      ),
      step("Abrir pasta de processo e cadastrar na planilha controle", O),
      step("Consultas prévias", O, [
        "Consulta prévia de nome (JCDF)",
        "Consulta prévia de endereço e atividade (Administração Regional)",
        "Consulta de débitos em nome dos sócios",
        "Consulta no INPI (se o cliente for registrar o nome)",
      ]),
      step("Solicitar documentos ao cliente", C, [
        "3 cópias autenticadas do RG, CPF ou CNH (se CNH, perguntar o local de nascimento do sócio)",
        "3 cópias do comprovante de residência de todos os sócios",
        "2 cópias do IPTU do imóvel",
        "3 cópias autenticadas do contrato de locação, com firma reconhecida (locador/locatário)",
      ]),
      step("Emitir recibo dos 50% iniciais da cobrança", O),
      step("Elaborar contrato social e documentos de apoio", O, [
        "Redigir contrato (nome, atividade, capital, %, administrador etc.)",
        "Declaração de enquadramento (se ME ou EPP)",
        "Capa da Junta Comercial",
        "FAC (preencher diretamente no site do GDF)",
        "Etiqueta do contador (CRC)",
        "Declaração de responsabilidade contábil",
      ]),
      step("Enviar recibo e colher assinaturas", C, [
        "Assinatura dos sócios",
        "Assinatura das testemunhas",
        "Assinatura do advogado (se não for ME ou EPP)",
      ]),
      step("Junta Comercial – DF e CF/DF – Sec. Fazenda", O, [
        "Contrato social assinado e com firma reconhecida em cartório (sócios/advogado) – 4 vias",
        "Declaração de porte da empresa em 4 vias (se ME ou EPP)",
        "Capa da JCDF preenchida e assinada",
        "Taxa – DARF de constituição conforme tabela (código 6621)",
        "FCN 1 e 2 preenchidas",
        "2 cópias autenticadas do RG, CPF e comprovante de residência de todos os sócios",
        "FAC preenchida e assinada, com etiqueta do contador",
        "1 cópia comum da consulta prévia de endereço e atividade e da consulta prévia de nome na JCDF",
      ]),
      step("Receita Federal – CNPJ", O, [
        "FCPJ e QSA preenchidos, gerar arquivo e enviar pela internet",
        "Recibo de identificação",
        "DBE assinado e com firma reconhecida",
        "1 cópia autenticada do contrato social (dispensável se junto com a constituição)",
        "Envelope com DBE e cópia autenticada do contrato social entregue na SRF (dispensável com o convênio da JCDF)",
      ]),
      step(
        "GDF – CF/DF",
        O,
        ["Protocolo do GDF fornecido pela JCDF", "CNPJ", "Retirada do CF/DF"],
        "Dispensável se usado o convênio com a Junta Comercial.",
      ),
      step("Verificar pagamento da 1ª parcela do serviço", C),
      step("Administração / Alvará", O, [
        "Cadastrar TFLI para alvará (paga pelo cliente) / requerimento do alvará (microempresas não pagam TFLI)",
        "1 cópia do contrato de locação autenticada ou acompanhada do original",
        "1 cópia do CNPJ",
        "1 cópia da DIF",
        "1 cópia do contrato social autenticada ou acompanhada do original",
        "1 cópia da declaração de microempresa (se for) autenticada ou acompanhada do original",
        "Declaração da Administração Regional: requerimento de alvará",
        "Declaração da Administração Regional: declaração de risco",
        "Declaração da Administração Regional: declaração de imóvel desocupado",
        "Declaração da Administração Regional: declaração de metragem",
        "Declaração da Administração Regional: declaração de metragem para TFLI (microempresas não pagam)",
      ]),
      step("Licença de funcionamento / Saúde", O, [
        "Emitir taxa para licença de funcionamento (DAR)",
        "Enviar alvará, contrato social registrado, inscrição estadual e CNPJ",
        "Orientar o cliente para entrada do processo na Inspetoria de Saúde",
      ]),
      step("Emitir recibo dos 50% finais da cobrança", O),
    ],
  },
  {
    seedKey: "abertura-cartorio",
    name: "Abertura de Empresa – Cartório",
    department: DEPT,
    description:
      "Mesmas observações da abertura via JCDF: conferir documentos do cliente antes de iniciar, registrar o capital na O.S. e, havendo profissional liberal, enviar o contrato ao Conselho responsável.",
    steps: [
      step("Combinar condições e valor do serviço", O),
      step("Abrir pasta de processo e cadastrar na planilha controle", O),
      step("Consulta prévia de endereço e atividade (Administração Regional)", O),
      step("Solicitar documentos ao cliente", C, [
        "3 cópias autenticadas do RG e CPF",
        "3 cópias do comprovante de residência de todos os sócios",
        "2 cópias autenticadas do IPTU do imóvel (exercício anterior)",
        "3 cópias autenticadas do contrato de locação, com firma reconhecida (locador/locatário)",
      ]),
      step("Emitir recibo dos 50% iniciais da cobrança", O),
      step("Elaborar e enviar contrato de prestação de serviços (agenda)", O),
      step("Cartório", O, [
        "Contrato social assinado (sócios/advogado) – 4 vias",
        "Requerimento do cartório",
        "Taxa – DARF de constituição conforme tabela",
      ]),
      step("Receita Federal", O, [
        "FCPJ e QSA preenchidos, gerar arquivo",
        "Recibo de identificação",
        "DBE assinado e com firma reconhecida",
        "1 cópia autenticada do contrato social",
        "Envelope com DBE e cópia autenticada do contrato social entregue na SRF",
      ]),
      step("GDF – protocolo", O, [
        "2 cópias autenticadas do RG, CPF e comprovante de residência de todos os sócios",
        "1 cópia do IPTU",
        "FAC preenchida e assinada",
        "1 cópia comum da consulta prévia de endereço e atividade",
        "CNPJ",
      ]),
      step("Verificar pagamento da 1ª parcela do serviço", C),
      step("Administração / Alvará", O, [
        "TFLI para alvará (paga pelo cliente; sociedades uniprofissionais não pagam)",
        "1 cópia do contrato de locação autenticada ou acompanhada do original",
        "CNPJ",
        "DIF – CF/DF",
        "Declarações da Administração Regional (requerimento, risco, imóvel desocupado, metragem, metragem para TFLI) para assinatura",
        "1 cópia comum do contrato social (acompanhada do original)",
      ]),
      step("Licença de funcionamento / Saúde", O, [
        "Emitir taxa para licença de funcionamento (DAR)",
        "Enviar alvará, contrato social registrado, inscrição estadual e CNPJ",
        "Orientar o cliente para entrada do processo na Inspetoria de Saúde",
      ]),
    ],
  },
  {
    seedKey: "alteracao-empresa",
    name: "Alteração de Empresa – Todos os Dados",
    department: DEPT,
    description: null,
    steps: [
      step("Combinar condições e valor do serviço", O),
      step("Abrir pasta de processo e cadastrar na planilha controle", O),
      step("Pesquisas", O, ["Pesquisa de nome empresarial na JCDF", "Pesquisa de endereço"]),
      step("Redigir alteração contratual e documentos de apoio", O, [
        "Redigir alteração contratual",
        "FAC – assinatura do responsável",
        "DBE – com firma reconhecida do sócio responsável",
      ]),
      step("Enviar recibo e colher assinaturas", C, [
        "Assinatura dos sócios",
        "Assinatura das testemunhas",
      ]),
      step("Junta Comercial – DF", O, [
        "Alteração contratual assinada (sócios) – 4 vias",
        "Capa da JCDF preenchida e assinada",
        "Taxa – DARF de alteração conforme tabela",
        "FCN 1 e 2 preenchidas",
      ]),
      step("Receita Federal", O, [
        "DBE assinado e com firma reconhecida",
        "1 cópia autenticada da alteração contratual",
        "Envelope com DBE e cópia autenticada entregue na SRF (sempre que possível usar o convênio com a Junta Comercial)",
      ]),
      step("GDF", O, [
        "Verificar o que foi alterado e providenciar junto ao GDF",
        "2 cópias autenticadas do RG, CPF e comprovante de residência de todos os sócios",
        "1 cópia do IPTU",
        "FAC preenchida e assinada",
        "1 cópia comum da consulta prévia de endereço e atividade",
        "CNPJ",
      ]),
      step("Verificar valor acertado e lançar na conta do cliente", O),
    ],
  },
  {
    seedKey: "servicos-internos",
    name: "Serviços Internos (pós-abertura / alteração)",
    department: DEPT,
    description: null,
    steps: [
      step(
        "Elaborar contrato de prestação de serviços",
        O,
        [],
        "Verificar o valor acertado com o cliente.",
      ),
      step("Cadastro interno nos sistemas (SISCON e PROSOFT)", O),
      step("Verificar e autenticar livros fiscais no site do GDF", O, [
        "Livro de Registro de Inventário",
        "Livro do UDFTO",
      ]),
      step("Agendar visita ao cliente sobre os procedimentos da empresa", C, [
        "Funcionalidade",
        "Notas fiscais",
        "Documentos a enviar à contabilidade",
      ]),
      step("Enviar ao cliente um exemplar do Código Civil", O),
      step("Organizar pasta com cópia original de cada documento e enviar ao cliente", O),
      step("Levar ao conhecimento de cada departamento a nova empresa", O),
      step(
        "Cobrar os gastos da abertura/alteração",
        O,
        ["Cartórios", "Cópias", "Livros fiscais", "Etiquetas de contador"],
        "Nunca esquecer de cobrar os gastos na abertura e alteração de empresa.",
      ),
    ],
  },
  {
    seedKey: "baixa-empresa",
    name: "Baixa de Empresa",
    department: DEPT,
    description:
      "Rotina de baixa: fica a cargo do departamento levantar a documentação exigida no relatório de pendências e, em caso de dúvida, procurar o departamento responsável.",
    steps: [
      step("Emitir certidões pela internet", O),
      step(
        "Solicitar relatório de pendências (internet ou no órgão)",
        O,
        [],
        "Somente se alguma certidão não puder ser emitida.",
      ),
      step("Levantar a documentação exigida no relatório", O),
    ],
  },
];

module.exports = { PROCESS_TEMPLATES };

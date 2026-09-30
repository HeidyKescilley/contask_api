// Padrões de processo do "Manual de Procedimentos Administrativos Integrado" (Contelb).
// responsible: "office" = responsabilidade do escritório | "client" = aguarda ação do cliente
const O = "office";
const C = "client";

const step = (title, responsible, checklist = [], description = null) => ({
  title,
  responsible,
  checklist,
  description,
});

const DEPT = "Processual";

// Regras gerais do manual (seção 7), repetidas nas descrições dos padrões de legalização.
const REGRAS_GERAIS =
  "Regras gerais: arquivo 100% digital (proibido armazenar pastas físicas para novos processos; manter tudo em servidores em nuvem seguros). " +
  "Custos com certificado digital (e-CNPJ/e-CPF) e taxas da JUCIS/DF são do cliente e pagos diretamente por ele.";

const PROCESS_TEMPLATES = [
  {
    seedKey: "manual-abertura-empresa",
    name: "Abertura de Empresa (JUCIS/DF ou Cartório Digital)",
    department: DEPT,
    description:
      "Todo o processo corre de forma 100% eletrônica e paralela no ecossistema da Redesim DF. " +
      REGRAS_GERAIS,
    steps: [
      step(
        "Anotar dados básicos",
        O,
        [
          "Razão Social",
          "Nome Fantasia",
          "Capital Social",
          "Quadro de sócios (QSA)",
          "Administrador",
          "Atividades do negócio",
        ],
        "Etapa 1 – Triagem e coleta de dados.",
      ),
      step(
        "Orientar sobre o nível do GOV.BR dos sócios",
        C,
        ["Conta GOV.BR de cada sócio nos níveis Prata ou Ouro"],
        "Obrigatório para as assinaturas eletrônicas dos atos.",
      ),
      step(
        "Solicitar documentação digital",
        C,
        [
          "RG/CPF ou CNH dos sócios (PDF ou foto nítida)",
          "Comprovante de endereço residencial dos sócios",
          "Inscrição Imobiliária (número do IPTU) do local da empresa",
        ],
        "Arquivos em PDF ou foto nítida de boa qualidade.",
      ),
      step(
        "Auditoria de CPF dos sócios",
        O,
        ["Consultar a regularidade do CPF de todos os sócios na base da Receita Federal"],
        "Fazer antes de elaborar as minutas.",
      ),
      step(
        "Pesquisa prévia de viabilidade",
        O,
        ["Nome empresarial", "Endereço", "Atividades"],
        "Etapa 2 – Viabilidade e coleta nacional. Acessar o Portal de Serviços da JUCIS/DF / Redesim para validar e aprovar perante o GDF.",
      ),
      step("Pesquisa de marca no INPI", O, [], "Consulta eletrônica no portal oficial do INPI para segurança do nome fantasia."),
      step(
        "Preencher o DBE (Documento Básico de Entrada)",
        O,
        [],
        "Preencher o Coletor Nacional da Receita Federal na Redesim para gerar o protocolo do DBE.",
      ),
      step(
        "Vistoria em conselho de classe",
        O,
        ["Enviar a minuta digital ao conselho (CRM, OAB etc.)", "Receber a validação do conselho"],
        "Somente para sociedades uniprofissionais regulamentadas (ex.: médicos, advogados). Dispensar o passo nos demais casos.",
      ),
      step(
        "Redigir a minuta do Contrato Social",
        O,
        [],
        "Etapa 3 – Protocolo, taxas e assinatura digital. Se a empresa for ME ou EPP, incluir a cláusula de porte que dispensa por lei a assinatura de advogado.",
      ),
      step(
        "Emitir a taxa (Documento de Arrecadação)",
        O,
        [],
        "Gerar o Preço do Serviço da JUCIS/DF diretamente pelo integrador.",
      ),
      step(
        "Protocolo digital na JUCIS/DF",
        O,
        ["Contrato Social", "DBE", "Viabilidade"],
        "Unificar os documentos no integrador eletrônico.",
      ),
      step(
        "Assinatura eletrônica pelos sócios",
        C,
        [
          "Enviar o link do processo aos sócios",
          "Assinaturas com certificado digital ou GOV.BR concluídas",
        ],
        "Ao registrar, o sistema gera o CNPJ e a Inscrição Estadual (CF/DF) de forma unificada e simultânea.",
      ),
      step(
        "Licenciamento integrado (RLE)",
        O,
        [],
        "Etapa 4 – Licenciamento e conclusão. Solicitar o Certificado de Licenciamento e Funcionamento pelo sistema RLE @ DIGITAL do DF.",
      ),
      step(
        "Autodeclarações eletrônicas",
        O,
        ["Termo de Risco", "Metragem", "Conformidade exigida pelo CBMDF e órgãos do GDF"],
        "Preencher diretamente em tela os termos digitais.",
      ),
      step("Entregar o kit inicial ao cliente", O, [
        "CNPJ",
        "Contrato Social registrado",
        "Inscrições",
        "Protocolo do Alvará",
      ]),
    ],
  },
  {
    seedKey: "manual-alteracao-empresa",
    name: "Alteração de Empresa (Todos os Dados)",
    department: DEPT,
    description: REGRAS_GERAIS,
    steps: [
      step(
        "Viabilidade e DBE",
        O,
        ["Nova Consulta de Viabilidade (se houver alteração de endereço ou atividade)", "DBE correspondente na Redesim"],
      ),
      step("Redigir o aditivo contratual", O, [], "Alteração Contratual listando as cláusulas modificadas."),
      step(
        "Protocolo web na JUCIS/DF",
        C,
        ["Assinaturas dos sócios (GOV.BR ou Certificado Digital ICP-Brasil)"],
        "Transmitir o processo pela JUCIS/DF e coletar as assinaturas dos sócios.",
      ),
      step(
        "Sincronização fiscal",
        O,
        ["Atualização na Receita Federal", "Atualização na Secretaria de Economia do DF (CF/DF)"],
        "Verificar no Portal de Serviços a liberação integrada das atualizações.",
      ),
    ],
  },
  {
    seedKey: "manual-baixa-empresa",
    name: "Baixa de Empresa (Encerramento)",
    department: DEPT,
    description:
      "Pelas regras de desburocratização vigentes, o encerramento pode ser feito de imediato, transferindo as pendências remanescentes automaticamente para o CPF dos sócios responsáveis.",
    steps: [
      step(
        "Auditoria de pendências",
        O,
        ["Situação fiscal no e-CAC da Receita Federal", "Situação na Agência Virtual do DF (Receita/DF)", "Informar o cliente sobre possíveis débitos"],
        "Consulta inteiramente digital, antes do fechamento.",
      ),
      step("Emitir as CNDs", O, [
        "RFB",
        "FGTS (Caixa)",
        "e-CAC DF",
        "Débitos Trabalhistas (TST)",
      ]),
      step("Distrato social eletrônico", C, [
        "Elaborar a minuta digital do distrato",
        "Assinatura online via GOV.BR",
      ]),
      step(
        "Extinção na JUCIS/DF",
        O,
        [],
        "Protocolar digitalmente o ato de encerramento para a baixa imediata do CNPJ e das inscrições fiscais.",
      ),
    ],
  },
  {
    seedKey: "manual-contrato-servicos",
    name: "Contrato de Prestação de Serviços (Compliance)",
    department: DEPT,
    description:
      "Antes do início de qualquer procedimento técnico nos sistemas internos é obrigatório formalizar os parâmetros comerciais e jurídicos da parceria.",
    steps: [
      step(
        "Elaborar a minuta",
        O,
        ["Honorários acordados", "Obrigações acessórias inclusas", "Limites de responsabilidade", "Regime de cobrança"],
        "Contrato de Prestação de Serviços Contábeis.",
      ),
      step(
        "Conferir o vínculo das partes",
        O,
        [],
        "O contrato deve vincular claramente a Contelb Contabilidade e a empresa/sócios clientes.",
      ),
      step(
        "Enviar para assinatura (Autentique)",
        C,
        [],
        "Enviar o documento finalizado pela plataforma Autentique para assinaturas digitais com validade jurídica.",
      ),
      step(
        "Validar as assinaturas",
        O,
        ["Todas as partes assinaram (conferir no painel da Autentique)"],
        "Só liberar o cliente para o fluxo de cadastro do escritório depois disso.",
      ),
    ],
  },
  {
    seedKey: "manual-cadastro-contask",
    name: "Cadastro de Cliente e Gestão Interna (CONTASK)",
    department: DEPT,
    description:
      "Provisiona a empresa no software de gestão de processos e obrigações da Contelb. Dica: confira se os dados digitados no CONTASK (especialmente o código de acesso e o CNPJ) batem com os que serão sincronizados no Domínio, evitando duplicidade ou tarefas perdidas.",
    steps: [
      step("Abrir o cliente no CONTASK", O, [], "Realizar o cadastro completo da nova empresa ativa."),
      step(
        "Alocar as obrigações",
        O,
        ["Obrigações federais", "Obrigações distritais", "Obrigações trabalhistas"],
        "Vincular a agenda de obrigações acessórias periódicas conforme o regime tributário (Simples Nacional, Lucro Presumido ou Real).",
      ),
      step(
        "Definir os responsáveis",
        O,
        ["Fiscal", "Contábil", "Pessoal"],
        "Atribuir os analistas e operadores responsáveis em cada departamento.",
      ),
      step(
        "Validar a inclusão no painel (gatilho de fluxo)",
        O,
        [],
        "Dispara o início oficial do fluxo de atendimento, antes de seguir para a configuração no Domínio.",
      ),
    ],
  },
  {
    seedKey: "manual-implantacao-dominio",
    name: "Implantação e Fluxo Interno (Sistema Domínio)",
    department: DEPT,
    description:
      "Fluxo sequencial: Cadastro CONTASK → Módulo Utilitários do Domínio → Configuração dos módulos → Configuração ONVIO → Onboarding.",
    steps: [
      step(
        "Configurar o cliente (Módulo Utilitários/Domínio)",
        O,
        ["Dados contratuais registrados", "CNAEs", "Quadro societário"],
        "Cadastrar a empresa com os dados detalhados.",
      ),
      step("Parametrizar o módulo Escrita Fiscal", O, [
        "Vigência inicial",
        "Regime tributário",
        "Regras de apuração de impostos federais e distritais (ISS/ICMS)",
        "Acumuladores de entrada/saída",
      ]),
      step("Parametrizar o módulo Folha de Pagamento", O, [
        "FPAS",
        "RAT",
        "FAP",
        "Conectividade com o portal do eSocial",
      ]),
      step(
        "Parametrizar o módulo Contabilidade",
        O,
        [],
        "Configurar e mapear o Plano de Contas referencial (adequado ao regime) para as futuras integrações automáticas.",
      ),
      step(
        "Ativar o cliente no ONVIO (Domínio Atendimento)",
        O,
        ["Cadastro na plataforma em nuvem", "Acessos dos usuários da empresa criados"],
        "Permite o envio eletrônico de guias, folhas de pagamento e relatórios contábeis de forma automatizada.",
      ),
      step("Configurar SPED e notas fiscais eletrônicas", O, [
        "Importação de XMLs de NFS-e (Padrão Nacional)",
        "Importação de XMLs de NF-e",
        "Importação de XMLs de NFC-e",
      ]),
      step(
        "Reunião de onboarding (boas-vindas)",
        C,
        ["Fluxo de notas fiscais eletrônicas", "Envio de extratos bancários digitais (OFX)", "Prazos de vencimento"],
        "Videoconferência (Teams, Zoom ou Google Meet) para instruir o cliente.",
      ),
      step(
        "Alinhar os departamentos",
        O,
        ["Fiscal", "Pessoal", "Contábil"],
        "Enviar notificação sistêmica interna informando que o cliente está ativo e parametrizado no Domínio.",
      ),
    ],
  },
];

// Padrões da versão anterior (manual antigo, departamento "Administrativo"): removidos na inicialização.
const LEGACY_SEED_KEYS = [
  "abertura-jcdf",
  "abertura-cartorio",
  "alteracao-empresa",
  "servicos-internos",
  "baixa-empresa",
];

module.exports = { PROCESS_TEMPLATES, LEGACY_SEED_KEYS };

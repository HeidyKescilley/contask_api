// /services/darAutomation.js
// Geração de DAR avulso (SEFAZ-DF, código 1317 - ICMS NORMAL) com Playwright.
// Roda no servidor: usa um Chrome real com perfil dedicado, em modo headless, conectado por CDP.
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const http = require("http");
const { chromium } = require("playwright-core");
const logger = require("../logger/logger");

const URL_DAR = "https://ww1.receita.fazenda.df.gov.br/dar-avulso/gerar-dar-avulso";
const CODIGO_RECEITA = "1317 - ICMS - NORMAL";
const PORTA = parseInt(process.env.DAR_CHROME_PORT || "9223", 10);
const CDP = `http://127.0.0.1:${PORTA}`;
// Padrão: Chrome com janela (o Cloudflare do site bloqueia o modo headless). O servidor é Windows,
// então a janela abre na sessão do servidor e o usuário do Contask não a vê.
// DAR_HEADLESS=true força headless (hoje o site reprova a verificação anti-bot nesse modo).
const HEADLESS = process.env.DAR_HEADLESS === "true";
const PERFIL = path.join(__dirname, "..", "chrome_perfil_dar");
const PASTA_PDF = path.join(os.tmpdir(), "contask_dar_pdfs");
const TTL_JOB_MS = 2 * 60 * 60 * 1000;
const TIMEOUT_ANTIBOT_MS = 60 * 1000;

const CHROME_LOCAIS = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA &&
    path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
].filter(Boolean);

// ---------------------------------------------------------------- utilidades

const soDigitos = (s) => String(s || "").replace(/\D/g, "");
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

/** Aceita '10,5', '10.5', '1.234,56' e devolve duas casas com vírgula. */
function formatarValor(v) {
  let s = String(v ?? "").replace("R$", "").replace(/\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (!s || !Number.isFinite(n) || n <= 0) throw new Error("Valor inválido.");
  return n.toFixed(2).replace(".", ",");
}

function portaAtiva() {
  return new Promise((resolve) => {
    const req = http.get(`${CDP}/json/version`, { timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

// ------------------------------------------------------------------- Chrome

let browserPromise = null;
let chromeProc = null; // processo iniciado por nós (null se o Chrome já estava aberto)

async function abrirChrome() {
  if (!(await portaAtiva())) {
    const chrome = CHROME_LOCAIS.find((c) => fs.existsSync(c));
    if (!chrome) throw new Error("chrome não encontrado no servidor. Defina CHROME_PATH no .env.");
    fs.mkdirSync(PERFIL, { recursive: true });
    const args = [
      `--remote-debugging-port=${PORTA}`,
      `--user-data-dir=${PERFIL}`,
      "--no-first-run",
      "--no-default-browser-check",
    ];
    if (HEADLESS) args.push("--headless=new");
    if (process.platform === "linux") args.push("--no-sandbox");
    args.push("about:blank");
    chromeProc = spawn(chrome, args, { stdio: "ignore" });
    chromeProc.on("exit", () => {
      chromeProc = null;
    });
    let ok = false;
    for (let i = 0; i < 60 && !ok; i++) {
      ok = await portaAtiva();
      if (!ok) await dorme(500);
    }
    if (!ok) throw new Error("Chrome não abriu a porta de depuração.");
  }
  const browser = await chromium.connectOverCDP(CDP);
  browser.on("disconnected", () => {
    browserPromise = null;
  });
  return browser;
}

function obterBrowser() {
  if (!browserPromise) {
    browserPromise = abrirChrome().catch((e) => {
      browserPromise = null;
      throw e;
    });
  }
  return browserPromise;
}

/** Encerra o Chrome por completo: pede o fechamento por CDP e, se sobrar processo, mata a árvore. */
async function fecharChrome() {
  const pending = browserPromise;
  browserPromise = null;
  try {
    const browser = pending && (await pending);
    if (browser) {
      const cdp = await browser.newBrowserCDPSession();
      await cdp.send("Browser.close").catch(() => {});
    }
  } catch {
    // já desconectado
  }
  for (let i = 0; i < 20 && (await portaAtiva()); i++) await dorme(250);

  const proc = chromeProc;
  if (proc && proc.exitCode === null) {
    await new Promise((resolve) => {
      proc.once("exit", resolve);
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        proc.kill("SIGKILL");
      }
      setTimeout(resolve, 5000);
    });
  }
  chromeProc = null;
  logger.info("Chrome da geração de DAR encerrado.");
}

// -------------------------------------------------------------- uma emissão

async function gerarPdf(page, { cnpj, valor }, status) {
  fs.mkdirSync(PASTA_PDF, { recursive: true });
  try {
    status("Abrindo site...");
    await page.goto(URL_DAR, { waitUntil: "domcontentloaded" });
    await page.locator("#mat-radio-3").click();
    await page.locator("#mat-input-0").fill(cnpj);

    // Verificação anti-bot (Cloudflare): não é contornada. Se não passar sozinha, a emissão falha
    // e uma pessoa precisa resolver (com janela no servidor; o perfil dedicado guarda a sessão).
    if (await page.locator("app-psv-turnstile, [name='cf-turnstile-response']").count()) {
      status("Aguardando verificação do site...");
      try {
        await page.waitForFunction(
          () => {
            const e = document.querySelector('[name="cf-turnstile-response"]');
            return !e || e.value.length > 0;
          },
          null,
          { timeout: TIMEOUT_ANTIBOT_MS },
        );
      } catch {
        const erro = new Error(
          "O site bloqueou a verificação anti-bot (Cloudflare) para a automação. Ela precisa ser resolvida por uma pessoa no servidor (abra o Chrome com janela no servidor).",
        );
        erro.antibot = true;
        throw erro;
      }
    }

    await page.waitForTimeout(2800);
    await page.locator("button:visible", { hasText: "Avançar" }).last().click();

    status("Selecionando 1317 - ICMS NORMAL...");
    await page.locator("#mat-expansion-panel-header-0").click();
    const linha = page
      .locator("tr", { has: page.locator("td", { hasText: CODIGO_RECEITA }) })
      .first();
    await linha.locator("mat-radio-button label").click();
    await page.waitForTimeout(800);
    await page.locator("button:visible", { hasText: "Avançar" }).last().click();

    status("Preenchendo valor...");
    const campo = page.locator("#mat-input-12");
    await campo.click();
    await campo.pressSequentially(valor, { delay: 80 });
    await campo.press("Tab");
    await page.waitForTimeout(800);
    await page.locator("button:visible", { hasText: "Avançar" }).last().click();

    status("Gerando PDF...");
    const botao = page.getByRole("button", { name: "Gerar PDF" });
    await botao.waitFor();
    let arquivo = null;
    for (let tentativa = 1; tentativa <= 10 && !arquivo; tentativa++) {
      try {
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 5000 }),
          botao.click(),
        ]);
        arquivo = download;
      } catch {
        status(`Download não iniciou, tentativa ${tentativa}/10...`);
      }
    }
    if (!arquivo) throw new Error("Download do PDF não iniciou após 10 tentativas.");
    const destino = path.join(PASTA_PDF, `DAR_${cnpj}_${crypto.randomBytes(6).toString("hex")}.pdf`);
    await arquivo.saveAs(destino);
    return destino;
  } finally {
    await page.goto("about:blank").catch(() => {});
  }
}

// ------------------------------------------------------------ jobs em memória

const jobs = new Map(); // id -> job
let fila = Promise.resolve(); // um job por vez (um único Chrome compartilhado)
let pendentes = 0; // jobs na fila ou em execução; o Chrome só fecha quando chega a zero

function criarJob(userId, itens) {
  const job = {
    id: crypto.randomUUID(),
    userId,
    createdAt: Date.now(),
    finishedAt: null,
    state: "queued", // queued | running | done
    items: itens.map((it, i) => ({
      id: i + 1,
      companyId: it.companyId,
      nome: it.nome,
      cnpj: it.cnpj,
      valor: it.valor,
      status: "Na fila", // Na fila | Processando | PDF gerado | Erro
      detalhe: "",
      file: null,
    })),
  };
  jobs.set(job.id, job);
  pendentes++;
  fila = fila
    .then(() => executarJob(job))
    .catch(() => {})
    .then(async () => {
      if (--pendentes === 0) await fecharChrome().catch((e) => logger.error(`Fechar Chrome: ${e.message}`));
      job.finishedAt = Date.now();
      job.state = "done";
    });
  return job;
}

async function executarJob(job) {
  job.state = "running";
  let page = null;
  try {
    const browser = await obterBrowser();
    const ctx = browser.contexts()[0] || (await browser.newContext());
    page = await ctx.newPage();
    page.setDefaultTimeout(30000);
    for (const item of job.items) {
      item.status = "Processando";
      try {
        item.file = await gerarPdf(page, item, (s) => (item.detalhe = s));
        item.status = "PDF gerado";
        item.detalhe = "";
      } catch (e) {
        item.status = "Erro";
        item.detalhe = String(e.message || e).split("\n")[0].slice(0, 300);
        logger.error(`DAR ${item.cnpj}: ${e.message}`);
        if (e.antibot) {
          // Os demais itens esbarrariam no mesmo bloqueio: não vale esperar o timeout de cada um.
          for (const resto of job.items) {
            if (resto.status === "Na fila") {
              resto.status = "Erro";
              resto.detalhe = item.detalhe;
            }
          }
          break;
        }
      }
    }
  } catch (e) {
    logger.error(`Falha geral na geração de DAR: ${e.message}`);
    for (const item of job.items) {
      if (item.status === "Na fila" || item.status === "Processando") {
        item.status = "Erro";
        item.detalhe = e.message.split("\n")[0].slice(0, 300);
      }
    }
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

function limparJobsAntigos() {
  const limite = Date.now() - TTL_JOB_MS;
  for (const [id, job] of jobs) {
    if (job.state === "done" && job.finishedAt < limite) {
      job.items.forEach((it) => it.file && fs.unlink(it.file, () => {}));
      jobs.delete(id);
    }
  }
}
setInterval(limparJobsAntigos, 10 * 60 * 1000).unref();

const obterJob = (id) => jobs.get(id);

/** Visão pública do job (sem caminhos de arquivo). */
function serializar(job) {
  return {
    id: job.id,
    state: job.state,
    items: job.items.map(({ file, ...resto }) => ({ ...resto, hasPdf: !!file })),
  };
}

module.exports = { fecharChrome, criarJob, obterJob, serializar, formatarValor, soDigitos };

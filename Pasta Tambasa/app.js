/* ===================== Tambasa - Painel de Controle ===================== */

const FILIAIS_PADRAO = ["ALE","RIA","LZI","CRT","GAN","JAR","ANP","NIQ","PIR","URU","ROT","CRI","RUB","ITA","STZ","GNA","GYN"];

const TIPOS_PENDENCIA = ["Custo","Ocorrência","Débito","Falta","Avaria","Outros"];

/* ---------- organizacao dos Focais (SAC) e unidades ---------- */
const FOCAIS_PADRAO = [
  { id:"sac1", titulo:"SAC 1 — Jéssica", unidades:[
    {sigla:"AL2"},
    {sigla:"CMG", grupo:"CW3", grupoNome:"CW3 TRANSPORTES E LOGÍSTICA LTDA"},
    {sigla:"CW3", grupo:"CW3", grupoNome:"CW3 TRANSPORTES E LOGÍSTICA LTDA"},
    {sigla:"IVC"}, {sigla:"NWF"}, {sigla:"RIT"}, {sigla:"SPR"},
    {sigla:"TLC"}, {sigla:"TNG"}, {sigla:"TOP"}, {sigla:"USE"}
  ]},
  { id:"sac3", titulo:"SAC 3 — Pablo", unidades:[
    {sigla:"EGO"}, {sigla:"BSB"}, {sigla:"ITA"}, {sigla:"CRI"}, {sigla:"RUB"}, {sigla:"STZ"}
  ]},
  { id:"sac4", titulo:"SAC 4 — Camila Amaral", unidades:[
    {sigla:"ALE"}, {sigla:"CRT"}, {sigla:"LZI"}, {sigla:"ALF"}
  ]},
  { id:"sac5", titulo:"SAC 5 — Pabline", unidades:[
    {sigla:"EPD"}, {sigla:"FAV"}
  ] },
  { id:"sac8", titulo:"SAC 8 — Zélia", unidades:[
    {sigla:"NIQ"}, {sigla:"PIR"}, {sigla:"URU"}
  ]},
  { id:"sac13", titulo:"SAC 13 — Keslley", unidades:[
    {sigla:"ANP"}, {sigla:"JAR"}, {sigla:"RIA"}, {sigla:"GAN"}
  ]}
];

function focalPorSigla(sigla){
  return FOCAIS.find(f => f.unidades.some(u => u.sigla === sigla)) || null;
}
function todasSiglasFocais(){
  const set = new Set();
  FOCAIS.forEach(f => f.unidades.forEach(u => set.add(u.sigla)));
  return set;
}

/* ---------- Ocorrências: regra de prioridade (PAGADOR > UNIDADE) -----------
   Estrutura centralizada (nada disso fica espalhado dentro das funções de
   parse/render) para facilitar expansão futura: novos códigos de ocorrência,
   novos pagadores prioritários, novos focais, novas unidades.

   IMPORTANTE: a lista de pagadores abaixo NÃO cria uma tabela de focais
   paralela. Ela só liga "NOME PAGADOR" à SIGLA que já existe dentro de
   FOCAIS_PADRAO (as mesmas siglas usadas nas telas "SAC ... como pagador",
   ver EMPRESAS_PAGADORA mais abaixo). Quem definitivamente diz qual é o
   focal responsável continua sendo a estrutura FOCAIS / focalPorSigla(),
   cadastrada em "Confirmação de Filiais". */
const OCORRENCIAS_CODIGOS_SUPORTADOS = ["69"]; // futuramente: acrescentar outros códigos aqui

const PAGADORES_PRIORITARIOS = {
  "FAVORITA TRANSPORTES LTDA": "FAV",
  "EP DISTRIBUIDORA DE LUBRIFICANTES": "EPD",
  "EP DISTRIBUIDORA DE LUBRIFICAN": "EPD",
  "EP DIST DE LUBRIFICANTES PECAS E FILTROS LTDA": "EPD",
  "EXPRESSO GOIAS E LOGISTICA LTD": "EGO",
  "ALFA TRANSPORTES": "ALF",
  "LC ENCOMENDAS E CARGAS LTDA": "TLC",
  "RAPIDO IPORA TRANSPORTES": "RIT",
  "USE TRANSPORTES": "USE",
  "INVICTA TRANSPORTE": "IVC",
  "CW3 TRANSPORTES": "CW3",
  "ALL CARGO LOG": "AL2",
  "NWF TRANSPORTES": "NWF",
  "SOUSA PIRES TRANSPORTES": "SPR",
  "DELPS TRANSPORTES": "TNG",
  "TOP LUZ TRANSPORTES": "TOP"
};

// Focais "especiais": não são um SAC dentro de FOCAIS_PADRAO, então ficam
// centralizados aqui, à parte, em vez de forçar a criação de "SACs" que não
// existem de verdade.
const FOCAIS_ESPECIAIS_POR_UNIDADE = { GNA: "Monique", GYN: "Monique", ROT: "Ester" };

function normalizarTextoPagador(s){
  return String(s || "")
    .replace(/\u00a0/g, " ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const PAGADORES_PRIORITARIOS_NORM = Object.fromEntries(
  Object.entries(PAGADORES_PRIORITARIOS).map(([nome, sigla]) => [normalizarTextoPagador(nome), sigla])
);

// Fallback pela 1ª palavra do nome do pagador: o relatório do SSW às vezes
// abrevia palavras de um jeito que o "começo em comum" de siglaPagadorPrioritario
// não pega (ex.: veio "CW3 TRANSP LOG LTDA" no arquivo, mas a lista acima tem
// "CW3 TRANSPORTES" — "TRANSP" e "TRANSPORTES" não são prefixo um do outro).
// Como a 1ª palavra de alguns desses pagadores É a própria sigla (CW3, NWF,
// TOP, USE), usar só ela como fallback resolve sem exigir o nome completo.
// Só entra aqui se a 1ª palavra for exclusiva de um único pagador da lista.
const PAGADORES_PRIORITARIOS_1A_PALAVRA = {};
(function montarFallback1aPalavra(){
  const vistos = {};
  Object.entries(PAGADORES_PRIORITARIOS_NORM).forEach(([nomeNorm, sigla]) => {
    const primeira = nomeNorm.split(" ")[0];
    if(!primeira || primeira.length < 3) return;
    if(vistos[primeira] === undefined){ vistos[primeira] = sigla; }
    else if(vistos[primeira] !== sigla){ vistos[primeira] = null; } // ambíguo, ignora
  });
  Object.entries(vistos).forEach(([palavra, sigla]) => { if(sigla) PAGADORES_PRIORITARIOS_1A_PALAVRA[palavra] = sigla; });
})();

// Acha a sigla do focal prioritário a partir do NOME PAGADOR da planilha.
// Tenta igualdade exata primeiro; se não bater, tenta um começo em comum
// (o campo do SSW às vezes vem truncado ou com sufixo levemente diferente,
// ex.: "LTDA" x "LTDA.") e por fim a 1ª palavra (ver acima).
function siglaPagadorPrioritario(nomePagador){
  const norm = normalizarTextoPagador(nomePagador);
  if(!norm) return null;
  if(PAGADORES_PRIORITARIOS_NORM[norm]) return PAGADORES_PRIORITARIOS_NORM[norm];
  for(const chave in PAGADORES_PRIORITARIOS_NORM){
    if(norm.length >= 6 && chave.length >= 6 && (norm.startsWith(chave) || chave.startsWith(norm))){
      return PAGADORES_PRIORITARIOS_NORM[chave];
    }
  }
  const palavras = norm.split(" ");
  const primeiraPalavra = palavras[0];
  // Só vale se o RESTO do nome for genérico (TRANSP, LOG, LTDA...). Evita "TOP FRUTAS",
  // "USE ALIMENTOS", "ALFA COMERCIO", "EXPRESSO SAO MIGUEL" virarem empresa do Grupo.
  const GENERICAS = new Set(["TRANSP","TRANSPORTE","TRANSPORTES","TRANSPORTADORA","LOG","LOGISTICA","E","DE","DO","DA","LTDA","LT","LTD","SA","S/A","EIRELI","ME","EPP","CARGAS","CARGA","ENCOMENDAS","SERVICOS","EXPRESSO"]);
  const resto = palavras.slice(1);
  if(primeiraPalavra && PAGADORES_PRIORITARIOS_1A_PALAVRA[primeiraPalavra] && resto.every(w => GENERICAS.has(w))){
    return PAGADORES_PRIORITARIOS_1A_PALAVRA[primeiraPalavra];
  }
  return null;
}

// Regra principal (CNPJ é a chave): 1º CNPJ DO PAGADOR (cadastro de
// CNPJ/grupo), 2º NOME DO PAGADOR (lista de pagadores prioritários, usada
// só quando o CNPJ não veio no arquivo ou não está cadastrado), 3º UNIDADE.
// Devolve o título do focal (o mesmo que já aparece no menu "Performance
// Geral") ou "Sem focal definido". O nome do pagador NUNCA é usado sozinho
// pra decidir — ele só entra como complemento/fallback do CNPJ, porque uma
// mesma empresa pode aparecer com nomes diferentes ou abreviados, e vários
// CNPJs podem pertencer ao mesmo grupo.
function definirFocalOcorrencia(nomePagador, unidade, cnpjPagador){
  const uni = String(unidade || "").trim().toUpperCase();

  // 1) CNPJ cadastrado -> usa a sigla do grupo/cliente vinculado a esse CNPJ.
  const cnpjNorm = normalizarCnpj(cnpjPagador);
  const cadastro = cnpjNorm ? buscarCnpjCadastro(cnpjNorm) : null;
  // 1b) Cliente Premium cadastrado (por CNPJ) com Focal/unidades definidos.
  const prem = cnpjNorm ? buscarClientePremium(cnpjNorm) : null;
  if(prem && prem.focalId){
    const focalPrem = FOCAIS.find(f => f.id === prem.focalId);
    const unidadesPrem = siglasDoTexto(prem.unidades);
    // Unidades "especiais" (ROT/Ester, GNA e GYN/Monique) NÃO são carteira de cliente
    // premium: documento de um CNPJ premium com Focal definido nunca pode cair nelas só
    // porque a unidade de entrega é uma delas (bug: Expresso Goiás entregue em ROT caía
    // na Ester, mas a carteira é do SAC 3).
    const unidadeEspecial = !!FOCAIS_ESPECIAIS_POR_UNIDADE[uni];
    if(focalPrem && (unidadesPrem.length === 0 || unidadesPrem.includes(uni) || unidadeEspecial || prem.sempreFocal)){
      return {titulo: focalPrem.titulo, origem: "premium"};
    }
  }
  // 2) Sem CNPJ (ou CNPJ não cadastrado) -> cai no nome do pagador, como antes.
  const siglaPagador = (cadastro && cadastro.sigla) || siglaPagadorPrioritario(nomePagador);

  // Empresas "cliente premium" (EMPRESAS_PAGADORA: Expresso Goiás, Alfa
  // Transportes, EP Distribuidora, Favorita) entregam em TODAS as unidades/
  // filiais — não só nas do seu SAC. Por isso, pra essas, o PAGADOR não pode
  // definir o focal (senão toda ocorrência/atraso delas cairia sempre no
  // mesmo SAC, mesmo quando quem entregou de fato foi outra unidade/Focal).
  // Pra essas, sempre vale a UNIDADE de entrega — mesma regra já usada na
  // Performance Geral "como pagador".
  const ehClientePremium = siglaPagador && Object.prototype.hasOwnProperty.call(EMPRESAS_PAGADORA, siglaPagador);
  if(siglaPagador && !ehClientePremium){
    const focal = focalPorSigla(siglaPagador);
    if(focal) return {titulo: focal.titulo, origem: cadastro ? "cnpj" : "pagador"};
  }

  // 2b) Cliente premium identificado só pelo NOME (CNPJ ausente/não cadastrado): mesma
  // proteção — unidade especial (ROT/GNA/GYN) não pode "roubar" o documento; vale o Focal
  // padrão da empresa premium (ex.: EGO -> SAC 3).
  // A carteira é do PAGADOR: empresa premium vai SEMPRE para o Focal dela, em qualquer
  // unidade de entrega (EGO -> SAC 3, ALF -> SAC 4, FAV/EPD -> SAC 5...).
  if(ehClientePremium){
    const grupoPadrao = PREMIUM_GRUPOS_PADRAO.find(g => g.sigla === siglaPagador);
    const focalPadrao = grupoPadrao ? FOCAIS.find(f => f.id === grupoPadrao.focalId) : null;
    if(focalPadrao) return {titulo: focalPadrao.titulo, origem: "premium"};
  }

  // 3) Unidade (mesma regra de sempre, inclusive pra cliente premium acima).
  if(FOCAIS_ESPECIAIS_POR_UNIDADE[uni]){
    return {titulo: FOCAIS_ESPECIAIS_POR_UNIDADE[uni], origem: "unidade"};
  }

  const focalUnidade = focalPorSigla(uni);
  if(focalUnidade) return {titulo: focalUnidade.titulo, origem: "unidade"};

  // 4) Nada bateu (nem CNPJ, nem pagador, nem unidade) -> sinaliza para
  // cadastro/ajuste em vez de "chutar" por nome parecido.
  return {titulo: "Sem focal definido", origem: "indefinido"};
}

const KEYS = {
  trocas: "tambasa_trocas",
  boletos: "tambasa_boletos",
  confirmacoes: "tambasa_confirmacoes",
  pendencias: "tambasa_pendencias",
  pacotes: "tambasa_pacotes",
  clientesAlerta: "tambasa_clientes_alerta",
  performance: "tambasa_performance",
  performanceGeralVal: "tambasa_performance_geral_val",
  performanceGeralRva: "tambasa_performance_geral_rva",
  receitaFechamento: "tambasa_receita_fechamento",
  receitaPagadora: "tambasa_receita_pagadora_fechamento",
  unidadeDestino: "tambasa_unidade_destino_fechamento",
  unidadeExpedidora: "tambasa_unidade_expedidora_fechamento",
  expedSelecao: "tambasa_exped_selecao_filiais",
  entregas: "tambasa_entregas",
  focais: "tambasa_focais",
  ocorrencias: "tambasa_ocorrencias",
  atrasos: "tambasa_documentos_atraso",
  trocasCobranca: "tambasa_trocas_cobranca",
  cnpjCadastro: "tambasa_cnpj_cadastro",
  clientesPremium: "tambasa_clientes_premium",
  filiais: "tambasa_filiais",
  focaisPadraoVistos: "tambasa_focais_padrao_vistos",
  premiumPadraoVistos: "tambasa_premium_padrao_vistos",
  cnpjPadraoVistos: "tambasa_cnpj_padrao_vistos",
  alertaPadraoVistos: "tambasa_alerta_padrao_vistos"
};

function escHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}

/* Focais (SAC) e suas unidades: vêm do cadastro salvo na aba "Confirmação de Filiais".
   Enquanto nada tiver sido salvo, vale a lista padrão (FOCAIS_PADRAO). */
function carregarFocais(){
  try{
    const raw = localStorage.getItem(KEYS.focais);
    const lista = raw ? JSON.parse(raw) : null;
    if(Array.isArray(lista)) return mesclarNovasUnidadesPadrao(lista);
  }catch(e){}
  return JSON.parse(JSON.stringify(FOCAIS_PADRAO));
}

// Garante que novas unidades incluidas no FOCAIS_PADRAO (ex.: novas
// transportadoras pagadoras) apareçam tambem para quem ja tem uma lista de
// Focais salva no navegador — sem apagar nem alterar nenhum Focal/unidade
// que o usuario ja tenha cadastrado ou editado na aba Confirmação de Filiais.
function mesclarNovasUnidadesPadrao(lista){
  // Só oferece uma unidade padrão UMA vez: se o usuário depois removê-la ou
  // movê-la para outro Focal, ela não volta sozinha (senão ficaria duplicada).
  let vistos = null;
  try{ vistos = JSON.parse(localStorage.getItem(KEYS.focaisPadraoVistos) || "null"); }catch(e){}
  const primeiraVez = !Array.isArray(vistos);
  const setVistos = new Set(primeiraVez ? [] : vistos);
  FOCAIS_PADRAO.forEach(padrao => {
    const focalSalvo = lista.find(f => f.id === padrao.id);
    padrao.unidades.forEach(u => {
      const jaVisto = setVistos.has(u.sigla);
      setVistos.add(u.sigla);
      if(primeiraVez || jaVisto || !focalSalvo) return;
      if(!Array.isArray(focalSalvo.unidades)) focalSalvo.unidades = [];
      const emAlgumFocal = lista.some(f => (f.unidades||[]).some(ux => ux.sigla === u.sigla));
      if(!emAlgumFocal) focalSalvo.unidades.push({...u});
    });
  });
  try{ localStorage.setItem(KEYS.focaisPadraoVistos, JSON.stringify([...setVistos])); }catch(e){}
  return lista;
}
function salvarFocais(){ localStorage.setItem(KEYS.focais, JSON.stringify(FOCAIS)); }
let FOCAIS = carregarFocais();

// Filiais (sigla) do controle de envio / seletores: editável em Confirmação
// de Filiais. Enquanto nada for salvo, vale a lista padrão.
function carregarFiliais(){
  try{
    const l = JSON.parse(localStorage.getItem(KEYS.filiais) || "null");
    if(Array.isArray(l) && l.length) return l;
  }catch(e){}
  return [...FILIAIS_PADRAO];
}
function salvarFiliais(){ localStorage.setItem(KEYS.filiais, JSON.stringify(FILIAIS)); }
let FILIAIS = carregarFiliais();

/* ================= CADASTRO DE CNPJ (pagador/grupo) =====================
   Base central usada em TODO o sistema para identificar o pagador pelo
   CNPJ antes de qualquer coisa (nome, unidade). Cada linha liga um CNPJ a
   uma SIGLA já usada em FOCAIS/EMPRESAS_PAGADORA (ex.: EGO = Expresso
   Goiás) — assim, achando o CNPJ, a regra de focal continua sendo a mesma
   (focalPorSigla / EMPRESAS_PAGADORA). Editável na tela (ver
   cnpjCadastroSecaoHTML) e o usuário pode cadastrar novos grupos/CNPJs a
   qualquer momento — o cadastro não é fixo no código.
   IMPORTANTE: "TLC Transporte e Logística" é um grupo diferente de "LC
   Encomendas e Cargas" (que já usa a sigla TLC) — por isso usa a sigla
   própria TL2, ainda sem Focal vinculado (cai em UNIDADE/pendente até
   alguém vincular um Focal a ela em Confirmação de Filiais). */
const CNPJ_CADASTRO_PADRAO = [
  {cnpj:"38475768000194", sigla:"EGO", nome:"Expresso Goiás e Logística Ltda"},
  {cnpj:"38475768000275", sigla:"EGO", nome:"Expresso Goiás e Logística Ltda A2"},
  {cnpj:"38475768000437", sigla:"EGO", nome:"Expresso Goiás e Logística Ltda A2"},
  {cnpj:"64123518000103", sigla:"EGO", nome:"Expresso Goiás e Logística A."},
  {cnpj:"64123518000286", sigla:"EGO", nome:"Expresso Goiás e Logística Ltda A2"},
  {cnpj:"02999822000153", sigla:"TLC", nome:"LC Encomendas e Cargas"},
  {cnpj:"04409096000105", sigla:"TLC", nome:"LC Encomendas e Cargas"},
  {cnpj:"02999822000234", sigla:"TLC", nome:"LC Encomendas e Cargas"},
  {cnpj:"02999822000404", sigla:"TLC", nome:"LC Encomendas e Cargas"},
  {cnpj:"02999822000315", sigla:"TLC", nome:"LC Encomendas e Cargas"},
  {cnpj:"00673682000101", sigla:"RIT", nome:"Rápido Iporá Transportes"},
  {cnpj:"00673682000284", sigla:"RIT", nome:"Rápido Iporá Transportes"},
  {cnpj:"11143275000281", sigla:"USE", nome:"USE Transportes"},
  {cnpj:"11290687000163", sigla:"USE", nome:"USE Transportes"},
  {cnpj:"11290687000244", sigla:"USE", nome:"USE Transportes"},
  {cnpj:"08594292000140", sigla:"IVC", nome:"Invicta Transportes"},
  {cnpj:"08594292000301", sigla:"IVC", nome:"Invicta Transportes"},
  {cnpj:"17794044000133", sigla:"CW3", nome:"CW3 Transportes e Logística"},
  {cnpj:"17794044000214", sigla:"CW3", nome:"CW3 Transportes e Logística"},
  {cnpj:"17794044000303", sigla:"CW3", nome:"CW3 Transportes e Logística"},
  {cnpj:"17794044000486", sigla:"CW3", nome:"CW3 Transportes e Logística"},
  {cnpj:"17794044000567", sigla:"CW3", nome:"CW3 Transportes e Logística"},
  {cnpj:"17794044000648", sigla:"CW3", nome:"CW3 Transportes e Logística"},
  {cnpj:"38462304000143", sigla:"AL2", nome:"All Cargo Logística e Transporte"},
  {cnpj:"38462304000224", sigla:"AL2", nome:"All Cargo Logística e Transporte"},
  {cnpj:"38462304000577", sigla:"AL2", nome:"All Cargo Logística e Transporte"},
  {cnpj:"38462304000810", sigla:"AL2", nome:"All Cargo Logística e Transporte"},
  {cnpj:"15045348000172", sigla:"NWF", nome:"NWF Transportes e Logística"},
  {cnpj:"15045348000253", sigla:"NWF", nome:"NWF Transportes e Logística"},
  {cnpj:"15045348000334", sigla:"NWF", nome:"NWF Transportes e Logística"},
  {cnpj:"03673321000145", sigla:"TNG", nome:"DELPS Transportes e Logística"},
  {cnpj:"03673321000650", sigla:"TNG", nome:"DELPS Transportes e Logística"},
  {cnpj:"03673321000811", sigla:"TNG", nome:"DELPS Transportes e Logística"},
  {cnpj:"07723713000122", sigla:"TOP", nome:"TOP Luz"},
  {cnpj:"07723713000203", sigla:"TOP", nome:"TOP Luz"},
  {cnpj:"07723713000475", sigla:"TOP", nome:"TOP Luz"},
  {cnpj:"57188272000184", sigla:"TL2", nome:"TLC Transporte e Logística"},
  {cnpj:"37859173000170", sigla:"SPR", nome:"Sousa Pires"},
  {cnpj:"15045348000504", sigla:"NWF", nome:"NWF Transportes e Logística"},
  {cnpj:"00001630217328", sigla:"NWF", nome:"NWF Transportes e Logística"},
  {cnpj:"07723713000637", sigla:"TOP", nome:"TOP Luz Transportes"},
  {cnpj:"82110818002094", sigla:"ALF", nome:"Alfa Transportes"},
  {cnpj:"82110818000393", sigla:"ALF", nome:"Alfa Transportes"},
  {cnpj:"01743404000138", sigla:"FAV", nome:"Favorita Transportes"},
  {cnpj:"01743404000308", sigla:"FAV", nome:"Favorita Transportes"},
  {cnpj:"01743404000561", sigla:"FAV", nome:"Favorita Transportes"},
  {cnpj:"01743404000642", sigla:"FAV", nome:"Favorita Transportes"},
  {cnpj:"01743404000480", sigla:"FAV", nome:"Favorita Transportes"},
  {cnpj:"01743404000995", sigla:"FAV", nome:"Favorita Transportes"},
  {cnpj:"01743404000804", sigla:"FAV", nome:"Favorita Transportes"},
  {cnpj:"01743404001100", sigla:"FAV", nome:"Favorita Transportes"},
  {cnpj:"01743404001290", sigla:"FAV", nome:"Favorita Transportes"},
  {cnpj:"01743404001452", sigla:"FAV", nome:"Favorita Transportes"},
  {cnpj:"01743404001533", sigla:"FAV", nome:"Favorita Transportes"},
  {cnpj:"08019654000179", sigla:"EPD", nome:"EP Distribuidora de Lubrificantes"},
  {cnpj:"08019654000411", sigla:"EPD", nome:"EP Distribuidora de Lubrificantes"},
  {cnpj:"08019654000683", sigla:"EPD", nome:"EP Distribuidora de Lubrificantes"}
];

// CNPJ/CPF -> só dígitos. Aceita com ou sem máscara.
function normalizarCnpj(v){
  return String(v || "").replace(/\D/g, "");
}

function carregarCnpjCadastro(){
  let lista = null;
  try{
    const raw = localStorage.getItem(KEYS.cnpjCadastro);
    const l = raw ? JSON.parse(raw) : null;
    if(Array.isArray(l)) lista = l; // respeita exclusões/edições do usuário
  }catch(e){}
  if(!lista) return CNPJ_CADASTRO_PADRAO.map(p => ({id: uid(), ...p}));
  // Acrescenta UMA vez os CNPJs padrão novos (não duplica, não recria o que foi excluído).
  let vistos = null;
  try{ vistos = JSON.parse(localStorage.getItem(KEYS.cnpjPadraoVistos) || "null"); }catch(e){}
  const set = new Set(Array.isArray(vistos) ? vistos : []);
  const primeiraVez = !Array.isArray(vistos);
  CNPJ_CADASTRO_PADRAO.forEach(p => {
    const n = normalizarCnpj(p.cnpj);
    if(set.has(n)) return;
    set.add(n);
    if(!lista.some(c => normalizarCnpj(c.cnpj) === n)) lista.push({id: uid(), ...p});
  });
  try{
    localStorage.setItem(KEYS.cnpjPadraoVistos, JSON.stringify([...set]));
    localStorage.setItem(KEYS.cnpjCadastro, JSON.stringify(lista));
  }catch(e){}
  return lista;
}
function salvarCnpjCadastro(){ localStorage.setItem(KEYS.cnpjCadastro, JSON.stringify(CNPJ_CADASTRO)); }
let CNPJ_CADASTRO = carregarCnpjCadastro();

// Acha o cadastro (grupo/sigla) de um CNPJ. Devolve null se não cadastrado
// — quem chama decide o que fazer (cair pra UNIDADE, sinalizar pendente...).
function buscarCnpjCadastro(cnpj){
  const norm = normalizarCnpj(cnpj);
  if(!norm) return null;
  return CNPJ_CADASTRO.find(c => normalizarCnpj(c.cnpj) === norm) || null;
}

/* ================= CLIENTES PREMIUM =====================================
   Cadastro editável (tela em Confirmação de Filiais). Chave = CNPJ. Se o
   cliente tiver Focal (e, opcionalmente, unidades) cadastrados, um documento
   cujo pagador tem esse CNPJ vai para esse Focal quando a unidade de entrega
   estiver na lista (ou quando a lista de unidades estiver vazia). Fora
   disso, vale a regra normal pela unidade. */
/* Grupos pré-configurados (CNPJ -> Focal). unidades "" = vale para todas as unidades.
   EGO continua restrito às unidades CRT, RUB, CRI, ITA (como já estava). */
const PREMIUM_GRUPOS_PADRAO = [
  {focalId:"sac1", sigla:"TLC", nome:"LC Encomendas e Cargas", unidades:"", cnpjs:["02999822000153","02999822000404","02999822000234"]},
  {focalId:"sac1", sigla:"RIT", nome:"Rápido Iporá Transportes", unidades:"", cnpjs:["00673682000101","00673682000284"]},
  {focalId:"sac1", sigla:"USE", nome:"USE Transportes", unidades:"", cnpjs:["11290687000163","11290687000244"]},
  {focalId:"sac1", sigla:"IVC", nome:"Invicta Transportes", unidades:"", cnpjs:["08594292000140","08594292000301"]},
  {focalId:"sac1", sigla:"CW3", nome:"CW3 Transportes e Logística", unidades:"", cnpjs:["17794044000133","17794044000214","17794044000303","17794044000486","17794044000567"]},
  {focalId:"sac1", sigla:"AL2", nome:"All Cargo Logística e Transporte", unidades:"", cnpjs:["38462304000143","38462304000810"]},
  {focalId:"sac1", sigla:"NWF", nome:"NWF Transportes e Logística", unidades:"", cnpjs:["15045348000172","15045348000504","00001630217328","15045348000253","15045348000334"]},
  {focalId:"sac1", sigla:"SPR", nome:"Sousa Pires Transportes", unidades:"", cnpjs:["37859173000170"]},
  {focalId:"sac1", sigla:"TNG", nome:"DELPS Transportes e Logística", unidades:"", cnpjs:["03673321000145","03673321000811","03673321000650"]},
  {focalId:"sac1", sigla:"TOP", nome:"TOP Luz Transportes", unidades:"", cnpjs:["07723713000203","07723713000475","07723713000637","07723713000122"]},
  {focalId:"sac3", sigla:"EGO", nome:"Expresso Goiás e Logística", unidades:"", cnpjs:["38475768000194","38475768000275","38475768000437","64123518000103","64123518000286"]},
  {focalId:"sac4", sigla:"ALF", nome:"Alfa Transportes", unidades:"", cnpjs:["82110818002094","82110818000393"]},
  {focalId:"sac5", sigla:"FAV", nome:"Favorita Transportes", unidades:"", cnpjs:["01743404000138","01743404000308","01743404000561","01743404000642","01743404000480","01743404000995","01743404000804","01743404001100","01743404001290","01743404001452","01743404001533"]},
  {focalId:"sac5", sigla:"EPD", nome:"EP Distribuidora de Lubrificantes", unidades:"", cnpjs:["08019654000179","08019654000411","08019654000683"]},
];
const CLIENTES_PREMIUM_PADRAO = PREMIUM_GRUPOS_PADRAO.flatMap(g =>
  g.cnpjs.map(cnpj => ({cnpj, nome:g.nome, unidades:g.unidades, focalId:g.focalId}))
);

function carregarClientesPremium(){
  let lista = null;
  try{
    const l = JSON.parse(localStorage.getItem(KEYS.clientesPremium) || "null");
    if(Array.isArray(l)) lista = l;
  }catch(e){}
  if(!lista) return CLIENTES_PREMIUM_PADRAO.map(c => ({id: uid(), ...c}));
  // Quem já tinha lista salva recebe os CNPJs padrão novos UMA vez (sem duplicar e sem
  // recriar o que o usuário excluiu depois).
  let vistos = null;
  try{ vistos = JSON.parse(localStorage.getItem(KEYS.premiumPadraoVistos) || "null"); }catch(e){}
  const set = new Set(Array.isArray(vistos) ? vistos : []);
  CLIENTES_PREMIUM_PADRAO.forEach(p => {
    const n = normalizarCnpj(p.cnpj);
    if(set.has(n)) return;
    set.add(n);
    if(!lista.some(c => normalizarCnpj(c.cnpj) === n)) lista.push({id: uid(), ...p});
  });
  try{
    localStorage.setItem(KEYS.premiumPadraoVistos, JSON.stringify([...set]));
    localStorage.setItem(KEYS.clientesPremium, JSON.stringify(lista));
  }catch(e){}
  return lista;
}
function salvarClientesPremium(){ localStorage.setItem(KEYS.clientesPremium, JSON.stringify(CLIENTES_PREMIUM)); }
let CLIENTES_PREMIUM = carregarClientesPremium();

function buscarClientePremium(cnpj){
  const norm = normalizarCnpj(cnpj);
  if(!norm) return null;
  return CLIENTES_PREMIUM.find(c => normalizarCnpj(c.cnpj) === norm) || null;
}

/* ---------- storage helpers ---------- */
function load(key){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}
function save(key, data){
  localStorage.setItem(key, JSON.stringify(data));
}

/* ---------- date helpers ---------- */
function todayISO(){
  const d = new Date();
  return d.toISOString().slice(0,10);
}
function addDaysISO(iso, n){
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0,10);
}
function fmtDate(iso){
  if(!iso) return "-";
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function daysDiff(fromISO, toISO){
  const a = new Date(fromISO + "T00:00:00");
  const b = new Date(toISO + "T00:00:00");
  return Math.round((b - a) / (1000*60*60*24));
}
function uid(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}
function money(v){
  const n = Number(v)||0;
  return n.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});
}

/* ---------- initial data ---------- */
function ensureConfirmacoes(){
  let list = load(KEYS.confirmacoes);
  const existing = new Set(list.map(c => c.filial));
  FILIAIS.forEach(f => {
    if(!existing.has(f)){
      list.push({filial:f, enviado:"nao", data:""});
    }
  });
  save(KEYS.confirmacoes, list);
  return list;
}

/* ================= TAB NAVIGATION ================= */
// "group" organiza o menu lateral em blocos, sem esconder nada:
//   null    -> fica fora de qualquer bloco (ex.: Dashboard)
//   "geral" -> usado tanto pela Tambasa quanto pelo Do Valle
//   "tambasa" -> exclusivo da operação Tambasa
const NAV_GROUP_LABELS = {
  geral: "Uso geral · Tambasa + Do Valle",
  tambasa: "Somente Tambasa"
};

const TABS = [
  {id:"dashboard", label:"Dashboard", icon:"dashboard", group:null},
  {id:"trocas", label:"Trocas", icon:"trocas", group:"geral"},
  {id:"boletos", label:"Boletos / Faturamento", icon:"boletos", group:"geral"},
  {id:"pendencias", label:"Pendências Abertas", icon:"pendencias", group:"geral"},
  {id:"confirmacao", label:"Confirmação de Filiais", icon:"confirmacao", group:"geral"},
  {id:"ocorrencias", label:"Ocorrências", icon:"ocorrencias", group:"geral"},
  {id:"pacotes", label:"Pacotes", icon:"pacotes", group:"tambasa"},
  {id:"previstas", label:"Entregas Previstas", icon:"entregas", group:"tambasa"},
  {id:"performance", label:"Performance", icon:"performance", group:"tambasa"},
  {id:"performance-geral", label:"Performance Geral", icon:"performance-geral", group:"tambasa"},
  {id:"fechamento-receita", label:"Fechamento-RECEITA", icon:"fechamento-receita", group:"tambasa"},
  {id:"entregas", label:"Controle de Entregas", icon:"entregas", group:"tambasa"}
];

// Ícones de linha (sem emoji), herdam a cor do texto do botão via currentColor.
const NAV_ICONS = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/></svg>',
  trocas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/></svg>',
  boletos: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="1.6"/><path d="M3.5 10h17"/><path d="M7 14.5h4"/></svg>',
  pendencias: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5"/><circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="none"/></svg>',
  confirmacao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V6.5L12 3l7 3.5V21"/><path d="M5 21h14"/><path d="M9.5 21v-5h5v5"/></svg>',
  ocorrencias: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 21 19H3z"/><path d="M12 9.5v4"/><circle cx="12" cy="16" r="0.6" fill="currentColor" stroke="none"/></svg>',
  pacotes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5 12 3l8.5 4.5L12 12z"/><path d="M3.5 7.5V16L12 21l8.5-5V7.5"/><path d="M12 12v9"/></svg>',
  performance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10"/><path d="M11 20V4"/><path d="M18 20v-7"/></svg>',
  "performance-geral": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19h16"/><path d="M4 15.5 9.5 10l3.5 3 6-6.5"/></svg>',
  "fechamento-receita": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9"/><path d="M14.7 9.8c0-1.1-1.2-1.9-2.7-1.9s-2.7.8-2.7 1.8c0 2.6 5.4 1.3 5.4 3.9 0 1-1.2 1.8-2.7 1.8s-2.7-.8-2.7-1.9"/></svg>',
  entregas: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="7.5" width="11" height="9" rx="1"/><path d="M13.5 10.5h4l3 3v3h-7z"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/></svg>'
};

let abaAtual = "dashboard";

// Menu lateral, organizado em blocos (ver NAV_GROUP_LABELS). A navegação entre
// Dashboard Principal / Por Unidade / Por Focal do "Performance Geral" (Fechamento)
// agora é interna à própria aba (ver PG_SUBTABS), sem sub-menu na sidebar.
function renderNav(){
  const nav = document.getElementById("tabsNav");
  let grupoAberto = undefined;
  nav.innerHTML = TABS.map(t => {
    const ativo = t.id === abaAtual;
    let html = "";
    if(t.group !== grupoAberto){
      grupoAberto = t.group;
      if(grupoAberto && NAV_GROUP_LABELS[grupoAberto]){
        html += `<div class="side-nav-group-label">${escHtml(NAV_GROUP_LABELS[grupoAberto])}</div>`;
      }
    }
    html += `<button data-tab="${t.id}" class="${ativo?'active':''}" title="${escHtml(t.label)}"><span class="nav-icon">${NAV_ICONS[t.icon]||''}</span><span class="nav-label">${escHtml(t.label)}</span></button>`;
    return html;
  }).join("");
  nav.querySelectorAll("button[data-tab]").forEach(btn=>{
    btn.addEventListener("click", ()=> switchTab(btn.dataset.tab));
  });
}

function switchTab(tabId){
  abaAtual = tabId;
  renderNav();
  document.querySelectorAll(".section").forEach(s=>{
    s.classList.toggle("active", s.id === "sec-"+tabId);
  });
  const tabInfo = TABS.find(t=>t.id===tabId);
  const pageTitle = document.getElementById("pageTitle");
  if(pageTitle && tabInfo) pageTitle.textContent = tabInfo.label;
  if(tabId === "dashboard"){
    document.getElementById("sec-dashboard").innerHTML = dashboardHTML();
    dashAfterRender();
  }
  closeMobileSidebar();
}

function closeMobileSidebar(){
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if(sidebar) sidebar.classList.remove("open");
  if(overlay) overlay.classList.remove("show");
}

function setTodayLabel(){
  const el = document.getElementById("todayLabel");
  if(!el) return;
  const d = new Date();
  el.textContent = d.toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'long', year:'numeric'});
}

/* ================= MAIN RENDER ================= */
function renderApp(){
  const main = document.getElementById("mainContent");
  main.innerHTML = `
    <section class="section active" id="sec-dashboard">${dashboardHTML()}</section>
    <section class="section" id="sec-trocas">${trocasHTML()}</section>
    <section class="section" id="sec-boletos">${boletosHTML()}</section>
    <section class="section" id="sec-pendencias">${pendenciasHTML()}</section>
    <section class="section" id="sec-confirmacao">${confirmacaoHTML()}</section>
    <section class="section" id="sec-pacotes">${pacotesHTML()}</section>
    <section class="section" id="sec-previstas">${previstasHTML()}</section>
    <section class="section" id="sec-performance">${performanceHTML()}</section>
    <section class="section" id="sec-performance-geral">${performanceGeralHTML()}</section>
    <section class="section" id="sec-fechamento-receita">${fechamentoReceitaHTML()}</section>
    <section class="section" id="sec-entregas">${entregasHTML()}</section>
    <section class="section" id="sec-ocorrencias">${ocorrenciasHTML()}</section>
  `;
  attachTrocasEvents();
  attachBoletosEvents();
  attachPendenciasEvents();
  attachConfirmacaoEvents();
  attachPacotesEvents();
  attachPrevistasEvents();
  attachPerformanceEvents();
  attachPerformanceGeralEvents();
  attachFechamentoReceitaEvents();
  attachEntregasEvents();
  attachOcorrenciasEvents();
  dashAfterRender();
}

/* ================= TROCAS ================= */
function trocasHTML(){
  return `
    <h2 class="section-title">Controle de Trocas</h2>

    <div class="ocor-nav">
      <div class="ocor-subtabs" id="trocasSubtabs" role="tablist" aria-label="Visão">
        <span class="ocor-subtabs-label">Visão</span>
        <div class="ocor-seg">
          <button type="button" role="tab" class="ocor-seg-btn trocasAbaBtn" data-aba="trocas">Trocas</button>
          <button type="button" role="tab" class="ocor-seg-btn trocasAbaBtn" data-aba="cobranca">Cobrança</button>
        </div>
      </div>
    </div>

    <div id="trocasAbaTrocas">
      <p class="section-desc">Cadastre a solicitação de troca manualmente, ou deixe que o sistema envie automaticamente os pacotes de <strong>SAC - Troca / Falta</strong> importados na aba Pacotes. O prazo de devolução é calculado automaticamente (5 dias após o envio). Itens marcados como "Devolvido: Sim" são ocultados da lista principal.</p>

      <div class="panel">
        <div class="panel-header">Nova solicitação de troca (manual)</div>
        <form class="add-form" id="formTroca">
          <div class="field"><label>NF</label><input type="text" id="trocaNf" required></div>
          <div class="field"><label>Filial responsável</label>
            <select id="trocaFilial" required>${FILIAIS.map(f=>`<option value="${f}">${f}</option>`).join("")}</select>
          </div>
          <div class="field"><label>Data de envio da solicitação</label><input type="date" id="trocaDataEnvio" required></div>
          <div class="field full" style="max-width:220px;">
            <button type="submit" class="btn btn-primary">Adicionar troca</button>
          </div>
        </form>
        <div class="footer-note">Data limite de devolução = data de envio + 5 dias.</div>
      </div>

      <div class="panel">
        <div class="panel-header">Trocas em aberto</div>
        <div class="toolbar">
          <label class="check-inline"><input type="checkbox" id="verDevolvidas"> Ver devolvidas / ocultas</label>
        </div>
        <div class="table-wrap" id="trocasTableWrap"></div>
      </div>
    </div>

    <div id="trocasAbaCobranca" style="display:none;">
      ${cobrancaHTML()}
    </div>
  `;
}

let trocasAbaAtiva = "trocas";

function trocarAbaTrocas(aba){
  trocasAbaAtiva = aba;
  document.querySelectorAll(".trocasAbaBtn").forEach(b=>{
    const ativo = b.dataset.aba === aba;
    b.classList.toggle("active", ativo);
    b.setAttribute("aria-selected", ativo ? "true" : "false");
  });
  const tro = document.getElementById("trocasAbaTrocas");
  const cob = document.getElementById("trocasAbaCobranca");
  if(tro) tro.style.display = aba === "trocas" ? "" : "none";
  if(cob) cob.style.display = aba === "cobranca" ? "" : "none";
  if(aba === "cobranca") renderCobrancaTable();
}

/* ================= TROCAS — COBRANÇA ================= */
// Sub-página dentro de Trocas: importa o mesmo arquivo do Controle de Entregas
// (relatório do SSW) e mostra NF, destinatário e cidade prontos. A pessoa só
// preenche a Filial responsável e a Observação direto na tabela — formato
// pensado pra tirar print e cobrar a filial no grupo de controle.
function cobrancaHTML(){
  return `
    <p class="section-desc">Importe o mesmo arquivo que você usa em <strong>Controle de Entregas</strong> (exportação da EXPRESSO GOIAS). O sistema já traz NF, destinatário e cidade prontos — você só marca a <strong>Filial responsável</strong> e escreve a <strong>Observação</strong> (ex.: "mercadoria em rota, favor colher mercadoria e nota" ou "mercadoria na unidade, favor confirmar troca"). Reimportar atualiza os dados já cadastrados (pela CTRC), sem apagar a filial/observação que você já preencheu.</p>

    <div class="panel">
      <div class="panel-header">Importar arquivo</div>
      <form class="add-form" id="formCobrancaArquivo">
        <div class="field"><label>Arquivo (.csv / .sswweb / .txt)</label><input type="file" id="cobrancaArquivoInput" accept=".csv,.sswweb,.txt,text/plain"></div>
        <div class="field" style="max-width:200px;">
          <button type="submit" class="btn btn-primary">Processar arquivo</button>
        </div>
        <div class="field full">
          <button type="button" class="link-btn" id="toggleCobrancaColarTexto">ou colar o texto manualmente</button>
        </div>
      </form>
      <div id="cobrancaColarTextoWrap" style="display:none; padding:0 18px 16px;">
        <textarea id="cobrancaTextoManual" rows="6" style="width:100%; font-family:monospace; font-size:11.5px; padding:8px; border:1px solid var(--line); border-radius:6px;" placeholder="Cole aqui o conteúdo do arquivo..."></textarea>
        <div style="margin-top:8px;"><button type="button" class="btn btn-ghost btn-sm" id="processarCobrancaTextoManual">Processar texto colado</button></div>
      </div>
      <div class="footer-note" id="cobrancaImportStatus"></div>
    </div>

    <div class="panel" id="cobrancaTablePanel">
      <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <span>Cobrança de filiais</span>
        <div class="toolbar-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="cobrancaFullscreenBtn">Tela cheia</button>
        </div>
      </div>
      <div class="toolbar">
        <label class="check-inline">
          Buscar: <input type="text" class="small-input" id="cobrancaBusca" placeholder="Destinatário, cidade ou NF..." style="width:200px;">
        </label>
        <label class="check-inline"><input type="checkbox" id="cobrancaSoPendentes"> Só sem filial preenchida</label>
        <button type="button" class="link-btn danger" id="limparCobranca">Limpar cobranças importadas</button>
      </div>
      <div class="table-wrap" id="cobrancaTableWrap"></div>
    </div>
  `;
}

// Upsert por CTRC, igual ao Controle de Entregas — preserva filial/observação
// já preenchidas quando reimporta.
function importCobranca(parsed){
  const filtradas = filtraRemetentesDesejados(parsed.rows);
  const existentes = load(KEYS.trocasCobranca);
  const porCtrc = new Map(existentes.map(e => [e.ctrc, e]));
  let novos = 0, atualizados = 0;
  filtradas.forEach(r => {
    if(porCtrc.has(r.ctrc)){
      const atual = porCtrc.get(r.ctrc);
      Object.assign(atual, r);
      atualizados++;
    } else {
      const item = {id: uid(), filial: "", observacoes: "", ...r};
      porCtrc.set(r.ctrc, item);
      novos++;
    }
  });
  save(KEYS.trocasCobranca, Array.from(porCtrc.values()));
  return {totalArquivo: parsed.rows.length, filtradas: filtradas.length, novos, atualizados};
}

function renderCobrancaTable(){
  const wrap = document.getElementById("cobrancaTableWrap");
  if(!wrap) return;
  const busca = (document.getElementById("cobrancaBusca")?.value || "").trim().toLowerCase();
  const soPendentes = document.getElementById("cobrancaSoPendentes")?.checked;

  let list = load(KEYS.trocasCobranca);
  if(busca){
    list = list.filter(r =>
      (r.destinatario||"").toLowerCase().includes(busca) ||
      (r.cidadeDestino||"").toLowerCase().includes(busca) ||
      (r.nfiscal||"").toLowerCase().includes(busca)
    );
  }
  if(soPendentes) list = list.filter(r => !r.filial);

  if(list.length===0){
    wrap.innerHTML = `<div class="empty">Nenhum registro ${soPendentes||busca?'encontrado':'importado ainda'}.</div>`;
    return;
  }

  list.sort((a,b)=> (a.destinatario||"").localeCompare(b.destinatario||""));

  wrap.innerHTML = `
    <table>
      <thead><tr>
        <th>NF</th><th>Cliente / Destinatário</th><th>Cidade</th><th>Última ocorrência</th><th>Filial responsável</th><th>Observação</th><th></th>
      </tr></thead>
      <tbody>
        ${list.map(r=>{
          const semFilial = !r.filial;
          return `
            <tr class="${semFilial?'row-warn':''}">
              <td>${escHtml(r.nfiscal || "-")}</td>
              <td style="max-width:220px; white-space:normal;">${escHtml(r.destinatario || "-")}</td>
              <td style="max-width:160px; white-space:normal;">${escHtml(r.cidadeDestino || "-")}</td>
              <td>${escHtml(r.ultimaOcorrencia || "-")}</td>
              <td>
                <select class="small-select cobranca-filial ${semFilial?'campo-pendente':''}" data-id="${r.id}">
                  <option value="" ${!r.filial?"selected":""}>Selecionar...</option>
                  ${FILIAIS.map(f=>`<option value="${f}" ${r.filial===f?"selected":""}>${f}</option>`).join("")}
                </select>
              </td>
              <td><input type="text" class="small-input cobranca-obs" data-id="${r.id}" value="${(r.observacoes||"").replace(/"/g,'&quot;')}" placeholder="Observação..." style="width:220px;"></td>
              <td><button class="link-btn danger cobranca-del" data-id="${r.id}">Excluir</button></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll(".cobranca-filial").forEach(sel=>{
    sel.addEventListener("change", ()=>{
      const list = load(KEYS.trocasCobranca);
      const item = list.find(r=>r.id===sel.dataset.id);
      if(item){ item.filial = sel.value; save(KEYS.trocasCobranca, list); }
      renderCobrancaTable();
    });
  });
  wrap.querySelectorAll(".cobranca-obs").forEach(inp=>{
    inp.addEventListener("change", ()=>{
      const list = load(KEYS.trocasCobranca);
      const item = list.find(r=>r.id===inp.dataset.id);
      if(item){ item.observacoes = inp.value; save(KEYS.trocasCobranca, list); }
    });
  });
  wrap.querySelectorAll(".cobranca-del").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if(!confirm("Excluir este registro?")) return;
      let list = load(KEYS.trocasCobranca);
      list = list.filter(r=>r.id!==btn.dataset.id);
      save(KEYS.trocasCobranca, list);
      renderCobrancaTable();
    });
  });
}

function attachCobrancaEvents(){
  const form = document.getElementById("formCobrancaArquivo");
  const statusEl = document.getElementById("cobrancaImportStatus");

  function relatarImportacao(parsed, result){
    if(!result || result.totalArquivo === 0){
      statusEl.textContent = "Não encontrei linhas de dados nesse arquivo. Confira se é o arquivo certo.";
      return;
    }
    statusEl.textContent = `${result.totalArquivo} linha(s) no arquivo, ${result.filtradas} válida(s) — ${result.novos} nova(s), ${result.atualizados} atualizada(s).`;
  }

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const fileInput = document.getElementById("cobrancaArquivoInput");
    const file = fileInput.files[0];
    if(!file){ statusEl.textContent = "Selecione o arquivo."; return; }
    try{
      const text = await readFileAsLatin1(file);
      const parsed = parseEntregasCsv(text);
      if(parsed.rows.length === 0){
        statusEl.textContent = "Não encontrei linhas de dados nesse arquivo. Confira se é o arquivo certo.";
        return;
      }
      const result = importCobranca(parsed);
      relatarImportacao(parsed, result);
      fileInput.value = "";
      renderCobrancaTable();
    }catch(err){
      console.error("Erro ao importar cobrança:", err);
      statusEl.textContent = "Não foi possível ler esse arquivo (" + (err.message||err) + "). Tente colar o texto manualmente.";
    }
  });

  document.getElementById("toggleCobrancaColarTexto").addEventListener("click", ()=>{
    const wrap = document.getElementById("cobrancaColarTextoWrap");
    wrap.style.display = wrap.style.display === "none" ? "block" : "none";
  });

  document.getElementById("processarCobrancaTextoManual").addEventListener("click", ()=>{
    const text = document.getElementById("cobrancaTextoManual").value;
    if(!text.trim()){ statusEl.textContent = "Cole o texto antes de processar."; return; }
    const parsed = parseEntregasCsv(text);
    if(parsed.rows.length === 0){
      statusEl.textContent = "Não encontrei linhas de dados nesse texto.";
      return;
    }
    const result = importCobranca(parsed);
    relatarImportacao(parsed, result);
    document.getElementById("cobrancaTextoManual").value = "";
    renderCobrancaTable();
  });

  document.getElementById("limparCobranca").addEventListener("click", ()=>{
    if(!confirm("Remover todas as cobranças importadas?")) return;
    save(KEYS.trocasCobranca, []);
    renderCobrancaTable();
  });

  document.getElementById("cobrancaBusca").addEventListener("input", renderCobrancaTable);
  document.getElementById("cobrancaSoPendentes").addEventListener("change", renderCobrancaTable);

  const fsBtn = document.getElementById("cobrancaFullscreenBtn");
  if(fsBtn){
    fsBtn.addEventListener("click", ()=> toggleFullscreen("cobrancaTablePanel"));
    updateFullscreenBtnLabel("cobrancaTablePanel", "cobrancaFullscreenBtn");
  }

  document.querySelectorAll(".trocasAbaBtn").forEach(btn=>{
    btn.addEventListener("click", ()=> trocarAbaTrocas(btn.dataset.aba));
  });
  trocarAbaTrocas("trocas");

  renderCobrancaTable();
}

function renderTrocasTable(){
  const wrap = document.getElementById("trocasTableWrap");
  if(!wrap) return;
  const verDevolvidas = document.getElementById("verDevolvidas").checked;
  const hoje = todayISO();
  let list = load(KEYS.trocas);
  list = verDevolvidas ? list : list.filter(t=>t.devolvido!=="sim");

  if(list.length===0){
    wrap.innerHTML = `<div class="empty">Nenhuma troca ${verDevolvidas?'cadastrada':'em aberto'}.</div>`;
    return;
  }

  list.sort((a,b)=> a.dataLimite.localeCompare(b.dataLimite));

  wrap.innerHTML = `
    <table>
      <thead><tr>
        <th>NF</th><th>Cliente</th><th>CNPJ/CPF</th><th>Cidade</th><th>Filial</th><th>Envio</th><th>Prazo devolução</th><th>Situação</th><th>Devolvido?</th><th>Observação</th><th></th>
      </tr></thead>
      <tbody>
        ${list.map(t=>{
          const d = daysDiff(hoje, t.dataLimite);
          let rowClass = "";
          let badge = "";
          if(t.devolvido==="sim"){
            rowClass = "";
            badge = `<span class="badge badge-green">Devolvida</span>`;
          } else if(d < 0){
            rowClass = "row-alert";
            badge = `<span class="badge badge-red">Atrasada ${Math.abs(d)}d — priorizar</span>`;
          } else if(d <= 1){
            rowClass = "row-warn";
            badge = `<span class="badge badge-amber">Vence em ${d===0?'hoje':d+'d'}</span>`;
          } else {
            badge = `<span class="badge badge-gray">No prazo (${d}d)</span>`;
          }
          const semFilial = !t.filial;
          return `
            <tr class="${rowClass}">
              <td>${t.nf}</td>
              <td style="max-width:200px; white-space:normal;">${t.cliente || "-"}</td>
              <td>${t.docCliente || "-"}</td>
              <td style="max-width:160px; white-space:normal;">${t.cidade || "-"}</td>
              <td>
                <select class="small-select troca-filial ${semFilial?'campo-pendente':''}" data-id="${t.id}">
                  <option value="" ${!t.filial?"selected":""}>Selecionar...</option>
                  ${FILIAIS.map(f=>`<option value="${f}" ${t.filial===f?"selected":""}>${f}</option>`).join("")}
                </select>
              </td>
              <td><input type="date" class="small-input troca-envio" data-id="${t.id}" value="${t.dataEnvio||''}" style="width:130px;"></td>
              <td>${fmtDate(t.dataLimite)}</td>
              <td>${badge}</td>
              <td>
                <select class="small-select troca-devolvido" data-id="${t.id}">
                  <option value="nao" ${t.devolvido!=="sim"?"selected":""}>Não</option>
                  <option value="sim" ${t.devolvido==="sim"?"selected":""}>Sim</option>
                </select>
              </td>
              <td><input type="text" class="small-input troca-obs" data-id="${t.id}" value="${(t.observacoes||"").replace(/"/g,'&quot;')}" placeholder="Observação..." style="width:140px;"></td>
              <td><button class="link-btn danger troca-del" data-id="${t.id}">Excluir</button></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll(".troca-devolvido").forEach(sel=>{
    sel.addEventListener("change", ()=>{
      const list = load(KEYS.trocas);
      const item = list.find(t=>t.id===sel.dataset.id);
      if(item){
        item.devolvido = sel.value;
        item.dataDevolvido = sel.value==="sim" ? todayISO() : "";
        save(KEYS.trocas, list);
      }
      renderTrocasTable();
    });
  });
  wrap.querySelectorAll(".troca-filial").forEach(sel=>{
    sel.addEventListener("change", ()=>{
      const list = load(KEYS.trocas);
      const item = list.find(t=>t.id===sel.dataset.id);
      if(item){ item.filial = sel.value; save(KEYS.trocas, list); }
      renderTrocasTable();
    });
  });
  wrap.querySelectorAll(".troca-envio").forEach(inp=>{
    inp.addEventListener("change", ()=>{
      if(!inp.value) return;
      const list = load(KEYS.trocas);
      const item = list.find(t=>t.id===inp.dataset.id);
      if(item){
        item.dataEnvio = inp.value;
        item.dataLimite = addDaysISO(inp.value, 5);
        save(KEYS.trocas, list);
      }
      renderTrocasTable();
    });
  });
  wrap.querySelectorAll(".troca-obs").forEach(inp=>{
    inp.addEventListener("change", ()=>{
      const list = load(KEYS.trocas);
      const item = list.find(t=>t.id===inp.dataset.id);
      if(item){ item.observacoes = inp.value; save(KEYS.trocas, list); }
    });
  });
  wrap.querySelectorAll(".troca-del").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if(!confirm("Excluir esta troca?")) return;
      let list = load(KEYS.trocas);
      list = list.filter(t=>t.id!==btn.dataset.id);
      save(KEYS.trocas, list);
      renderTrocasTable();
    });
  });
}

function attachTrocasEvents(){
  const form = document.getElementById("formTroca");
  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const nf = document.getElementById("trocaNf").value.trim();
    const filial = document.getElementById("trocaFilial").value;
    const dataEnvio = document.getElementById("trocaDataEnvio").value;
    if(!nf || !dataEnvio) return;
    const item = {
      id: uid(),
      nf, filial,
      cliente: "",
      docCliente: "",
      cidade: "",
      dataEnvio,
      dataLimite: addDaysISO(dataEnvio, 5),
      devolvido: "nao",
      dataDevolvido: "",
      observacoes: ""
    };
    const list = load(KEYS.trocas);
    list.push(item);
    save(KEYS.trocas, list);
    form.reset();
    renderTrocasTable();
  });
  document.getElementById("verDevolvidas").addEventListener("change", renderTrocasTable);
  renderTrocasTable();

  attachCobrancaEvents();
}

/* ================= BOLETOS / PENDÊNCIA FATURAMENTO ================= */
function boletosHTML(){
  return `
    <h2 class="section-title">Boletos / Pendência de Faturamento</h2>
    <p class="section-desc">O prazo limite para apresentar o processo é calculado automaticamente (8 dias antes do vencimento do boleto).</p>

    <div class="panel">
      <div class="panel-header">Nova pendência de boleto</div>
      <form class="add-form" id="formBoleto">
        <div class="field"><label>NF</label><input type="text" id="boletoNf" required></div>
        <div class="field"><label>Valor do débito (R$)</label><input type="number" step="0.01" id="boletoValor" required></div>
        <div class="field"><label>Data que recebeu o débito</label><input type="date" id="boletoDataRecebimento" required></div>
        <div class="field"><label>Vencimento do boleto</label><input type="date" id="boletoDataVencimento" required></div>
        <div class="field"><label>Enviado para prevenção?</label>
          <select id="boletoPrevencao"><option value="nao">Não</option><option value="sim">Sim</option></select>
        </div>
        <div class="field full"><label>Observações</label><textarea id="boletoObs" rows="2"></textarea></div>
        <div class="field full" style="max-width:220px;">
          <button type="submit" class="btn btn-primary">Adicionar boleto</button>
        </div>
      </form>
      <div class="footer-note">Data limite para apresentar processo = vencimento do boleto − 8 dias.</div>
    </div>

    <div class="panel">
      <div class="panel-header">Boletos / pendências cadastradas</div>
      <div class="table-wrap" id="boletosTableWrap"></div>
    </div>
  `;
}

function renderBoletosTable(){
  const wrap = document.getElementById("boletosTableWrap");
  if(!wrap) return;
  const hoje = todayISO();
  let list = load(KEYS.boletos);

  if(list.length===0){
    wrap.innerHTML = `<div class="empty">Nenhum boleto cadastrado.</div>`;
    return;
  }
  list.sort((a,b)=> a.dataLimiteProcesso.localeCompare(b.dataLimiteProcesso));

  wrap.innerHTML = `
    <table>
      <thead><tr>
        <th>NF</th><th>Valor</th><th>Recebido em</th><th>Vencimento</th><th>Prazo processo</th><th>Situação</th><th>Prevenção?</th><th>Obs.</th><th></th>
      </tr></thead>
      <tbody>
        ${list.map(b=>{
          const d = daysDiff(hoje, b.dataLimiteProcesso);
          let rowClass = "";
          let badge = "";
          if(b.prevencao==="sim"){
            badge = `<span class="badge badge-green">Enviado à prevenção</span>`;
          } else if(d < 0){
            rowClass = "row-alert";
            badge = `<span class="badge badge-red">Prazo vencido há ${Math.abs(d)}d</span>`;
          } else if(d <= 2){
            rowClass = "row-warn";
            badge = `<span class="badge badge-amber">Vence em ${d===0?'hoje':d+'d'}</span>`;
          } else {
            badge = `<span class="badge badge-gray">No prazo (${d}d)</span>`;
          }
          return `
            <tr class="${rowClass}">
              <td>${b.nf}</td>
              <td>R$ ${money(b.valor)}</td>
              <td>${fmtDate(b.dataRecebimento)}</td>
              <td>${fmtDate(b.dataVencimento)}</td>
              <td>${fmtDate(b.dataLimiteProcesso)}</td>
              <td>${badge}</td>
              <td>
                <select class="small-select boleto-prevencao" data-id="${b.id}">
                  <option value="nao" ${b.prevencao!=="sim"?"selected":""}>Não</option>
                  <option value="sim" ${b.prevencao==="sim"?"selected":""}>Sim</option>
                </select>
              </td>
              <td style="max-width:180px; white-space:normal;">${b.observacoes ? b.observacoes : "-"}</td>
              <td><button class="link-btn danger boleto-del" data-id="${b.id}">Excluir</button></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll(".boleto-prevencao").forEach(sel=>{
    sel.addEventListener("change", ()=>{
      const list = load(KEYS.boletos);
      const item = list.find(b=>b.id===sel.dataset.id);
      if(item){ item.prevencao = sel.value; save(KEYS.boletos, list); }
      renderBoletosTable();
    });
  });
  wrap.querySelectorAll(".boleto-del").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if(!confirm("Excluir este boleto?")) return;
      let list = load(KEYS.boletos);
      list = list.filter(b=>b.id!==btn.dataset.id);
      save(KEYS.boletos, list);
      renderBoletosTable();
    });
  });
}

function attachBoletosEvents(){
  const form = document.getElementById("formBoleto");
  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const nf = document.getElementById("boletoNf").value.trim();
    const valor = document.getElementById("boletoValor").value;
    const dataRecebimento = document.getElementById("boletoDataRecebimento").value;
    const dataVencimento = document.getElementById("boletoDataVencimento").value;
    const prevencao = document.getElementById("boletoPrevencao").value;
    const observacoes = document.getElementById("boletoObs").value.trim();
    if(!nf || !dataVencimento || !dataRecebimento) return;
    const item = {
      id: uid(),
      nf, valor,
      dataRecebimento,
      dataVencimento,
      dataLimiteProcesso: addDaysISO(dataVencimento, -8),
      prevencao,
      observacoes
    };
    const list = load(KEYS.boletos);
    list.push(item);
    save(KEYS.boletos, list);
    form.reset();
    renderBoletosTable();
  });
  renderBoletosTable();
}

/* ================= PENDÊNCIAS ABERTAS ================= */
function pendenciasHTML(){
  return `
    <h2 class="section-title">Pendências em Aberto</h2>
    <p class="section-desc">Registre qualquer pendência que ainda não foi resolvida: custo, ocorrência, débito, falta, avaria ou outros.</p>

    <div class="panel">
      <div class="panel-header">Nova pendência</div>
      <form class="add-form" id="formPendencia">
        <div class="field"><label>Tipo de pendência</label>
          <select id="pendTipo">${TIPOS_PENDENCIA.map(t=>`<option value="${t}">${t}</option>`).join("")}</select>
        </div>
        <div class="field" id="pendOutroWrap" style="display:none;"><label>Especifique</label><input type="text" id="pendOutro"></div>
        <div class="field"><label>NF</label><input type="text" id="pendNf" required></div>
        <div class="field"><label>Filial</label>
          <select id="pendFilial" required>${FILIAIS.map(f=>`<option value="${f}">${f}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Data que entrou no sistema</label><input type="date" id="pendData" required></div>
        <div class="field full"><label>Observações</label><textarea id="pendObs" rows="2" placeholder="Detalhes, andamento, contato responsável, etc."></textarea></div>
        <div class="field full" style="max-width:220px;">
          <button type="submit" class="btn btn-primary">Adicionar pendência</button>
        </div>
      </form>
    </div>

    <div class="panel">
      <div class="panel-header">Pendências não resolvidas</div>
      <div class="toolbar">
        <label class="check-inline"><input type="checkbox" id="verResolvidas"> Ver resolvidas</label>
      </div>
      <div class="table-wrap" id="pendenciasTableWrap"></div>
    </div>
  `;
}

function renderPendenciasTable(){
  const wrap = document.getElementById("pendenciasTableWrap");
  if(!wrap) return;
  const verResolvidas = document.getElementById("verResolvidas").checked;
  const hoje = todayISO();
  let list = load(KEYS.pendencias);
  list = verResolvidas ? list : list.filter(p=>p.resolvido!=="sim");

  if(list.length===0){
    wrap.innerHTML = `<div class="empty">Nenhuma pendência ${verResolvidas?'cadastrada':'em aberto'}.</div>`;
    return;
  }
  list.sort((a,b)=> a.dataSistema.localeCompare(b.dataSistema));

  wrap.innerHTML = `
    <table>
      <thead><tr>
        <th>Tipo</th><th>NF</th><th>Filial</th><th>Data no sistema</th><th>Dias em aberto</th><th>Observações</th><th>Resolvido?</th><th></th>
      </tr></thead>
      <tbody>
        ${list.map(p=>{
          const dias = daysDiff(p.dataSistema, hoje);
          let rowClass = "";
          if(p.resolvido==="sim"){ rowClass=""; }
          else if(dias >= 10){ rowClass = "row-alert"; }
          else if(dias >= 5){ rowClass = "row-warn"; }
          const tipoLabel = p.tipo === "Outros" && p.tipoOutro ? `Outros — ${p.tipoOutro}` : p.tipo;
          return `
            <tr class="${rowClass}">
              <td>${tipoLabel}</td>
              <td>${p.nf}</td>
              <td>${p.filial}</td>
              <td>${fmtDate(p.dataSistema)}</td>
              <td>${p.resolvido==="sim" ? "-" : dias + "d"}</td>
              <td style="max-width:220px; white-space:normal;">${p.observacoes ? p.observacoes : "-"}</td>
              <td>
                <select class="small-select pend-resolvido" data-id="${p.id}">
                  <option value="nao" ${p.resolvido!=="sim"?"selected":""}>Não</option>
                  <option value="sim" ${p.resolvido==="sim"?"selected":""}>Sim</option>
                </select>
              </td>
              <td><button class="link-btn danger pend-del" data-id="${p.id}">Excluir</button></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll(".pend-resolvido").forEach(sel=>{
    sel.addEventListener("change", ()=>{
      const list = load(KEYS.pendencias);
      const item = list.find(p=>p.id===sel.dataset.id);
      if(item){ item.resolvido = sel.value; save(KEYS.pendencias, list); }
      renderPendenciasTable();
    });
  });
  wrap.querySelectorAll(".pend-del").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      if(!confirm("Excluir esta pendência?")) return;
      let list = load(KEYS.pendencias);
      list = list.filter(p=>p.id!==btn.dataset.id);
      save(KEYS.pendencias, list);
      renderPendenciasTable();
    });
  });
}

function attachPendenciasEvents(){
  const tipoSel = document.getElementById("pendTipo");
  tipoSel.addEventListener("change", ()=>{
    document.getElementById("pendOutroWrap").style.display = tipoSel.value==="Outros" ? "flex" : "none";
  });
  const form = document.getElementById("formPendencia");
  form.addEventListener("submit", (e)=>{
    e.preventDefault();
    const tipo = document.getElementById("pendTipo").value;
    const tipoOutro = document.getElementById("pendOutro").value.trim();
    const nf = document.getElementById("pendNf").value.trim();
    const filial = document.getElementById("pendFilial").value;
    const dataSistema = document.getElementById("pendData").value;
    const observacoes = document.getElementById("pendObs").value.trim();
    if(!nf || !dataSistema) return;
    const item = { id: uid(), tipo, tipoOutro, nf, filial, dataSistema, observacoes, resolvido:"nao" };
    const list = load(KEYS.pendencias);
    list.push(item);
    save(KEYS.pendencias, list);
    form.reset();
    document.getElementById("pendOutroWrap").style.display = "none";
    renderPendenciasTable();
  });
  document.getElementById("verResolvidas").addEventListener("change", renderPendenciasTable);
  renderPendenciasTable();
}

/* ================= CONFIRMAÇÃO DE FILIAIS ================= */
let confirmacaoSubAba = "filiais";
function confirmacaoHTML(){
  const abas = [["filiais","Filiais"],["focais","Focais (SAC)"],["premium","Clientes Premium"],["cnpj","Cadastro de CNPJ"]];
  return `
    <h2 class="section-title">Confirmação de Filiais</h2>
    <p class="section-desc">Controle de envio das filiais e cadastros de apoio (Focais, Clientes Premium e CNPJ).</p>
    <div class="pg-subtabs" id="confSubtabs">
      ${abas.map(([id,t]) => `<button type="button" class="pg-subtab-btn${id===confirmacaoSubAba?" active":""}" data-conf-sub="${id}">${t}</button>`).join("")}
    </div>
    <div class="pg-subview${confirmacaoSubAba==="filiais"?" active":""}" id="confSub-filiais">
      <p class="section-desc">Marque quando cada filial enviar os dados solicitados.</p>
    <div class="panel">
      <div class="panel-header">Filiais</div>
      <form class="add-form" id="formFilial" style="padding-top:10px;">
        <div class="field" style="max-width:220px;"><label>Nova filial (sigla)</label><input type="text" id="filialNovaSigla" placeholder="Ex.: ABC" maxlength="5" style="text-transform:uppercase;"></div>
        <div class="field" style="max-width:160px;"><button type="submit" class="btn btn-primary">Cadastrar filial</button></div>
      </form>
      <div id="filiaisEditWrap" style="padding:0 18px 10px;"></div>
      <div class="filial-grid" id="filialGrid"></div>
    </div>

    </div>
    <div class="pg-subview${confirmacaoSubAba==="focais"?" active":""}" id="confSub-focais">
    <div class="panel" style="margin-top:0;">
      <div class="panel-header">Focais (SAC) e suas unidades</div>
      <p class="section-desc" style="padding:0 18px;">Cadastre um Focal e as siglas das unidades dele. Cada Focal aparece automaticamente como subpasta em <strong>Performance Geral</strong>. A configuração fica salva neste navegador.</p>
      <form class="add-form" id="formFocal">
        <div class="field"><label>Nome do Focal</label><input type="text" id="focalNome" placeholder="Ex.: SAC 6 — Maria" required></div>
        <div class="field"><label>Unidades (siglas separadas por vírgula)</label><input type="text" id="focalSiglas" placeholder="Ex.: ABC, DEF, GHI"></div>
        <div class="field" style="max-width:200px;"><button type="submit" class="btn btn-primary">Adicionar Focal</button></div>
      </form>
      <div id="focaisConfig"></div>
    </div>

    </div>
    <div class="pg-subview${confirmacaoSubAba==="premium"?" active":""}" id="confSub-premium">
    <div class="panel" style="margin-top:0;">
      <div class="panel-header">Clientes Premium</div>
      <p class="section-desc" style="padding:0 18px;">Cadastre os clientes Premium pelo <strong>CNPJ</strong> (obrigatório, junto com o nome). Unidade(s) e Focal são opcionais: quando preenchidos, os documentos desse CNPJ nessas unidades vão para o Focal informado. Tudo que for salvo aqui vale para Ocorrências (69) e Documentos em Atraso (150).</p>
      <form class="add-form" id="formPremium">
        <input type="hidden" id="premEditId" value="">
        <div class="field"><label>Nome do cliente *</label><input type="text" id="premNome" placeholder="Ex.: Expresso Goiás"></div>
        <div class="field"><label>CNPJ *</label><input type="text" id="premCnpj" placeholder="Ex.: 38.475.768/0001-94"></div>
        <div class="field"><label>Unidade(s) (siglas separadas por vírgula)</label><input type="text" id="premUnidades" placeholder="Ex.: CRT, RUB, CRI, ITA"></div>
        <div class="field"><label>Focal responsável</label><select id="premFocal"></select></div>
        <div class="field" style="max-width:190px;"><button type="submit" class="btn btn-primary" id="premSalvarBtn">Cadastrar cliente</button></div>
        <div class="field" id="premCancelWrap" style="display:none; max-width:160px;"><button type="button" class="btn btn-ghost btn-sm" id="premCancelBtn">Cancelar edição</button></div>
      </form>
      <div class="field" style="padding:0 18px 10px; max-width:420px;"><label>Buscar cliente / CNPJ / Focal</label><input type="text" id="premBusca" placeholder="Digite para filtrar a lista..."></div>
      <div class="table-wrap" id="premiumTableWrap"></div>
    </div>

    </div>
    <div class="pg-subview${confirmacaoSubAba==="cnpj"?" active":""}" id="confSub-cnpj">
      ${cnpjCadastroSecaoHTML()}
    </div>
  `;
}

function renderFilialGrid(){
  const grid = document.getElementById("filialGrid");
  if(!grid) return;
  const list = ensureConfirmacoes();
  grid.innerHTML = list.map(c=>`
    <div class="filial-card ${c.enviado==='sim' ? 'sent' : 'pending'}">
      <div class="fname">${c.filial}</div>
      <div class="frow">
        <label class="check-inline">
          <input type="checkbox" class="filial-check" data-filial="${c.filial}" ${c.enviado==='sim'?'checked':''}>
          Enviou os dados
        </label>
      </div>
      <div class="frow">
        <input type="date" class="filial-date" data-filial="${c.filial}" value="${c.data||''}">
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".filial-check").forEach(chk=>{
    chk.addEventListener("change", ()=>{
      const list = load(KEYS.confirmacoes);
      const item = list.find(c=>c.filial===chk.dataset.filial);
      if(item){
        item.enviado = chk.checked ? "sim" : "nao";
        if(chk.checked && !item.data) item.data = todayISO();
        save(KEYS.confirmacoes, list);
      }
      renderFilialGrid();
    });
  });
  grid.querySelectorAll(".filial-date").forEach(inp=>{
    inp.addEventListener("change", ()=>{
      const list = load(KEYS.confirmacoes);
      const item = list.find(c=>c.filial===inp.dataset.filial);
      if(item){ item.data = inp.value; save(KEYS.confirmacoes, list); }
    });
  });
}

function attachConfirmacaoEvents(){
  renderFilialGrid();
  renderFiliaisEdit();
  attachFiliaisEditEvents();
  renderFocaisConfig();
  attachFocaisConfigEvents();
  attachPremiumEvents();
  attachCnpjCadastroEvents();
  // Cadastro de CNPJ já aparece aberto dentro da sua sub-aba (sem "mostrar/ocultar")
  const corpoCnpj = document.querySelector("#sec-confirmacao #cnpjCadastroCorpo");
  if(corpoCnpj) corpoCnpj.style.display = "";
  const btnCnpj = document.querySelector("#sec-confirmacao #cnpjCadastroToggleBtn");
  if(btnCnpj) btnCnpj.style.display = "none";
  const barra = document.getElementById("confSubtabs");
  if(barra) barra.addEventListener("click", e => {
    const b = e.target.closest("[data-conf-sub]");
    if(!b) return;
    confirmacaoSubAba = b.dataset.confSub;
    barra.querySelectorAll("[data-conf-sub]").forEach(x => x.classList.toggle("active", x === b));
    ["filiais","focais","premium","cnpj"].forEach(id => {
      const v = document.getElementById("confSub-" + id);
      if(v) v.classList.toggle("active", id === confirmacaoSubAba);
    });
  });
}

/* ---------- filiais (cadastro editável) ---------- */
function renderFiliaisEdit(){
  const box = document.getElementById("filiaisEditWrap");
  if(!box) return;
  box.innerHTML = `<div class="focal-chips">${FILIAIS.map(f => `
    <span class="focal-chip">${escHtml(f)}
      <button type="button" title="Renomear filial" data-ren-filial="${escHtml(f)}">✎</button>
      <button type="button" title="Remover filial" data-rm-filial="${escHtml(f)}">×</button>
    </span>`).join("")}</div>`;
}
function attachFiliaisEditEvents(){
  const form = document.getElementById("formFilial");
  const box = document.getElementById("filiaisEditWrap");
  if(!form || !box) return;
  function refreshFiliais(){
    salvarFiliais(); renderFiliaisEdit(); renderFilialGrid();
  }
  form.addEventListener("submit", e => {
    e.preventDefault();
    const sg = document.getElementById("filialNovaSigla").value.trim().toUpperCase();
    if(!sg) return;
    if(FILIAIS.includes(sg)){ alert("Essa filial já está cadastrada."); return; }
    FILIAIS.push(sg);
    form.reset();
    refreshFiliais();
  });
  box.addEventListener("click", e => {
    const b = e.target.closest("button");
    if(!b) return;
    if(b.dataset.rmFilial){
      if(!confirm(`Remover a filial ${b.dataset.rmFilial} da lista? Os dados já lançados não são apagados.`)) return;
      FILIAIS = FILIAIS.filter(f => f !== b.dataset.rmFilial);
      refreshFiliais();
    } else if(b.dataset.renFilial){
      const antiga = b.dataset.renFilial;
      const nova = (prompt("Nova sigla para " + antiga + ":", antiga) || "").trim().toUpperCase();
      if(!nova || nova === antiga) return;
      if(FILIAIS.includes(nova)){ alert("Já existe uma filial com essa sigla."); return; }
      FILIAIS = FILIAIS.map(f => f === antiga ? nova : f);
      const conf = load(KEYS.confirmacoes);
      conf.forEach(c => { if(c.filial === antiga) c.filial = nova; });
      save(KEYS.confirmacoes, conf);
      refreshFiliais();
    }
  });
}

/* ---------- clientes premium (tela) ---------- */
function renderPremiumTable(){
  const wrap = document.getElementById("premiumTableWrap");
  const sel = document.getElementById("premFocal");
  if(sel){
    const atual = sel.value;
    sel.innerHTML = `<option value="">— nenhum —</option>` + FOCAIS.map(f => `<option value="${escHtml(f.id)}">${escHtml(f.titulo)}</option>`).join("");
    sel.value = atual;
  }
  if(!wrap) return;
  if(CLIENTES_PREMIUM.length === 0){ wrap.innerHTML = `<div class="empty">Nenhum cliente Premium cadastrado.</div>`; return; }
  const buscaEl = document.getElementById("premBusca");
  const termo = normalizarTextoPagador(buscaEl ? buscaEl.value : "");
  const termoNum = normalizarCnpj(termo);
  const lista = [...CLIENTES_PREMIUM].filter(c => {
    if(!termo) return true;
    const f = FOCAIS.find(x => x.id === c.focalId);
    return normalizarTextoPagador([c.nome, c.unidades, f ? f.titulo : ""].join(" ")).includes(termo)
      || (termoNum && normalizarCnpj(c.cnpj).includes(termoNum));
  }).sort((a,b)=> (a.nome||"").localeCompare(b.nome||"") || (a.cnpj||"").localeCompare(b.cnpj||""));
  if(lista.length === 0){ wrap.innerHTML = `<div class="empty">Nenhum cliente encontrado.</div>`; return; }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Cliente</th><th>CNPJ</th><th>Unidade(s)</th><th>Focal</th><th></th></tr></thead>
      <tbody>${lista.map(c => {
        const f = FOCAIS.find(x => x.id === c.focalId);
        return `<tr>
          <td>${escHtml(c.nome||"-")}</td>
          <td>${escHtml(formatarCnpjExibicao(c.cnpj))}</td>
          <td>${escHtml(c.unidades||"-")}</td>
          <td>${escHtml(f ? f.titulo : "-")}</td>
          <td style="white-space:nowrap;"><button type="button" class="link-btn" data-prem-edit="${c.id}">Editar</button> &nbsp;·&nbsp; <button type="button" class="link-btn danger" data-prem-del="${c.id}">Excluir</button></td>
        </tr>`;}).join("")}</tbody>
    </table>`;
}
function attachPremiumEvents(){
  const form = document.getElementById("formPremium");
  const wrap = document.getElementById("premiumTableWrap");
  if(!form || !wrap) return;
  renderPremiumTable();
  const buscaPrem = document.getElementById("premBusca");
  if(buscaPrem) buscaPrem.addEventListener("input", renderPremiumTable);
  function limpar(){
    form.reset();
    document.getElementById("premEditId").value = "";
    document.getElementById("premSalvarBtn").textContent = "Cadastrar cliente";
    document.getElementById("premCancelWrap").style.display = "none";
  }
  document.getElementById("premCancelBtn").addEventListener("click", limpar);
  form.addEventListener("submit", e => {
    e.preventDefault();
    const editId = document.getElementById("premEditId").value;
    const nome = document.getElementById("premNome").value.trim();
    const cnpj = document.getElementById("premCnpj").value.trim();
    const unidades = siglasDoTexto(document.getElementById("premUnidades").value).join(", ");
    const focalId = document.getElementById("premFocal").value;
    if(!nome){ alert("Informe o nome do cliente."); return; }
    if(!normalizarCnpj(cnpj)){ alert("Informe o CNPJ do cliente."); return; }
    const dup = CLIENTES_PREMIUM.find(c => normalizarCnpj(c.cnpj) === normalizarCnpj(cnpj) && c.id !== editId);
    if(dup){ alert("Esse CNPJ já está cadastrado como cliente Premium (" + dup.nome + ")."); return; }
    if(editId){
      const it = CLIENTES_PREMIUM.find(c => c.id === editId);
      if(it) Object.assign(it, {nome, cnpj, unidades, focalId});
    } else {
      CLIENTES_PREMIUM.push({id: uid(), nome, cnpj, unidades, focalId});
    }
    salvarClientesPremium();
    recalcularFocalComCadastroCnpj();
    renderPremiumTable();
    limpar();
  });
  wrap.addEventListener("click", e => {
    const b = e.target.closest("button");
    if(!b) return;
    if(b.dataset.premDel){
      if(!confirm("Excluir este cliente Premium?")) return;
      CLIENTES_PREMIUM = CLIENTES_PREMIUM.filter(c => c.id !== b.dataset.premDel);
      salvarClientesPremium(); recalcularFocalComCadastroCnpj(); renderPremiumTable();
    } else if(b.dataset.premEdit){
      const c = CLIENTES_PREMIUM.find(x => x.id === b.dataset.premEdit);
      if(!c) return;
      document.getElementById("premEditId").value = c.id;
      document.getElementById("premNome").value = c.nome || "";
      document.getElementById("premCnpj").value = c.cnpj || "";
      document.getElementById("premUnidades").value = c.unidades || "";
      document.getElementById("premFocal").value = c.focalId || "";
      document.getElementById("premSalvarBtn").textContent = "Salvar alteração";
      document.getElementById("premCancelWrap").style.display = "";
      form.scrollIntoView({behavior:"smooth", block:"center"});
    }
  });
}

function siglasDoTexto(txt){
  return [...new Set(String(txt || "").toUpperCase().split(/[\s,;]+/).filter(Boolean))];
}

// Uma sigla só pode pertencer a um Focal (senão a consolidação contaria duas vezes).
function adicionarSiglasAoFocal(focal, siglas){
  const recusadas = [];
  siglas.forEach(sg => {
    const dono = FOCAIS.find(f => f.unidades.some(u => u.sigla === sg));
    if(!dono){ focal.unidades.push({sigla: sg}); return; }
    if(dono === focal){ recusadas.push(`${sg} (já está neste Focal)`); return; }
    // Mudar o Focal responsável por uma unidade: move (continua só em um Focal).
    if(confirm(`${sg} está em "${dono.titulo}". Mover para "${focal.titulo}"?`)){
      const un = dono.unidades.find(u => u.sigla === sg);
      dono.unidades = dono.unidades.filter(u => u.sigla !== sg);
      focal.unidades.push(un || {sigla: sg});
    }
  });
  if(recusadas.length) alert("Não adicionei: " + recusadas.join("; "));
}

function focaisMudaram(){
  salvarFocais();
  recalcularFocalComCadastroCnpj();
  if(!FOCAIS.some(f => f.id === perfGeralFocalAtivo)) perfGeralFocalAtivo = "geral";
  renderFocaisConfig();
  renderNav();
  renderPerformanceGeralDashboard();
}

function renderFocaisConfig(){
  const box = document.getElementById("focaisConfig");
  if(!box) return;
  box.innerHTML = FOCAIS.map(f => `
    <div class="focal-cfg">
      <div class="focal-cfg-head">
        <strong>${escHtml(f.titulo)}</strong>
        <span>
          <button type="button" class="btn btn-ghost btn-sm" data-ren-focal="${f.id}">Renomear Focal</button>
          <button type="button" class="btn btn-ghost btn-sm" data-del-focal="${f.id}">Remover Focal</button>
        </span>
      </div>
      <div class="focal-chips">
        ${f.unidades.map(u => `<span class="focal-chip">${escHtml(u.sigla)}<button type="button" title="Renomear sigla da unidade" data-ed-focal="${f.id}" data-ed-sigla="${escHtml(u.sigla)}">✎</button><button type="button" title="Remover unidade" data-rm-focal="${f.id}" data-rm-sigla="${escHtml(u.sigla)}">×</button></span>`).join("") || '<span class="footer-note">Nenhuma unidade ainda</span>'}
      </div>
      <div class="focal-add">
        <input type="text" placeholder="Adicionar unidades (ex.: ABC, DEF)" data-add-input="${f.id}">
        <button type="button" class="btn btn-ghost btn-sm" data-add-focal="${f.id}">+ Adicionar</button>
      </div>
    </div>
  `).join("");
}

function attachFocaisConfigEvents(){
  const form = document.getElementById("formFocal");
  const box = document.getElementById("focaisConfig");
  if(!form || !box) return;

  form.addEventListener("submit", e => {
    e.preventDefault();
    const titulo = document.getElementById("focalNome").value.trim();
    if(!titulo) return;
    if(FOCAIS.some(f => f.titulo.toLowerCase() === titulo.toLowerCase())){ alert("Já existe um Focal com esse nome."); return; }
    const focal = {id: "f" + Date.now().toString(36), titulo, unidades: []};
    FOCAIS.push(focal);
    adicionarSiglasAoFocal(focal, siglasDoTexto(document.getElementById("focalSiglas").value));
    form.reset();
    focaisMudaram();
  });

  box.addEventListener("click", e => {
    const b = e.target.closest("button");
    if(!b) return;
    const id = b.dataset.delFocal || b.dataset.rmFocal || b.dataset.addFocal || b.dataset.renFocal || b.dataset.edFocal;
    const focal = FOCAIS.find(f => f.id === id);
    if(!focal) return;
    if(b.dataset.renFocal){
      // Altera SÓ o nome do Focal — unidades e demais dados ficam como estão.
      const novo = (prompt("Novo nome do Focal:", focal.titulo) || "").trim();
      if(!novo || novo === focal.titulo) return;
      if(FOCAIS.some(f => f !== focal && f.titulo.toLowerCase() === novo.toLowerCase())){ alert("Já existe um Focal com esse nome."); return; }
      focal.titulo = novo;
    } else if(b.dataset.edFocal){
      const antiga = b.dataset.edSigla;
      const nova = (prompt("Nova sigla para a unidade " + antiga + ":", antiga) || "").trim().toUpperCase();
      if(!nova || nova === antiga) return;
      if(FOCAIS.some(f => f.unidades.some(u => u.sigla === nova))){ alert("Essa sigla já está cadastrada em um Focal."); return; }
      const un = focal.unidades.find(u => u.sigla === antiga);
      if(un) un.sigla = nova;
      CNPJ_CADASTRO.forEach(c => { if(c.sigla === antiga) c.sigla = nova; });
      salvarCnpjCadastro();
      CLIENTES_PREMIUM.forEach(c => { c.unidades = siglasDoTexto(c.unidades).map(x => x === antiga ? nova : x).join(", "); });
      salvarClientesPremium();
    } else if(b.dataset.delFocal){
      if(!confirm(`Remover "${focal.titulo}"? Os dados importados não são apagados.`)) return;
      FOCAIS.splice(FOCAIS.indexOf(focal), 1);
    } else if(b.dataset.rmFocal){
      focal.unidades = focal.unidades.filter(u => u.sigla !== b.dataset.rmSigla);
    } else {
      const inp = box.querySelector(`[data-add-input="${id}"]`);
      adicionarSiglasAoFocal(focal, siglasDoTexto(inp ? inp.value : ""));
    }
    focaisMudaram();
  });

  box.addEventListener("keydown", e => {
    if(e.key === "Enter" && e.target.dataset.addInput){
      e.preventDefault();
      box.querySelector(`[data-add-focal="${e.target.dataset.addInput}"]`).click();
    }
  });
}

/* ================= PACOTES (importação de Mapa de Entrega) ================= */
function pacotesHTML(){
  return `
    <h2 class="section-title">Pacotes — Mapa de Entrega</h2>
    <p class="section-desc">Importe o PDF do Mapa de Entrega. O sistema identifica cada pacote (número da Relação) e a data da rota, destaca automaticamente os pacotes de <strong>SAC - Troca / Falta</strong> e avisa quando aparecer um cliente ou CNPJ que você cadastrou para alerta. Pacotes de troca são enviados automaticamente para a aba <strong>Trocas</strong>, com NF, cliente, CNPJ e cidade já preenchidos — só falta você indicar a filial.</p>

    <div class="panel">
      <div class="panel-header">Importar Mapa de Entrega (PDF)</div>
      <form class="add-form" id="formPacotePdf">
        <div class="field"><label>Arquivo PDF</label><input type="file" id="pacotePdfInput" accept="application/pdf"></div>
        <div class="field" style="max-width:200px;">
          <button type="submit" class="btn btn-primary">Processar PDF</button>
        </div>
        <div class="field full">
          <button type="button" class="link-btn" id="toggleColarTexto">ou colar o texto extraído do PDF manualmente</button>
        </div>
      </form>
      <div id="colarTextoWrap" style="display:none; padding:0 18px 16px;">
        <textarea id="pacoteTextoManual" rows="6" style="width:100%; font-family:monospace; font-size:12px; padding:8px; border:1px solid var(--line); border-radius:6px;" placeholder="Cole aqui o texto do mapa de entrega..."></textarea>
        <div style="margin-top:8px;"><button type="button" class="btn btn-ghost btn-sm" id="processarTextoManual">Processar texto colado</button></div>
      </div>
      <div class="footer-note" id="pacoteImportStatus"></div>
    </div>

    <div class="panel">
      <div class="panel-header">Clientes / CNPJ para alerta</div>
      <form class="add-form" id="formClienteAlerta">
        <div class="field"><label>Nome do cliente (ou parte do nome)</label><input type="text" id="alertaNome"></div>
        <div class="field"><label>CNPJ / CPF (opcional)</label><input type="text" id="alertaCnpj" placeholder="Ex: 07.834.024/0001-95"></div>
        <div class="field full"><label>Observações (ex.: rota que aparece no mapa x quem entrega)</label><input type="text" id="alertaObs" placeholder="Ex: Rota Guarinos — atendido por Santa Terezinha"></div>
        <input type="hidden" id="alertaEditId">
        <div class="field" style="max-width:200px;">
          <button type="submit" class="btn btn-primary" id="alertaSalvarBtn">Cadastrar alerta</button>
        </div>
        <div class="field" style="max-width:200px; display:none;" id="alertaCancelWrap">
          <button type="button" class="btn btn-ghost" id="alertaCancelBtn">Cancelar edição</button>
        </div>
      </form>
      <div class="table-wrap" id="clientesAlertaWrap"></div>
    </div>

    <div class="panel">
      <div class="panel-header">Pacotes importados</div>
      <div class="toolbar">
        <label class="check-inline">
          Filtrar:
          <select class="small-select" id="pacoteFiltro">
            <option value="todos">Todos</option>
            <option value="troca">Somente Trocas (SAC - Troca/Falta)</option>
            <option value="alerta">Somente Cliente Alerta</option>
          </select>
        </label>
        <label class="check-inline"><input type="checkbox" id="verTodosDetalhes"> Mostrar detalhes de todos os pacotes</label>
        <button type="button" class="link-btn danger" id="limparPacotes">Limpar todos os pacotes importados</button>
      </div>
      <div class="table-wrap" id="pacotesTableWrap"></div>
    </div>
  `;
}

/* ---------- pdf.js text extraction ---------- */
let __pdfWorkerReady = false;
async function ensurePdfWorker(){
  if(__pdfWorkerReady) return;
  const workerUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  try{
    // Baixa o worker e cria um Blob local — evita bloqueio de CORS quando o site é aberto via file://
    const resp = await fetch(workerUrl);
    const code = await resp.text();
    const blob = new Blob([code], {type: "text/javascript"});
    pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(blob);
  }catch(e){
    // fallback: aponta direto para o CDN (funciona quando o site está em http/https)
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  __pdfWorkerReady = true;
}

async function extractPdfText(file){
  if(typeof pdfjsLib === "undefined"){
    throw new Error("Biblioteca de leitura de PDF não carregou. Verifique sua conexão com a internet e recarregue a página.");
  }
  await ensurePdfWorker();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: buf}).promise;
  let fullText = "";
  for(let i = 1; i <= pdf.numPages; i++){
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let lastY = null;
    content.items.forEach(item => {
      const y = item.transform[5];
      if(lastY !== null && Math.abs(y - lastY) > 2){
        fullText += "\n";
      }
      fullText += item.str;
      if(item.hasEOL) fullText += "\n";
      lastY = y;
    });
    fullText += "\n";
  }
  return fullText;
}

/* ---------- parsing logic ---------- */
function normalizeDoc(str){
  return (str||"").replace(/\D/g, "");
}
function brDateToISO(br){
  const m = br && br.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if(!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseRouteText(text){
  // normaliza quebras de linha duplicadas/extras que o pdf.js às vezes gera entre campos
  text = text.replace(/\r\n/g, "\n").replace(/\n{2,}/g, "\n");

  const dataMatch = text.match(/Data:\s*(\d{2}\/\d{2}\/\d{4})/);
  const rotaMatch = text.match(/Rota:\s*([A-Z0-9]+(?:\s+[A-Z0-9-]+)*)\s+Entregas/i);
  const rotaDate = dataMatch ? brDateToISO(dataMatch[1]) : "";
  const rota = rotaMatch ? rotaMatch[1].trim() : "";

  // split into per-package chunks, each starting with "<numero> / REL: <n>"
  const splitRegex = /(?=\d{4,}\s*\/\s*REL:\s*\d+)/g;
  const rawChunks = text.split(splitRegex).slice(1); // discard header before first match

  const packages = [];
  rawChunks.forEach(chunk => {
    const relMatch = chunk.match(/\/\s*REL:\s*(\d+)/);
    if(!relMatch) return;
    const relnum = relMatch[1];

    const tipoMatch = chunk.match(/REL:\s*\d+\s*\n\s*([^\n]+)/);
    const tipoVenda = tipoMatch ? tipoMatch[1].trim() : "Venda normal";

    const nfMatch = chunk.match(/Origem:\s*TAMBASA[\s\S]*?\n\s*(\d{4,})\s*\n\s*([^\n]+)/i);
    const nf = nfMatch ? nfMatch[1].trim() : "";
    const cliente = nfMatch ? nfMatch[2].trim() : "";

    const docMatch = chunk.match(/(\d{4,})\s*-\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})/);
    const docCliente = docMatch ? docMatch[2] : "";

    const pesoMatch = chunk.match(/([\d.,]+)\s*kg/);
    const peso = pesoMatch ? pesoMatch[1] : "";

    const cidadeMatch = chunk.match(/\n([^\n]+)\n[\d.,]+\s*kg/);
    const cidade = cidadeMatch ? cidadeMatch[1].trim() : "";

    if(nf){
      packages.push({
        rota, relnum, nf, tipoVenda, cliente, docCliente, cidade, peso,
        dataRota: rotaDate
      });
    }
  });
  return {rota, rotaDate, packages};
}

/* Clientes pré-configurados para alerta (Pacotes). Entram UMA vez em cada
   navegador (não duplicam e, se o usuário excluir, não voltam sozinhos).
   A observação aparece na tabela de pacotes quando o cliente é encontrado. */
const CLIENTES_ALERTA_PADRAO = [
  {nome:"LUCIENE MARTINS DE ABREU LIMA", cnpj:"016.549.141-85",
   obs:"Rota Guarinos — atendido por Santa Terezinha."},
  {nome:"JOYCE GRACIELLE ARAUJO GODINHO", cnpj:"021.675.311-25",
   obs:"Rota Crixás — porém entregue por Rubiataba."},
  {nome:"GERALDO EUSTAQUIO DE MOURA", cnpj:"438.609.741-49",
   obs:"Quando é CPF, a rota aparece Abadiânia — porém entregue por Pirenópolis."},
  {nome:"", cnpj:"14.479.796/0001-11",
   obs:"CNPJ do Geraldo Eustáquio de Moura (CPF 438.609.741-49). A rota Abadiânia → Pirenópolis vale quando o documento é CPF."},
  {nome:"RUBISMAR CORREIA GUEDES", cnpj:"319.930.011-15",
   obs:"Rota Crixás — porém entregue por Santa Terezinha."},
  {nome:"ANA PAULA DE OLIVEIRA SANTOS", cnpj:"029.706.391-06",
   obs:"Rota Pirenópolis — porém entregue por Jaraguá."},
  {nome:"PEDRO FABIANO DA SILVA", cnpj:"355.012.001-04",
   obs:"Rota Pirenópolis — porém entregue por Anápolis."}
];

function semearClientesAlertaPadrao(){
  const lista = load(KEYS.clientesAlerta);
  let vistos = [];
  try{ const v = JSON.parse(localStorage.getItem(KEYS.alertaPadraoVistos) || "[]"); if(Array.isArray(v)) vistos = v; }catch(e){}
  const set = new Set(vistos);
  let mudou = false;
  CLIENTES_ALERTA_PADRAO.forEach(p => {
    const chave = normalizeDoc(p.cnpj) || semAcento(p.nome);
    if(set.has(chave)) return;
    set.add(chave);
    mudou = true;
    // Se o usuário já cadastrou esse documento, só completa a observação (se estiver vazia).
    const ja = lista.find(a => normalizeDoc(a.cnpj) && normalizeDoc(a.cnpj) === normalizeDoc(p.cnpj));
    if(ja){ if(!ja.obs) ja.obs = p.obs; if(!ja.nome) ja.nome = p.nome; }
    else lista.push({id: uid(), ...p});
  });
  if(mudou){
    save(KEYS.clientesAlerta, lista);
    try{ localStorage.setItem(KEYS.alertaPadraoVistos, JSON.stringify([...set])); }catch(e){}
  }
}

// Maiúsculas, sem acento e sem espaços repetidos — nome do PDF e do cadastro comparam igual.
function semAcento(str){
  return (str||"").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

function checkAlerta(pkg, alertas){
  const nomeUp = semAcento(pkg.cliente);
  const docNorm = normalizeDoc(pkg.docCliente);
  return alertas.find(a => {
    const nomeA = semAcento(a.nome);
    const nomeMatch = nomeA && nomeUp.includes(nomeA);
    const cnpjMatch = a.cnpj && docNorm && docNorm === normalizeDoc(a.cnpj);
    return nomeMatch || cnpjMatch;
  });
}

function importPackages(parsed){
  if(parsed.packages.length === 0){
    return {added:0, total:0, trocasAdded:0};
  }
  const existing = load(KEYS.pacotes);
  const existingKeys = new Set(existing.map(p => `${p.rota}|${p.relnum}|${p.nf}`));
  let added = 0;
  const novos = [];
  parsed.packages.forEach(p => {
    const key = `${p.rota}|${p.relnum}|${p.nf}`;
    if(existingKeys.has(key)) return;
    const item = {id: uid(), ...p};
    existing.push(item);
    existingKeys.add(key);
    novos.push(item);
    added++;
  });
  save(KEYS.pacotes, existing);
  const trocasAdded = syncTrocasFromPackages(novos);
  return {added, total: parsed.packages.length, trocasAdded};
}

// Cria automaticamente uma solicitação de troca (aba Trocas) para cada pacote
// novo identificado como "SAC - Troca / Falta". Filial fica em branco para o
// usuário preencher, já que o Mapa de Entrega não informa a filial responsável.
function syncTrocasFromPackages(pacotesNovos){
  const trocaPkgs = pacotesNovos.filter(p => /troca/i.test(p.tipoVenda));
  if(trocaPkgs.length === 0) return 0;
  const trocas = load(KEYS.trocas);
  const existingOrigem = new Set(trocas.filter(t=>t.origemPacoteId).map(t=>t.origemPacoteId));
  let count = 0;
  trocaPkgs.forEach(p => {
    const origemId = `${p.rota}|${p.relnum}|${p.nf}`;
    if(existingOrigem.has(origemId)) return;
    // Data de envio = dia da importação (não a data da rota do PDF, que costuma
    // divergir). O campo continua editável na tabela, caso precise ajustar.
    const dataBase = todayISO();
    trocas.push({
      id: uid(),
      nf: p.nf,
      filial: "",
      cliente: p.cliente || "",
      docCliente: p.docCliente || "",
      cidade: p.cidade || "",
      dataEnvio: dataBase,
      dataLimite: addDaysISO(dataBase, 5),
      devolvido: "nao",
      dataDevolvido: "",
      observacoes: "",
      origemPacoteId: origemId
    });
    existingOrigem.add(origemId);
    count++;
  });
  save(KEYS.trocas, trocas);
  return count;
}

function attachPacotesEvents(){
  const formPdf = document.getElementById("formPacotePdf");
  const statusEl = document.getElementById("pacoteImportStatus");

  formPdf.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const fileInput = document.getElementById("pacotePdfInput");
    const file = fileInput.files[0];
    if(!file){ statusEl.textContent = "Selecione um arquivo PDF."; return; }
    statusEl.textContent = "Lendo o PDF...";
    try{
      const text = await extractPdfText(file);
      const parsed = parseRouteText(text);
      const result = importPackages(parsed);
      let msg = `Rota ${parsed.rota || "-"} (${fmtDate(parsed.rotaDate) || "-"}): ${result.total} pacote(s) encontrados, ${result.added} novo(s) adicionado(s).`;
      if(result.trocasAdded > 0) msg += ` ${result.trocasAdded} pacote(s) de troca enviados para a aba Trocas.`;
      statusEl.textContent = msg;
      fileInput.value = "";
      renderPacotesTable();
    }catch(err){
      console.error("Erro ao importar PDF:", err);
      statusEl.innerHTML = `Não foi possível ler esse PDF automaticamente.<br><small>Detalhe técnico: ${err.message || err}</small><br>Tente colar o texto manualmente abaixo (abra o PDF, selecione tudo com Ctrl+A, copie com Ctrl+C e cole na caixa).`;
    }
  });

  document.getElementById("toggleColarTexto").addEventListener("click", ()=>{
    const wrap = document.getElementById("colarTextoWrap");
    wrap.style.display = wrap.style.display === "none" ? "block" : "none";
  });

  document.getElementById("processarTextoManual").addEventListener("click", ()=>{
    const text = document.getElementById("pacoteTextoManual").value;
    if(!text.trim()){ statusEl.textContent = "Cole o texto do mapa de entrega antes de processar."; return; }
    const parsed = parseRouteText(text);
    const result = importPackages(parsed);
    let msg = `Rota ${parsed.rota || "-"} (${fmtDate(parsed.rotaDate) || "-"}): ${result.total} pacote(s) encontrados, ${result.added} novo(s) adicionado(s).`;
    if(result.trocasAdded > 0) msg += ` ${result.trocasAdded} pacote(s) de troca enviados para a aba Trocas.`;
    statusEl.textContent = msg;
    document.getElementById("pacoteTextoManual").value = "";
    renderPacotesTable();
  });

  document.getElementById("limparPacotes").addEventListener("click", ()=>{
    if(!confirm("Remover todos os pacotes importados?")) return;
    save(KEYS.pacotes, []);
    renderPacotesTable();
  });

  function limparFormAlerta(){
    document.getElementById("formClienteAlerta").reset();
    document.getElementById("alertaEditId").value = "";
    document.getElementById("alertaSalvarBtn").textContent = "Cadastrar alerta";
    document.getElementById("alertaCancelWrap").style.display = "none";
  }
  document.getElementById("alertaCancelBtn").addEventListener("click", limparFormAlerta);

  document.getElementById("formClienteAlerta").addEventListener("submit", (e)=>{
    e.preventDefault();
    const editId = document.getElementById("alertaEditId").value;
    const nome = document.getElementById("alertaNome").value.trim();
    const cnpj = document.getElementById("alertaCnpj").value.trim();
    const obs = document.getElementById("alertaObs").value.trim();
    if(!nome && !cnpj) return;
    const list = load(KEYS.clientesAlerta);
    if(editId){
      const it = list.find(a => a.id === editId);
      if(it) Object.assign(it, {nome, cnpj, obs});
    } else {
      list.push({id: uid(), nome, cnpj, obs});
    }
    save(KEYS.clientesAlerta, list);
    limparFormAlerta();
    renderClientesAlerta();
    renderPacotesTable();
  });

  document.getElementById("verTodosDetalhes").addEventListener("change", renderPacotesTable);
  document.getElementById("pacoteFiltro").addEventListener("change", renderPacotesTable);

  semearClientesAlertaPadrao();
  renderClientesAlerta();
  renderPacotesTable();
}

function renderClientesAlerta(){
  const wrap = document.getElementById("clientesAlertaWrap");
  if(!wrap) return;
  const list = load(KEYS.clientesAlerta);
  if(list.length === 0){
    wrap.innerHTML = `<div class="empty">Nenhum cliente cadastrado para alerta.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Nome</th><th>CNPJ / CPF</th><th>Observações</th><th></th></tr></thead>
      <tbody>
        ${list.map(a=>`
          <tr>
            <td>${a.nome ? escHtml(a.nome) : "-"}</td>
            <td>${a.cnpj ? escHtml(a.cnpj) : "-"}</td>
            <td>${a.obs ? escHtml(a.obs) : "-"}</td>
            <td>
              <button class="link-btn alerta-edit" data-id="${a.id}">Editar</button>
              <button class="link-btn danger alerta-del" data-id="${a.id}">Excluir</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll(".alerta-edit").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const a = load(KEYS.clientesAlerta).find(x => x.id === btn.dataset.id);
      if(!a) return;
      document.getElementById("alertaEditId").value = a.id;
      document.getElementById("alertaNome").value = a.nome || "";
      document.getElementById("alertaCnpj").value = a.cnpj || "";
      document.getElementById("alertaObs").value = a.obs || "";
      document.getElementById("alertaSalvarBtn").textContent = "Salvar alteração";
      document.getElementById("alertaCancelWrap").style.display = "";
      document.getElementById("formClienteAlerta").scrollIntoView({behavior:"smooth", block:"center"});
    });
  });
  wrap.querySelectorAll(".alerta-del").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      let list = load(KEYS.clientesAlerta);
      list = list.filter(a=>a.id!==btn.dataset.id);
      save(KEYS.clientesAlerta, list);
      renderClientesAlerta();
      renderPacotesTable();
    });
  });
}

function renderPacotesTable(){
  const wrap = document.getElementById("pacotesTableWrap");
  if(!wrap) return;
  const verTodos = document.getElementById("verTodosDetalhes").checked;
  const filtro = document.getElementById("pacoteFiltro").value;
  let list = load(KEYS.pacotes);
  const alertas = load(KEYS.clientesAlerta);

  if(filtro === "troca"){
    list = list.filter(p => /troca/i.test(p.tipoVenda));
  } else if(filtro === "alerta"){
    list = list.filter(p => !!checkAlerta(p, alertas));
  }

  if(list.length === 0){
    wrap.innerHTML = `<div class="empty">Nenhum pacote encontrado para esse filtro.</div>`;
    return;
  }

  list.sort((a,b)=> (b.dataRota||"").localeCompare(a.dataRota||"") || a.relnum.localeCompare(b.relnum, undefined, {numeric:true}));

  wrap.innerHTML = `
    <table>
      <thead><tr>
        <th>Pacote</th><th>Data</th><th>Situação</th><th>NF</th><th>Cliente</th><th>CNPJ/CPF</th><th>Cidade</th><th>Observações do alerta</th>
      </tr></thead>
      <tbody>
        ${list.map(p=>{
          const isTroca = /troca/i.test(p.tipoVenda);
          const alertaMatch = checkAlerta(p, alertas);
          const expand = verTodos || isTroca || !!alertaMatch;
          let rowClass = "";
          if(isTroca) rowClass = "row-alert";
          else if(alertaMatch) rowClass = "row-warn";

          let situacao = `<span class="badge badge-gray">${p.tipoVenda}</span>`;
          if(isTroca) situacao = `<span class="badge badge-red">SAC - Troca / Falta</span>`;
          if(alertaMatch) situacao += ` <span class="badge badge-amber">Cliente alerta</span>`;

          return `
            <tr class="${rowClass}">
              <td><strong>${p.relnum}</strong></td>
              <td>${fmtDate(p.dataRota)}</td>
              <td>${situacao}</td>
              <td>${expand ? p.nf : "-"}</td>
              <td>${expand ? (p.cliente||"-") : "-"}</td>
              <td>${expand ? (p.docCliente||"-") : "-"}</td>
              <td>${expand ? (p.cidade||"-") : "-"}</td>
              <td>${alertaMatch && alertaMatch.obs ? `<strong>${escHtml(alertaMatch.obs)}</strong>` : "-"}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

/* ================= PERFORMANCE (relatório SSW) ================= */
function performanceHTML(){
  return `
    <h2 class="section-title">SLA e Performance por Unidade</h2>
    <p class="section-desc">Importe o relatório de Performance de Entregas (arquivo .sswweb do SSW — completo ou apenas com as unidades de um Focal). O sistema agrupa automaticamente pela sigla da unidade e calcula o SLA de cada uma. Cada importação atualiza só as unidades presentes no arquivo, sem apagar os dados já importados de outras unidades — por isso a aba <strong>Performance Geral</strong> e os painéis de cada Focal ficam sempre atualizados automaticamente, sem precisar preencher nada manualmente lá.</p>

    <div class="panel">
      <div class="panel-header">Importar relatório de Performance</div>
      <form class="add-form" id="formPerfArquivo">
        <div class="field"><label>Arquivo (.sswweb / .txt)</label><input type="file" id="perfArquivoInput" accept=".sswweb,.txt,text/plain"></div>
        <div class="field" style="max-width:200px;">
          <button type="submit" class="btn btn-primary">Processar arquivo</button>
        </div>
        <div class="field full">
          <button type="button" class="link-btn" id="togglePerfColarTexto">ou colar o texto do relatório manualmente</button>
        </div>
      </form>
      <div id="perfColarTextoWrap" style="display:none; padding:0 18px 16px;">
        <textarea id="perfTextoManual" rows="8" style="width:100%; font-family:monospace; font-size:11.5px; padding:8px; border:1px solid var(--line); border-radius:6px;" placeholder="Cole aqui o conteúdo do relatório de performance..."></textarea>
        <div style="margin-top:8px;"><button type="button" class="btn btn-ghost btn-sm" id="processarPerfTextoManual">Processar texto colado</button></div>
      </div>
      <div class="footer-note-row">
        <div class="footer-note" id="perfImportStatus"></div>
        <button type="button" class="link-btn danger" id="redefinirPerformance">Redefinir (limpar dados importados)</button>
      </div>
    </div>

    <div id="perfDashboardWrap"></div>
  `;
}

function num(str){
  if(!str) return 0;
  const clean = String(str).trim().replace(/\./g,"").replace(",", ".");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function parseSswPerformance(text){
  text = text.replace(/\r\n/g, "\n");

  // periodo: tenta "PERIODO EMISSAO", senao usa "MES: MM/AA" (formato usado no 084 - PERFORMANCE DE ENTREGAS)
  let periodo = "";
  const periodoMatch = text.match(/PERIODO EMISSAO:\s*([\d/]+)\s*A\s*([\d/]+)/i);
  if(periodoMatch){
    periodo = `${periodoMatch[1]} a ${periodoMatch[2]}`;
  } else {
    const mesMatch = text.match(/MES:\s*([\d/]+)/i);
    if(mesMatch) periodo = `Mês ${mesMatch[1]}`;
  }

  // O relatorio do SSW traz duas secoes: o detalhamento por cidade e, ao final,
  // uma secao "R E S U M O" com UM total por unidade. Preferimos sempre o RESUMO
  // (evita ter que somar cidade a cidade e evita contar a mesma unidade 2x caso
  // as duas secoes estejam no arquivo). Se o RESUMO nao existir, cai para o
  // detalhamento, acumulando as cidades por unidade.
  const resumoIdx = text.search(/R\s*E\s*S\s*U\s*M\s*O/i);
  const usaResumo = resumoIdx !== -1;
  const workText = usaResumo ? text.slice(resumoIdx) : text;
  const lines = workText.split("\n");

  // acha a linha de separacao (-----+---+---...) DENTRO do trecho usado, para
  // descobrir os limites de cada coluna daquela secao especificamente
  const sepLine = lines.find(l => /^-{5,}\+/.test(l));
  let bounds = [];
  if(sepLine){
    for(let i = 0; i < sepLine.length; i++){
      if(sepLine[i] === "+") bounds.push(i);
    }
  }
  if(bounds.length < 10){
    // layout padrao conhecido (detalhado, por cidade), caso a linha de separacao nao seja encontrada
    bounds = [15,41,48,55,62,70,82,88,96,102,111,117,129,135,141,152,158,167];
  }

  // a secao RESUMO nao tem as colunas de PRAZO/DIAS, entao os indices das
  // colunas numericas mudam de posicao em relacao ao detalhamento por cidade
  const layoutResumo = bounds.length < 17;
  const col = layoutResumo
    ? {exped:2, entregue:3, noPrazo:5, atrasCli:7, atrasTrans:9, abertoNoPrazo:12, abertoAtrasado:14}
    : {exped:4, entregue:5, noPrazo:7, atrasCli:9, atrasTrans:11, abertoNoPrazo:14, abertoAtrasado:16};

  function slice(line, idx){
    const start = idx === 0 ? 0 : bounds[idx-1] + 1;
    if(start >= line.length) return "";
    const end = idx < bounds.length ? bounds[idx] : line.length;
    return (line.slice(start, end) || "").trim();
  }

  const rows = [];
  let siglaAtual = null;

  lines.forEach(line => {
    if(!line.trim()) return;
    if(/^-{5,}\+/.test(line)){ siglaAtual = null; return; }
    if(line.startsWith("**")){ siglaAtual = null; return; }

    const destino = slice(line, 0);
    // alguns relatorios trazem a origem ("GYN") antes da sigla da unidade de
    // destino e da cidade (ex.: "GYN  RUB  RUBIATABA"). Essa origem nao e uma
    // unidade e deve ser desconsiderada, ficando so a sigla da unidade + cidade.
    const destinoSemOrigem = destino.replace(/^GYN\s+/, "");
    const m = destinoSemOrigem.match(/^([A-Z0-9]{2,5})\s+(.*)$/);

    if(m){
      const sigla = m[1];
      // linhas de subtotal ("TOTAL", "TOTAL DF", "TOTAL GO", "TOTAL GERAL"...) encerram o bloco atual
      if(sigla === "DEST" || sigla === "DESTINO" || sigla === "UNIDADE" || sigla === "TOTAL"){
        siglaAtual = null;
        return;
      }
      siglaAtual = sigla; // nova unidade — a propria linha ja tras dados (usados abaixo)
    } else if(destino !== ""){
      // texto que nao e sigla nem continuacao em branco (ex.: cabecalhos repetidos entre paginas)
      siglaAtual = null;
      return;
    }
    // aqui: destino === "" (linha de continuacao de cidade) ou acabamos de achar uma sigla nova
    if(!siglaAtual) return;

    const exped = num(slice(line, col.exped));
    const entregue = num(slice(line, col.entregue));
    const noPrazoEnt = num(slice(line, col.noPrazo));
    const atrasCli = num(slice(line, col.atrasCli));
    const atrasTrans = num(slice(line, col.atrasTrans));
    const abertoNoPrazo = num(slice(line, col.abertoNoPrazo));
    const abertoAtrasado = num(slice(line, col.abertoAtrasado));

    if(!exped && !entregue && !noPrazoEnt && !atrasCli && !atrasTrans && !abertoNoPrazo && !abertoAtrasado) return;

    rows.push({sigla: siglaAtual, exped, entregue, noPrazoEnt, atrasCli, atrasTrans, abertoNoPrazo, abertoAtrasado});
  });

  return {rows, periodo, fonte: usaResumo ? "resumo" : "detalhado"};
}

function aggregatePerformance(rows){
  const map = {};
  rows.forEach(r => {
    if(!map[r.sigla]) map[r.sigla] = {sigla:r.sigla, exped:0, entregue:0, noPrazoEnt:0, atrasCli:0, atrasTrans:0, abertoNoPrazo:0, abertoAtrasado:0};
    const m = map[r.sigla];
    m.exped += r.exped; m.entregue += r.entregue; m.noPrazoEnt += r.noPrazoEnt;
    m.atrasCli += r.atrasCli; m.atrasTrans += r.atrasTrans;
    m.abertoNoPrazo += r.abertoNoPrazo; m.abertoAtrasado += r.abertoAtrasado;
  });
  const list = Object.values(map).map(m => {
    const foraDoPrazo = m.atrasCli + m.atrasTrans;
    const denom = m.entregue - m.atrasCli;
    const sla = denom > 0 ? (m.noPrazoEnt/denom*100) : (m.entregue > 0 ? 0 : null);
    const total = m.entregue + m.abertoNoPrazo + m.abertoAtrasado;
    return {...m, foraDoPrazo, sla, total};
  });
  list.sort((a,b)=> b.total - a.total);
  return list;
}

function importPerformance(parsed){
  const novosAgg = aggregatePerformance(parsed.rows);

  // upsert por sigla: preserva os dados de unidades que nao vieram neste arquivo.
  // Isso permite que cada Focal importe so o relatorio da sua area, sem apagar
  // o que os outros Focais ja importaram — a Performance Geral fica sempre
  // consistente, sem duplicar nem sobrescrever indevidamente.
  const atual = load(KEYS.performance);
  const mapa = {};
  if(atual && Array.isArray(atual.unidades)){
    atual.unidades.forEach(u => { mapa[u.sigla] = u; });
  }
  const agora = todayISO();
  const atualizadoEm = (atual && atual.atualizadoEm) ? {...atual.atualizadoEm} : {};
  novosAgg.forEach(u => {
    mapa[u.sigla] = u;
    atualizadoEm[u.sigla] = agora;
  });

  const unidades = Object.values(mapa).sort((a,b)=> b.total - a.total);
  save(KEYS.performance, {
    periodo: parsed.periodo || (atual && atual.periodo) || "",
    importadoEm: agora,
    atualizadoEm,
    unidades
  });
  return novosAgg;
}

function attachPerformanceEvents(){
  const form = document.getElementById("formPerfArquivo");
  const statusEl = document.getElementById("perfImportStatus");

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const fileInput = document.getElementById("perfArquivoInput");
    const file = fileInput.files[0];
    if(!file){ statusEl.textContent = "Selecione o arquivo do relatório."; return; }
    try{
      const text = await file.text();
      const parsed = parseSswPerformance(text);
      if(parsed.rows.length === 0){
        statusEl.textContent = "Não encontrei linhas de unidade nesse arquivo. Confira se é o relatório de Performance de Entregas do SSW.";
        return;
      }
      importPerformance(parsed);
      statusEl.textContent = `Período ${parsed.periodo || "-"}: ${parsed.rows.length} linha(s) processadas e agrupadas por unidade (a partir da seção ${parsed.fonte === "resumo" ? "RESUMO" : "detalhada por cidade"} do relatório).`;
      fileInput.value = "";
      renderPerformanceDashboard();
      renderPerformanceGeralDashboard();
    }catch(err){
      console.error("Erro ao importar performance:", err);
      statusEl.textContent = "Não foi possível ler esse arquivo (" + (err.message||err) + "). Tente colar o texto manualmente.";
    }
  });

  document.getElementById("togglePerfColarTexto").addEventListener("click", ()=>{
    const wrap = document.getElementById("perfColarTextoWrap");
    wrap.style.display = wrap.style.display === "none" ? "block" : "none";
  });

  document.getElementById("processarPerfTextoManual").addEventListener("click", ()=>{
    const text = document.getElementById("perfTextoManual").value;
    if(!text.trim()){ statusEl.textContent = "Cole o texto do relatório antes de processar."; return; }
    const parsed = parseSswPerformance(text);
    if(parsed.rows.length === 0){
      statusEl.textContent = "Não encontrei linhas de unidade nesse texto.";
      return;
    }
    importPerformance(parsed);
    statusEl.textContent = `Período ${parsed.periodo || "-"}: ${parsed.rows.length} linha(s) processadas e agrupadas por unidade (a partir da seção ${parsed.fonte === "resumo" ? "RESUMO" : "detalhada por cidade"} do relatório).`;
    document.getElementById("perfTextoManual").value = "";
    renderPerformanceDashboard();
    renderPerformanceGeralDashboard();
  });

  document.getElementById("redefinirPerformance").addEventListener("click", ()=>{
    if(!confirm("Isso vai apagar todos os dados de Performance já importados (todas as unidades e Focais). Deseja continuar?")) return;
    save(KEYS.performance, null);
    statusEl.textContent = "Dados de performance redefinidos.";
    renderPerformanceDashboard();
    renderPerformanceGeralDashboard();
  });

  renderPerformanceDashboard();
}

function fmtPct(v){
  if(v === null || v === undefined) return "-";
  return v.toFixed(2).replace(".", ",") + "%";
}

// Faixas de cor do SLA — meta da empresa é 98%+
// ALTERE OS NUMEROS AQUI se a meta mudar:
function slaClass(v){
  if(v === null || v === undefined) return 'perf-sla-na';
  if(v >= 100) return 'perf-sla-ok';      // 100% -> verde
  if(v >= 99)  return 'perf-sla-good';    // 99% a 99,99% -> verde clarinho
  if(v >= 98)  return 'perf-sla-warn';    // 98% a 98,99% -> amarelo
  return 'perf-sla-bad';                  // menos de 98% -> vermelho
}

// Faixas de cor do PERF% — usadas só na aba Performance Geral (independentes
// da faixa acima, que é da aba Performance):
// Mesma escala do detalhado (meta 98%): Performance Geral e painéis por Focal pintam o SLA igual.
function slaClassGeral(v){ return slaClass(v); }

let perfSortMode = "padrao";

function renderPerformanceDashboard(){
  const wrap = document.getElementById("perfDashboardWrap");
  if(!wrap) return;
  const data = load(KEYS.performance);
  if(!data || !data.unidades || data.unidades.length === 0){
    wrap.innerHTML = `<div class="empty">Nenhum relatório de performance importado ainda.</div>`;
    return;
  }

  const totals = data.unidades.reduce((acc, u) => {
    acc.entregue += u.entregue; acc.noPrazoEnt += u.noPrazoEnt; acc.foraDoPrazo += u.foraDoPrazo;
    acc.atrasCli += u.atrasCli; acc.atrasTrans += u.atrasTrans; acc.exped += u.exped;
    acc.abertoAtrasado += u.abertoAtrasado; acc.abertoNoPrazo += u.abertoNoPrazo; acc.total += u.total;
    return acc;
  }, {entregue:0,noPrazoEnt:0,foraDoPrazo:0,atrasCli:0,atrasTrans:0,exped:0,abertoAtrasado:0,abertoNoPrazo:0,total:0});
  const denomTotal = totals.entregue - totals.atrasCli;
  const slaTotal = denomTotal > 0 ? (totals.noPrazoEnt/denomTotal*100) : null;

  const unidades = [...data.unidades];
  if(perfSortMode === "sla-desc"){
    unidades.sort((a,b) => (b.sla ?? -1) - (a.sla ?? -1));
  } else if(perfSortMode === "sla-asc"){
    unidades.sort((a,b) => (a.sla ?? 999) - (b.sla ?? 999));
  }
  // "padrao" mantem a ordem original (por Total, maior para menor)

  wrap.innerHTML = `
    <div class="perf-layout">
      <div class="perf-side">
        ${performanceGaugeCardsHTML({...totals, sla: slaTotal})}
      </div>
      <div class="perf-main">
        <div class="panel" id="perfTablePanel">
          <div class="panel-header perf-header">
            <div class="perf-header-org">TEC E ARM MIGUEL BARTOLOMEU (C.) — CNPJ 17.359.233/0001-88</div>
            <div class="perf-header-title">SLA e Performance por Unidade ${data.periodo ? "— Período: " + data.periodo : ""}</div>
          </div>
          <div class="toolbar">
            <label class="check-inline">
              Ordenar por:
              <select class="small-select" id="perfSortSelect">
                <option value="padrao" ${perfSortMode==="padrao"?"selected":""}>Padrão (Total)</option>
                <option value="sla-desc" ${perfSortMode==="sla-desc"?"selected":""}>SLA — maior para menor</option>
                <option value="sla-asc" ${perfSortMode==="sla-asc"?"selected":""}>SLA — menor para maior</option>
              </select>
            </label>
            <div class="toolbar-actions">
              <button type="button" class="btn btn-ghost btn-sm" id="perfExportBtn" title="Baixar esta tabela em Excel (.xlsx) com as mesmas cores">Exportar Excel</button>
              <button type="button" class="btn btn-ghost btn-sm" id="perfResetColsBtn" title="Restaurar as larguras originais das colunas">↺ Larguras</button>
              <button type="button" class="btn btn-ghost btn-sm" id="perfFullscreenBtn">Tela cheia</button>
            </div>
          </div>
          <p class="col-resize-hint">Arraste a borda direita de uma coluna para ajustar a largura.</p>
          <div class="table-wrap perf-table-wrap">
            <table class="perf-table perf-table-full" id="perfTable">
              <colgroup>
                ${PERF_COLS.map(c => `<col data-col="${c.id}">`).join("")}
              </colgroup>
              <thead><tr>
                ${PERF_COLS.map(c => `<th class="th-${c.id}" data-col="${c.id}">${c.label}<span class="col-resizer" data-col="${c.id}"></span></th>`).join("")}
              </tr></thead>
              <tbody>
                ${unidades.map(u => `
                  <tr>
                    <td class="perf-unidade">${u.sigla}</td>
                    <td class="perf-entregue">${u.entregue}</td>
                    <td class="perf-noprazo">${u.noPrazoEnt}</td>
                    <td class="perf-foraprazo">${u.foraDoPrazo}</td>
                    <td class="perf-cliente">${u.atrasCli}</td>
                    <td class="perf-transp">${u.atrasTrans}</td>
                    <td class="${slaClass(u.sla)}">${fmtPct(u.sla)}</td>
                    <td class="perf-previstas">${u.exped}</td>
                    <td class="perf-abertoatraso">${u.abertoAtrasado || ""}</td>
                    <td class="perf-abertonoprazo">${u.abertoNoPrazo}</td>
                  </tr>
                `).join("")}
              </tbody>
              <tfoot>
                <tr class="perf-total-row">
                  <td>TOTAL GERAL</td>
                  <td>${totals.entregue}</td>
                  <td>${totals.noPrazoEnt}</td>
                  <td>${totals.foraDoPrazo}</td>
                  <td>${totals.atrasCli}</td>
                  <td>${totals.atrasTrans}</td>
                  <td>${fmtPct(slaTotal)}</td>
                  <td>${totals.exped}</td>
                  <td>${totals.abertoAtrasado || ""}</td>
                  <td>${totals.abertoNoPrazo}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div class="footer-note">Importado em ${fmtDate(data.importadoEm)}. SLA = No Prazo / (Entregue − Cliente) — mesma fórmula de PERFORM usada pelo SSW.</div>
        </div>
      </div>
    </div>
  `;

  document.getElementById("perfSortSelect").addEventListener("change", (e)=>{
    perfSortMode = e.target.value;
    renderPerformanceDashboard();
  });

  const fsBtn = document.getElementById("perfFullscreenBtn");
  if(fsBtn){
    fsBtn.addEventListener("click", ()=> toggleFullscreen("perfTablePanel"));
    updateFullscreenBtnLabel("perfTablePanel", "perfFullscreenBtn");
  }

  const expBtn = document.getElementById("perfExportBtn");
  if(expBtn){
    expBtn.addEventListener("click", ()=>{
      const painel = document.getElementById("perfTablePanel");
      exportarTabelasExcel([{
        nome: "Performance",
        titulo: painel.querySelector(".perf-header-title").textContent.trim(),
        subtitulo: painel.querySelector(".perf-header-org").textContent.trim(),
        tabela: document.getElementById("perfTable"),
        rodape: painel.querySelector(".footer-note").textContent.trim()
      }], `Performance_${dataParaArquivo()}.xlsx`);
    });
  }

  applyPerfColWidths();
  attachPerfColResize();
  const resetBtn = document.getElementById("perfResetColsBtn");
  if(resetBtn){
    resetBtn.addEventListener("click", ()=>{
      save(KEYS.perfColWidths, null);
      applyPerfColWidths();
    });
  }
}

/* ---------- Larguras de coluna ajustáveis (tabela "SLA e Performance por Unidade") ---------- */
// Definição das colunas da tabela grande (sem a coluna "Total", removida a
// pedido — ela duplicava a informação já mostrada em "Entregas Previstas" e
// deixava a tabela poluída). Cada coluna tem uma largura padrão em px; o
// usuário pode arrastar a borda direita do cabeçalho para redimensionar, e a
// escolha fica salva (assim continua do jeito que a pessoa deixou).
const PERF_COLS = [
  {id:"unidade",       label:"Unidade (Sigla)",     width:150},
  {id:"entregue",      label:"Entregue",            width:88},
  {id:"noprazo",       label:"No Prazo",            width:88},
  {id:"foraprazo",     label:"Fora Do Prazo",       width:96},
  {id:"cliente",       label:"Cliente",             width:80},
  {id:"transp",        label:"Transportadora",      width:108},
  {id:"sla",           label:"SLA",                 width:80},
  {id:"previstas",     label:"Entregas Previstas",  width:108},
  {id:"abertoatraso",  label:"Aberto Atrasado",     width:100},
  {id:"abertonoprazo", label:"Aberto No Prazo",     width:104}
];
KEYS.perfColWidths = "tambasa_perf_col_widths";

function applyPerfColWidths(){
  const table = document.getElementById("perfTable");
  if(!table) return;
  const saved = load(KEYS.perfColWidths) || {};
  const widths = Array.isArray(saved) || !saved || typeof saved !== "object" ? {} : saved;
  table.querySelectorAll("colgroup col[data-col]").forEach(col => {
    const def = PERF_COLS.find(c => c.id === col.dataset.col);
    const w = widths[col.dataset.col] || (def ? def.width : 90);
    col.style.width = w + "px";
  });
  // largura mínima da tabela = soma das colunas, pra scroll horizontal
  // aparecer em telas menores em vez das colunas se espremerem/invadirem
  const total = PERF_COLS.reduce((s,c) => s + (widths[c.id] || c.width), 0);
  table.style.minWidth = total + "px";
}

function attachPerfColResize(){
  const table = document.getElementById("perfTable");
  if(!table) return;
  table.querySelectorAll(".col-resizer").forEach(handle => {
    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const colId = handle.dataset.col;
      const col = table.querySelector(`colgroup col[data-col="${colId}"]`);
      if(!col) return;
      const startX = e.clientX;
      const startWidth = col.getBoundingClientRect().width;
      document.body.style.userSelect = "none";

      function onMove(ev){
        const newWidth = Math.max(48, Math.round(startWidth + (ev.clientX - startX)));
        col.style.width = newWidth + "px";
        const total = Array.from(table.querySelectorAll("colgroup col")).reduce((s,c)=> s + parseFloat(c.style.width||0), 0);
        table.style.minWidth = total + "px";
      }
      function onUp(){
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.userSelect = "";
        const saved = load(KEYS.perfColWidths) || {};
        const widths = (saved && typeof saved === "object" && !Array.isArray(saved)) ? saved : {};
        table.querySelectorAll("colgroup col[data-col]").forEach(c => {
          widths[c.dataset.col] = Math.round(parseFloat(c.style.width));
        });
        save(KEYS.perfColWidths, widths);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

// Alterna a tela cheia (API nativa do navegador) para o elemento indicado —
// usado no botão "Tela cheia" da tabela de Performance por Unidade, pra
// facilitar tirar print sem a tabela ficar cortada.
function toggleFullscreen(elId){
  const el = document.getElementById(elId);
  if(!el) return;
  const isFs = document.fullscreenElement || document.webkitFullscreenElement;
  if(!isFs){
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if(req) req.call(el);
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if(exit) exit.call(document);
  }
}
function updateFullscreenBtnLabel(elId, btnId){
  const btn = document.getElementById(btnId);
  if(!btn) return;
  const el = document.getElementById(elId);
  const isFs = (document.fullscreenElement || document.webkitFullscreenElement) === el;
  btn.textContent = isFs ? "Sair da tela cheia" : "Tela cheia";
}
["fullscreenchange","webkitfullscreenchange"].forEach(evt=>{
  document.addEventListener(evt, ()=> updateFullscreenBtnLabel("perfTablePanel", "perfFullscreenBtn"));
});

// Painel lateral da aba Performance: gauge do SLA Geral + cards coloridos
// (Entregue, No Prazo, Fora do Prazo, Transportadora, Cliente).
function performanceGaugeCardsHTML(totais){
  return `
    <div class="panel perf-gauge-panel">
      <div class="gauge-label">SLA Geral</div>
      ${gaugeSVG(totais.sla)}
      <div class="gauge-pct ${slaKpiClass(totais.sla)}">${fmtPct(totais.sla)}</div>
      <div class="gauge-meta">Meta: 98%</div>
    </div>
    <div class="perf-stat perf-stat-navy">
      <div class="perf-stat-label">Entregue</div>
      <div class="perf-stat-value">${fmtInt(totais.entregue)}</div>
    </div>
    <div class="perf-stat perf-stat-green">
      <div class="perf-stat-label">Entregas no Prazo</div>
      <div class="perf-stat-value">${fmtInt(totais.noPrazoEnt)}</div>
    </div>
    <div class="perf-stat perf-stat-red">
      <div class="perf-stat-label">Entregas Fora do Prazo</div>
      <div class="perf-stat-value">${fmtInt(totais.foraDoPrazo)}</div>
    </div>
    <div class="perf-stat perf-stat-amber">
      <div class="perf-stat-label">Transportadora</div>
      <div class="perf-stat-value">${fmtInt(totais.atrasTrans)}</div>
    </div>
    <div class="perf-stat perf-stat-amber">
      <div class="perf-stat-label">Cliente</div>
      <div class="perf-stat-value">${fmtInt(totais.atrasCli)}</div>
    </div>
  `;
}

// Gera um gauge (semicírculo) em SVG mostrando o SLA geral, com faixas
// vermelho/amarelo/verde e um ponteiro — no estilo do painel de referência.
function gaugeSVG(pct){
  const v = (pct === null || pct === undefined) ? 0 : Math.max(0, Math.min(100, pct));
  const cx = 110, cy = 105, r = 80, sw = 20;

  function polar(cx, cy, r, angleDeg){
    const rad = angleDeg * Math.PI / 180;
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
  }
  function arc(startAngle, endAngle){
    const start = polar(cx, cy, r, startAngle);
    const end = polar(cx, cy, r, endAngle);
    const largeArcFlag = (endAngle - startAngle) <= 180 ? "0" : "1";
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }
  function angleForValue(val){ return -90 + (val / 100) * 180; }

  const needleAngle = angleForValue(v);
  const needleTip = polar(cx, cy, r - sw/2 - 6, needleAngle);

  return `
    <svg viewBox="0 0 220 122" class="gauge-svg" xmlns="http://www.w3.org/2000/svg">
      <path d="${arc(-90, 72)}" stroke="var(--red)" stroke-width="${sw}" fill="none" stroke-linecap="butt"/>
      <path d="${arc(72, 86.4)}" stroke="#e8b84b" stroke-width="${sw}" fill="none" stroke-linecap="butt"/>
      <path d="${arc(86.4, 90)}" stroke="var(--green)" stroke-width="${sw}" fill="none" stroke-linecap="butt"/>
      <line x1="${cx}" y1="${cy}" x2="${needleTip.x.toFixed(2)}" y2="${needleTip.y.toFixed(2)}" stroke="#2a2a2a" stroke-width="4" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="7" fill="#2a2a2a"/>
    </svg>
  `;
}

/* ================= PERFORMANCE GERAL — importação própria (VAL + RVA) =================
   Esta aba tem importação INDEPENDENTE da aba "Performance" (que fica com o
   parser antigo, mais completo, usado pelos painéis por Focal daquela aba).
   Aqui a leitura é enxuta: só a última página do relatório .sswweb (a seção
   "R E S U M O", que já traz um total por unidade) e só os campos pedidos —
   sigla, destino, QCTRCS EXPEDI, ENTREGUE QCTRC, NOPRAZO QCTRC, ATRASCLI
   QCTRC, ATRASTRANSP QCTRC, PERF %, NOPRAZO QCTRC (não entregues) e ATRASADO
   QCTRC (não entregues). Existem dois "slots" de importação — VAL (Rede Do
   Valle) e RVA (Real Vale) — porque são dois sistemas diferentes. Quando os
   dois têm dados, o painel junta pela sigla da unidade, somando os números
   de quem aparecer nos dois arquivos. */

function parseSswResumoGeral(text){
  text = text.replace(/\r\n/g, "\n");

  let periodo = "";
  const mesMatch = text.match(/MES:\s*([\d/]+)/i);
  if(mesMatch) periodo = mesMatch[1];

  const resumoIdx = text.search(/R\s*E\s*S\s*U\s*M\s*O/i);
  if(resumoIdx === -1) return {rows:[], periodo, encontrouResumo:false};
  const lines = text.slice(resumoIdx).split("\n");

  // acha a linha de separacao (-----+---+---...) para descobrir os limites
  // de cada coluna nesta secao (o RESUMO tem menos colunas que o detalhado)
  const sepLine = lines.find(l => /^-{5,}\+/.test(l));
  let bounds = [];
  if(sepLine){
    for(let i = 0; i < sepLine.length; i++){
      if(sepLine[i] === "+") bounds.push(i);
    }
  }
  if(bounds.length < 10){
    // layout padrao conhecido do RESUMO, caso a linha de separacao nao seja encontrada
    bounds = [55,62,70,82,88,96,102,111,117,129,135,141,152,158,167];
  }

  function slice(line, idx){
    const start = idx === 0 ? 0 : bounds[idx-1] + 1;
    if(start >= line.length) return "";
    const end = idx < bounds.length ? bounds[idx] : line.length;
    return (line.slice(start, end) || "").trim();
  }

  const rows = [];
  lines.forEach(line => {
    if(!line.trim()) return;
    if(/^-{5,}\+/.test(line)) return;

    const primeira = slice(line, 0);
    // desconsidera o prefixo de origem "GYN" quando presente (ex.: "GYN  RUB  RUBIATABA"),
    // ficando so a sigla da unidade de destino + cidade
    const primeiraSemOrigem = primeira.replace(/^GYN\s+/, "");
    const m = primeiraSemOrigem.match(/^([A-Z0-9]{2,5})\s+(.*)$/);
    if(!m) return; // nao e linha de unidade (cabecalho, rodape, linha em branco...)
    const sigla = m[1];
    // "TOTAL", "TOTAL DF", "TOTAL GO", "TOTAL GERAL" sao subtotais de regiao, nao unidades
    if(sigla === "DEST" || sigla === "DESTINO" || sigla === "UNIDADE" || sigla === "TOTAL") return;
    const destino = m[2].trim();

    const exped = num(slice(line, 2));
    const entregue = num(slice(line, 3));
    const noPrazoEnt = num(slice(line, 5));
    const atrasCli = num(slice(line, 7));
    const atrasTrans = num(slice(line, 9));
    const perf = num(slice(line, 11));
    const abertoNoPrazo = num(slice(line, 12));
    const abertoAtrasado = num(slice(line, 14));

    if(!exped && !entregue && !abertoNoPrazo && !abertoAtrasado) return;

    rows.push({sigla, destino, exped, entregue, noPrazoEnt, atrasCli, atrasTrans, perf, abertoNoPrazo, abertoAtrasado});
  });

  return {rows, periodo, encontrouResumo:true};
}

// Calcula os campos derivados de uma unidade (fora do prazo, PERF%, total).
// A formula do PERF% reproduz exatamente a coluna "PERF %" do relatorio SSW:
// noPrazo / (entregue - atrasCliente) * 100 — por isso funciona tanto para
// uma unidade de uma unica fonte quanto para o total ja somado de VAL+RVA.
function calcularCamposPerformance(m){
  const foraDoPrazo = m.atrasCli + m.atrasTrans;
  const denom = m.entregue - m.atrasCli;
  const perf = denom > 0 ? (m.noPrazoEnt/denom*100) : (m.entregue > 0 ? 0 : null);
  const total = m.entregue + m.abertoNoPrazo + m.abertoAtrasado;
  return {...m, foraDoPrazo, perf, sla: perf, total};
}

function aggregatePerformanceGeral(rows){
  const map = {};
  rows.forEach(r => {
    if(!map[r.sigla]) map[r.sigla] = {sigla:r.sigla, destino:r.destino, exped:0, entregue:0, noPrazoEnt:0, atrasCli:0, atrasTrans:0, abertoNoPrazo:0, abertoAtrasado:0};
    const m = map[r.sigla];
    if(!m.destino && r.destino) m.destino = r.destino;
    m.exped += r.exped; m.entregue += r.entregue; m.noPrazoEnt += r.noPrazoEnt;
    m.atrasCli += r.atrasCli; m.atrasTrans += r.atrasTrans;
    m.abertoNoPrazo += r.abertoNoPrazo; m.abertoAtrasado += r.abertoAtrasado;
  });
  return Object.values(map).map(calcularCamposPerformance);
}

// Grava os dados de UMA fonte (VAL ou RVA). Upsert por sigla — assim, se um
// dia vier so um arquivo parcial (ex.: so as unidades de um Focal), as demais
// unidades ja importadas daquela mesma fonte nao se perdem.
function importPerformanceGeralFonte(key, parsed){
  const novosAgg = aggregatePerformanceGeral(parsed.rows);
  const atual = load(key);
  const mapa = {};
  if(atual && Array.isArray(atual.unidades)){
    atual.unidades.forEach(u => { mapa[u.sigla] = u; });
  }
  const agora = todayISO();
  novosAgg.forEach(u => { mapa[u.sigla] = u; });
  const unidades = Object.values(mapa);
  save(key, {periodo: parsed.periodo || (atual && atual.periodo) || "", importadoEm: agora, unidades});
  return novosAgg;
}

// Junta VAL + RVA pela sigla da unidade, somando os campos numericos de quem
// aparecer nas duas fontes. Se so uma fonte tiver dados, o resultado e so
// aquela fonte (sem nenhuma soma). O formato devolvido e compativel com o
// que visaoGeralHTML/focalMiniPanelHTML/focalDashboardHTML ja esperam.
function mesclarPerformanceGeral(valData, rvaData){
  const mapa = {};
  function add(fonte, origem){
    if(!fonte || !Array.isArray(fonte.unidades)) return;
    fonte.unidades.forEach(u => {
      if(!mapa[u.sigla]){
        mapa[u.sigla] = {sigla:u.sigla, destino:u.destino, exped:0, entregue:0, noPrazoEnt:0, atrasCli:0, atrasTrans:0, abertoNoPrazo:0, abertoAtrasado:0, origens:[]};
      }
      const m = mapa[u.sigla];
      if(!m.destino && u.destino) m.destino = u.destino;
      m.exped += u.exped||0; m.entregue += u.entregue||0; m.noPrazoEnt += u.noPrazoEnt||0;
      m.atrasCli += u.atrasCli||0; m.atrasTrans += u.atrasTrans||0;
      m.abertoNoPrazo += u.abertoNoPrazo||0; m.abertoAtrasado += u.abertoAtrasado||0;
      if(!m.origens.includes(origem)) m.origens.push(origem);
    });
  }
  add(valData, "VAL");
  add(rvaData, "RVA");

  const unidades = Object.values(mapa).map(calcularCamposPerformance);
  unidades.sort((a,b)=> b.total - a.total);

  const periodos = [];
  if(valData && valData.periodo) periodos.push(`VAL: ${valData.periodo}`);
  if(rvaData && rvaData.periodo) periodos.push(`RVA: ${rvaData.periodo}`);
  const importadoEm = [valData && valData.importadoEm, rvaData && rvaData.importadoEm].filter(Boolean).sort().pop() || "";

  return {unidades, periodo: periodos.join(" · "), importadoEm};
}

function origemBadgeHTML(origens){
  if(!origens || origens.length === 0) return "";
  if(origens.length === 2) return `<span class="badge badge-green" style="font-size:10px;">VAL+RVA</span>`;
  const cor = origens[0] === "VAL" ? "badge-amber" : "badge-gray";
  return `<span class="badge ${cor}" style="font-size:10px;">${origens[0]}</span>`;
}

// Ordena a lista de unidades conforme perfGeralOrdenacao ("padrao" = sigla
// A-Z, "maior"/"menor" = por PERF%). Nao muta a lista recebida.
function ordenarUnidadesPerfGeral(lista){
  const l = [...lista];
  if(perfGeralOrdenacao === "maior"){
    l.sort((a,b)=> (b.perf===null||b.perf===undefined?-1:b.perf) - (a.perf===null||a.perf===undefined?-1:a.perf));
  } else if(perfGeralOrdenacao === "menor"){
    l.sort((a,b)=> (a.perf===null||a.perf===undefined?999:a.perf) - (b.perf===null||b.perf===undefined?999:b.perf));
  } else {
    l.sort((a,b)=> a.sigla.localeCompare(b.sigla));
  }
  return l;
}

// Painel de filtro (quais unidades entram na tabela) + ordenação. O estado
// (perfGeralUnidadesExcluidas / perfGeralOrdenacao) e' global ao modulo, entao
// sobrevive a cada re-render da aba.
function filtroOrdenacaoPerformanceGeralHTML(data){
  const unidadesTodas = [...data.unidades].sort((a,b)=> a.sigla.localeCompare(b.sigla));
  const selecionadas = unidadesTodas.length - perfGeralUnidadesExcluidas.size;
  return `
    <div class="panel">
      <div class="panel-header">Filtro de unidades e ordenação</div>
      <div style="padding:14px 18px;">
        <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
          <label style="font-weight:700; font-size:12.5px; color:var(--navy);">Ordenar por:</label>
          <select id="perfGeralOrdenacaoSelect" style="padding:6px 10px; border:1px solid var(--line); border-radius:6px; font-size:12.5px;">
            <option value="padrao" ${perfGeralOrdenacao==='padrao'?'selected':''}>Padrão (sigla A-Z)</option>
            <option value="maior" ${perfGeralOrdenacao==='maior'?'selected':''}>Maior performance primeiro</option>
            <option value="menor" ${perfGeralOrdenacao==='menor'?'selected':''}>Menor performance primeiro</option>
          </select>
          <button type="button" class="link-btn" id="perfGeralSelecionarTodas" style="margin-left:auto;">Selecionar todas</button>
          <button type="button" class="link-btn danger" id="perfGeralSelecionarNenhuma">Limpar seleção</button>
        </div>
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:12px;">
          <span style="font-size:12.5px; font-weight:700; color:var(--navy);">Selecionar só as unidades de:</span>
          ${FOCAIS.map(f => `<button type="button" class="pill perfGeralSoFocal" data-focal="${f.id}">${escHtml(f.titulo.split("—")[0].trim())}</button>`).join("")}
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:6px 14px; max-height:260px; overflow-y:auto; border:1px solid var(--line); border-radius:8px; padding:10px;">
          ${unidadesTodas.map(u => `
            <label style="display:flex; align-items:center; gap:6px; font-size:12.5px; cursor:pointer;">
              <input type="checkbox" class="perfGeralUnidadeCheck" value="${u.sigla}" ${perfGeralUnidadesExcluidas.has(u.sigla)?'':'checked'}>
              <span><strong>${u.sigla}</strong> — ${u.destino || '-'}</span>
            </label>
          `).join("")}
        </div>
        <div class="footer-note" style="padding-top:8px;">${selecionadas} de ${unidadesTodas.length} unidade(s) selecionada(s) para a tabela abaixo.</div>
      </div>
    </div>
  `;
}

function attachFiltroOrdenacaoPerformanceGeralEvents(){
  const sel = document.getElementById("perfGeralOrdenacaoSelect");
  if(sel) sel.addEventListener("change", (e)=>{
    perfGeralOrdenacao = e.target.value;
    renderPerformanceGeralDashboard();
  });
  document.querySelectorAll(".perfGeralUnidadeCheck").forEach(chk=>{
    chk.addEventListener("change", (e)=>{
      const sigla = e.target.value;
      if(e.target.checked) perfGeralUnidadesExcluidas.delete(sigla);
      else perfGeralUnidadesExcluidas.add(sigla);
      renderPerformanceGeralDashboard();
    });
  });
  document.querySelectorAll(".perfGeralSoFocal").forEach(btn => btn.addEventListener("click", () => {
    const focal = FOCAIS.find(f => f.id === btn.dataset.focal);
    if(!focal) return;
    const siglas = new Set(focal.unidades.map(u => u.sigla));
    perfGeralUnidadesExcluidas.clear();
    document.querySelectorAll(".perfGeralUnidadeCheck").forEach(chk => { if(!siglas.has(chk.value)) perfGeralUnidadesExcluidas.add(chk.value); });
    renderPerformanceGeralDashboard();
  }));
  const btnTodas = document.getElementById("perfGeralSelecionarTodas");
  if(btnTodas) btnTodas.addEventListener("click", ()=>{
    perfGeralUnidadesExcluidas.clear();
    renderPerformanceGeralDashboard();
  });
  const btnNenhuma = document.getElementById("perfGeralSelecionarNenhuma");
  if(btnNenhuma) btnNenhuma.addEventListener("click", ()=>{
    document.querySelectorAll(".perfGeralUnidadeCheck").forEach(chk => perfGeralUnidadesExcluidas.add(chk.value));
    renderPerformanceGeralDashboard();
  });
}

// Tabela "crua", com exatamente os campos pedidos: sigla, destino e as
// colunas do relatorio (QCTRCS EXPEDI, ENTREGUE, NOPRAZO, ATRASCLI,
// ATRASTRANSP, PERF%, NOPRAZO e ATRASADO das nao entregues). Recebe a lista
// ja filtrada e ordenada (ver ordenarUnidadesPerfGeral / perfGeralUnidadesExcluidas)
// — os totais do rodape refletem so o que estiver selecionado no filtro.
function tabelaPerformanceGeralHTML(unidadesFiltradas, periodo, temVal, temRva){
  const mostraOrigem = temVal && temRva;
  const tituloFonte = mostraOrigem ? " — VAL + RVA (somado pela sigla)" : (temVal ? " — VAL" : " — RVA");

  if(unidadesFiltradas.length === 0){
    return `
      <div class="panel">
        <div class="panel-header">Performance Geral por Unidade${tituloFonte}</div>
        <div class="empty">Nenhuma unidade selecionada no filtro acima.</div>
      </div>
    `;
  }

  const totais = computeTotais(unidadesFiltradas);
  // colgroup com larguras fixas — garante que thead/tbody/tfoot fiquem SEMPRE
  // alinhados entre si, mesmo com textos de tamanhos bem diferentes em cada
  // linha (ex.: "TOTAL DA SELEÇÃO" no rodapé vs. "CRT" no corpo).
  const colsLabel = mostraOrigem
    ? `<col style="width:7%"><col style="width:15%"><col style="width:8%">`
    : `<col style="width:7%"><col style="width:23%">`;
  const colgroup = `
    <colgroup>
      ${colsLabel}
      <col style="width:9%"><col style="width:9%"><col style="width:9%">
      <col style="width:9%"><col style="width:9%"><col style="width:8%">
      <col style="width:9%"><col style="width:8%">
    </colgroup>`;
  const colspanLabel = mostraOrigem ? 3 : 2;

  return `
    <div class="panel">
      <div class="panel-header" id="perfGeralTabelaHeader" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
        <span>Performance Geral por Unidade${tituloFonte}</span>
        <span style="display:flex; align-items:center; gap:12px;">
          ${periodo ? `<span style="font-weight:400; font-size:12.5px; opacity:.85;">${periodo}</span>` : ""}
          <button type="button" class="btn btn-ghost btn-sm" id="perfGeralExportBtn" title="Baixar esta tabela em Excel (.xlsx) com as mesmas cores">Exportar Excel</button>
        </span>
      </div>
      <div class="table-wrap perf-table-wrap">
        <table class="perf-table perf-table-simple" id="perfGeralTabela">
          ${colgroup}
          <thead><tr>
            <th class="th-unidade">Unidade</th><th class="th-unidade">Destino</th>${mostraOrigem ? '<th class="th-unidade">Origem</th>' : ""}
            <th class="th-previstas">QCTRCS Exped.</th><th class="th-entregue">Entregue QCTRC</th><th class="th-noprazo">No Prazo QCTRC</th>
            <th class="th-cliente">Atraso Cliente QCTRC</th><th class="th-transp">Atraso Transp. QCTRC</th><th class="th-sla">PERF %</th>
            <th class="th-abertonoprazo">Não Entreg. No Prazo</th><th class="th-abertoatraso">Não Entreg. Atrasado</th>
          </tr></thead>
          <tbody>
            ${unidadesFiltradas.map(u => `
              <tr id="pgu-row-${u.sigla}">
                <td class="perf-unidade">${u.sigla}</td>
                <td style="text-align:left; font-weight:400;">${u.destino || "-"}</td>
                ${mostraOrigem ? `<td>${origemBadgeHTML(u.origens)}</td>` : ""}
                <td class="perf-previstas">${fmtInt(u.exped)}</td>
                <td class="perf-entregue">${fmtInt(u.entregue)}</td>
                <td class="perf-noprazo">${fmtInt(u.noPrazoEnt)}</td>
                <td class="perf-cliente">${fmtInt(u.atrasCli)}</td>
                <td class="perf-transp">${fmtInt(u.atrasTrans)}</td>
                <td class="${slaClassGeral(u.perf)}">${fmtPct(u.perf)}</td>
                <td class="perf-abertonoprazo">${fmtInt(u.abertoNoPrazo)}</td>
                <td class="perf-abertoatraso">${fmtInt(u.abertoAtrasado)}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr class="perf-total-row">
              <td colspan="${colspanLabel}" style="text-align:left;">TOTAL DA SELEÇÃO</td>
              <td>${fmtInt(totais.exped)}</td>
              <td>${fmtInt(totais.entregue)}</td>
              <td>${fmtInt(totais.noPrazoEnt)}</td>
              <td>${fmtInt(totais.atrasCli)}</td>
              <td>${fmtInt(totais.atrasTrans)}</td>
              <td>${fmtPct(totais.sla)}</td>
              <td>${fmtInt(totais.abertoNoPrazo)}</td>
              <td>${fmtInt(totais.abertoAtrasado)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="footer-note">${unidadesFiltradas.length} unidade(s) — extraído da seção RESUMO (última página) do relatório .sswweb importado (${[temVal?"VAL":null, temRva?"RVA":null].filter(Boolean).join(" + ")}).</div>
    </div>
  `;
}

/* ================= SAC 1, 3, 4 e 5 — importação "transportadora como pagadora" ================= */
// Performance Geral = o Do Valle paga (mercadoria sai do Do Valle para as empresas).
// Aqui a empresa é a pagadora (mercadoria vem da transportadora para o Do Valle entregar).
//
// ATENÇÃO: estes arquivos NÃO seguem o modelo da Performance Geral de VAL/RVA (que só lê a
// seção RESUMO). O modelo daqui é o relatório 084 "PERFORMANCE DE ENTREGAS" do grupo
// "(COMO PAGADOR)", com uma linha por unidade de entrega + cidade, por exemplo:
//     GYN  ANP  ANAPOLIS     -> origem (GYN) + unidade de ENTREGA (ANP) + cidade
//     ITA  GNA  GOIANIA      -> origem (ITA) + unidade de ENTREGA (GNA) + cidade
//     GNA  GOIANIA           -> sem origem: unidade de ENTREGA (GNA) + cidade
// Regra: a linha é SEMPRE identificada pela unidade de entrega. A origem (GYN, ITA...) é
// descartada e nunca vira sigla de unidade.
//
// Cliente premium: quando a empresa é a pagadora, o arquivo dela traz TODAS as unidades de
// entrega. Esses dados ficam numa tabela ISOLADA, abaixo da tabela normal do SAC, e NÃO somam
// na tabela normal nem no total do SAC (nem na Visão Geral / Fechamento).
// Para liberar em outro SAC, coloque o id dele na lista.
const FOCAIS_COM_PAGADORA = ["sac1", "sac3", "sac4", "sac5"];
const EMPRESAS_PAGADORA = {
  AL2:"All Cargo", CMG:"CW3 (CMG)", CW3:"CW3", IVC:"Invicta", NWF:"NWF", RIT:"Rápido Ipora",
  SPR:"Sousa Pires", TLC:"LC Encomendas", TNG:"Delps (Transnorte Goiano)", TOP:"Top Luz", USE:"USE Transportes",
  EGO:"Expresso Goiás", ALF:"Alfa Transportes", EPD:"EP Distribuidora", FAV:"A Favorita Transportes"
};
// Alias: se alguém renomeou EPD para EP na tela de Confirmação de Filiais, continua valendo.
EMPRESAS_PAGADORA.EP = "EP Distribuidora";
const ALIAS_PAGADORA = { EPD:["EP"], EP:["EPD"] };

// UNIDADE (Do Valle paga → mercadoria sai do Do Valle para a empresa entregar) x PAGADORA
// (a empresa paga → ela entrega para o Do Valle). São tabelas SEPARADAS em todo SAC:
//   SAC 1 → TEM as 3 tabelas: unidades (Do Valle → grupo), pagadoras (1 linha por pagador) e Geral;
//   SAC 5 → não tem unidade: só clientes pagadores;
//   SAC 4         → ALF (Alfa) só existe como pagadora, não entregamos para ela;
//   SAC 3         → EGO é unidade (Do Valle → Expresso) E também pagadora (Expresso → Do Valle),
//                   em tabelas diferentes, nunca misturadas.
const FOCAIS_SO_PAGADORA = ["sac5"];
// SAC 1: o pagador é o próprio grupo (transportadoras). Na tabela de pagadoras NÃO abre por
// unidade de entrega: uma linha só por pagador (senão a tabela fica gigante).
const FOCAIS_PAGADOR_SEM_UNIDADE = ["sac1"];
const SIGLAS_SO_PAGADORA = { sac4:["ALF"] };
function unidadesNormaisDoFocal(focal){
  if(FOCAIS_SO_PAGADORA.includes(focal.id)) return [];
  const excl = SIGLAS_SO_PAGADORA[focal.id] || [];
  return focal.unidades.filter(u => !excl.includes(u.sigla));
}

const CAMPOS_PAGADORA = ["exped","entregue","noPrazoEnt","atrasCli","atrasTrans","abertoNoPrazo","abertoAtrasado"];
// Limites das colunas do relatório 084 detalhado (posição dos "+" da linha de separação).
// Só é usado se o arquivo não trouxer a linha de separação.
const PAGADORA_BOUNDS_PADRAO = [30,34,38,45,53,65,71,79,85,94,100,112,118,126,138,143,152];

let pagadoraMensagem = {focalId:"", texto:""};
let pagadoraArquivos = {};   // arquivo escolhido em cada linha, ainda não processado: {"sac1:AL2": File}

function chavePagadora(focalId){ return "tambasa_pagadora_" + focalId; }
function chaveArquivoPagadora(focalId, sigla){ return focalId + ":" + sigla; }
function carregarPagadora(focalId){
  const d = load(chavePagadora(focalId));
  return (d && typeof d === "object" && !Array.isArray(d)) ? d : {};
}
function definirMensagemPagadora(focalId, texto){ pagadoraMensagem = {focalId, texto}; }

// Lê a célula "DESTINO" de uma linha do relatório e devolve a unidade de ENTREGA.
// Aceita "ORIGEM  UNIDADE  CIDADE" (origem descartada) e "UNIDADE  CIDADE".
function identificarUnidadeEntrega(celula){
  const txt = String(celula || "").trim();
  if(!txt) return null;
  if(/^(DEST|DESTINO|TOTAL|UNIDADE)\b/i.test(txt)) return null;   // cabeçalho / subtotais
  let m = txt.match(/^([A-Z0-9]{2,5}) {2,}([A-Z0-9]{2,5}) {2,}(\S.*)$/);
  if(m) return {origem:m[1], unidade:m[2], cidade:m[3].trim()};
  m = txt.match(/^([A-Z0-9]{2,5}) {2,}(\S.*)$/);
  if(m) return {origem:"", unidade:m[1], cidade:m[2].trim()};
  return null;
}

// Leitor do arquivo do modelo "pagador" (relatório 084 detalhado, sem seção RESUMO).
function parseSswPagador(text){
  text = String(text || "").replace(/\r\n?/g, "\n");

  let periodo = "";
  const pm = text.match(/PERIODO EMISSAO:\s*(\d{2}\/\d{2}\/\d{2,4})\s*A\s*(\d{2}\/\d{2}\/\d{2,4})/i);
  if(pm) periodo = `${pm[1]} a ${pm[2]}`;

  let grupo = "", cnpj = "", comoPagador = false;
  const gm = text.match(/^GRUPO:\s*(.*?)\s*\((COMO [^)]+)\)\s*$/im) || text.match(/^GRUPO:\s*(.*?)\s*$/im);
  if(gm){
    comoPagador = /COMO PAGADOR/i.test(gm[2] || "");
    const cm = gm[1].match(/^([\d./-]{11,})\s+(.*)$/);
    cnpj = cm ? cm[1] : "";
    grupo = (cm ? cm[2] : gm[1]).trim();
  }

  // se vier um arquivo com seção RESUMO (modelo VAL/RVA), lê só o detalhado, antes do RESUMO
  const resumoIdx = text.search(/R\s*E\s*S\s*U\s*M\s*O/i);
  const temResumo = resumoIdx !== -1;
  const lines = (temResumo ? text.slice(0, resumoIdx) : text).split("\n");

  // limites das colunas: posição dos "+" da linha de separação do cabeçalho
  let bounds = null;
  for(const l of lines){
    if(/^-{5,}\+/.test(l)){
      const b = [];
      for(let i = 0; i < l.length; i++) if(l[i] === "+") b.push(i);
      if(b.length >= 17){ bounds = b; break; }
    }
  }
  const temCabecalho = !!bounds && /DESTINO/.test(text);
  if(!bounds) bounds = PAGADORA_BOUNDS_PADRAO;

  const col = {exped:4, entregue:5, noPrazo:7, atrasCli:9, atrasTrans:11, abertoNoPrazo:14, abertoAtrasado:16};
  function slice(line, idx){
    const start = idx === 0 ? 0 : bounds[idx-1] + 1;
    if(start >= line.length) return "";
    const end = idx < bounds.length ? bounds[idx] : line.length;
    return (line.slice(start, end) || "").trim();
  }

  const rows = [];
  let totalCliente = null;
  lines.forEach(line => {
    if(!line.trim() || /^-{5,}/.test(line)) return;
    const celula = slice(line, 0);
    if(/^TOTAL CLIENTE/i.test(celula)){
      totalCliente = {exped:num(slice(line, col.exped)), entregue:num(slice(line, col.entregue))};
      return;
    }
    const id = identificarUnidadeEntrega(celula);
    if(!id) return;
    const r = {
      origem:id.origem, unidade:id.unidade, cidade:id.cidade,
      exped:num(slice(line, col.exped)), entregue:num(slice(line, col.entregue)),
      noPrazoEnt:num(slice(line, col.noPrazo)), atrasCli:num(slice(line, col.atrasCli)),
      atrasTrans:num(slice(line, col.atrasTrans)),
      abertoNoPrazo:num(slice(line, col.abertoNoPrazo)), abertoAtrasado:num(slice(line, col.abertoAtrasado))
    };
    if(!CAMPOS_PAGADORA.some(c => r[c])) return;
    rows.push(r);
  });

  return {rows, periodo, grupo, cnpj, comoPagador, totalCliente, temCabecalho, temResumo};
}

// Soma as linhas por UNIDADE DE ENTREGA (a origem, GYN ou qualquer outra, já foi descartada).
function agruparPorUnidadeEntrega(rows){
  const mapa = {};
  rows.forEach(r => {
    if(!mapa[r.unidade]){
      mapa[r.unidade] = {sigla:r.unidade};
      CAMPOS_PAGADORA.forEach(c => { mapa[r.unidade][c] = 0; });
    }
    CAMPOS_PAGADORA.forEach(c => { mapa[r.unidade][c] += r[c] || 0; });
  });
  return mapa;
}

// A tabela normal do Focal usa só a Performance Geral (VAL/RVA). Os clientes premium
// (pagadora) têm tabela própria, abaixo — não entram aqui.
function dadoDaUnidade(focal, sigla, unidadesMap){
  return unidadesMap[sigla] || null;
}

// So entram no painel de importacao "pagadora" as unidades do Focal que sao
// transportadoras parceiras (cadastradas em EMPRESAS_PAGADORA) — as unidades
// que sao filiais/cidades normais (com importacao propria de Performance)
// nao aparecem aqui, mesmo fazendo parte do mesmo Focal.
function unidadesPagadoraDoFocal(focal){
  const lista = focal.unidades.filter(u => Object.prototype.hasOwnProperty.call(EMPRESAS_PAGADORA, u.sigla));
  // Garante o campo de importação dos clientes premium padrão do Focal (SAC 3 → EGO, SAC 4 → ALF,
  // SAC 5 → EPD e FAV) mesmo que o cadastro salvo no navegador seja antigo e não os tenha.
  // Não recria se a sigla já estiver em algum Focal (o usuário pode tê-la movido de propósito).
  const padrao = FOCAIS_PADRAO.find(f => f.id === focal.id);
  if(padrao){
    padrao.unidades.forEach(u => {
      if(!Object.prototype.hasOwnProperty.call(EMPRESAS_PAGADORA, u.sigla)) return;
      const nomes = [u.sigla, ...(ALIAS_PAGADORA[u.sigla] || [])];
      if(lista.some(x => nomes.includes(x.sigla))) return;
      if(FOCAIS.some(f => f.unidades.some(x => nomes.includes(x.sigla)))) return;
      lista.push({...u});
    });
  }
  return lista;
}

// Dados dos clientes premium (empresa pagadora) já importados de um Focal.
// Cada cliente premium tem UM pagador (o próprio cliente): EGO → Expresso Goiás,
// EPD → EP Distribuidora, FAV → Favorita, ALF → Alfa Transportes.
// Usado pela tela (tabelas premium + Geral) e pelo fechamento/exportação.
function premiumDoFocal(focal){
  if(!FOCAIS_COM_PAGADORA.includes(focal.id)) return [];
  const dados = carregarPagadora(focal.id);
  return unidadesPagadoraDoFocal(focal).filter(u => dados[u.sigla] && dados[u.sigla].unidades).map(u => {
    const d = dados[u.sigla];
    const pagador = EMPRESAS_PAGADORA[u.sigla] || u.sigla;
    const linhas = Object.keys(d.unidades).map(un => calcularCamposPerformance({...d.unidades[un], sigla:un, pagador, pagadorSigla:u.sigla}));
    return {sigla:u.sigla, pagador, grupo:d.grupo || "", periodo:d.periodo || "", linhas, totais:computeTotais(linhas)};
  });
}

// "Geral" do SAC: soma de TODOS os clientes premium importados do Focal (ex.: SAC 5 = EP + Favorita),
// mantendo o pagador em cada linha (unidade de entrega x pagador).
function geralPremiumDoFocal(focal){
  const clientes = premiumDoFocal(focal);
  if(clientes.length === 0) return null;
  const linhas = [];
  clientes.forEach(c => c.linhas.forEach(l => linhas.push(l)));
  return {clientes, linhas, totais:computeTotais(linhas)};
}

// Faturamento (frete) que o Focal trouxe, vindo da aba Fechamento-RECEITA:
//   unidades  = Do Valle → unidade (tabela de receita normal, só as unidades do focal)
//   pagadora  = empresa pagadora → Do Valle (store separada de receita "como pagador")
// Nunca soma unidade com pagadora dentro da mesma leitura: são duas stores diferentes.
function faturamentoDoFocal(focal){
  // MESMA regra da aba Fechamento-RECEITA (Por Focal): usa TODAS as unidades cadastradas no focal
  // (totaisReceitaDoGrupo) + a store da empresa pagadora (totaisReceitaPagadoraDoGrupo).
  // Antes usava unidadesNormaisDoFocal(), que descartava EPD/FAV (SAC 1 e 5) e ALF (SAC 4) da
  // direção Do Valle → Grupo e por isso o total não batia com a Receita.
  const dados = loadReceitaData().unidades, pag = loadReceitaPagadoraData().unidades;
  const grupo = {id:focal.id, titulo:focal.titulo, unidades:focal.unidades.map(u => u.sigla)};
  const un = totaisReceitaDoGrupo(grupo, dados).frete;
  const pg = totaisReceitaPagadoraDoGrupo(focal.id, pag).frete;
  const tem = grupo.unidades.some(s => dados[s]) || unidadesPagadoraDoFocal(focal).some(u => pag[u.sigla]);
  return {unidades:un, pagadora:pg, total:un + pg, temDados:tem};
}
// Faturamento total da empresa = MESMA conta do Dashboard da Receita (todos os grupos, incluindo
// "Outras unidades" e "Sem Focal definido", nas duas direções).
function faturamentoTotalGeral(){
  const dados = loadReceitaData().unidades, pag = loadReceitaPagadoraData().unidades;
  return totalGeralReceitaCombinado(gruposReceita(dados), dados, pag).frete;
}

// GERAL do SAC = unidades (Do Valle paga) + pagadora(s) (empresa paga), tudo somado numa linha só.
function geralDoFocal(focal, unidadesMap){
  const linhas = unidadesAgrupadasDoFocal(focal, unidadesMap);
  const comDados = linhas.filter(l => !l.semDados);
  const unidades = comDados.length ? computeTotais(comDados) : null;
  const g = geralPremiumDoFocal(focal);
  const pagadora = g ? g.totais : null;
  const partes = [unidades, pagadora].filter(Boolean);
  return {linhas, comDados, unidades, pagadora, clientes: g ? g.clientes : [],
          totais: computeTotais(partes), temDados: partes.length > 0};
}

function premiumTabelaHTML(o){
  const t = o.totais;
  return `
    <div class="panel premium-panel ${o.geral ? "premium-geral" : ""}" id="${escHtml(o.id)}" data-premium-sigla="${escHtml(o.siglaRef)}" style="margin-top:22px;">
      <div class="panel-header" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <span>${escHtml(o.titulo)}</span>
        <span style="padding:4px 10px; border-radius:6px; font-size:12.5px; font-weight:700; ${slaBadgeStyle(t.sla)}">SLA ${fmtPct(t.sla)}</span>
      </div>
      <div class="table-wrap perf-table-wrap">
        <table class="perf-table perf-table-full">
          <thead><tr>
            <th class="th-unidade">Unidade de entrega</th><th class="th-unidade">Pagador</th><th class="th-entregue">Entregue</th><th class="th-noprazo">No Prazo</th><th class="th-foraprazo">Fora Do Prazo</th><th class="th-cliente">Cliente</th><th class="th-transp">Transportadora</th><th class="th-sla">SLA</th><th class="th-previstas">Entregas Previstas</th><th class="th-abertoatraso">Aberto Atrasado</th><th class="th-abertonoprazo">Aberto No Prazo</th><th class="th-total">Total</th>
          </tr></thead>
          <tbody>
            ${o.linhas.map(l => `
              <tr>
                <td class="perf-unidade">${escHtml(l.sigla)}</td>
                <td>${escHtml(l.pagador)}</td>
                <td class="perf-entregue">${l.entregue}</td>
                <td class="perf-noprazo">${l.noPrazoEnt}</td>
                <td class="perf-foraprazo">${l.foraDoPrazo}</td>
                <td class="perf-cliente">${l.atrasCli}</td>
                <td class="perf-transp">${l.atrasTrans}</td>
                <td class="${slaClass(l.sla)}">${fmtPct(l.sla)}</td>
                <td class="perf-previstas">${l.exped}</td>
                <td class="perf-abertoatraso">${l.abertoAtrasado || ""}</td>
                <td class="perf-abertonoprazo">${l.abertoNoPrazo}</td>
                <td class="perf-total">${l.total}</td>
              </tr>`).join("")}
          </tbody>
          <tfoot>
            <tr class="perf-total-row">
              <td>${escHtml(o.rotuloTotal)}</td><td>${escHtml(o.pagadorTotal)}</td>
              <td>${t.entregue}</td><td>${t.noPrazoEnt}</td><td>${t.foraDoPrazo}</td>
              <td>${t.atrasCli}</td><td>${t.atrasTrans}</td><td>${fmtPct(t.sla)}</td>
              <td>${t.exped}</td><td>${t.abertoAtrasado || ""}</td><td>${t.abertoNoPrazo}</td><td>${t.total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="footer-note">${escHtml(o.nota)}</div>
    </div>`;
}

// Tabelas das empresas PAGADORAS (a empresa paga e entrega para o Do Valle), uma por cliente,
// abaixo da tabela de unidades. O GERAL do SAC (unidades + pagadora) é a tabela seguinte.
// Linhas de pagadores SEM abrir por unidade de entrega (SAC 1). CMG + CW3 viram uma linha só.
function pagadoresResumidosDoFocal(focal){
  const g = geralPremiumDoFocal(focal);
  if(!g) return [];
  const mapa = new Map();
  g.clientes.forEach(c => {
    const un = focal.unidades.find(u => u.sigla === c.sigla) || {};
    const chave = un.grupo || c.sigla;
    if(!mapa.has(chave)) mapa.set(chave, {sigla:chave, siglas:[], nomes:[], periodo:c.periodo, partes:[]});
    const m = mapa.get(chave);
    m.siglas.push(c.sigla); m.nomes.push(c.pagador); m.partes.push(c.totais);
  });
  return [...mapa.values()].map(m => ({...m, totais:computeTotais(m.partes), pagador:m.nomes[0]}));
}

function pagadorasResumoHTML(focal){
  const linhas = pagadoresResumidosDoFocal(focal);
  if(linhas.length === 0) return "";
  const nomeCurto = focal.titulo.split("—")[0].trim();
  const t = computeTotais(linhas.map(l => l.totais));
  const periodo = (linhas.find(l => l.periodo) || {}).periodo || "";
  return `
    <div class="panel premium-panel" id="premiumPanel-PAGADORAS" data-premium-sigla="PAGADORAS" style="margin-top:22px;">
      <div class="panel-header" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <span>2 · ${escHtml(focal.titulo)} — Pagadoras (o grupo paga e entrega para o Do Valle)</span>
        <span style="padding:4px 10px; border-radius:6px; font-size:12.5px; font-weight:700; ${slaBadgeStyle(t.sla)}">SLA ${fmtPct(t.sla)}</span>
      </div>
      <div class="table-wrap perf-table-wrap">
        <table class="perf-table perf-table-full">
          <thead><tr>
            <th class="th-unidade">Pagador</th><th class="th-entregue">Entregue</th><th class="th-noprazo">No Prazo</th><th class="th-foraprazo">Fora Do Prazo</th><th class="th-cliente">Cliente</th><th class="th-transp">Transportadora</th><th class="th-sla">SLA</th><th class="th-previstas">Entregas Previstas</th><th class="th-abertoatraso">Aberto Atrasado</th><th class="th-abertonoprazo">Aberto No Prazo</th><th class="th-total">Total</th>
          </tr></thead>
          <tbody>
            ${linhas.map(l => `
              <tr>
                <td class="perf-unidade">${escHtml(l.sigla)}${l.siglas.length > 1 ? ` <span style="font-weight:400;font-size:11px;opacity:.85;">(${l.siglas.join("+")})</span>` : ""}</td>
                <td class="perf-entregue">${l.totais.entregue}</td>
                <td class="perf-noprazo">${l.totais.noPrazoEnt}</td>
                <td class="perf-foraprazo">${l.totais.foraDoPrazo}</td>
                <td class="perf-cliente">${l.totais.atrasCli}</td>
                <td class="perf-transp">${l.totais.atrasTrans}</td>
                <td class="${slaClass(l.totais.sla)}">${fmtPct(l.totais.sla)}</td>
                <td class="perf-previstas">${l.totais.exped}</td>
                <td class="perf-abertoatraso">${l.totais.abertoAtrasado || ""}</td>
                <td class="perf-abertonoprazo">${l.totais.abertoNoPrazo}</td>
                <td class="perf-total">${l.totais.total}</td>
              </tr>`).join("")}
          </tbody>
          <tfoot>
            <tr class="perf-total-row">
              <td>TOTAL PAGADORAS ${escHtml(nomeCurto)}</td>
              <td>${t.entregue}</td><td>${t.noPrazoEnt}</td><td>${t.foraDoPrazo}</td><td>${t.atrasCli}</td><td>${t.atrasTrans}</td><td>${fmtPct(t.sla)}</td>
              <td>${t.exped}</td><td>${t.abertoAtrasado || ""}</td><td>${t.abertoNoPrazo}</td><td>${t.total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="footer-note">Uma linha por pagador (sem abrir por unidade de entrega)${periodo ? " — período " + escHtml(periodo) : ""}. Aqui o grupo é o pagador (ele entrega para o Do Valle) — não se mistura com a tabela de unidades; as duas se juntam só no Geral.</div>
    </div>`;
}

function clientesPremiumHTML(focal){
  if(FOCAIS_PAGADOR_SEM_UNIDADE.includes(focal.id)) return pagadorasResumoHTML(focal);
  const g = geralPremiumDoFocal(focal);
  if(!g) return "";
  const nomeCurto = focal.titulo.split("—")[0].trim();
  return g.clientes.map(c => premiumTabelaHTML({
    id:"premiumPanel-" + c.sigla, siglaRef:c.sigla, geral:false,
    titulo:`Pagadora — ${c.pagador} (${c.sigla}) · pagador: ${c.pagador}`,
    linhas:c.linhas, totais:c.totais, rotuloTotal:`TOTAL ${c.sigla}`, pagadorTotal:c.pagador,
    nota:`${c.linhas.length} unidade(s) de entrega${c.grupo ? " — arquivo de " + c.grupo : ""}${c.periodo ? " — período " + c.periodo : ""}. Aqui a empresa é a pagadora (ela entrega para o Do Valle) — não se mistura com a tabela de unidades do ${nomeCurto}; as duas se juntam só no Geral.`
  })).join("");
}

function pagadoraPainelHTML(focal){
  if(!FOCAIS_COM_PAGADORA.includes(focal.id)) return "";
  const unidadesPagadora = unidadesPagadoraDoFocal(focal);
  if(unidadesPagadora.length === 0) return "";
  const dados = carregarPagadora(focal.id);
  const feitas = unidadesPagadora.filter(u => dados[u.sigla]).length;
  const nomeCurto = focal.titulo.split("—")[0].trim();
  const mensagem = pagadoraMensagem.focalId === focal.id ? pagadoraMensagem.texto : "";
  return `
    <div class="panel" id="pagadoraPanel" style="margin-bottom:18px;">
      <div class="panel-header">Importar arquivos SSW — transportadora como pagadora (tabela separada no ${escHtml(nomeCurto)})</div>
      <p class="section-desc" style="padding:0 18px;">A <strong>Performance Geral</strong> é quando o Do Valle paga (mercadoria sai do Do Valle para as empresas). Aqui é o contrário: a empresa é a pagadora (mercadoria vem da transportadora para o Do Valle entregar). Estes arquivos têm <strong>modelo próprio</strong> (relatório 084 do grupo “como pagador”, uma linha por unidade de entrega) — não é o mesmo da Performance Geral de VAL/RVA. Em cada empresa, escolha o arquivo e clique em <strong>Processar</strong>. O sistema identifica a <strong>unidade de entrega</strong> e desconsidera a origem (ex.: <em>GYN ANP</em> → <strong>ANP</strong>). Cada empresa aparece como <strong>pagadora</strong> numa tabela própria, <strong>abaixo</strong> da tabela de unidades, com todas as unidades de entrega — ela <strong>não se mistura</strong> com a tabela de unidades; as duas só se somam na tabela <strong>Geral</strong> do SAC. Importar de novo a mesma sigla substitui o que já estava (não duplica). <strong>${feitas} de ${unidadesPagadora.length}</strong> importadas.</p>
      <div class="table-wrap"><table class="pagadora-table">
        <thead><tr><th>Sigla</th><th>Empresa</th><th>Previstas</th><th>Entregue</th><th>Situação</th><th>Arquivo</th></tr></thead>
        <tbody>
          ${unidadesPagadora.map(u => {
            const d = dados[u.sigla];
            const escolhido = pagadoraArquivos[chaveArquivoPagadora(focal.id, u.sigla)];
            const nUn = d && d.unidades ? Object.keys(d.unidades).length : 0;
            return `<tr data-pag-row="${escHtml(u.sigla)}">
              <td><strong>${escHtml(u.sigla)}</strong></td>
              <td>${escHtml(EMPRESAS_PAGADORA[u.sigla] || (d && d.destino) || "-")}${d && d.grupo ? `<div class="pag-arquivo">Arquivo de: ${escHtml(d.grupo)}${nUn ? ` · ${nUn} unidade(s) de entrega` : ""}</div>` : ""}</td>
              <td>${d ? fmtInt(d.exped) : "—"}</td>
              <td>${d ? fmtInt(d.entregue) : "—"}</td>
              <td>${d ? `<span class="badge badge-green">✔ ${fmtDate(d.importadoEm)}</span>${d.conferido === false ? ` <span class="badge badge-amber" title="A soma das linhas não bate com o TOTAL CLIENTE do arquivo">⚠ conferir</span>` : ""}${d.periodo ? `<div class="pag-arquivo">Período ${escHtml(d.periodo)}</div>` : ""}` : `<span class="badge badge-gray">Pendente</span>`}</td>
              <td class="pag-acoes"><div class="pag-box">
                <label class="btn btn-ghost btn-sm pagadora-btn">Escolher arquivo<input type="file" hidden accept=".sswweb,.txt,text/plain" data-pag-sigla="${escHtml(u.sigla)}"></label>
                <button type="button" class="btn btn-primary btn-sm" data-pag-processar="${escHtml(u.sigla)}" ${escolhido ? "" : "disabled"}>Processar</button>
                ${d ? `<button type="button" class="link-btn danger" data-pag-del="${escHtml(u.sigla)}">Remover</button>` : ""}
                <span class="pag-arquivo pag-nome" data-pag-nome="${escHtml(u.sigla)}" title="${escolhido ? escHtml(escolhido.name) : ""}">${escolhido ? escHtml(escolhido.name) : "nenhum arquivo escolhido"}</span>
              </div></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table></div>
      <div class="footer-note" id="pagadoraStatus">${escHtml(mensagem)}</div>
    </div>`;
}

function attachPagadoraEvents(focal){
  const painel = document.getElementById("pagadoraPanel");
  if(!painel) return;
  const status = painel.querySelector("#pagadoraStatus");

  // 1) escolher o arquivo da linha (ainda não processa)
  painel.querySelectorAll("input[data-pag-sigla]").forEach(inp => inp.addEventListener("change", () => {
    const sg = inp.dataset.pagSigla;
    const chave = chaveArquivoPagadora(focal.id, sg);
    const file = inp.files[0];
    if(file) pagadoraArquivos[chave] = file; else delete pagadoraArquivos[chave];
    inp.value = "";
    const nome = painel.querySelector(`[data-pag-nome="${sg}"]`);
    const btn = painel.querySelector(`button[data-pag-processar="${sg}"]`);
    if(nome){ nome.textContent = file ? file.name : "nenhum arquivo escolhido"; nome.title = file ? file.name : ""; }
    if(btn) btn.disabled = !file;
  }));

  // 2) processar só o arquivo daquela linha
  painel.querySelectorAll("button[data-pag-processar]").forEach(btn => btn.addEventListener("click", async () => {
    const sg = btn.dataset.pagProcessar;
    const file = pagadoraArquivos[chaveArquivoPagadora(focal.id, sg)];
    if(!file){ if(status) status.textContent = `${sg}: escolha o arquivo antes de processar.`; return; }
    btn.disabled = true;
    btn.textContent = "Processando…";
    await importarPagadora(focal, sg, file);
  }));

  painel.querySelectorAll("button[data-pag-del]").forEach(btn => btn.addEventListener("click", () => {
    const sg = btn.dataset.pagDel;
    if(!confirm(`Remover a importação de ${sg}? Ela deixa de somar no ${focal.titulo}.`)) return;
    const dados = carregarPagadora(focal.id);
    delete dados[sg];
    save(chavePagadora(focal.id), dados);
    definirMensagemPagadora(focal.id, `Importação de ${sg} removida.`);
    renderPerformanceGeralDashboard();
  }));
}

async function importarPagadora(focal, slotSigla, file){
  const chave = chaveArquivoPagadora(focal.id, slotSigla);
  try{
    const parsed = parseSswPagador(await file.text());
    if(!parsed.temCabecalho){
      definirMensagemPagadora(focal.id, `${slotSigla} — ${file.name}: não parece o relatório 084 - Performance de Entregas (modelo “como pagador”). Confira o arquivo escolhido.`);
    } else if(parsed.rows.length === 0){
      definirMensagemPagadora(focal.id, `${slotSigla} — ${file.name}: não encontrei nenhuma linha de unidade de entrega nesse arquivo.`);
    } else {
      const unidades = agruparPorUnidadeEntrega(parsed.rows);
      const tot = {exped:0, entregue:0};
      parsed.rows.forEach(r => { tot.exped += r.exped; tot.entregue += r.entregue; });
      const conferido = !!parsed.totalCliente && parsed.totalCliente.exped === tot.exped && parsed.totalCliente.entregue === tot.entregue;

      const dados = carregarPagadora(focal.id);
      dados[slotSigla] = {
        sigla:slotSigla, grupo:parsed.grupo, cnpj:parsed.cnpj, arquivo:file.name,
        periodo:parsed.periodo || "", importadoEm:todayISO(),
        exped:tot.exped, entregue:tot.entregue, conferido, unidades
      };
      save(chavePagadora(focal.id), dados);
      delete pagadoraArquivos[chave];

      const lista = Object.keys(unidades);
      let msg = `✔ ${slotSigla} — ${file.name}: ${fmtInt(tot.exped)} previstas / ${fmtInt(tot.entregue)} entregues em ${lista.length} unidade(s) de entrega (${lista.join(", ")}; origem/GYN desconsiderada). Veja a tabela “Cliente premium” abaixo da tabela do SAC.`;
      if(!parsed.comoPagador) msg += ` ⚠ O cabeçalho do arquivo não diz “(COMO PAGADOR)” — confira se é o arquivo certo.`;
      if(!parsed.totalCliente) msg += ` ⚠ Não encontrei a linha TOTAL CLIENTE (arquivo incompleto?).`;
      else if(!conferido) msg += ` ⚠ A soma das linhas (${fmtInt(tot.exped)} / ${fmtInt(tot.entregue)}) não bate com o TOTAL CLIENTE do arquivo (${fmtInt(parsed.totalCliente.exped)} / ${fmtInt(parsed.totalCliente.entregue)}).`;
      definirMensagemPagadora(focal.id, msg);
    }
  }catch(err){
    console.error("Erro ao importar arquivo da transportadora pagadora:", err);
    definirMensagemPagadora(focal.id, `Não foi possível ler ${file.name} (${err.message || err}).`);
  }
  renderPerformanceGeralDashboard();
}

/* ================= PERFORMANCE GERAL — dashboard (consolidado + por Focal) ================= */

function fmtInt(n){
  return Math.round(n || 0).toLocaleString('pt-BR');
}

function slaBadgeStyle(sla){
  const cls = slaClass(sla);
  const map = {
    'perf-sla-ok':   'background:var(--green); color:#fff;',
    'perf-sla-good': 'background:#a9e0b4; color:#1e7d3c;',
    'perf-sla-warn': 'background:#ffdd66; color:#7a5600;',
    'perf-sla-bad':  'background:var(--red); color:#fff;',
    'perf-sla-na':   'background:#eee; color:var(--muted);'
  };
  return map[cls] || map['perf-sla-na'];
}

function slaKpiClass(sla){
  if(sla === null || sla === undefined) return "warn";
  return sla >= 98 ? "ok" : (sla >= 95 ? "warn" : "alert");
}

function computeTotais(lista){
  const t = lista.reduce((acc,u)=>{
    acc.exped += u.exped||0; acc.entregue += u.entregue||0; acc.noPrazoEnt += u.noPrazoEnt||0;
    acc.atrasCli += u.atrasCli||0; acc.atrasTrans += u.atrasTrans||0;
    acc.abertoNoPrazo += u.abertoNoPrazo||0; acc.abertoAtrasado += u.abertoAtrasado||0;
    acc.total += u.total||0;
    return acc;
  }, {exped:0,entregue:0,noPrazoEnt:0,atrasCli:0,atrasTrans:0,abertoNoPrazo:0,abertoAtrasado:0,total:0});
  const denom = t.entregue - t.atrasCli;
  t.sla = denom > 0 ? (t.noPrazoEnt/denom*100) : (t.entregue > 0 ? 0 : null);
  t.foraDoPrazo = t.atrasCli + t.atrasTrans;
  return t;
}

function somarUnidades(lista){
  return computeTotais(lista);
}

// Monta as linhas de um Focal, ja combinando unidades do mesmo grupo (ex.: CMG+CW3)
// em uma unica linha, e marcando como "semDados" as unidades ainda nao importadas.
function unidadesAgrupadasDoFocal(focal, unidadesMap){
  const vistos = new Set();
  const linhas = [];
  const unidadesFocal = unidadesNormaisDoFocal(focal);   // pagadoras ficam em tabela própria
  unidadesFocal.forEach(u => {
    if(vistos.has(u.sigla)) return;
    if(u.grupo){
      const doGrupo = unidadesFocal.filter(x => x.grupo === u.grupo);
      doGrupo.forEach(x => vistos.add(x.sigla));
      const dados = doGrupo.map(x => dadoDaUnidade(focal, x.sigla, unidadesMap)).filter(Boolean);
      if(dados.length === 0){
        linhas.push({sigla:u.grupo, semDados:true});
      } else {
        linhas.push({...computeTotais(dados), sigla:u.grupo, combinaSiglas: doGrupo.map(x=>x.sigla)});
      }
    } else {
      vistos.add(u.sigla);
      const dado = dadoDaUnidade(focal, u.sigla, unidadesMap);
      linhas.push(dado ? {...dado} : {sigla:u.sigla, semDados:true});
    }
  });
  return linhas;
}

let perfGeralFocalAtivo = "geral";
let perfGeralOrdenacao = "padrao"; // "padrao" (sigla A-Z) | "maior" | "menor" (por PERF%)
let perfGeralUnidadesExcluidas = new Set(); // siglas desmarcadas no filtro (vazio = mostra todas)

function blocoImportacaoPerfGeralHTML(cfg){
  return `
    <div class="panel">
      <div class="panel-header">${cfg.titulo}</div>
      <form class="add-form" id="${cfg.formId}">
        <div class="field"><label>Arquivo (.sswweb / .txt)</label><input type="file" id="${cfg.inputId}" accept=".sswweb,.txt,text/plain"></div>
        <div class="field" style="max-width:200px;">
          <button type="submit" class="btn btn-primary">Processar arquivo</button>
        </div>
        <div class="field full">
          <button type="button" class="link-btn" id="${cfg.toggleId}">ou colar o texto manualmente (só a última página / RESUMO)</button>
        </div>
      </form>
      <div id="${cfg.wrapId}" style="display:none; padding:0 18px 16px;">
        <textarea id="${cfg.textareaId}" rows="8" style="width:100%; font-family:monospace; font-size:11.5px; padding:8px; border:1px solid var(--line); border-radius:6px;" placeholder="Cole aqui o texto da última página (RESUMO) do relatório..."></textarea>
        <div style="margin-top:8px;"><button type="button" class="btn btn-ghost btn-sm" id="${cfg.processarId}">Processar texto colado</button></div>
      </div>
      <div class="footer-note-row">
        <div class="footer-note" id="${cfg.statusId}"></div>
        <button type="button" class="link-btn danger" id="${cfg.redefinirId}">Redefinir ${cfg.nomeFonte}</button>
      </div>
    </div>
  `;
}

let perfGeralSubTab = "dashboard"; // "dashboard" | "unidade" | "focal"

const PG_SUBTABS = [
  {id:"dashboard", label:"Dashboard Principal"},
  {id:"unidade", label:"Por Unidade"},
  {id:"focal", label:"Por Focal"}
];

function performanceGeralHTML(){
  return `
    <h2 class="section-title">Fechamento — Performance de Entregas</h2>
    <p class="section-desc">Importação <strong>própria</strong>, independente da aba <strong>Performance</strong>. Existem dois sistemas diferentes: <strong>VAL</strong> (Rede Do Valle) e <strong>RVA</strong> (Real Vale) — se importar os dois, o painel junta os dados automaticamente pela sigla da unidade. Use as sub-abas abaixo para navegar entre a visão geral, o detalhe por unidade e o detalhe por Focal.</p>

    <div class="pg-subtabs" id="pgSubtabsNav">
      ${PG_SUBTABS.map(t => `<button type="button" class="pg-subtab-btn ${perfGeralSubTab===t.id?'active':''}" data-pgsub="${t.id}">${t.label}</button>`).join("")}
    </div>

    <div class="pg-subview ${perfGeralSubTab==='dashboard'?'active':''}" id="pgView-dashboard">
      ${blocoImportacaoPerfGeralHTML({
        titulo: "Importar Performance VAL — Rede Do Valle",
        formId: "formPerfGeralVal", inputId: "perfGeralValInput",
        toggleId: "togglePerfGeralValTexto", wrapId: "perfGeralValTextoWrap",
        textareaId: "perfGeralValTexto", processarId: "processarPerfGeralValTexto",
        statusId: "perfGeralValStatus", redefinirId: "redefinirPerfGeralVal",
        nomeFonte: "VAL"
      })}
      ${blocoImportacaoPerfGeralHTML({
        titulo: "Importar Performance RVA — Real Vale",
        formId: "formPerfGeralRva", inputId: "perfGeralRvaInput",
        toggleId: "togglePerfGeralRvaTexto", wrapId: "perfGeralRvaTextoWrap",
        textareaId: "perfGeralRvaTexto", processarId: "processarPerfGeralRvaTexto",
        statusId: "perfGeralRvaStatus", redefinirId: "redefinirPerfGeralRva",
        nomeFonte: "RVA"
      })}
      <div id="perfGeralDashWrap"></div>
    </div>

    <div class="pg-subview ${perfGeralSubTab==='unidade'?'active':''}" id="pgView-unidade">
      <div id="perfGeralUnidadeWrap"></div>
    </div>

    <div class="pg-subview ${perfGeralSubTab==='focal'?'active':''}" id="pgView-focal">
      <div id="perfGeralFocalWrap"></div>
    </div>
  `;
}

function attachPgSubtabsEvents(){
  const nav = document.getElementById("pgSubtabsNav");
  if(!nav) return;
  nav.querySelectorAll("[data-pgsub]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      perfGeralSubTab = btn.dataset.pgsub;
      nav.querySelectorAll("[data-pgsub]").forEach(b=> b.classList.toggle("active", b.dataset.pgsub===perfGeralSubTab));
      document.getElementById("pgView-dashboard").classList.toggle("active", perfGeralSubTab==="dashboard");
      document.getElementById("pgView-unidade").classList.toggle("active", perfGeralSubTab==="unidade");
      document.getElementById("pgView-focal").classList.toggle("active", perfGeralSubTab==="focal");
    });
  });
}

// Muda para a sub-aba "Por Unidade" e garante que a unidade pedida fique visível
// no filtro (usado pelos cliques do Dashboard Principal — Top 5 / bottom 5).
window.perfGeralIrParaUnidade = function(sigla){
  perfGeralUnidadesExcluidas.delete(sigla);
  perfGeralSubTab = "unidade";
  renderPerformanceGeralDashboard();
  const nav = document.getElementById("pgSubtabsNav");
  if(nav) nav.querySelectorAll("[data-pgsub]").forEach(b=> b.classList.toggle("active", b.dataset.pgsub==="unidade"));
  document.getElementById("pgView-dashboard").classList.remove("active");
  document.getElementById("pgView-unidade").classList.add("active");
  document.getElementById("pgView-focal").classList.remove("active");
  setTimeout(()=>{
    const row = document.getElementById("pgu-row-"+sigla);
    if(row){ if(typeof row.scrollIntoView === "function") row.scrollIntoView({behavior:"smooth", block:"center"}); row.classList.add("row-highlight"); setTimeout(()=> row.classList.remove("row-highlight"), 2200); }
  }, 30);
};

function wireImportacaoPerfGeral(cfg){
  const form = document.getElementById(cfg.formId);
  const statusEl = document.getElementById(cfg.statusId);
  if(!form || !statusEl) return;

  function processar(text){
    const parsed = parseSswResumoGeral(text);
    if(!parsed.encontrouResumo){
      statusEl.textContent = "Não encontrei a seção RESUMO (última página) nesse arquivo. Confira se é o relatório 084 - Performance de Entregas completo.";
      return;
    }
    if(parsed.rows.length === 0){
      statusEl.textContent = "Não encontrei linhas de unidade na seção RESUMO desse arquivo.";
      return;
    }
    importPerformanceGeralFonte(cfg.key, parsed);
    statusEl.textContent = `Período ${parsed.periodo || "-"}: ${parsed.rows.length} unidade(s) importada(s) da seção RESUMO (${cfg.nomeFonte}).`;
    renderPerformanceGeralDashboard();
  }

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const fileInput = document.getElementById(cfg.inputId);
    const file = fileInput.files[0];
    if(!file){ statusEl.textContent = "Selecione o arquivo do relatório."; return; }
    try{
      const text = await file.text();
      processar(text);
      fileInput.value = "";
    }catch(err){
      console.error("Erro ao importar performance geral ("+cfg.nomeFonte+"):", err);
      statusEl.textContent = "Não foi possível ler esse arquivo (" + (err.message||err) + "). Tente colar o texto manualmente.";
    }
  });

  document.getElementById(cfg.toggleId).addEventListener("click", ()=>{
    const w = document.getElementById(cfg.wrapId);
    w.style.display = w.style.display === "none" ? "block" : "none";
  });

  document.getElementById(cfg.processarId).addEventListener("click", ()=>{
    const textarea = document.getElementById(cfg.textareaId);
    const text = textarea.value;
    if(!text.trim()){ statusEl.textContent = "Cole o texto do relatório antes de processar."; return; }
    processar(text);
    textarea.value = "";
  });

  document.getElementById(cfg.redefinirId).addEventListener("click", ()=>{
    if(!confirm(`Isso vai apagar os dados de Performance Geral já importados para ${cfg.nomeFonte}. Deseja continuar?`)) return;
    save(cfg.key, null);
    statusEl.textContent = `Dados ${cfg.nomeFonte} redefinidos.`;
    renderPerformanceGeralDashboard();
  });

  const atual = load(cfg.key);
  if(atual && Array.isArray(atual.unidades) && atual.unidades.length){
    statusEl.textContent = `${atual.unidades.length} unidade(s) importada(s)${atual.periodo ? " — período " + atual.periodo : ""}.`;
  }
}

function attachPerformanceGeralEvents(){
  wireImportacaoPerfGeral({
    key: KEYS.performanceGeralVal,
    formId: "formPerfGeralVal", inputId: "perfGeralValInput",
    toggleId: "togglePerfGeralValTexto", wrapId: "perfGeralValTextoWrap",
    textareaId: "perfGeralValTexto", processarId: "processarPerfGeralValTexto",
    statusId: "perfGeralValStatus", redefinirId: "redefinirPerfGeralVal",
    nomeFonte: "VAL"
  });
  wireImportacaoPerfGeral({
    key: KEYS.performanceGeralRva,
    formId: "formPerfGeralRva", inputId: "perfGeralRvaInput",
    toggleId: "togglePerfGeralRvaTexto", wrapId: "perfGeralRvaTextoWrap",
    textareaId: "perfGeralRvaTexto", processarId: "processarPerfGeralRvaTexto",
    statusId: "perfGeralRvaStatus", redefinirId: "redefinirPerfGeralRva",
    nomeFonte: "RVA"
  });
  attachPgSubtabsEvents();
  renderPerformanceGeralDashboard();
}

function renderPerformanceGeralDashboard(){
  const dashWrap = document.getElementById("perfGeralDashWrap");
  const unidadeWrap = document.getElementById("perfGeralUnidadeWrap");
  const focalWrap = document.getElementById("perfGeralFocalWrap");
  if(!dashWrap || !unidadeWrap || !focalWrap) return;

  const valData = load(KEYS.performanceGeralVal);
  const rvaData = load(KEYS.performanceGeralRva);
  const temVal = !!(valData && Array.isArray(valData.unidades) && valData.unidades.length > 0);
  const temRva = !!(rvaData && Array.isArray(rvaData.unidades) && rvaData.unidades.length > 0);

  if(!temVal && !temRva){
    const vazio = `<div class="empty">Nenhum relatório importado ainda. Importe pelo menos um dos arquivos (VAL e/ou RVA) na aba "Dashboard Principal" para ver o resumo geral por unidade.</div>`;
    dashWrap.innerHTML = vazio;
    unidadeWrap.innerHTML = vazio;
    focalWrap.innerHTML = vazio;
    return;
  }

  const data = mesclarPerformanceGeral(temVal ? valData : null, temRva ? rvaData : null);
  const unidadesMap = {};
  data.unidades.forEach(u => { unidadesMap[u.sigla] = u; });

  // ---- Sub-aba Dashboard Principal ----
  dashWrap.innerHTML = dashboardPrincipalPerfGeralHTML(data);

  // ---- Sub-aba Por Unidade ----
  const unidadesSelecionadas = data.unidades.filter(u => !perfGeralUnidadesExcluidas.has(u.sigla));
  const unidadesParaTabela = ordenarUnidadesPerfGeral(unidadesSelecionadas);
  unidadeWrap.innerHTML = `
    ${filtroOrdenacaoPerformanceGeralHTML(data)}
    ${tabelaPerformanceGeralHTML(unidadesParaTabela, data.periodo, temVal, temRva)}
  `;
  attachFiltroOrdenacaoPerformanceGeralEvents();

  // ---- Sub-aba Por Focal ----
  if(!FOCAIS.some(f => f.id === perfGeralFocalAtivo)) perfGeralFocalAtivo = "geral";
  focalWrap.innerHTML = `
    <div class="pg-focal-picker" id="pgFocalPicker">
      <button type="button" class="pill ${perfGeralFocalAtivo==='geral'?'active':''}" data-focalpick="geral">Visão geral (todos os Focais)</button>
      ${FOCAIS.map(f => `<button type="button" class="pill ${perfGeralFocalAtivo===f.id?'active':''}" data-focalpick="${f.id}">${escHtml(f.titulo.split("—")[0].trim())}</button>`).join("")}
    </div>
    <div id="pgFocalContent"></div>
  `;
  document.getElementById("pgFocalPicker").querySelectorAll("[data-focalpick]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      perfGeralFocalAtivo = btn.dataset.focalpick;
      renderPerformanceGeralDashboard();
    });
  });
  const focalContent = document.getElementById("pgFocalContent");
  if(perfGeralFocalAtivo === "geral"){
    focalContent.innerHTML = visaoGeralHTML(data, unidadesMap);
  } else {
    const focal = FOCAIS.find(f => f.id === perfGeralFocalAtivo);
    focalContent.innerHTML = pagadoraPainelHTML(focal) + focalDashboardHTML(focal, data, unidadesMap);
    attachPagadoraEvents(focal);
  }

  attachExportPerfGeralEvents(data);
}

/* ---------- Fechamento (Excel para o gestor) ---------- */
const SUPERVISORA_SAC = "CAMILA BORGES";   // aparece no PRINCIPAL: "SUPERVISORA SAC - ..."
const META_PERFORMANCE = 98;               // meta (%) usada nas cores e no cabeçalho

// "08/2026" -> "Agosto/2026" (se não reconhecer, devolve o texto como veio)
function periodoPorExtenso(txt){
  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const achados = [...String(txt || "").matchAll(/(\d{2})\/(\d{4})/g)]
    .map(m => (meses[parseInt(m[1],10) - 1] || m[1]) + "/" + m[2]);
  const unicos = [...new Set(achados)];
  return unicos.length ? unicos.join(" e ") : (txt || "");
}

// Dados da aba Fechamento-RECEITA no formato do Excel (dashboard + aba RECEITA).
// Devolve null quando ainda não há nada importado.
function montarPayloadReceita(){
  const data = loadReceitaData();
  const dadosPagadora = loadReceitaPagadoraData().unidades;
  const temNormal = Object.keys(data.unidades).length > 0;
  const temPagadora = Object.keys(dadosPagadora).length > 0;
  if(!temNormal && !temPagadora) return null;

  const periodos = [];
  Object.values(data.unidades).forEach(u => [u.val, u.rva].forEach(o => { if(o && o.periodo) periodos.push(o.periodo); }));
  Object.values(dadosPagadora).forEach(u => [u.val, u.rva].forEach(o => { if(o && o.periodo) periodos.push(o.periodo); }));

  // Direção Do Valle → Grupo (unidade normal, Do Valle fatura).
  const grupos = gruposReceita(data.unidades).map(g => ({
    titulo: g.titulo,
    unidades: g.unidades.filter(s => data.unidades[s]).map(s => ({sigla:s, val:data.unidades[s].val || null, rva:data.unidades[s].rva || null}))
  })).filter(g => g.unidades.length > 0);

  // Direção Grupo → Do Valle (empresa pagadora) — entra como grupo(s) SEPARADO(S), com
  // título próprio, pra nunca ser somado nem confundido com a linha "Do Valle → Grupo"
  // da mesma sigla na planilha.
  FOCAIS.forEach(focal => {
    const unidadesPag = unidadesPagadoraDoFocal(focal)
      .filter(u => dadosPagadora[u.sigla])
      .map(u => ({sigla:u.sigla, val:dadosPagadora[u.sigla].val || null, rva:dadosPagadora[u.sigla].rva || null}));
    if(unidadesPag.length){
      grupos.push({titulo: `${focal.titulo} — Grupo → Do Valle (empresa pagadora)`, unidades: unidadesPag});
    }
  });

  // Expedidora + Geral (Expedida x Recebida): vão junto como abas EXPEDIDORA e GERAL no Excel.
  return {periodo: periodoPorExtenso(periodos.join(" ")), supervisora: SUPERVISORA_SAC, grupos, expedicao: montarPayloadExpedicao()};
}

// Dados das abas EXPEDIDORA (o que cada unidade expediu) e GERAL (expedida x recebida)
// no formato do Excel. null quando ainda não há Praça Expedidora importada.
function montarPayloadExpedicao(){
  const exp = loadUnidadeExpedidoraData();
  if(!Object.keys(exp.unidades).length) return null;
  const rec = loadUnidadeDestinoData();
  const periodos = [];
  const conv = u => {
    const v = {qctrc:Number(u.val && u.val.qctrc) || 0, frete:Number(u.val && u.val.frete) || 0, vlrMerc:Number(u.val && u.val.vlrMerc) || 0};
    const r = {qctrc:Number(u.rva && u.rva.qctrc) || 0, frete:Number(u.rva && u.rva.frete) || 0, vlrMerc:Number(u.rva && u.rva.vlrMerc) || 0};
    if(u.val && u.val.periodo) periodos.push(u.val.periodo);
    if(u.rva && u.rva.periodo) periodos.push(u.rva.periodo);
    return {sigla:u.sigla, cidade:u.cidade || "", qctrc:v.qctrc + r.qctrc, freteVal:v.frete, freteRva:r.frete, frete:v.frete + r.frete, vlrMerc:v.vlrMerc + r.vlrMerc};
  };
  return {
    periodo: periodoPorExtenso([...new Set(periodos)].join(" ")),
    // só as filiais marcadas na seleção (GYN começa desmarcada)
    expedidoras: Object.values(exp.unidades).filter(u => filialMarcada(u.sigla)).map(conv),
    receptoras: Object.values(rec.unidades).filter(u => filialMarcada(u.sigla)).map(conv)
  };
}

// Monta os dados do fechamento a partir do que já está na tela (sem depender do filtro da tabela:
// o fechamento sempre leva TODAS as siglas importadas e TODOS os Focais).
function montarPayloadFechamento(data){
  const unidadesMap = {};
  data.unidades.forEach(u => { unidadesMap[u.sigla] = u; });
  const origens = new Set();
  data.unidades.forEach(u => (u.origens || []).forEach(o => origens.add(o)));
  const fontes = ["VAL","RVA"].filter(o => origens.has(o)).join(" + ") || "VAL + RVA";

  const campoPremium = l => ({sigla:l.sigla, pagador:l.pagador || "", exped:l.exped, entregue:l.entregue,
    noPrazoEnt:l.noPrazoEnt, atrasCli:l.atrasCli, atrasTrans:l.atrasTrans});
  // frete (faturamento) por unidade (Do Valle → Grupo) e por empresa pagadora (Grupo → Do Valle)
  const recUn = loadReceitaData().unidades, recPag = loadReceitaPagadoraData().unidades;
  const freteUn = siglas => siglas.reduce((s, x) => s + combinaUnidadeReceita(recUn[x]).frete, 0);
  const focais = FOCAIS.filter(f => f.unidades.length > 0).map(f => ({
    titulo: f.titulo,
    faturamento: faturamentoDoFocal(f),   // quanto o focal trouxe de faturamento (Fechamento-RECEITA)
    // pagadoras (pagador = a própria empresa): uma tabela por empresa. O GERAL do SAC
    // (unidades + pagadoras) é montado no Excel a partir dos totais das duas partes.
    premium: (() => {
      const g = geralPremiumDoFocal(f);
      if(!g) return null;
      return {clientes: g.clientes.map(c => ({sigla:c.sigla, pagador:c.pagador, periodo:c.periodo,
        grupo: (f.unidades.find(x => x.sigla === c.sigla) || {}).grupo || "",
        frete: combinaUnidadeReceita(recPag[c.sigla]).frete, linhas:c.linhas.map(campoPremium)}))};
    })(),
    linhas: unidadesAgrupadasDoFocal(f, unidadesMap).map(l => {
      if(l.semDados) return {sigla:l.sigla, semDados:true};
      const grupoNome = (f.unidades.find(x => x.grupo === l.sigla) || {}).grupoNome;
      const unidade = unidadesMap[l.sigla] || {};
      return {
        sigla:l.sigla, combina:l.combinaSiglas || null,
        destino: l.destino || grupoNome || unidade.destino || "",
        exped:l.exped, entregue:l.entregue, noPrazoEnt:l.noPrazoEnt,
        atrasCli:l.atrasCli, atrasTrans:l.atrasTrans,
        frete: freteUn(l.combinaSiglas || [l.sigla])   // quanto a unidade faturou
      };
    })
  }));

  return {
    supervisora: SUPERVISORA_SAC, fontes, meta: META_PERFORMANCE,
    faturamentoTotal: faturamentoTotalGeral(),
    receita: montarPayloadReceita(),   // vira as abas DASHBOARD RECEITA + RECEITA (só se houver dados)
    periodo: periodoPorExtenso(data.periodo),
    unidades: data.unidades.map(u => ({sigla:u.sigla, destino:u.destino, exped:u.exped, entregue:u.entregue,
      noPrazoEnt:u.noPrazoEnt, atrasCli:u.atrasCli, atrasTrans:u.atrasTrans})),
    focais
  };
}

// Botões "Exportar Excel" da aba Performance Geral (tabela principal,
// todos os Focais numa planilha só, e detalhe de um Focal).
function attachExportPerfGeralEvents(data){
  const periodo = data.periodo || "";

  const btnGeral = document.getElementById("perfGeralExportBtn");
  if(btnGeral) btnGeral.addEventListener("click", ()=>{
    const painel = btnGeral.closest(".panel");
    exportarTabelasExcel([{
      nome: "Performance Geral",
      titulo: "Performance Geral por Unidade" + (periodo ? " — " + periodo : ""),
      subtitulo: "TEC E ARM MIGUEL BARTOLOMEU (C.) — CNPJ 17.359.233/0001-88",
      tabela: document.getElementById("perfGeralTabela"),
      rodape: painel.querySelector(".footer-note").textContent.trim()
    }], `Performance_Geral_${dataParaArquivo()}.xlsx`);
  });

  const btnFocais = document.getElementById("perfGeralExportFocaisBtn");
  if(btnFocais) btnFocais.addEventListener("click", async ()=>{
    const sheets = [];
    const temporarios = [];
    document.querySelectorAll("[data-export-focal]").forEach(painel => {
      const focal = FOCAIS.find(f => f.id === painel.dataset.exportFocal);
      const tabela = painel.querySelector("table");
      // ignora Focais sem nenhuma unidade com dados (só linhas "sem dados")
      if(!focal || !tabela || !tabela.querySelector("tbody tr:not(.placeholder-row)")) return;
      const nota = painel.querySelector(".footer-note");
      sheets.push({
        nome: focal.titulo.split("—")[0].trim(),
        titulo: focal.titulo + (periodo ? " — " + periodo : ""),
        subtitulo: "TEC E ARM MIGUEL BARTOLOMEU (C.) — CNPJ 17.359.233/0001-88",
        tabela,
        rodape: nota ? nota.textContent.trim() : ""
      });
    });
    // clientes premium (individuais + Geral do SAC): a exportação lê a tabela pintada na tela,
    // então montamos as tabelas fora da área visível só durante a exportação.
    FOCAIS.forEach(focal => {
      if(!geralPremiumDoFocal(focal)) return;
      const nomeCurto = focal.titulo.split("—")[0].trim();
      const tmp = document.createElement("div");
      tmp.style.cssText = "position:absolute; left:-99999px; top:0; width:1400px;";
      tmp.innerHTML = clientesPremiumHTML(focal);
      document.body.appendChild(tmp);
      temporarios.push(tmp);
      tmp.querySelectorAll(".premium-panel").forEach(pn => {
        const nota = pn.querySelector(".footer-note");
        sheets.push({
          nome: `${nomeCurto} ${pn.dataset.premiumSigla === "GERAL" ? "Geral" : pn.dataset.premiumSigla}`,
          titulo: pn.querySelector(".panel-header span").textContent.trim() + (periodo ? " — " + periodo : ""),
          subtitulo: "TEC E ARM MIGUEL BARTOLOMEU (C.) — CNPJ 17.359.233/0001-88",
          tabela: pn.querySelector("table"),
          rodape: nota ? nota.textContent.trim() : ""
        });
      });
    });
    try{
      await exportarTabelasExcel(sheets, `Performance_Geral_Focais_${dataParaArquivo()}.xlsx`);
    } finally {
      temporarios.forEach(t => t.remove());
    }
  });

  const btnFech = document.getElementById("perfGeralFechamentoBtn");
  if(btnFech) btnFech.addEventListener("click", ()=>{
    const payload = montarPayloadFechamento(data);
    exportarFechamento(payload, `Fechamento_SAC_${payload.periodo.replace(/\//g,"-")}_${dataParaArquivo()}.xlsx`);
  });

  const btnFocal = document.getElementById("focalExportBtn");
  if(btnFocal) btnFocal.addEventListener("click", ()=>{
    const focal = FOCAIS.find(f => f.id === perfGeralFocalAtivo);
    const nomeCurto = focal ? focal.titulo.split("—")[0].trim() : "Focal";
    const sub = "TEC E ARM MIGUEL BARTOLOMEU (C.) — CNPJ 17.359.233/0001-88";
    const sheets = [];
    const un = document.getElementById("focalDetalheTabela");
    if(un) sheets.push({nome:`${nomeCurto} Unidades`, titulo:`${focal.titulo} — SLA e Performance por Unidade` + (periodo ? " — " + periodo : ""),
      subtitulo:sub, tabela:un, rodape:"Unidades (Do Valle paga)."});
    document.querySelectorAll("#pgFocalContent .premium-panel").forEach(pn => {
      const nota = pn.querySelector(".footer-note");
      sheets.push({nome:`${nomeCurto} ${pn.dataset.premiumSigla}`, titulo:pn.querySelector(".panel-header span").textContent.trim() + (periodo ? " — " + periodo : ""),
        subtitulo:sub, tabela:pn.querySelector("table"), rodape:nota ? nota.textContent.trim() : ""});
    });
    const ger = document.getElementById("focalGeralTabela");
    const gerNota = document.querySelector("#focalGeralPanel .footer-note");
    if(ger) sheets.push({nome:`${nomeCurto} Geral`, titulo:`Geral ${nomeCurto} — unidades + pagadora` + (periodo ? " — " + periodo : ""),
      subtitulo:sub, tabela:ger, rodape:gerNota ? gerNota.textContent.trim() : ""});
    exportarTabelasExcel(sheets, `Performance_${nomeCurto.replace(/\s+/g,"_")}_${dataParaArquivo()}.xlsx`);
  });
}

window.perfGeralIrPara = function(focalId){
  perfGeralFocalAtivo = FOCAIS.some(f => f.id === focalId) ? focalId : "geral";
  switchTab("performance-geral");
  perfGeralSubTab = "focal";
  renderPerformanceGeralDashboard();
  const nav = document.getElementById("pgSubtabsNav");
  if(nav) nav.querySelectorAll("[data-pgsub]").forEach(b=> b.classList.toggle("active", b.dataset.pgsub==="focal"));
  const dv = document.getElementById("pgView-dashboard"), uv = document.getElementById("pgView-unidade"), fv = document.getElementById("pgView-focal");
  if(dv) dv.classList.remove("active");
  if(uv) uv.classList.remove("active");
  if(fv) fv.classList.add("active");
  if(fv && typeof fv.scrollIntoView === "function") fv.scrollIntoView({behavior:"smooth", block:"start"});
};

/* ================= FECHAMENTO-RECEITA (faturamento por Unidade / Focal) =================
   Aba própria (não fica dentro de Performance Geral), com importação PRÓPRIA. Para
   cada unidade existem DOIS locais de importação — exatamente como na Performance —
   porque são dois sistemas diferentes: VAL (Rede Do Valle) e RVA (Real Vale). Importa-se
   só a última página (seção RESUMO) do relatório do SSW (CTRCs Expedidos e Recebidos),
   lendo a linha ***TOTAL GERAL, de onde saem QCTRC, QTVOL, FRETE e VLR MERC de uma vez.
   Como esse RESUMO NÃO separa por unidade dentro do arquivo (ele soma tudo que estiver
   no arquivo), cada arquivo precisa vir do SSW já filtrado para UMA ÚNICA unidade — por
   isso a importação é feita unidade por unidade, agrupada por Focal, exatamente como a
   lista de Focais cadastrada em "Confirmação de Filiais". */

// Lê a seção RESUMO (última página) do relatório do SSW e devolve os totais da linha
// "***TOTAL GERAL", pelos NOMES das colunas do cabeçalho (não pela posição fixa).
function parseSswResumoReceita(text){
  text = String(text || "").replace(/\r\n/g, "\n");

  let periodo = "";
  const pMatch = text.match(/PERIODO DE EMISSAO\.?:\s*([\d/]+\s*A\s*[\d/]+)/i);
  if(pMatch) periodo = pMatch[1].replace(/\s+/g, " ").trim();

  const resumoIdx = text.search(/R\s*E\s*S\s*U\s*M\s*O/i);
  if(resumoIdx === -1) return {encontrouResumo:false, encontrouTotal:false, periodo};

  const linhas = text.slice(resumoIdx).split("\n");
  const sepIdxs = [];
  linhas.forEach((l, i) => { if(/^-{5,}\+/.test(l)) sepIdxs.push(i); });
  if(sepIdxs.length < 2) return {encontrouResumo:true, encontrouTotal:false, periodo};

  // limites das colunas, a partir da linha de separação "---+---+..."
  const sepLine = linhas[sepIdxs[0]];
  const bounds = [];
  for(let i = 0; i < sepLine.length; i++) if(sepLine[i] === "+") bounds.push(i);

  function slice(line, idx){
    const start = idx === 0 ? 0 : bounds[idx-1] + 1;
    if(start >= line.length) return "";
    const end = idx < bounds.length ? bounds[idx] : line.length;
    return (line.slice(start, end) || "").trim();
  }

  const headerLine = linhas.slice(sepIdxs[0] + 1, sepIdxs[1]).find(l => l.trim()) || "";
  const colNomes = [];
  for(let i = 0; i <= bounds.length; i++) colNomes.push(slice(headerLine, i).toUpperCase());

  function idxColuna(...nomes){
    for(const alvo of nomes){
      const i = colNomes.findIndex(c => c === alvo);
      if(i !== -1) return i;
    }
    return -1;
  }
  const iQctrc = idxColuna("QCTRC");
  const iQtvol = idxColuna("QTVOL");
  const iFrete = idxColuna("FRETE");
  const iVlrMerc = idxColuna("VLR MERC", "VLRMERC");

  const totalLine = linhas.slice(sepIdxs[1] + 1).find(l => /\*{0,3}\s*TOTAL\s+GERAL/i.test(l));
  if(!totalLine) return {encontrouResumo:true, encontrouTotal:false, periodo};

  const out = {encontrouResumo:true, encontrouTotal:true, periodo};
  if(iQctrc !== -1) out.qctrc = num(slice(totalLine, iQctrc));
  if(iQtvol !== -1) out.qtvol = num(slice(totalLine, iQtvol));
  if(iFrete !== -1) out.frete = num(slice(totalLine, iFrete));
  if(iVlrMerc !== -1) out.vlrMerc = num(slice(totalLine, iVlrMerc));
  return out;
}

// ---- IMPORTAÇÃO GERAL (arquivo .sswweb inteiro, com TODAS as unidades/praças juntas) ----
// Ao contrário do parseSswResumoReceita (que só lê a última página, já somada, de um
// arquivo filtrado numa unidade), este lê CTRC por CTRC do relatório "CTRCs Expedidos
// e Recebidos" completo e classifica cada linha por DIREÇÃO, igual à regra usada nas
// Ocorrências e na Performance Geral:
//   • pagador é uma empresa do Grupo (está em PAGADORES_PRIORITARIOS/EMPRESAS_PAGADORA)
//     -> GRUPO → DO VALLE: mercadoria vem da transportadora pro Do Valle entregar,
//        a empresa é quem paga. Vai para "porPagador", por SIGLA DA EMPRESA.
//   • qualquer outro pagador (não é empresa do Grupo)
//     -> DO VALLE → GRUPO / cliente comum: o Do Valle é quem fatura. Vai para
//        "porSigla", pela PRAÇA do CTRC (3 primeiras siglas; praças de 4 letras,
//        ex. GNAP/GNAI, viram GNA).
// As duas direções são mantidas em listas SEPARADAS (nunca se misturam) porque uma
// mesma sigla pode existir nas duas pontas (ex.: AL2 como praça de entrega x AL2 como
// empresa pagadora) e representam faturamentos diferentes.
// Cada CTRC entra em FRETE (nosso faturamento) e VLR MERC (valor da mercadoria).
function parseSswFaturamentoDetalhado(text){
  text = String(text || "").replace(/\r\n/g, "\n");

  let periodo = "";
  const pMatch = text.match(/PERIODO DE EMISSAO\.?:\s*([\d/]+\s*A\s*[\d/]+)/i);
  if(pMatch) periodo = pMatch[1].replace(/\s+/g, " ").trim();

  const linhas = text.split("\n");
  const headerIdx = linhas.findIndex(l => /^TP\s+CTRC/.test(l));
  if(headerIdx === -1) return {encontrou:false, periodo, porSigla:{}, porPagador:{}, porPraca:{}, totalLinhas:0, semClassificar:{}};

  let sepLine = "";
  if(linhas[headerIdx - 1] && /^-{2,}\+/.test(linhas[headerIdx - 1])) sepLine = linhas[headerIdx - 1];
  else if(linhas[headerIdx + 1] && /^-{2,}\+/.test(linhas[headerIdx + 1])) sepLine = linhas[headerIdx + 1];

  let bounds = [];
  for(let i = 0; i < sepLine.length; i++) if(sepLine[i] === "+") bounds.push(i);
  // layout padrao conhecido do relatorio "CTRCs Expedidos e Recebidos", caso a linha
  // de separacao nao seja encontrada
  if(bounds.length < 20) bounds = [2,14,26,35,50,65,70,78,81,96,106,116,131,142,153,166,177,188,199,212,226,229,235,241];
  const allB = [0, ...bounds, 100000];

  function slice(line, idx){
    const s = allB[idx], e = allB[idx + 1];
    if(s >= line.length) return "";
    return (line.slice(s, e) || "").trim();
  }

  const colNomes = [];
  for(let i = 0; i <= bounds.length; i++) colNomes.push(slice(linhas[headerIdx], i).toUpperCase());
  function idxColuna(...nomes){
    for(const alvo of nomes){ const i = colNomes.findIndex(c => c === alvo); if(i !== -1) return i; }
    return -1;
  }
  const iInclusao = idxColuna("INCLUSAO");
  const iPrac = idxColuna("PRAC");
  const iCidade = idxColuna("CIDADE");
  const iPagador = idxColuna("PAGADOR");
  const iFrete = idxColuna("FRETE");
  const iVlrMerc = idxColuna("VLR MERC", "VLRMERC");
  if(iPrac === -1 || iFrete === -1) return {encontrou:false, periodo, porSigla:{}, porPagador:{}, porPraca:{}, totalLinhas:0, semClassificar:{}};

  const porSigla = {};    // DO VALLE → GRUPO (cliente comum): pagador não é do Grupo, agrupado pela PRAÇA
  const porPagador = {};  // GRUPO → DO VALLE: pagador é empresa do Grupo, agrupado pela SIGLA DA EMPRESA
  const porPraca = {};    // só a unidade de entrega/destino (praça, 3 siglas) — ignora o pagador
  const semClassificar = {};
  let totalLinhas = 0;

  for(let li = headerIdx + 1; li < linhas.length; li++){
    const line = linhas[li];
    if(!line || line.length < 60) continue;
    const tp = slice(line, 0);
    if(!/^[A-Z]{2}$/.test(tp)) continue; // pula cabecalhos repetidos, separadores, linhas em branco etc.
    const inclusao = iInclusao !== -1 ? slice(line, iInclusao) : "";
    if(inclusao && !/^\d{2}\/\d{2}/.test(inclusao)) continue; // confirma que é linha de CTRC (não RESUMO/rodapé)

    const prac = slice(line, iPrac);
    if(!prac) continue;
    const praca3 = prac.slice(0, 3).toUpperCase();
    const cidade = iCidade !== -1 ? slice(line, iCidade) : "";
    const pagador = iPagador !== -1 ? slice(line, iPagador) : "";
    const frete = num(slice(line, iFrete));
    const vlrMerc = iVlrMerc !== -1 ? num(slice(line, iVlrMerc)) : 0;
    if(!frete && !vlrMerc) continue;

    // --- direção: pagador é empresa do Grupo (GRUPO → DO VALLE) ou não (DO VALLE → GRUPO) ---
    const siglaPag = siglaPagadorPrioritario(pagador);
    const sigla = siglaPag || praca3;
    if(siglaPag){
      if(!porPagador[siglaPag]) porPagador[siglaPag] = {sigla:siglaPag, frete:0, vlrMerc:0, qctrc:0};
      porPagador[siglaPag].frete += frete;
      porPagador[siglaPag].vlrMerc += vlrMerc;
      porPagador[siglaPag].qctrc += 1;
    } else {
      if(!porSigla[praca3]) porSigla[praca3] = {sigla:praca3, frete:0, vlrMerc:0, qctrc:0};
      porSigla[praca3].frete += frete;
      porSigla[praca3].vlrMerc += vlrMerc;
      porSigla[praca3].qctrc += 1;
    }

    // --- por Unidade de entrega: só a praça, pagador não entra ---
    if(!porPraca[praca3]) porPraca[praca3] = {sigla:praca3, cidade:"", frete:0, vlrMerc:0, qctrc:0};
    if(!porPraca[praca3].cidade && cidade) porPraca[praca3].cidade = cidade;
    porPraca[praca3].frete += frete;
    porPraca[praca3].vlrMerc += vlrMerc;
    porPraca[praca3].qctrc += 1;

    totalLinhas++;

    if(!focalPorSigla(sigla) && !FOCAIS_ESPECIAIS_POR_UNIDADE[sigla]){
      semClassificar[sigla] = (semClassificar[sigla] || 0) + 1;
    }
  }

  return {encontrou: totalLinhas > 0, periodo, porSigla, porPagador, porPraca, totalLinhas, semClassificar};
}

// ---- IMPORTAÇÃO GERAL — formato CSV (";") "CTRCs Expedidos e Recebidos" ----
// Mesmo relatório do SSW, exportado em CSV (linha 0 = título/período; linha 1 = cabeçalho
// com "Cliente Pagador", "CNPJ Pagador", "Unidade Receptora", "Valor do Frete"...).
// Devolve a MESMA estrutura de parseSswFaturamentoDetalhado (porSigla/porPagador/porPraca),
// então a tela e as exportações existentes continuam funcionando sem mudança.
// Carteira, nesta ordem (o CNPJ é a chave):
//   1) CNPJ do pagador cadastrado (Cadastro de CNPJ) -> carteira do Focal dessa empresa;
//   2) senão, NOME do pagador bate com empresa/Focal (lista de pagadores prioritários);
//   3) senão, sem vínculo -> UNIDADE RECEPTORA (a unidade que entrega).
// Entram FRETE (nosso faturamento) e VLR MERC (Valor da Mercadoria) + qtd. de CTRCs.
// CTRCs cancelados (com Data do Cancelamento) ficam de fora.
function ehCsvFaturamento(text){
  const cab = String(text || "").slice(0, 4000);
  return cab.indexOf(";") !== -1 && /Cliente Pagador/i.test(cab) && /Valor do Frete/i.test(cab);
}

function parseSswFaturamentoCsv(text){
  text = String(text || "").replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
  const linhas = text.split("\n");
  const vazio = {encontrou:false, periodo:"", porSigla:{}, porPagador:{}, porPraca:{}, porExpedidora:{}, totalLinhas:0, semClassificar:{}, canceladas:0, origemClass:{cnpj:0, nome:0, unidade:0}, totalFrete:0, totalVlrMerc:0};

  let periodo = "";
  const pMatch = text.match(/PERIODO DE EMISSAO\.?:\s*([\d/]+\s*A\s*[\d/]+)/i);
  if(pMatch) periodo = pMatch[1].replace(/\s+/g, " ").trim();

  const norm = s => String(s || "").trim().toUpperCase();
  const headerIdx = linhas.findIndex(l => /Cliente Pagador/i.test(l) && /Valor do Frete/i.test(l));
  if(headerIdx === -1) return {...vazio, periodo};
  const cab = linhas[headerIdx].split(";").map(norm);
  const col = (...nomes) => { for(const n of nomes){ const i = cab.indexOf(norm(n)); if(i !== -1) return i; } return -1; };
  const iCnpjPag = col("CNPJ Pagador"), iPagador = col("Cliente Pagador");
  const iRecept = col("Unidade Receptora"), iPraca = col("Praca Expedidora", "Praça Expedidora");
  const iFrete = col("Valor do Frete"), iMerc = col("Valor da Mercadoria");
  const iCidade = col("Cidade de Entrega"), iCancel = col("Data do Cancelamento");
  if(iFrete === -1 || iRecept === -1) return {...vazio, periodo};

  const out = {...vazio, periodo, porSigla:{}, porPagador:{}, porPraca:{}, porExpedidora:{}, semClassificar:{}, origemClass:{cnpj:0, nome:0, unidade:0}};
  const soma = (mapa, chave, extra, frete, merc) => {
    if(!mapa[chave]) mapa[chave] = {sigla:chave, ...extra, frete:0, vlrMerc:0, qctrc:0};
    mapa[chave].frete += frete; mapa[chave].vlrMerc += merc; mapa[chave].qctrc += 1;
    return mapa[chave];
  };

  for(let li = headerIdx + 1; li < linhas.length; li++){
    const c = linhas[li].split(";");
    if(c.length < cab.length - 2) continue;                 // rodapé, linha em branco
    if(String(c[0]).trim() !== "2") continue;               // só linhas de CTRC
    if(iCancel !== -1 && String(c[iCancel] || "").trim()){ out.canceladas++; continue; }

    const frete = num(c[iFrete]);
    const merc = iMerc !== -1 ? num(c[iMerc]) : 0;
    if(!frete && !merc) continue;

    const recept = norm(c[iRecept]).slice(0, 3) || (iPraca !== -1 ? norm(c[iPraca]).slice(0, 3) : "");
    if(!recept) continue;
    const cidade = iCidade !== -1 ? String(c[iCidade] || "").trim() : "";
    const cnpjPag = iCnpjPag !== -1 ? normalizarCnpj(c[iCnpjPag]) : "";
    const nomePag = iPagador !== -1 ? String(c[iPagador] || "").trim() : "";

    // 1) CNPJ do pagador  2) nome do pagador  3) unidade receptora
    let siglaPag = null, origem = "unidade";
    const cad = cnpjPag ? buscarCnpjCadastro(cnpjPag) : null;
    if(cad && cad.sigla){ siglaPag = cad.sigla; origem = "cnpj"; }
    else {
      const sn = siglaPagadorPrioritario(nomePag);
      if(sn){ siglaPag = sn; origem = "nome"; }
    }
    out.origemClass[origem]++;

    let sigla;
    if(siglaPag){ soma(out.porPagador, siglaPag, {}, frete, merc); sigla = siglaPag; }
    else { soma(out.porSigla, recept, {}, frete, merc); sigla = recept; }

    const pr = soma(out.porPraca, recept, {cidade:""}, frete, merc);
    if(!pr.cidade && cidade) pr.cidade = cidade;

    // Praça EXPEDIDORA (quem despachou o CTRC): só as 3 primeiras letras — praças de 4
    // letras (ex.: GYNP, ANPP) viram a unidade (GYN, ANP). O pagador não entra nessa conta.
    const exped = iPraca !== -1 ? norm(c[iPraca]).slice(0, 3) : "";
    if(exped) soma(out.porExpedidora, exped, {}, frete, merc);

    out.totalLinhas++; out.totalFrete += frete; out.totalVlrMerc += merc;
    if(!focalPorSigla(sigla) && !FOCAIS_ESPECIAIS_POR_UNIDADE[sigla]){
      out.semClassificar[sigla] = (out.semClassificar[sigla] || 0) + 1;
    }
  }
  out.encontrou = out.totalLinhas > 0;
  return out;
}

function loadReceitaData(){
  const raw = load(KEYS.receitaFechamento);
  return (raw && !Array.isArray(raw) && raw.unidades) ? raw : {unidades:{}};
}

// ---- FATURAMENTO "EMPRESA COMO PAGADORA" (GRUPO → DO VALLE) ----
// Guardado À PARTE de loadReceitaData()/salvarReceitaUnidade() (que é a direção
// DO VALLE → GRUPO: unidade normal, Do Valle fatura). Aqui é o contrário: a empresa
// do Grupo é quem paga o frete, mercadoria vem da transportadora pro Do Valle
// entregar — exatamente a mesma distinção já usada em "Performance Geral" (tabela
// normal x "cliente premium"). Nunca escrever nesta store a partir de dados da
// direção Do Valle → Grupo, e vice-versa: são faturamentos diferentes, mesmo
// quando a sigla é igual (ex.: AL2 como praça x AL2 como empresa pagadora).
// Sigla "canônica" de uma empresa pagadora: a que está cadastrada na Confirmação de Filiais.
// Ex.: o parser grava a EP Distribuidora como EPD, mas se no cadastro ela está como EP,
// os dados precisam ficar em EP (senão a tabela mostra "Sem dados importados").
function siglaPagadoraCanonica(sigla){
  const cadastradas = new Set();
  if(typeof FOCAIS !== "undefined") FOCAIS.forEach(f => f.unidades.forEach(x => cadastradas.add(x.sigla)));
  if(cadastradas.has(sigla)) return sigla;
  // Qualquer sigla que represente a MESMA empresa (mesmo nome em EMPRESAS_PAGADORA) e esteja
  // cadastrada num Focal vira a sigla cadastrada — vale para EP/EPD e para futuros casos iguais.
  const nome = EMPRESAS_PAGADORA[sigla];
  const candidatas = [...(ALIAS_PAGADORA[sigla] || [])];
  if(nome) Object.keys(EMPRESAS_PAGADORA).forEach(k => { if(EMPRESAS_PAGADORA[k] === nome) candidatas.push(k); });
  for(const c of candidatas) if(cadastradas.has(c)) return c;
  return sigla;
}
function loadReceitaPagadoraData(){
  const raw = load(KEYS.receitaPagadora);
  if(!(raw && !Array.isArray(raw) && raw.unidades)) return {unidades:{}};
  // Move dados guardados sob um alias (EPD <-> EP) para a sigla cadastrada.
  const out = {...raw, unidades:{}};
  Object.keys(raw.unidades).forEach(k => {
    const c = siglaPagadoraCanonica(k);
    const u = {...raw.unidades[k], sigla:c};
    if(!out.unidades[c]){ out.unidades[c] = u; return; }
    const dest = out.unidades[c];
    ["val","rva"].forEach(o => {
      if(!u[o]) return;
      if(!dest[o]) dest[o] = u[o];
      else dest[o] = {...dest[o], qctrc:(Number(dest[o].qctrc)||0)+(Number(u[o].qctrc)||0), frete:(Number(dest[o].frete)||0)+(Number(u[o].frete)||0), vlrMerc:(Number(dest[o].vlrMerc)||0)+(Number(u[o].vlrMerc)||0)};
    });
  });
  return out;
}
function salvarReceitaPagadoraUnidade(sigla, origem, campos){
  sigla = siglaPagadoraCanonica(sigla);
  const data = loadReceitaPagadoraData();
  const atual = data.unidades[sigla] || {sigla};
  atual[origem] = {...(atual[origem]||{}), ...campos};
  data.unidades[sigla] = atual;
  save(KEYS.receitaPagadora, data);
}

// ---- FATURAMENTO POR UNIDADE DE ENTREGA (ignora completamente o pagador) ----
// Guardado à parte da Fechamento-RECEITA (que é por Focal/pagador). Aqui cada
// "unidade" é a praça física do CTRC (3 siglas) — não importa quem pagou.
function loadUnidadeDestinoData(){
  const raw = load(KEYS.unidadeDestino);
  return (raw && !Array.isArray(raw) && raw.unidades) ? raw : {unidades:{}};
}

function salvarUnidadeDestino(praca3, origem, campos){
  const data = loadUnidadeDestinoData();
  const atual = data.unidades[praca3] || {sigla:praca3, cidade:""};
  if(campos.cidade && !atual.cidade) atual.cidade = campos.cidade;
  atual[origem] = {...(atual[origem] || {}), qctrc:campos.qctrc, frete:campos.frete, vlrMerc:campos.vlrMerc, periodo:campos.periodo, atualizadoEm:campos.atualizadoEm};
  data.unidades[praca3] = atual;
  save(KEYS.unidadeDestino, data);
}

// ---- FATURAMENTO POR UNIDADE EXPEDIDORA (coluna "Praca Expedidora" do CSV) ----
// O que cada unidade DESPACHOU (origem do CTRC). É o espelho da unidade receptora
// (a que entrega, guardada em loadUnidadeDestinoData): o mesmo CTRC conta uma vez em
// cada ponta. Mesma estrutura (val/rva por sigla de 3 letras).
function loadUnidadeExpedidoraData(){
  const raw = load(KEYS.unidadeExpedidora);
  return (raw && !Array.isArray(raw) && raw.unidades) ? raw : {unidades:{}};
}
function salvarUnidadeExpedidora(sigla3, origem, campos){
  const data = loadUnidadeExpedidoraData();
  const atual = data.unidades[sigla3] || {sigla:sigla3};
  atual[origem] = {...(atual[origem] || {}), qctrc:campos.qctrc, frete:campos.frete, vlrMerc:campos.vlrMerc, periodo:campos.periodo, atualizadoEm:campos.atualizadoEm};
  data.unidades[sigla3] = atual;
  save(KEYS.unidadeExpedidora, data);
}

// Upsert por sigla + origem ("val"/"rva"): cada origem guarda seu próprio QCTRC/QTVOL/
// FRETE/VLR MERC, sem apagar o que já tinha sido importado da outra origem pra mesma unidade.
function salvarReceitaUnidade(sigla, origem, campos){
  const data = loadReceitaData();
  const atual = data.unidades[sigla] || {sigla};
  atual[origem] = {...(atual[origem]||{}), ...campos};
  data.unidades[sigla] = atual;
  save(KEYS.receitaFechamento, data);
}

function fmtMoeda(v){
  return "R$ " + money(v);
}

// Soma VAL + RVA de uma unidade num único total {qctrc,qtvol,frete,vlrMerc}.
function combinaUnidadeReceita(u){
  const t = {qctrc:0, qtvol:0, frete:0, vlrMerc:0};
  if(!u) return t;
  ["val","rva"].forEach(origem => {
    const o = u[origem];
    if(!o) return;
    t.qctrc += Number(o.qctrc)||0; t.qtvol += Number(o.qtvol)||0;
    t.frete += Number(o.frete)||0; t.vlrMerc += Number(o.vlrMerc)||0;
  });
  return t;
}

function origensUnidadeReceita(u){
  if(!u) return [];
  return ["val","rva"].filter(o => u[o]).map(o => o.toUpperCase());
}

// Junta os Focais cadastrados (Confirmação de Filiais) com as unidades "especiais"
// que não pertencem a nenhum SAC (GNA/ROT), pra nenhuma unidade do código ficar de fora.
function gruposReceita(unidadesData){
  const grupos = FOCAIS.filter(f => f.unidades.length > 0)
    .map(f => ({id:f.id, titulo:f.titulo, unidades:f.unidades.map(u => u.sigla)}));
  const jaClassificadas = todasSiglasFocais();
  const extras = Object.keys(FOCAIS_ESPECIAIS_POR_UNIDADE).filter(s => !jaClassificadas.has(s));
  if(extras.length) grupos.push({id:"outras", titulo:"Outras unidades (sem SAC)", unidades:extras});

  // Qualquer sigla que apareceu nos dados importados (ex.: Importação Geral por praça)
  // mas não está em nenhum Focal cadastrado nem nas unidades especiais: entra aqui,
  // pra nenhum valor de faturamento ficar escondido/perdido — precisa ser revisada
  // em "Confirmação de Filiais" (cadastrar a unidade no Focal certo).
  if(unidadesData){
    const conhecidas = new Set([...jaClassificadas, ...extras]);
    const semFocal = Object.keys(unidadesData).filter(s => !conhecidas.has(s));
    if(semFocal.length) grupos.push({id:"sem-focal", titulo:"Sem Focal definido (revisar em Confirmação de Filiais)", unidades:semFocal});
  }
  return grupos;
}

function totaisReceitaDoGrupo(grupo, unidadesData){
  const t = {qctrc:0, qtvol:0, frete:0, vlrMerc:0};
  grupo.unidades.forEach(sigla => {
    const c = combinaUnidadeReceita(unidadesData[sigla]);
    t.qctrc += c.qctrc; t.qtvol += c.qtvol; t.frete += c.frete; t.vlrMerc += c.vlrMerc;
  });
  return t;
}

// Totais da direção GRUPO → DO VALLE (empresa pagadora) de um Focal — mesma ideia de
// totaisReceitaDoGrupo, mas lendo a store separada (loadReceitaPagadoraData) e só as
// unidades do Focal que são empresas do Grupo (EMPRESAS_PAGADORA).
function totaisReceitaPagadoraDoGrupo(grupoId, dadosPagadora){
  const t = {qctrc:0, qtvol:0, frete:0, vlrMerc:0};
  const focalReal = FOCAIS.find(f => f.id === grupoId);
  if(!focalReal) return t;
  unidadesPagadoraDoFocal(focalReal).forEach(u => {
    const c = combinaUnidadeReceita(dadosPagadora[u.sigla]);
    t.qctrc += c.qctrc; t.qtvol += c.qtvol; t.frete += c.frete; t.vlrMerc += c.vlrMerc;
  });
  return t;
}

// Total geral combinando as duas direções (Do Valle → Grupo + Grupo → Do Valle) de
// todos os Focais — usado nos KPIs do Dashboard Principal, pra não subestimar o
// faturamento real só porque uma parte está numa store separada.
function totalGeralReceitaCombinado(grupos, unidadesData, dadosPagadora){
  const t = {qctrc:0, qtvol:0, frete:0, vlrMerc:0};
  grupos.forEach(g => {
    const a = totaisReceitaDoGrupo(g, unidadesData);
    const b = totaisReceitaPagadoraDoGrupo(g.id, dadosPagadora);
    t.qctrc += a.qctrc + b.qctrc; t.qtvol += a.qtvol + b.qtvol;
    t.frete += a.frete + b.frete; t.vlrMerc += a.vlrMerc + b.vlrMerc;
  });
  return t;
}

let frSubTab = "dashboard"; // "dashboard" | "focal" | "unidade" | "expedidora" | "geral" — sub-abas da Fechamento-RECEITA
let frUnidModo = "pagador"; // "pagador" | "destino" — dentro da sub-aba "Por Unidade"
let frUnidadeSelecionada = null;

const FR_SUBTABS = [
  {id:"dashboard", label:"Dashboard Principal"},
  {id:"focal", label:"Por Focal"},
  {id:"unidade", label:"Por Unidade"},
  {id:"expedidora", label:"Por Unidade Expedidora"},
  {id:"geral", label:"Geral (Expedida + Recebida)"}
];

function fechamentoReceitaHTML(){
  return `
    <h2 class="section-title">Fechamento-RECEITA — Faturamento por Unidade e por Focal</h2>
    <p class="section-desc">Aba com importação <strong>própria</strong>, independente das demais. Existem <strong>dois campos por unidade</strong> porque são dois sistemas diferentes: <strong>VAL</strong> (Rede Do Valle) e <strong>RVA</strong> (Real Vale) — se importar os dois, o painel soma automaticamente. Use as sub-abas abaixo: importe os arquivos na <strong>Dashboard Principal</strong>, veja o detalhe agrupado em <strong>Por Focal</strong> e o detalhe unidade a unidade em <strong>Por Unidade</strong>.</p>

    <div class="pg-subtabs" id="frSubtabsNav">
      ${FR_SUBTABS.map(t => `<button type="button" class="pg-subtab-btn ${frSubTab===t.id?'active':''}" data-frsub="${t.id}">${t.label}</button>`).join("")}
    </div>

    <div class="pg-subview ${frSubTab==='dashboard'?'active':''}" id="frView-dashboard">
      <div id="frDashWrap"></div>
    </div>

    <div class="pg-subview ${frSubTab==='focal'?'active':''}" id="frView-focal">
      <div id="frFocalWrap"></div>
    </div>

    <div class="pg-subview ${frSubTab==='unidade'?'active':''}" id="frView-unidade">
      <div id="frUnidadeWrap"></div>
    </div>

    <div class="pg-subview ${frSubTab==='expedidora'?'active':''}" id="frView-expedidora">
      <div id="frExpedidoraWrap"></div>
    </div>

    <div class="pg-subview ${frSubTab==='geral'?'active':''}" id="frView-geral">
      <div id="frGeralWrap"></div>
    </div>
  `;
}

/* ---------- Sub-aba: Dashboard Principal ---------- */
// ---- Helpers de formatação/dados usados só no Dashboard Principal (tema escuro) ----

// "5692452.3" -> "R$ 5,69 M" / "350200" -> "R$ 350,2 K" — pra caber no topo das barras.
function frFmtCompacto(v){
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if(abs >= 1000000) return "R$ " + (n/1000000).toFixed(2).replace(".", ",") + " M";
  if(abs >= 1000) return "R$ " + (n/1000).toFixed(1).replace(".", ",") + " K";
  return fmtMoeda(n);
}

// Soma FRETE/QCTRC/VLR MERC separado por origem (VAL x RVA), pro donut.
function frTotaisPorOrigem(data){
  const t = {val:{frete:0, qctrc:0, vlrMerc:0}, rva:{frete:0, qctrc:0, vlrMerc:0}};
  Object.values(data.unidades).forEach(u => {
    ["val","rva"].forEach(o => {
      if(!u[o]) return;
      t[o].frete += Number(u[o].frete) || 0;
      t[o].qctrc += Number(u[o].qctrc) || 0;
      t[o].vlrMerc += Number(u[o].vlrMerc) || 0;
    });
  });
  return t;
}

// Período por extenso a partir de todos os "periodo" já salvos nas unidades.
function frPeriodoTexto(data){
  const periodos = [];
  Object.values(data.unidades).forEach(u => {
    if(u.val && u.val.periodo) periodos.push(u.val.periodo);
    if(u.rva && u.rva.periodo) periodos.push(u.rva.periodo);
  });
  if(!periodos.length) return "";
  return periodoPorExtenso([...new Set(periodos)].join(" "));
}

// Gráfico de barras verticais genérico (tema escuro). items: [{label, value, id}].
// Quando o item tem "id", a barra fica clicável (cursor + data-drill-id) — quem
// desenha decide o que abrir no clique (ver attachFrDashboardDrillEvents).
function frVBarChartHTML(items, opts){
  opts = opts || {};
  const cor = opts.cor || "#2fd9c4";
  if(!items.length) return `<div class="fr-empty-dark">${opts.vazio || "Sem dados ainda."}</div>`;
  const max = Math.max(...items.map(i => i.value), 1);
  return `
    <div class="fr-vbars">
      ${items.map(i => `
        <div class="fr-vbar-col${i.id != null ? ' fr-vbar-col-click' : ''}" ${i.id != null ? `data-drill-id="${escHtml(String(i.id))}" tabindex="0" role="button"` : ''} title="${i.id != null ? 'Clique para ver o detalhe' : ''}">
          <div class="fr-vbar-value">${frFmtCompacto(i.value)}</div>
          <div class="fr-vbar" style="--h:${Math.max(i.value / max * 100, 3)}%; background:${i.cor || cor};"></div>
          <div class="fr-vbar-label" title="${escHtml(i.label)}">${escHtml(i.label)}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function frBarChartFocalDarkHTML(grupos, data, dadosPagadora){
  const items = grupos
    .map(g => {
      const a = totaisReceitaDoGrupo(g, data.unidades);
      const b = totaisReceitaPagadoraDoGrupo(g.id, dadosPagadora);
      return {label:g.titulo.split("—")[0].trim(), value: a.frete + b.frete, id:g.id};
    })
    .filter(i => i.value > 0);
  return frVBarChartHTML(items, {cor:"#2fd9c4", vazio:"Sem dados de faturamento por Focal ainda."});
}

function frBarChartTopUnidadesHTML(){
  const lista = unidadesComDadosReceita().sort((a,b) => b.frete - a.frete).slice(0, 8);
  return frVBarChartHTML(lista.map(u => ({label:u.sigla, value:u.frete, id:u.sigla})), {cor:"#f0a34e", vazio:"Sem dados de faturamento por unidade ainda."});
}

// Rosca (CSS conic-gradient) comparando quanto do faturamento veio de VAL x RVA.
function frDonutOrigemHTML(data){
  const t = frTotaisPorOrigem(data);
  const total = t.val.frete + t.rva.frete;
  if(total <= 0) return `<div class="fr-empty-dark">Sem dados de faturamento importados ainda.</div>`;
  const corVal = "#2fd9c4", corRva = "#c99a2e";
  const pctVal = t.val.frete / total * 100;
  const pctRva = 100 - pctVal;
  return `
    <div class="fr-donut-wrap">
      <div class="fr-donut" style="background:conic-gradient(${corVal} 0% ${pctVal}%, ${corRva} ${pctVal}% 100%);">
        <div class="fr-donut-hole">
          <div class="fr-donut-total">${frFmtCompacto(total)}</div>
          <div class="fr-donut-total-label">Total</div>
        </div>
      </div>
      <div class="fr-donut-legend">
        <div class="fr-donut-legend-item"><span class="fr-donut-dot" style="background:${corVal};"></span>VAL — Rede Do Valle · ${fmtMoeda(t.val.frete)} (${pctVal.toFixed(1).replace(".",",")}%)</div>
        <div class="fr-donut-legend-item"><span class="fr-donut-dot" style="background:${corRva};"></span>RVA — Real Vale · ${fmtMoeda(t.rva.frete)} (${pctRva.toFixed(1).replace(".",",")}%)</div>
      </div>
    </div>
  `;
}

// Faixa de destaques (Focal com maior faturamento / Unidade com maior faturamento
// / quantas unidades já têm dado), no estilo "Melhor Vendedor" do print de referência.
function frDestaquesHTML(grupos, data, listaUnidades, dadosPagadora){
  const focaisComDados = grupos
    .map(g => {
      const a = totaisReceitaDoGrupo(g, data.unidades);
      const b = totaisReceitaPagadoraDoGrupo(g.id, dadosPagadora);
      return {titulo:g.titulo, t:{qctrc:a.qctrc+b.qctrc, qtvol:a.qtvol+b.qtvol, frete:a.frete+b.frete, vlrMerc:a.vlrMerc+b.vlrMerc}};
    })
    .filter(x => x.t.frete > 0)
    .sort((a,b) => b.t.frete - a.t.frete);
  const melhorFocal = focaisComDados[0];
  const melhorUnidade = [...listaUnidades].sort((a,b) => b.frete - a.frete)[0];
  if(!melhorFocal && !melhorUnidade) return "";

  const iconTrophy = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v3a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4v1a4 4 0 0 0 4 4M17 5h3v1a4 4 0 0 1-4 4"/></svg>';
  const iconBuilding = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1"/></svg>';
  const iconUnits = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5 12 3l9 4.5M3 7.5V16L12 21l9-5V7.5"/><path d="M12 12v9"/></svg>';

  return `
    <div class="fr-destaques">
      ${melhorFocal ? `
      <div class="fr-destaque-item">
        <div class="fr-destaque-icon">${iconTrophy}</div>
        <div>
          <div class="fr-destaque-label">Focal com maior faturamento</div>
          <div class="fr-destaque-value">${escHtml(melhorFocal.titulo.split("—")[0].trim())}</div>
          <div class="fr-destaque-sub">${fmtMoeda(melhorFocal.t.frete)}</div>
        </div>
      </div>` : ""}
      ${melhorUnidade ? `
      <div class="fr-destaque-item">
        <div class="fr-destaque-icon">${iconBuilding}</div>
        <div>
          <div class="fr-destaque-label">Unidade com maior faturamento</div>
          <div class="fr-destaque-value">${escHtml(melhorUnidade.sigla)}</div>
          <div class="fr-destaque-sub">${fmtMoeda(melhorUnidade.frete)}</div>
        </div>
      </div>` : ""}
      <div class="fr-destaque-item">
        <div class="fr-destaque-icon">${iconUnits}</div>
        <div>
          <div class="fr-destaque-label">Unidades com dados</div>
          <div class="fr-destaque-value">${listaUnidades.length}</div>
          <div class="fr-destaque-sub">com faturamento importado</div>
        </div>
      </div>
    </div>
  `;
}

function frDashboardPrincipalHTML(data, grupos, totalGeral, dadosPagadora){
  const listaUnidades = unidadesComDadosReceita();
  const periodoTxt = frPeriodoTexto(data);

  return `
    <div class="fr-dark">
      <div class="fr-dark-title">Dashboard de Faturamento</div>
      <p class="fr-dark-sub">Fechamento-RECEITA${periodoTxt ? " — período " + escHtml(periodoTxt) : ""}</p>

      <div class="fr-kpi-grid">
        <div class="fr-kpi-card fr-kpi-card-click" id="frKpiTotalBtn" tabindex="0" role="button" title="Clique para ver o detalhe por Sistema (VAL/RVA)">
          <div class="fr-kpi-label">Faturamento total (FRETE)</div>
          <div class="fr-kpi-value" data-kpi-raw="${totalGeral.frete}" data-kpi-fmt="moeda">${fmtMoeda(0)}</div>
          <div class="fr-kpi-hint">Soma VAL + RVA · Do Valle → Grupo + Grupo → Do Valle · clique para detalhar</div>
        </div>
        <div class="fr-kpi-card">
          <div class="fr-kpi-label">Valor de mercadoria</div>
          <div class="fr-kpi-value" data-kpi-raw="${totalGeral.vlrMerc}" data-kpi-fmt="moeda">${fmtMoeda(0)}</div>
          <div class="fr-kpi-hint">VLR MERC transportado</div>
        </div>
        <div class="fr-kpi-card">
          <div class="fr-kpi-label">CTRCs</div>
          <div class="fr-kpi-value" data-kpi-raw="${totalGeral.qctrc}" data-kpi-fmt="int">${fmtInt(0)}</div>
          <div class="fr-kpi-hint">Quantidade total de CTRCs</div>
        </div>
        <div class="fr-kpi-card">
          <div class="fr-kpi-label">Volumes</div>
          <div class="fr-kpi-value" data-kpi-raw="${totalGeral.qtvol}" data-kpi-fmt="int">${fmtInt(0)}</div>
          <div class="fr-kpi-hint">Quantidade total de volumes</div>
        </div>
      </div>

      ${frDestaquesHTML(grupos, data, listaUnidades, dadosPagadora)}

      <div class="fr-panels-grid fr-panels-3">
        <div class="fr-chart-panel">
          <div class="fr-chart-title">Faturamento por Focal <span class="fr-chart-hint">clique numa barra para detalhar</span></div>
          ${frBarChartFocalDarkHTML(grupos, data, dadosPagadora)}
        </div>
        <div class="fr-chart-panel">
          <div class="fr-chart-title">Faturamento por Origem</div>
          ${frDonutOrigemHTML(data)}
        </div>
        <div class="fr-chart-panel">
          <div class="fr-chart-title">Top unidades por Faturamento <span class="fr-chart-hint">clique numa barra para detalhar</span></div>
          ${frBarChartTopUnidadesHTML()}
        </div>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; align-items:center; gap:14px; margin:4px 0 18px; flex-wrap:wrap;">
      <button type="button" class="btn btn-primary btn-sm" id="receitaExportBtn" title="Baixa um Excel com o DASHBOARD de faturamento (cartões, gráficos e Top 5) + a aba RECEITA com os dados + uma aba por Focal">Exportar Dashboard (Excel)</button>
      <button type="button" class="link-btn danger" id="receitaLimparBtn">Limpar todos os dados de Receita importados</button>
    </div>

    <div class="panel" style="margin-top:4px;">
      <div class="panel-header">Importar Faturamento Geral (um arquivo com todas as unidades)</div>
      <p class="section-desc" style="padding:0 18px;">Envie aqui o relatório <strong>completo</strong> "CTRCs Expedidos e Recebidos" (.sswweb ou <strong>CSV</strong> com colunas separadas por ";"), com todas as unidades/praças juntas. <strong>No CSV</strong> a carteira segue esta ordem: 1º <strong>CNPJ do pagador</strong> vinculado a um Focal (Cadastro de CNPJ) → carteira do Focal; 2º <strong>nome do pagador</strong> que bate com o Focal; 3º sem vínculo → <strong>Unidade Receptora</strong>. Valem <strong>Valor do Frete</strong> (nosso faturamento) e <strong>Valor da Mercadoria</strong>; CTRCs cancelados são ignorados. Abaixo, a explicação do formato .sswweb:  — <strong>não</strong> precisa filtrar por unidade. O sistema lê CTRC por CTRC e classifica cada um pela <strong>direção</strong>: se o <strong>PAGADOR</strong> é uma empresa do Grupo (mesma lista usada nas Ocorrências), entra como <strong>Grupo → Do Valle</strong> (a empresa paga); senão, entra como <strong>Do Valle → Grupo</strong>, pela <strong>praça</strong> do CTRC (só as 3 primeiras siglas — ex.: GNAP e GNAI viram GNA). As duas direções ficam em tabelas <strong>separadas</strong> na aba "Por Focal" — nunca se somam nem se sobrescrevem, mesmo quando a sigla é igual (ex.: AL2 praça x AL2 empresa pagadora). De cada CTRC entram <strong>FRETE</strong> (nosso faturamento) e <strong>VLR MERC</strong> (valor da mercadoria). Reimportar substitui o total "Geral" daquela origem (val/rva) em cada direção — a importação manual por unidade abaixo (sempre Do Valle → Grupo) continua funcionando à parte, se precisar corrigir uma unidade específica.</p>
      <div style="padding:0 18px 18px; display:flex; gap:24px; flex-wrap:wrap;">
        <div class="receita-import-slot">
          <label>VAL — Rede Do Valle (arquivo completo)</label>
          <input type="file" accept=".sswweb,.csv,.txt,text/plain" id="receitaGeral_val">
          <span class="receita-import-status" id="receitaGeralStatus_val"></span>
        </div>
        <div class="receita-import-slot">
          <label>RVA — Real Vale (arquivo completo)</label>
          <input type="file" accept=".sswweb,.csv,.txt,text/plain" id="receitaGeral_rva">
          <span class="receita-import-status" id="receitaGeralStatus_rva"></span>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:18px;">
      <div class="panel-header">Importar dados por unidade (manual, opcional)</div>
      <p class="section-desc" style="padding:0 18px;">Só use isso se precisar corrigir/importar UMA unidade específica com o relatório já filtrado (RESUMO). Isto é sempre a direção <strong>Do Valle → Grupo</strong> (Do Valle fatura a unidade). Se você já importou pelo "Faturamento Geral" acima, normalmente não precisa repetir aqui — os dois gravam na mesma direção (Do Valle → Grupo) e o último importado vale; a direção Grupo → Do Valle (empresa pagadora) só entra pelo "Faturamento Geral" e aparece em tabela separada na aba "Por Focal".</p>
      <div style="padding:0 18px 18px;">
        ${grupos.map(g => importacaoReceitaFocalHTML(g)).join("")}
      </div>
    </div>
  `;
}

/* ---------- Dashboard Principal: drill-down interativo (modal) ----------
   Clique no card "Faturamento total" ou nas barras dos gráficos abre um modal
   (sem sair da página) com o detalhe, com "migalhas de pão" (breadcrumb) pra
   ir descendo Sistema → Focal → Unidade e voltar por onde já passou.
   Reaproveita o mesmo visual/HTML já usado em "Por Focal" e "Por Unidade" —
   nada disso duplica dado, só reorganiza a visualização. */
let frDrillStack = [];

function frFecharDrillModal(){
  const el = document.getElementById("frDrillModalOverlay");
  if(el){
    el.classList.add("fr-modal-closing");
    setTimeout(() => el.remove(), 160);
  }
  document.removeEventListener("keydown", frDrillEscHandler);
}
function frDrillEscHandler(e){ if(e.key === "Escape") frFecharDrillModal(); }

function frAbrirDrill(passo){
  frDrillStack = [passo];
  frRenderDrillModal("fwd");
}
function frEmpilharDrill(passo){
  frDrillStack.push(passo);
  frRenderDrillModal("fwd");
}
function frIrParaDrill(indice){
  frDrillStack = frDrillStack.slice(0, indice + 1);
  frRenderDrillModal("back");
}

// Uma linha de ranking clicável (mesmo visual de "Por Unidade" — receita-rank-*).
function frDrillRankRowsHTML(items, max){
  return items.map((it, i) => `
    <div class="receita-rank-row receita-rank-row-click" data-drill-item="${i}" tabindex="0" role="button">
      <div class="receita-rank-sigla" style="width:auto; min-width:70px; max-width:220px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(it.label)}</div>
      <div class="receita-rank-bar-wrap">
        <div class="receita-rank-bar" style="width:${Math.max(it.value / max * 100, 2)}%; background:${it.cor || '#94A3B8'};"></div>
      </div>
      <div class="receita-rank-valor">${fmtMoeda(it.value)}</div>
    </div>
  `).join("");
}

// Soma FRETE de um Focal, só de UMA origem (val/rva), somando as duas direções
// (Do Valle → Grupo + Grupo → Do Valle) — usado no drill Sistema → Focal.
function frFreteGrupoOrigem(grupo, data, dadosPagadora, origem){
  let frete = 0;
  grupo.unidades.forEach(sigla => {
    const u = data.unidades[sigla];
    if(u && u[origem]) frete += Number(u[origem].frete) || 0;
  });
  const focalReal = FOCAIS.find(f => f.id === grupo.id);
  if(focalReal){
    unidadesPagadoraDoFocal(focalReal).forEach(uu => {
      const p = dadosPagadora[uu.sigla];
      if(p && p[origem]) frete += Number(p[origem].frete) || 0;
    });
  }
  return frete;
}

// Monta {titulo, html, itens, aoClicar} de cada nível do drill — só leitura,
// não altera nada salvo.
function frDrillCorpoHTML(passo){
  const data = loadReceitaData();
  const grupos = gruposReceita(data.unidades);
  const dadosPagadora = loadReceitaPagadoraData().unidades;

  if(passo.nivel === "sistema"){
    const t = frTotaisPorOrigem(data);
    const items = [
      {label:"VAL — Rede Do Valle", value:t.val.frete, cor:"#2fd9c4", origem:"val"},
      {label:"RVA — Real Vale", value:t.rva.frete, cor:"#c99a2e", origem:"rva"}
    ].filter(i => i.value > 0);
    return {
      titulo: "Faturamento Total — por Sistema",
      html: items.length ? frDrillRankRowsHTML(items, Math.max(t.val.frete, t.rva.frete, 1)) : '<div class="empty">Sem dados de faturamento ainda.</div>',
      itens: items,
      aoClicar: (it) => frEmpilharDrill({nivel:"focalSistema", origem:it.origem, tituloSistema:it.label})
    };
  }

  if(passo.nivel === "focalSistema"){
    const items = grupos.map(g => ({label:g.titulo.split("—")[0].trim(), value:frFreteGrupoOrigem(g, data, dadosPagadora, passo.origem), grupoId:g.id}))
      .filter(i => i.value > 0).sort((a,b) => b.value - a.value);
    const max = Math.max(...items.map(i => i.value), 1);
    return {
      titulo: `${passo.tituloSistema} — por Focal`,
      html: items.length ? frDrillRankRowsHTML(items, max) : '<div class="empty">Sem dados nesse sistema ainda.</div>',
      itens: items,
      aoClicar: (it) => frEmpilharDrill({nivel:"unidadeSistema", origem:passo.origem, tituloSistema:passo.tituloSistema, grupoId:it.grupoId, tituloFocal:it.label})
    };
  }

  if(passo.nivel === "unidadeSistema"){
    const grupo = grupos.find(g => g.id === passo.grupoId);
    const items = (grupo ? grupo.unidades : []).map(sigla => {
      const u = data.unidades[sigla];
      return {label:sigla, value: u && u[passo.origem] ? (Number(u[passo.origem].frete) || 0) : 0, sigla};
    }).filter(i => i.value > 0).sort((a,b) => b.value - a.value);
    const max = Math.max(...items.map(i => i.value), 1);
    return {
      titulo: `${passo.tituloSistema} — ${passo.tituloFocal} — Unidades`,
      html: items.length ? frDrillRankRowsHTML(items, max) : '<div class="empty">Sem dados de unidade nesse sistema ainda.</div>',
      itens: items,
      aoClicar: (it) => frEmpilharDrill({nivel:"unidade", sigla:it.sigla})
    };
  }

  if(passo.nivel === "focal"){
    const grupo = grupos.find(g => g.id === passo.focalId);
    if(!grupo) return {titulo:"Focal", html:'<div class="empty">Focal não encontrado.</div>', itens:[]};
    const totalGeral = totalGeralReceitaCombinado(grupos, data.unidades, dadosPagadora);
    return {
      titulo: grupo.titulo,
      html: painelReceitaFocalHTML(grupo, data.unidades, totalGeral) + painelReceitaPagadoraHTML(grupo, dadosPagadora, totalGeral),
      itens: []
    };
  }

  if(passo.nivel === "unidade"){
    const lista = unidadesComDadosReceita().sort((a,b) => b.frete - a.frete);
    const u = lista.find(x => x.sigla === passo.sigla);
    if(!u) return {titulo: passo.sigla || "Unidade", html:'<div class="empty">Sem dados para essa unidade.</div>', itens:[]};
    return {titulo: `Unidade ${u.sigla}`, html: frUnidadeBodyPagadorHTML(u, lista), itens:[]};
  }

  return {titulo:"", html:"", itens:[]};
}

function frRenderDrillModal(direcao){
  const overlay0 = document.getElementById("frDrillModalOverlay");
  const passoAtual = frDrillStack[frDrillStack.length - 1];
  const corpo = frDrillCorpoHTML(passoAtual);

  const breadcrumb = frDrillStack.map((p, i) => {
    const label = i === frDrillStack.length - 1 ? corpo.titulo : frDrillCorpoHTML(p).titulo;
    return `<span class="fr-drill-crumb${i === frDrillStack.length - 1 ? ' fr-drill-crumb-atual' : ''}" data-drill-goto="${i}">${escHtml(label)}</span>`;
  }).join('<span class="fr-drill-crumb-sep">›</span>');

  const classeAnim = direcao === "back" ? "fr-drill-back" : "fr-drill-fwd";
  const html = `
    <div class="receita-modal-overlay" id="frDrillModalOverlay">
      <div class="receita-modal" style="max-width:640px;">
        <div class="receita-modal-head">
          <div>
            <div class="fr-drill-breadcrumb">${breadcrumb}</div>
            <h3 style="margin-top:6px;">${escHtml(corpo.titulo)}</h3>
          </div>
          <button type="button" class="receita-modal-close" id="frDrillModalClose">✕ Fechar</button>
        </div>
        <div id="frDrillBody" class="${classeAnim}" style="margin-top:12px; max-height:70vh; overflow-y:auto;">${corpo.html}</div>
      </div>
    </div>
  `;

  if(overlay0){
    overlay0.outerHTML = html;
  } else {
    document.body.insertAdjacentHTML("beforeend", html);
    document.addEventListener("keydown", frDrillEscHandler);
  }
  attachFrDrillModalEvents(corpo);
}

function attachFrDrillModalEvents(corpo){
  const overlay = document.getElementById("frDrillModalOverlay");
  if(!overlay) return;
  overlay.addEventListener("click", (e) => { if(e.target === overlay) frFecharDrillModal(); });
  const closeBtn = document.getElementById("frDrillModalClose");
  if(closeBtn) closeBtn.addEventListener("click", frFecharDrillModal);

  overlay.querySelectorAll(".fr-drill-crumb[data-drill-goto]").forEach(el => {
    el.addEventListener("click", () => frIrParaDrill(Number(el.dataset.drillGoto)));
  });

  if(corpo.aoClicar){
    overlay.querySelectorAll("[data-drill-item]").forEach(el => {
      const ir = () => corpo.aoClicar(corpo.itens[Number(el.dataset.drillItem)]);
      el.addEventListener("click", ir);
      el.addEventListener("keydown", (e) => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); ir(); } });
    });
  }
}

// Anima os números dos cartões do Dashboard Principal contando de 0 até o
// valor real (efeito "uau" de apresentação) — só visual, não mexe no dado.
function frAnimarKpis(){
  document.querySelectorAll("#frDashWrap [data-kpi-raw]").forEach(el => {
    const alvo = Number(el.dataset.kpiRaw) || 0;
    const fmt = el.dataset.kpiFmt === "int" ? fmtInt : fmtMoeda;
    const dur = 900;
    const t0 = performance.now();
    function passo(agora){
      const p = Math.min((agora - t0) / dur, 1);
      const facilitado = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(alvo * facilitado);
      if(p < 1) requestAnimationFrame(passo);
    }
    requestAnimationFrame(passo);
  });
}

// Liga os cliques do Dashboard Principal (card "Faturamento total" e as barras
// dos 2 gráficos) que abrem o modal — chamado toda vez que o dashboard é
// (re)desenhado, porque o HTML é refeito do zero a cada render.
function attachFrDashboardDrillEvents(){
  frAnimarKpis();
  const kpiTotal = document.getElementById("frKpiTotalBtn");
  if(kpiTotal){
    const abrir = () => frAbrirDrill({nivel:"sistema"});
    kpiTotal.addEventListener("click", abrir);
    kpiTotal.addEventListener("keydown", (e) => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); abrir(); } });
  }
  document.querySelectorAll("#frDashWrap .fr-vbar-col-click[data-drill-id]").forEach(col => {
    const painel = col.closest(".fr-chart-panel");
    const tituloPainel = painel ? (painel.querySelector(".fr-chart-title")?.textContent || "") : "";
    const ehTopUnidades = /top unidades/i.test(tituloPainel);
    const abrir = () => {
      if(ehTopUnidades) frAbrirDrill({nivel:"unidade", sigla: col.dataset.drillId});
      else frAbrirDrill({nivel:"focal", focalId: col.dataset.drillId});
    };
    col.addEventListener("click", abrir);
    col.addEventListener("keydown", (e) => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); abrir(); } });
  });
}

/* ---------- Sub-aba: Por Focal ---------- */
// Alguns Focais (SAC 1, SAC 5, e as empresas do Grupo dentro de SAC 3/SAC 4) misturam
// unidades normais com empresas que também são pagadoras do Grupo. Por isso cada Focal
// pode render DUAS tabelas aqui, nunca somadas entre si:
//   • "Saindo da Do Valle" (Do Valle → Grupo)  — painelReceitaFocalHTML, store normal
//   • "Chegando na Do Valle" (Grupo → Do Valle) — painelReceitaPagadoraHTML, store separada
function frFocalHTML(data, grupos, totalGeral){
  const temAlgumDado = Object.keys(data.unidades).length > 0;
  const dadosPagadora = loadReceitaPagadoraData().unidades;
  const temAlgumPagadora = Object.keys(dadosPagadora).length > 0;
  return `
    <div class="panel">
      <div class="panel-header">Faturamento por Focal — Detalhado</div>
      <p class="section-desc" style="padding:0 18px;">Quando o Focal tem empresas do Grupo (ex.: <strong>SAC 1</strong> e <strong>SAC 5</strong>), aparecem duas tabelas: <strong>Saindo da Do Valle</strong> (Do Valle → Grupo, Do Valle fatura) e <strong>Chegando na Do Valle</strong> (Grupo → Do Valle, a empresa é quem paga). São direções diferentes e os valores não se somam entre as duas tabelas.</p>
      <div style="padding:14px 18px;">
        ${grupos.map(g => painelReceitaFocalHTML(g, data.unidades, totalGeral) + painelReceitaPagadoraHTML(g, dadosPagadora, totalGeral)).join("")}
        ${(!temAlgumDado && !temAlgumPagadora) ? '<div class="empty">Nenhum dado de Receita importado ainda. Importe os arquivos na aba "Dashboard Principal".</div>' : ""}
      </div>
    </div>
  `;
}

/* ---------- Sub-aba: Por Unidade ---------- */
function frUnidadeHTML(){
  const lista = frUnidModo === "pagador"
    ? unidadesComDadosReceita().sort((a,b) => b.frete - a.frete)
    : unidadesDestinoComDados().sort((a,b) => b.frete - a.frete);

  if(!lista.length) frUnidadeSelecionada = null;
  else if(!frUnidadeSelecionada || !lista.some(u => u.sigla === frUnidadeSelecionada)) frUnidadeSelecionada = lista[0].sigla;

  return `
    <p class="section-desc">A visão <strong>"com pagador"</strong> mostra a direção <strong>Do Valle → Grupo</strong> por unidade (pagador não é empresa do Grupo, agrupado pela praça). A visão <strong>"sem pagador"</strong> olha só a unidade física que recebeu a mercadoria (a praça do CTRC), ignorando quem pagou. A direção <strong>Grupo → Do Valle</strong> (empresa pagadora) fica na aba <strong>"Por Focal"</strong>, em tabela separada. As três usam os mesmos arquivos já importados na aba Dashboard Principal — não precisa importar de novo.</p>

    <div class="pill-tabs" id="frUnidModoTabs">
      <button type="button" class="pill ${frUnidModo==='pagador'?'active':''}" data-frmodo="pagador">Por Unidade (com pagador)</button>
      <button type="button" class="pill ${frUnidModo==='destino'?'active':''}" data-frmodo="destino">Por Unidade de Entrega (sem pagador)</button>
    </div>

    ${!lista.length ? `<div class="empty">${frUnidModo==='pagador' ? 'Importe dados de faturamento (VAL e/ou RVA) na aba "Dashboard Principal".' : 'Importe o Faturamento Geral (VAL e/ou RVA) na aba "Dashboard Principal".'}</div>` : `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:14px; margin-bottom:14px; flex-wrap:wrap;">
        <select id="frUnidadeSelect" style="min-width:240px; padding:7px 10px; border:1px solid var(--line); border-radius:6px;">
          ${lista.map(u => `<option value="${escHtml(u.sigla)}" ${u.sigla===frUnidadeSelecionada?"selected":""}>${escHtml(u.sigla)}${frUnidModo==='pagador' ? (u.focal ? " — " + escHtml(u.focal.split("—")[0].trim()) : "") : (u.cidade ? " — " + escHtml(u.cidade) : "")}</option>`).join("")}
        </select>
        ${frUnidModo==='destino' ? '<button type="button" class="btn btn-primary btn-sm" id="receitaExportUnidadeBtn">Exportar por Unidade (Excel)</button>' : ""}
      </div>
      <div id="frUnidadeBody"></div>
    `}
  `;
}

/* ---------- Sub-abas: Por Unidade Expedidora e Geral (Expedida + Recebida) ---------- */
// ---- Seleção de filiais (vale para as abas Expedidora/Geral e para o Excel exportado) ----
// Guarda só as filiais DESMARCADAS: assim, uma filial nova que aparecer num arquivo futuro
// já entra marcada. Padrão: GYN começa desmarcada.
// Unidades do Valle (usadas no botão "Somente Unidades Do Valle"). CRI = Crixás.
const FILIAIS_DO_VALLE = ["ALE","RIA","NIQ","CRI","GAN","URU","RUB","CRT","LZI","ITA","PIR","STZ","ANP","JAR","ROT","GNA"];
function loadSelecaoExped(){
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(KEYS.expedSelecao) || "null"); }catch(e){}
  if(raw && Array.isArray(raw.excluidas)) return {excluidas: raw.excluidas.map(x => String(x).toUpperCase()), somenteValle: !!raw.somenteValle};
  return {excluidas:["GYN"], somenteValle:false};
}
function salvarSelecaoExped(sel){
  try{ localStorage.setItem(KEYS.expedSelecao, JSON.stringify({excluidas: sel.excluidas, somenteValle: !!sel.somenteValle})); }catch(e){}
}
function filialMarcada(sigla){
  const sel = loadSelecaoExped();
  const sg = String(sigla).toUpperCase();
  // Modo "Somente Unidades Do Valle": só as da lista ficam marcadas (qualquer outra sigla, inclusive nova, fica de fora).
  if(sel.somenteValle) return FILIAIS_DO_VALLE.includes(sg);
  return !sel.excluidas.includes(sg);
}
// Todas as siglas que existem (expedidoras + receptoras), em ordem alfabética.
function siglasExpedicaoDisponiveis(){
  const set = new Set();
  Object.keys(loadUnidadeExpedidoraData().unidades).forEach(x => set.add(x));
  Object.keys(loadUnidadeDestinoData().unidades).forEach(x => set.add(x));
  return [...set].sort();
}

function frFiltroFiliaisHTML(){
  const todas = siglasExpedicaoDisponiveis();
  if(!todas.length) return "";
  const selAtual = loadSelecaoExped();
  const marcadas = todas.filter(x => filialMarcada(x)).length;
  return `
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-header">Filiais incluídas — ${marcadas} de ${todas.length} marcadas</div>
      <div style="padding:12px 18px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
          <button type="button" class="btn btn-ghost btn-sm" data-frexp-sel="todas">Marcar todas</button>
          <button type="button" class="btn btn-ghost btn-sm" data-frexp-sel="nenhuma">Desmarcar todas</button>
          <button type="button" class="btn btn-ghost btn-sm" data-frexp-sel="semgyn">Todas, menos GYN</button>
          <button type="button" class="btn ${selAtual.somenteValle ? 'btn-primary' : 'btn-ghost'} btn-sm" data-frexp-sel="valle" title="Marca só: ${FILIAIS_DO_VALLE.join(', ')}">Somente Unidades Do Valle</button>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px 16px;">
          ${todas.map(x => `<label style="display:inline-flex; align-items:center; gap:5px; cursor:pointer; font-size:13px; font-weight:600;"><input type="checkbox" data-frexp-sig="${escHtml(x)}" ${filialMarcada(x) ? "checked" : ""}> ${escHtml(x)}</label>`).join("")}
        </div>
        <div class="footer-note" style="margin-top:8px;">Vale para as duas abas e para o Excel exportado (inclusive o fechamento geral). A GYN começa desmarcada; marque-a aqui se quiser incluir. \"Somente Unidades Do Valle\" marca só ${FILIAIS_DO_VALLE.join(", ")} e deixa as demais de fora.</div>
      </div>
    </div>`;
}

// Lista do que cada unidade EXPEDIU (praça expedidora, 3 primeiras letras) — só as filiais marcadas.
function unidadesExpedidoraComDados(){
  const data = loadUnidadeExpedidoraData();
  return Object.values(data.unidades).filter(u => filialMarcada(u.sigla)).map(u => {
    const c = combinaUnidadeReceita(u);
    return {sigla:u.sigla, origens:origensUnidadeReceita(u), ...c};
  });
}

// Junta, por sigla, o que a unidade EXPEDIU e o que ela RECEBEU (entregou).
function geralExpedidaRecebida(){
  const exp = unidadesExpedidoraComDados();
  const rec = unidadesDestinoComDados().filter(u => filialMarcada(u.sigla));
  const mapa = {};
  const pega = s => mapa[s] || (mapa[s] = {sigla:s, expQctrc:0, expFrete:0, expMerc:0, recQctrc:0, recFrete:0, recMerc:0});
  exp.forEach(u => { const m = pega(u.sigla); m.expQctrc += u.qctrc; m.expFrete += u.frete; m.expMerc += u.vlrMerc; });
  rec.forEach(u => { const m = pega(u.sigla); m.recQctrc += u.qctrc; m.recFrete += u.frete; m.recMerc += u.vlrMerc; });
  return Object.values(mapa).map(m => ({...m, totalFrete:m.expFrete + m.recFrete})).sort((a,b) => b.totalFrete - a.totalFrete);
}

function frExportExpedicaoBtnHTML(){
  return '<button type="button" class="btn btn-primary btn-sm" data-frexp-export="1">Exportar Expedidora + Geral (Excel)</button>';
}

function frExpedidoraHTML(){
  const lista = unidadesExpedidoraComDados().sort((a,b) => b.frete - a.frete);
  const temImportado = Object.keys(loadUnidadeExpedidoraData().unidades).length > 0;
  if(temImportado && !lista.length){
    return `${frFiltroFiliaisHTML()}<div class="empty">Nenhuma filial marcada. Marque pelo menos uma filial acima.</div>`;
  }
  if(!lista.length){
    return `
      <p class="section-desc">Mostra o que cada unidade <strong>expediu</strong> (coluna <strong>Praça Expedidora</strong> do arquivo). Praças com 4 letras (ex.: GYNP, ANPP) contam só as <strong>3 primeiras</strong> (GYN, ANP).</p>
      <div class="empty">Importe o Faturamento Geral (VAL e/ou RVA) na aba "Dashboard Principal". Se você já tinha importado antes, importe de novo o arquivo para carregar a Praça Expedidora.</div>`;
  }
  const t = lista.reduce((a,u) => ({qctrc:a.qctrc+u.qctrc, frete:a.frete+u.frete, vlrMerc:a.vlrMerc+u.vlrMerc}), {qctrc:0, frete:0, vlrMerc:0});
  const max = Math.max(...lista.map(u => u.frete), 1);
  const pct1 = v => v.toFixed(1).replace(".", ",");
  return `
    <p class="section-desc">Mostra o que cada unidade <strong>expediu</strong> (coluna <strong>Praça Expedidora</strong> do arquivo). Praças com 4 letras (ex.: GYNP, ANPP) contam só as <strong>3 primeiras</strong> (GYN, ANP). É o espelho da aba "Por Unidade" (que olha a unidade que <em>recebeu/entregou</em>). Usa os mesmos arquivos já importados no Dashboard Principal.</p>
    ${frFiltroFiliaisHTML()}
    <div style="display:flex; justify-content:flex-end; margin-bottom:12px;">${frExportExpedicaoBtnHTML()}</div>

    <div class="kpi-grid">
      <div class="kpi-card ok"><div class="label">Faturamento expedido (FRETE)</div><div class="value">${fmtMoeda(t.frete)}</div><div class="hint">${lista.length} unidade(s) expedidora(s)</div></div>
      <div class="kpi-card"><div class="label">Valor de Mercadoria</div><div class="value">${fmtMoeda(t.vlrMerc)}</div><div class="hint">Frete = ${t.vlrMerc > 0 ? (t.frete / t.vlrMerc * 100).toFixed(2).replace(".", ",") : "0,00"}% da mercadoria</div></div>
      <div class="kpi-card"><div class="label">CTRCs expedidos</div><div class="value">${fmtInt(t.qctrc)}</div><div class="hint">Ticket médio: ${fmtMoeda(t.qctrc ? t.frete / t.qctrc : 0)}</div></div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-header">Ranking — o que cada unidade expediu</div>
      <div class="table-wrap perf-table-wrap">
        <table class="perf-table-simple" style="min-width:720px;">
          <thead><tr><th>Unidade expedidora</th><th>Origem</th><th>CTRCs</th><th>Faturamento (FRETE)</th><th>% do total</th><th>Vlr. Mercadoria</th><th></th></tr></thead>
          <tbody>
            ${lista.map(u => {
              const cor = u.origens.length===2 ? "badge-green" : (u.origens[0]==="VAL" ? "badge-amber" : "badge-gray");
              return `<tr><td class="perf-unidade">${escHtml(u.sigla)}</td><td><span class="badge ${cor}">${u.origens.join(" + ") || "—"}</span></td><td>${fmtInt(u.qctrc)}</td><td>${fmtMoeda(u.frete)}</td><td>${t.frete > 0 ? pct1(u.frete / t.frete * 100) : "0,0"}%</td><td>${fmtMoeda(u.vlrMerc)}</td>
                <td style="min-width:120px;"><div class="receita-rank-bar-wrap"><div class="receita-rank-bar" style="width:${Math.max(u.frete / max * 100, 2)}%; background:#D4A017;"></div></div></td></tr>`;
            }).join("")}
          </tbody>
          <tfoot><tr><td>TOTAL</td><td></td><td>${fmtInt(t.qctrc)}</td><td>${fmtMoeda(t.frete)}</td><td>100%</td><td>${fmtMoeda(t.vlrMerc)}</td><td></td></tr></tfoot>
        </table>
      </div>
    </div>
  `;
}

function frGeralHTML(){
  const lista = geralExpedidaRecebida();
  if(siglasExpedicaoDisponiveis().length && !lista.length){
    return `${frFiltroFiliaisHTML()}<div class="empty">Nenhuma filial marcada. Marque pelo menos uma filial acima.</div>`;
  }
  if(!lista.length){
    return `
      <p class="section-desc">Visão geral por filial: quanto cada uma <strong>expediu</strong> e quanto <strong>recebeu</strong> (entregou), lado a lado.</p>
      <div class="empty">Importe o Faturamento Geral (VAL e/ou RVA) na aba "Dashboard Principal".</div>`;
  }
  const T = lista.reduce((a,u) => ({expQctrc:a.expQctrc+u.expQctrc, expFrete:a.expFrete+u.expFrete, recQctrc:a.recQctrc+u.recQctrc, recFrete:a.recFrete+u.recFrete, totalFrete:a.totalFrete+u.totalFrete}), {expQctrc:0, expFrete:0, recQctrc:0, recFrete:0, totalFrete:0});
  const pct1 = v => v.toFixed(1).replace(".", ",");
  return `
    <p class="section-desc">Visão <strong>geral por filial</strong>: o que cada unidade gerou como <strong>expedidora</strong> (despachou) e como <strong>receptora</strong> (entregou), e a soma das duas pontas. Atenção: o mesmo CTRC conta uma vez na expedidora e uma vez na receptora — por isso a coluna "Frete Exp. + Rec." mostra o quanto cada filial <em>movimentou</em> nas duas pontas — somar todas as filiais conta o faturamento em dobro.</p>
    ${frFiltroFiliaisHTML()}
    <div style="display:flex; justify-content:flex-end; margin-bottom:12px;">${frExportExpedicaoBtnHTML()}</div>

    <div class="kpi-grid">
      <div class="kpi-card ok"><div class="label">Exp. + Rec. (filiais marcadas)</div><div class="value">${fmtMoeda(T.totalFrete)}</div><div class="hint">${lista.length} filial(is) · movimentado nas duas pontas</div></div>
      <div class="kpi-card"><div class="label">Expedido</div><div class="value">${fmtMoeda(T.expFrete)}</div><div class="hint">${fmtInt(T.expQctrc)} CTRCs</div></div>
      <div class="kpi-card"><div class="label">Recebido (entregue)</div><div class="value">${fmtMoeda(T.recFrete)}</div><div class="hint">${fmtInt(T.recQctrc)} CTRCs</div></div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-header">Geral por filial — Expedida x Recebida</div>
      <div class="table-wrap perf-table-wrap">
        <table class="perf-table-simple" style="min-width:860px;">
          <thead><tr><th>Filial</th><th>CTRCs expedidos</th><th>Frete expedido</th><th>CTRCs recebidos</th><th>Frete recebido</th><th>Frete Exp. + Rec.</th><th>% movimentado</th></tr></thead>
          <tbody>
            ${lista.map(u => `<tr><td class="perf-unidade">${escHtml(u.sigla)}</td><td>${fmtInt(u.expQctrc)}</td><td>${fmtMoeda(u.expFrete)}</td><td>${fmtInt(u.recQctrc)}</td><td>${fmtMoeda(u.recFrete)}</td><td><strong>${fmtMoeda(u.totalFrete)}</strong></td><td>${T.totalFrete > 0 ? pct1(u.totalFrete / T.totalFrete * 100) : "0,0"}%</td></tr>`).join("")}
          </tbody>
          <tfoot><tr><td>TOTAL</td><td>${fmtInt(T.expQctrc)}</td><td>${fmtMoeda(T.expFrete)}</td><td>${fmtInt(T.recQctrc)}</td><td>${fmtMoeda(T.recFrete)}</td><td>${fmtMoeda(T.totalFrete)}</td><td>100%</td></tr></tfoot>
        </table>
      </div>
    </div>
  `;
}

function painelReceitaFocalHTML(grupo, unidadesData, totalGeral){
  const t = totaisReceitaDoGrupo(grupo, unidadesData);
  const pct = totalGeral.frete > 0 ? (t.frete / totalGeral.frete * 100) : 0;
  const comDados = grupo.unidades.filter(s => unidadesData[s]);
  const focalReal = FOCAIS.find(f => f.id === grupo.id);
  const temContraparte = !!(focalReal && unidadesPagadoraDoFocal(focalReal).length);
  return `
    <details class="receita-details" ${comDados.length ? "open" : ""}>
      <summary>
        <span>${escHtml(grupo.titulo)}${temContraparte ? ' <span class="receita-direcao-tag">Saindo da Do Valle (Do Valle → Grupo)</span>' : ''}</span>
        <span class="receita-summary-total">${fmtMoeda(t.frete)}${totalGeral.frete>0 ? ` (${pct.toFixed(1).replace(".",",")}% do total)` : ""} · ${comDados.length}/${grupo.unidades.length} unidade(s) com dados</span>
      </summary>
      <div class="table-wrap perf-table-wrap">
        <table class="perf-table-simple" style="min-width:680px;">
          <thead><tr><th>Unidade</th><th>Origem</th><th>CTRCs</th><th>Volumes</th><th>Faturamento (FRETE)</th><th>Vlr. Mercadoria</th></tr></thead>
          <tbody>
            ${grupo.unidades.map(sigla => {
              const u = unidadesData[sigla];
              if(!u) return `<tr><td class="perf-unidade">${sigla}</td><td colspan="5" style="text-align:center; color:var(--muted); font-style:italic;">Sem dados importados</td></tr>`;
              const c = combinaUnidadeReceita(u);
              const origens = origensUnidadeReceita(u);
              const cor = origens.length===2 ? "badge-green" : (origens[0]==="VAL" ? "badge-amber" : "badge-gray");
              return `<tr><td class="perf-unidade">${sigla}</td><td><span class="badge ${cor}">${origens.join(" + ")}</span></td><td>${fmtInt(c.qctrc)}</td><td>${fmtInt(c.qtvol)}</td><td>${fmtMoeda(c.frete)}</td><td>${fmtMoeda(c.vlrMerc)}</td></tr>`;
            }).join("")}
          </tbody>
          <tfoot><tr><td>TOTAL</td><td></td><td>${fmtInt(t.qctrc)}</td><td>${fmtInt(t.qtvol)}</td><td>${fmtMoeda(t.frete)}</td><td>${fmtMoeda(t.vlrMerc)}</td></tr></tfoot>
        </table>
      </div>
    </details>
  `;
}

// Tabela SEPARADA (nunca soma com a de cima): unidades do Focal que são empresas do
// Grupo (EMPRESAS_PAGADORA) — direção GRUPO → DO VALLE, lida da store própria
// (loadReceitaPagadoraData). Mesmo padrão visual de "cliente premium" já usado em
// Performance Geral. Some Focais inteiros (ex.: SAC 1, SAC 5) só têm empresas do
// Grupo, então só esta tabela aparece com dados de verdade; outros (ex.: SAC 3 com
// EGO/BSB, SAC 4 com ALF) têm as duas tabelas convivendo lado a lado.
function painelReceitaPagadoraHTML(grupo, dadosPagadora, totalGeral){
  const focalReal = FOCAIS.find(f => f.id === grupo.id);
  if(!focalReal) return "";
  const unidadesPag = unidadesPagadoraDoFocal(focalReal);
  if(!unidadesPag.length) return "";

  const t = totaisReceitaPagadoraDoGrupo(grupo.id, dadosPagadora);
  const pct = totalGeral.frete > 0 ? (t.frete / totalGeral.frete * 100) : 0;
  const comDados = unidadesPag.filter(u => dadosPagadora[u.sigla]);

  return `
    <details class="receita-details" ${comDados.length ? "open" : ""}>
      <summary>
        <span>${escHtml(grupo.titulo)} <span class="receita-direcao-tag receita-direcao-tag-in">Chegando na Do Valle (Grupo → Do Valle · empresa pagadora)</span></span>
        <span class="receita-summary-total">${fmtMoeda(t.frete)}${totalGeral.frete>0 ? ` (${pct.toFixed(1).replace(".",",")}% do total)` : ""} · ${comDados.length}/${unidadesPag.length} empresa(s) com dados</span>
      </summary>
      <div class="table-wrap perf-table-wrap">
        <table class="perf-table-simple" style="min-width:680px;">
          <thead><tr><th>Empresa</th><th>Sigla</th><th>Origem</th><th>CTRCs</th><th>Volumes</th><th>Faturamento (FRETE)</th><th>Vlr. Mercadoria</th></tr></thead>
          <tbody>
            ${unidadesPag.map(u => {
              const nome = EMPRESAS_PAGADORA[u.sigla] || u.sigla;
              const d = dadosPagadora[u.sigla];
              if(!d) return `<tr><td class="perf-unidade">${escHtml(nome)}</td><td>${escHtml(u.sigla)}</td><td colspan="5" style="text-align:center; color:var(--muted); font-style:italic;">Sem dados importados</td></tr>`;
              const c = combinaUnidadeReceita(d);
              const origens = origensUnidadeReceita(d);
              const cor = origens.length===2 ? "badge-green" : (origens[0]==="VAL" ? "badge-amber" : "badge-gray");
              return `<tr><td class="perf-unidade">${escHtml(nome)}</td><td>${escHtml(u.sigla)}</td><td><span class="badge ${cor}">${origens.join(" + ")}</span></td><td>${fmtInt(c.qctrc)}</td><td>${fmtInt(c.qtvol)}</td><td>${fmtMoeda(c.frete)}</td><td>${fmtMoeda(c.vlrMerc)}</td></tr>`;
            }).join("")}
          </tbody>
          <tfoot><tr><td>TOTAL</td><td></td><td></td><td>${fmtInt(t.qctrc)}</td><td>${fmtInt(t.qtvol)}</td><td>${fmtMoeda(t.frete)}</td><td>${fmtMoeda(t.vlrMerc)}</td></tr></tfoot>
        </table>
      </div>
      <div class="footer-note">Esta tabela é separada da de cima (não soma junto): aqui a empresa do Grupo é quem paga o frete — vem do arquivo "Faturamento Geral", classificado pelo PAGADOR.</div>
    </details>
  `;
}

function importacaoReceitaFocalHTML(grupo){
  return `
    <details class="receita-details">
      <summary><span>${escHtml(grupo.titulo)}</span><span class="receita-summary-total">${grupo.unidades.length} unidade(s)</span></summary>
      <div>
        ${grupo.unidades.map(sigla => linhaImportacaoReceitaHTML(sigla)).join("")}
      </div>
    </details>
  `;
}

function linhaImportacaoReceitaHTML(sigla){
  return `
    <div class="receita-unit-row">
      <div class="receita-unit-sigla">${sigla}</div>
      <div class="receita-import-slot">
        <label>VAL — Rede Do Valle</label>
        <input type="file" accept=".sswweb,.txt,text/plain" data-receita-sigla="${sigla}" data-receita-origem="val">
        <span class="receita-import-status" data-receita-status="${sigla}-val"></span>
      </div>
      <div class="receita-import-slot">
        <label>RVA — Real Vale</label>
        <input type="file" accept=".sswweb,.txt,text/plain" data-receita-sigla="${sigla}" data-receita-origem="rva">
        <span class="receita-import-status" data-receita-status="${sigla}-rva"></span>
      </div>
      <div class="receita-import-slot">
        <label>Já importado</label>
        <span class="receita-vals" data-receita-resumo="${sigla}"></span>
      </div>
    </div>
  `;
}

function textoResumoUnidade(u){
  if(!u) return "—";
  const c = combinaUnidadeReceita(u);
  const origens = origensUnidadeReceita(u);
  if(!origens.length) return "—";
  return `${fmtMoeda(c.frete)} · ${fmtInt(c.qctrc)} CTRC (${origens.join(" + ")})`;
}

function atualizarResumosReceita(){
  const data = loadReceitaData();
  document.querySelectorAll("[data-receita-resumo]").forEach(el => {
    const sigla = el.dataset.receitaResumo;
    el.textContent = textoResumoUnidade(data.unidades[sigla]);
  });
}

// ---- Dashboard Interativo por Unidade (janela dentro do painel, sem Excel) ----
// Lista achatada de todas as unidades com dados de Receita, já combinando VAL+RVA
// e sabendo a que Focal cada uma pertence (mesmos grupos usados na tela e no Excel).
function unidadesComDadosReceita(){
  const data = loadReceitaData();
  const grupos = gruposReceita(data.unidades);
  const lista = [];
  grupos.forEach(g => {
    g.unidades.forEach(sigla => {
      const u = data.unidades[sigla];
      if(!u) return;
      const c = combinaUnidadeReceita(u);
      lista.push({sigla, focal:g.titulo, origens:origensUnidadeReceita(u), ...c});
    });
  });
  return lista;
}

function unidadesDestinoComDados(){
  const data = loadUnidadeDestinoData();
  return Object.values(data.unidades).map(u => {
    const c = combinaUnidadeReceita(u);
    return {sigla:u.sigla, cidade:u.cidade || "", origens:origensUnidadeReceita(u), ...c};
  });
}

// Corpo (cartões + ranking) da visão "Por Unidade — com pagador", usado dentro
// da sub-aba fixa Por Unidade (sem modal/overlay).
function frUnidadeBodyPagadorHTML(u, listaTodas){
  const totalGeral = listaTodas.reduce((s, x) => s + x.frete, 0);
  const totalFocal = listaTodas.filter(x => x.focal === u.focal).reduce((s, x) => s + x.frete, 0);
  const pctGeral = totalGeral > 0 ? (u.frete / totalGeral * 100) : 0;
  const pctFocal = totalFocal > 0 ? (u.frete / totalFocal * 100) : 0;
  const ticket = u.qctrc ? (u.frete / u.qctrc) : 0;
  const relFreteMerc = u.vlrMerc > 0 ? (u.frete / u.vlrMerc * 100) : 0;
  const maxFrete = Math.max(...listaTodas.map(x => x.frete), 1);
  const corOrigem = u.origens.length === 2 ? "badge-green" : (u.origens[0] === "VAL" ? "badge-amber" : "badge-gray");
  const pct1 = v => v.toFixed(1).replace(".", ",");
  const pct2 = v => v.toFixed(2).replace(".", ",");

  return `
    <div class="kpi-grid" style="margin-top:14px;">
      <div class="kpi-card ok">
        <div class="label">Faturamento (FRETE)</div>
        <div class="value">${fmtMoeda(u.frete)}</div>
        <div class="hint">${pct1(pctGeral)}% do faturamento geral</div>
      </div>
      <div class="kpi-card">
        <div class="label">Valor de Mercadoria</div>
        <div class="value">${fmtMoeda(u.vlrMerc)}</div>
        <div class="hint">Frete = ${pct2(relFreteMerc)}% da mercadoria</div>
      </div>
      <div class="kpi-card">
        <div class="label">CTRCs</div>
        <div class="value">${fmtInt(u.qctrc)}</div>
        <div class="hint">Ticket médio: ${fmtMoeda(ticket)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Participação no Focal</div>
        <div class="value">${pct1(pctFocal)}%</div>
        <div class="hint">${escHtml(u.focal)}</div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-header">Origem dos dados</div>
      <div style="padding:14px 18px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <span class="badge ${corOrigem}">${u.origens.join(" + ") || "—"}</span>
        <span class="footer-note" style="margin:0;">VAL = Rede Do Valle · RVA = Real Vale. Quando as duas aparecem, o valor acima já é a soma das duas.</span>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-header">Ranking de unidades por Faturamento (FRETE)</div>
      <div style="padding:14px 18px; display:flex; flex-direction:column; gap:7px; max-height:320px; overflow-y:auto;">
        ${listaTodas.map(x => `
          <div class="receita-rank-row">
            <div class="receita-rank-sigla" style="font-weight:${x.sigla === u.sigla ? "800" : "600"}; color:${x.sigla === u.sigla ? "var(--navy)" : "#374057"};">${escHtml(x.sigla)}</div>
            <div class="receita-rank-bar-wrap">
              <div class="receita-rank-bar" style="width:${Math.max(x.frete / maxFrete * 100, 2)}%; background:${x.sigla === u.sigla ? "#D4A017" : "#94A3B8"};"></div>
            </div>
            <div class="receita-rank-valor">${fmtMoeda(x.frete)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// Corpo (cartões + ranking) da visão "Por Unidade de Entrega — sem pagador",
// lendo de loadUnidadeDestinoData() (praça pura) em vez de loadReceitaData().
function frUnidadeBodyDestinoHTML(u, listaTodas){
  const totalGeral = listaTodas.reduce((s, x) => s + x.frete, 0);
  const pctGeral = totalGeral > 0 ? (u.frete / totalGeral * 100) : 0;
  const ticket = u.qctrc ? (u.frete / u.qctrc) : 0;
  const relFreteMerc = u.vlrMerc > 0 ? (u.frete / u.vlrMerc * 100) : 0;
  const maxFrete = Math.max(...listaTodas.map(x => x.frete), 1);
  const corOrigem = u.origens.length === 2 ? "badge-green" : (u.origens[0] === "VAL" ? "badge-amber" : "badge-gray");
  const pct1 = v => v.toFixed(1).replace(".", ",");
  const pct2 = v => v.toFixed(2).replace(".", ",");

  return `
    <div class="kpi-grid" style="margin-top:14px;">
      <div class="kpi-card ok">
        <div class="label">Faturamento (FRETE)</div>
        <div class="value">${fmtMoeda(u.frete)}</div>
        <div class="hint">${pct1(pctGeral)}% do faturamento geral</div>
      </div>
      <div class="kpi-card">
        <div class="label">Valor de Mercadoria</div>
        <div class="value">${fmtMoeda(u.vlrMerc)}</div>
        <div class="hint">Frete = ${pct2(relFreteMerc)}% da mercadoria</div>
      </div>
      <div class="kpi-card">
        <div class="label">CTRCs</div>
        <div class="value">${fmtInt(u.qctrc)}</div>
        <div class="hint">Ticket médio: ${fmtMoeda(ticket)}</div>
      </div>
      <div class="kpi-card">
        <div class="label">Cidade</div>
        <div class="value" style="font-size:16px;">${escHtml(u.cidade || "—")}</div>
        <div class="hint">Pagador não entra nessa conta</div>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-header">Origem dos dados</div>
      <div style="padding:14px 18px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
        <span class="badge ${corOrigem}">${u.origens.join(" + ") || "—"}</span>
        <span class="footer-note" style="margin:0;">VAL = Rede Do Valle · RVA = Real Vale. Quando as duas aparecem, o valor acima já é a soma das duas.</span>
      </div>
    </div>

    <div class="panel" style="margin-top:16px;">
      <div class="panel-header">Ranking de unidades por Faturamento (FRETE) — sem pagador</div>
      <div style="padding:14px 18px; display:flex; flex-direction:column; gap:7px; max-height:320px; overflow-y:auto;">
        ${listaTodas.map(x => `
          <div class="receita-rank-row">
            <div class="receita-rank-sigla" style="font-weight:${x.sigla === u.sigla ? "800" : "600"}; color:${x.sigla === u.sigla ? "var(--navy)" : "#374057"};">${escHtml(x.sigla)}</div>
            <div class="receita-rank-bar-wrap">
              <div class="receita-rank-bar" style="width:${Math.max(x.frete / maxFrete * 100, 2)}%; background:${x.sigla === u.sigla ? "#D4A017" : "#94A3B8"};"></div>
            </div>
            <div class="receita-rank-valor">${fmtMoeda(x.frete)}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

// Refaz o corpo (cartões + ranking) da sub-aba Por Unidade, sem reconstruir o
// select/pills em volta — chamado ao trocar a unidade escolhida no <select>.
function renderFrUnidadeBody(){
  const body = document.getElementById("frUnidadeBody");
  if(!body) return;
  const lista = frUnidModo === "pagador"
    ? unidadesComDadosReceita().sort((a,b) => b.frete - a.frete)
    : unidadesDestinoComDados().sort((a,b) => b.frete - a.frete);
  const u = lista.find(x => x.sigla === frUnidadeSelecionada);
  if(!u){ body.innerHTML = '<div class="empty">Sem dados para essa unidade.</div>'; return; }
  body.innerHTML = frUnidModo === "pagador" ? frUnidadeBodyPagadorHTML(u, lista) : frUnidadeBodyDestinoHTML(u, lista);
}

// Reconstrói a sub-aba Por Unidade inteira (pills + select + corpo) — chamado
// ao trocar entre "com pagador" e "sem pagador".
function frRefreshUnidadeTab(){
  const wrap = document.getElementById("frUnidadeWrap");
  if(!wrap) return;
  wrap.innerHTML = frUnidadeHTML();
  attachFrUnidadeEvents();
  renderFrUnidadeBody();
}

function attachFrUnidadeEvents(){
  const pills = document.getElementById("frUnidModoTabs");
  if(pills) pills.querySelectorAll("[data-frmodo]").forEach(btn => {
    btn.addEventListener("click", () => {
      if(btn.dataset.frmodo === frUnidModo) return;
      frUnidModo = btn.dataset.frmodo;
      frUnidadeSelecionada = null;
      frRefreshUnidadeTab();
    });
  });

  const select = document.getElementById("frUnidadeSelect");
  if(select) select.addEventListener("change", (e) => {
    frUnidadeSelecionada = e.target.value;
    renderFrUnidadeBody();
  });

  const exportUnidadeBtn = document.getElementById("receitaExportUnidadeBtn");
  if(exportUnidadeBtn) exportUnidadeBtn.addEventListener("click", () => {
    const payload = montarPayloadUnidadeDestino();
    if(!payload){ alert("Importe o Faturamento Geral (VAL e/ou RVA) antes de exportar."); return; }
    exportarUnidadeExcel(payload, `Faturamento_Por_Unidade_${(payload.periodo || "").replace(/[\/\s]+/g,"-")}_${dataParaArquivo()}.xlsx`);
  });
}

// Monta o payload que o exportar-unidade.js espera, a partir dos dados salvos.
function montarPayloadUnidadeDestino(){
  const data = loadUnidadeDestinoData();
  const siglas = Object.keys(data.unidades);
  if(!siglas.length) return null;
  const periodos = [];
  const unidades = siglas.map(sigla => {
    const u = data.unidades[sigla];
    const v = {qctrc:Number(u.val && u.val.qctrc) || 0, frete:Number(u.val && u.val.frete) || 0, vlrMerc:Number(u.val && u.val.vlrMerc) || 0};
    const r = {qctrc:Number(u.rva && u.rva.qctrc) || 0, frete:Number(u.rva && u.rva.frete) || 0, vlrMerc:Number(u.rva && u.rva.vlrMerc) || 0};
    if(u.val && u.val.periodo) periodos.push(u.val.periodo);
    if(u.rva && u.rva.periodo) periodos.push(u.rva.periodo);
    return {sigla, cidade:u.cidade || "", qctrc:v.qctrc + r.qctrc, freteVal:v.frete, freteRva:r.frete, frete:v.frete + r.frete, vlrMerc:v.vlrMerc + r.vlrMerc};
  });
  return {periodo: periodoPorExtenso([...new Set(periodos)].join(" ")), unidades, expedicao: montarPayloadExpedicao()};
}

function renderFechamentoReceitaSection(){
  const sec = document.getElementById("sec-fechamento-receita");
  if(!sec) return;
  sec.innerHTML = fechamentoReceitaHTML();
  attachFechamentoReceitaEvents();
}

// Importação Geral (VAL/RVA): lê o arquivo .sswweb inteiro, agrupa sozinho por
// Focal (pagador > praça) e grava um salvarReceitaUnidade() por sigla encontrada —
// reaproveitando toda a tela/exportação que já existe por unidade.
function attachImportacaoGeralReceitaEvents(){
  ["val","rva"].forEach(origem => {
    const input = document.getElementById(`receitaGeral_${origem}`);
    if(!input) return;
    input.addEventListener("change", async () => {
      const statusEl = document.getElementById(`receitaGeralStatus_${origem}`);
      const file = input.files[0];
      if(!file) return;
      if(statusEl) statusEl.textContent = "Lendo arquivo...";
      try{
        // O SSW exporta em Windows-1252 (acentos); tenta UTF-8 e cai para Windows-1252.
        const buf = await file.arrayBuffer();
        let text;
        try{ text = new TextDecoder("utf-8", {fatal:true}).decode(buf); }
        catch(e){ text = new TextDecoder("windows-1252").decode(buf); }
        const ehCsv = ehCsvFaturamento(text);
        const parsed = ehCsv ? parseSswFaturamentoCsv(text) : parseSswFaturamentoDetalhado(text);
        if(!parsed.encontrou){
          if(statusEl) statusEl.textContent = "Não encontrei linhas de CTRC nesse arquivo. Confira se é o relatório \"CTRCs Expedidos e Recebidos\" (.sswweb ou CSV) completo.";
          input.value = "";
          return;
        }
        const agora = new Date().toISOString();
        // Do Valle → Grupo (cliente comum, pagador não é empresa do Grupo): grava na
        // store normal, por praça.
        const siglas = Object.values(parsed.porSigla);
        siglas.forEach(u => {
          salvarReceitaUnidade(u.sigla, origem, {
            qctrc: u.qctrc, vlrMerc: u.vlrMerc, frete: u.frete,
            periodo: parsed.periodo, atualizadoEm: agora
          });
        });
        // Grupo → Do Valle (empresa do Grupo é a pagadora): grava numa store SEPARADA,
        // pra não sobrescrever/misturar com o faturamento normal da mesma sigla.
        const pagadoras = Object.values(parsed.porPagador || {});
        pagadoras.forEach(u => {
          salvarReceitaPagadoraUnidade(u.sigla, origem, {
            qctrc: u.qctrc, vlrMerc: u.vlrMerc, frete: u.frete,
            periodo: parsed.periodo, atualizadoEm: agora
          });
        });
        const pracas = Object.values(parsed.porPraca || {});
        pracas.forEach(u => {
          salvarUnidadeDestino(u.sigla, origem, {
            qctrc: u.qctrc, vlrMerc: u.vlrMerc, frete: u.frete, cidade: u.cidade,
            periodo: parsed.periodo, atualizadoEm: agora
          });
        });
        // Praça EXPEDIDORA (o que cada unidade despachou) — store própria.
        const expedidoras = Object.values(parsed.porExpedidora || {});
        expedidoras.forEach(u => {
          salvarUnidadeExpedidora(u.sigla, origem, {
            qctrc: u.qctrc, vlrMerc: u.vlrMerc, frete: u.frete,
            periodo: parsed.periodo, atualizadoEm: agora
          });
        });
        const semClass = Object.keys(parsed.semClassificar || {});
        let msg = `Importado ${fmtDate(todayISO())} — ${siglas.length} unidade(s) Do Valle → Grupo, ${pagadoras.length} empresa(s) Grupo → Do Valle, ${pracas.length} praça(s) de entrega, ${expedidoras.length} praça(s) expedidora(s), ${parsed.totalLinhas} CTRCs${parsed.periodo ? " — período " + parsed.periodo : ""}.`;
        if(ehCsv && parsed.origemClass){
          const oc = parsed.origemClass;
          msg += ` Carteira: ${oc.cnpj} por CNPJ do pagador, ${oc.nome} por nome, ${oc.unidade} pela Unidade Receptora${parsed.canceladas ? " (" + parsed.canceladas + " cancelados ignorados)" : ""}.`;
        }
        if(semClass.length) msg += ` Atenção: ${semClass.join(", ")} sem Focal cadastrado — foram para "Sem Focal definido", cadastre em Confirmação de Filiais.`;
        if(statusEl) statusEl.textContent = msg;
        input.value = "";
        renderFechamentoReceitaSection();
      }catch(err){
        console.error("Erro ao importar Faturamento Geral ("+origem+"):", err);
        if(statusEl) statusEl.textContent = "Não foi possível ler esse arquivo (" + (err.message || err) + ").";
      }
    });
  });
}

// Troca de sub-aba (Dashboard Principal / Por Focal / Por Unidade) — só alterna
// visibilidade, os 3 conteúdos já foram desenhados por renderFechamentoReceitaSubtabs().
function attachFrSubtabsEvents(){
  const nav = document.getElementById("frSubtabsNav");
  if(!nav) return;
  nav.querySelectorAll("[data-frsub]").forEach(btn => {
    btn.addEventListener("click", () => {
      frSubTab = btn.dataset.frsub;
      nav.querySelectorAll("[data-frsub]").forEach(b => b.classList.toggle("active", b.dataset.frsub === frSubTab));
      document.getElementById("frView-dashboard").classList.toggle("active", frSubTab === "dashboard");
      document.getElementById("frView-focal").classList.toggle("active", frSubTab === "focal");
      document.getElementById("frView-unidade").classList.toggle("active", frSubTab === "unidade");
      document.getElementById("frView-expedidora").classList.toggle("active", frSubTab === "expedidora");
      document.getElementById("frView-geral").classList.toggle("active", frSubTab === "geral");
    });
  });
}

// Desenha o conteúdo das 3 sub-abas e liga todos os eventos (import, export,
// limpar, seletor de unidade). Chamado sempre que os dados de Receita mudam.
function renderFechamentoReceitaSubtabs(){
  const dashWrap = document.getElementById("frDashWrap");
  const focalWrap = document.getElementById("frFocalWrap");
  const unidadeWrap = document.getElementById("frUnidadeWrap");
  const expedidoraWrap = document.getElementById("frExpedidoraWrap");
  const geralWrap = document.getElementById("frGeralWrap");
  if(!dashWrap || !focalWrap || !unidadeWrap || !expedidoraWrap || !geralWrap) return;

  const data = loadReceitaData();
  const grupos = gruposReceita(data.unidades);
  const dadosPagadora = loadReceitaPagadoraData().unidades;
  const totalGeral = totalGeralReceitaCombinado(grupos, data.unidades, dadosPagadora);

  // ---- Sub-aba Dashboard Principal ----
  dashWrap.innerHTML = frDashboardPrincipalHTML(data, grupos, totalGeral, dadosPagadora);
  atualizarResumosReceita();
  attachImportacaoGeralReceitaEvents();
  attachFrDashboardDrillEvents();

  document.querySelectorAll("input[data-receita-sigla]").forEach(input => {
    input.addEventListener("change", async () => {
      const sigla = input.dataset.receitaSigla;
      const origem = input.dataset.receitaOrigem;
      const statusEl = document.querySelector(`[data-receita-status="${sigla}-${origem}"]`);
      const file = input.files[0];
      if(!file) return;
      try{
        const text = await file.text();
        const parsed = parseSswResumoReceita(text);
        if(!parsed.encontrouResumo){
          if(statusEl) statusEl.textContent = "RESUMO não encontrado nesse arquivo.";
          input.value = "";
          return;
        }
        if(!parsed.encontrouTotal){
          if(statusEl) statusEl.textContent = "Linha TOTAL GERAL não encontrada.";
          input.value = "";
          return;
        }
        const campos = {};
        if(parsed.qctrc !== undefined) campos.qctrc = parsed.qctrc;
        if(parsed.qtvol !== undefined) campos.qtvol = parsed.qtvol;
        if(parsed.frete !== undefined) campos.frete = parsed.frete;
        if(parsed.vlrMerc !== undefined) campos.vlrMerc = parsed.vlrMerc;
        if(parsed.periodo) campos.periodo = parsed.periodo;
        campos.atualizadoEm = new Date().toISOString();
        salvarReceitaUnidade(sigla, origem, campos);
        if(statusEl) statusEl.textContent = `Importado ${fmtDate(todayISO())}${parsed.periodo ? " — período " + parsed.periodo : ""}.`;
        input.value = "";
        renderFechamentoReceitaSection();
      }catch(err){
        console.error("Erro ao importar Receita ("+sigla+"/"+origem+"):", err);
        if(statusEl) statusEl.textContent = "Não foi possível ler esse arquivo (" + (err.message||err) + ").";
      }
    });
  });

  const exportBtn = document.getElementById("receitaExportBtn");
  if(exportBtn) exportBtn.addEventListener("click", () => {
    const payload = montarPayloadReceita();
    if(!payload){ alert("Importe os dados de Receita (VAL e/ou RVA) antes de exportar."); return; }
    exportarReceitaExcel(payload, `Fechamento_Receita_${(payload.periodo || "").replace(/[\/\s]+/g,"-")}_${dataParaArquivo()}.xlsx`);
  });

  const limparBtn = document.getElementById("receitaLimparBtn");
  if(limparBtn) limparBtn.addEventListener("click", () => {
    if(!confirm("Isso vai apagar TODOS os dados de Fechamento-RECEITA importados (Do Valle → Grupo e Grupo → Do Valle). Deseja continuar?")) return;
    save(KEYS.receitaFechamento, {unidades:{}});
    save(KEYS.receitaPagadora, {unidades:{}});
    save(KEYS.unidadeDestino, {unidades:{}});
    save(KEYS.unidadeExpedidora, {unidades:{}});
    renderFechamentoReceitaSection();
  });

  // ---- Sub-aba Por Focal ----
  focalWrap.innerHTML = frFocalHTML(data, grupos, totalGeral);

  // ---- Sub-aba Por Unidade ----
  unidadeWrap.innerHTML = frUnidadeHTML();
  attachFrUnidadeEvents();
  renderFrUnidadeBody();

  // ---- Sub-abas Por Unidade Expedidora e Geral (Expedida + Recebida) ----
  frRefreshExpedicaoTabs();
}

// Redesenha só as duas abas (Expedidora e Geral) e religa seleção + exportação —
// chamado ao carregar e sempre que uma filial é marcada/desmarcada.
function frRefreshExpedicaoTabs(){
  const expedidoraWrap = document.getElementById("frExpedidoraWrap");
  const geralWrap = document.getElementById("frGeralWrap");
  if(!expedidoraWrap || !geralWrap) return;
  expedidoraWrap.innerHTML = frExpedidoraHTML();
  geralWrap.innerHTML = frGeralHTML();

  [expedidoraWrap, geralWrap].forEach(wrap => {
    wrap.querySelectorAll("input[data-frexp-sig]").forEach(chk => chk.addEventListener("change", () => {
      const sig = chk.dataset.frexpSig.toUpperCase();
      // Mexer numa filial na mão sai do modo "Somente Do Valle": congela o que estava marcado e aplica a mudança.
      const set = new Set(siglasExpedicaoDisponiveis().filter(x => !filialMarcada(x)));
      if(chk.checked) set.delete(sig); else set.add(sig);
      salvarSelecaoExped({excluidas:[...set], somenteValle:false});
      frRefreshExpedicaoTabs();
    }));
    wrap.querySelectorAll("[data-frexp-sel]").forEach(btn => btn.addEventListener("click", () => {
      const modo = btn.dataset.frexpSel;
      if(modo === "valle"){
        salvarSelecaoExped({excluidas: siglasExpedicaoDisponiveis().filter(x => !FILIAIS_DO_VALLE.includes(x)), somenteValle:true});
      } else {
        const excl = modo === "todas" ? [] : modo === "nenhuma" ? siglasExpedicaoDisponiveis() : ["GYN"];
        salvarSelecaoExped({excluidas:excl, somenteValle:false});
      }
      frRefreshExpedicaoTabs();
    }));
    wrap.querySelectorAll("[data-frexp-export]").forEach(btn => btn.addEventListener("click", () => {
      const payload = montarPayloadExpedicao();
      if(!payload || (!payload.expedidoras.length && !payload.receptoras.length)){ alert("Nada para exportar: importe o Faturamento Geral (VAL e/ou RVA) e marque pelo menos uma filial. Se já tinha importado antes, importe de novo para carregar a Praça Expedidora."); return; }
      exportarExpedicaoExcel(payload, `Faturamento_Expedidora_Geral_${(payload.periodo || "").replace(/[\/\s]+/g,"-")}_${dataParaArquivo()}.xlsx`);
    }));
  });
}

function attachFechamentoReceitaEvents(){
  attachFrSubtabsEvents();
  renderFechamentoReceitaSubtabs();
}


// TELA 1 — visão consolidada de todos os Focais e unidades
/* ---------- Dashboard Principal (sub-aba do Fechamento) ---------- */

// Gráfico de barras simples (CSS) comparando a Performance de cada Focal (SAC)
// + GERAL com a meta. items: [{clickId, label, sub, perf}]. clickId=null (ex.:
// GERAL) não é clicável.
function pgBarChartFocalHTML(items, meta){
  const validos = items.filter(i => i.perf !== null && i.perf !== undefined);
  const menor = validos.length ? Math.min(...validos.map(i=>i.perf), meta) : meta;
  let eixoMin = Math.floor(menor) - 2;
  if(eixoMin > 90) eixoMin = 90;
  if(eixoMin < 0) eixoMin = 0;
  const eixoMax = 100;
  const faixa = eixoMax - eixoMin || 1;
  const metaPct = ((meta - eixoMin) / faixa * 100);

  return `
    <div class="pg-bar-row">
      <div class="pg-bar-metaline" style="bottom:${metaPct}%;"><span>Meta ${String(meta).replace(".",",")}%</span></div>
      ${items.map(it=>{
        const temValor = it.perf !== null && it.perf !== undefined;
        const alvo = temValor ? Math.max(eixoMin, Math.min(eixoMax, it.perf)) : eixoMin;
        const alturaPct = Math.max(2, (alvo - eixoMin) / faixa * 100);
        const abaixo = temValor && it.perf < meta;
        const cor = !temValor ? "var(--muted)" : (abaixo ? "var(--red)" : "var(--green)");
        const clique = it.clickId ? ` onclick="window.perfGeralIrPara('${it.clickId}')"` : "";
        return `
          <div class="pg-bar-col${it.clickId?' clicavel':''}"${clique} title="${escHtml(it.label)}${it.clickId?' — clique para ver o detalhe':''}">
            <div class="pg-bar-fill" style="height:${alturaPct}%; background:${cor};">
              <div class="pg-bar-value" style="color:${cor};">${temValor?fmtPct(it.perf):"—"}</div>
            </div>
          </div>
        `;
      }).join("")}
    </div>
    <div class="pg-bar-labels">
      ${items.map(it => `<div class="pg-bar-label-col">${escHtml(it.label)}${it.sub?`<span class="sub">${escHtml(it.sub)}</span>`:""}</div>`).join("")}
    </div>
  `;
}

// Donut (conic-gradient) com cores semânticas fixas (ok/atenção), diferente do
// ocorDonutHTML (que usa a paleta navy/gold). fatias: [{label, qtd, cor}].
function pgDonutHTML(fatias, centerNumero, centerLabel){
  const total = fatias.reduce((s,f)=> s + (f.qtd||0), 0);
  if(total === 0) return `<div class="empty" style="padding:18px;">Sem dados.</div>`;
  let acumulado = 0;
  const stops = fatias.map(f => {
    const inicio = acumulado/total*360;
    acumulado += (f.qtd||0);
    const fim = acumulado/total*360;
    return `${f.cor} ${inicio}deg ${fim}deg`;
  }).join(", ");
  const legenda = fatias.map(f => `
    <div class="ocor-legend-item">
      <span class="ocor-legend-dot" style="background:${f.cor};"></span>
      <span class="ocor-legend-name">${escHtml(f.label)}</span>
      <span class="ocor-legend-value">${fmtInt(f.qtd)}</span>
      <span class="ocor-legend-pct">${total>0?Math.round((f.qtd||0)/total*100):0}%</span>
    </div>
  `).join("");
  return `
    <div class="ocor-donut-row">
      <div class="ocor-donut" style="background:conic-gradient(${stops});">
        <div class="ocor-donut-center"><span class="n">${fmtInt(centerNumero)}</span><span class="l">${escHtml(centerLabel)}</span></div>
      </div>
      <div class="ocor-legend">${legenda}</div>
    </div>
  `;
}

// Tabela compacta usada nos Top 5 (melhor / pior performance). Cada linha
// clicável leva direto para a unidade na sub-aba "Por Unidade".
function pgTop5TableHTML(lista){
  if(!lista.length) return `<div class="empty">Sem dados suficientes.</div>`;
  return `
    <div class="table-wrap perf-table-wrap">
      <table class="perf-table-simple">
        <thead><tr><th>#</th><th>Sigla</th><th style="text-align:left;">Unidade</th><th>Entregue</th><th>Performance</th><th>Vs. Meta</th></tr></thead>
        <tbody>
          ${lista.map((u,i) => {
            const diff = (u.perf===null||u.perf===undefined) ? null : (u.perf - META_PERFORMANCE);
            const diffTxt = diff===null ? "—" : `${diff>=0?"▲":"▼"} ${Math.abs(diff).toFixed(1).replace(".",",")} p.p.`;
            return `
              <tr class="pg-clicavel" onclick="window.perfGeralIrParaUnidade('${u.sigla}')">
                <td>${i+1}</td>
                <td class="perf-unidade">${u.sigla}</td>
                <td style="text-align:left;">${u.destino||"-"}</td>
                <td>${fmtInt(u.entregue)}</td>
                <td class="${slaClassGeral(u.perf)}">${fmtPct(u.perf)}</td>
                <td style="font-weight:700; color:${diff===null?'var(--muted)':(diff>=0?'var(--green)':'var(--red)')};">${diffTxt}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function dashboardPrincipalPerfGeralHTML(data){
  const totalGeral = computeTotais(data.unidades);
  const unidadesMap = {};
  data.unidades.forEach(u => { unidadesMap[u.sigla] = u; });
  const unidadesOk = data.unidades.filter(u => u.sla !== null && u.sla !== undefined && u.sla >= META_PERFORMANCE).length;
  const unidadesAtencao = data.unidades.length - unidadesOk;

  const barrasFocais = FOCAIS.map(f => {
    const G = geralDoFocal(f, unidadesMap);
    if(!G.temDados) return null;
    const t = G.totais;
    return {clickId: f.id, label: f.titulo.split("—")[0].trim(), sub: (f.titulo.split("—")[1]||"").trim(), perf: t.sla};
  }).filter(Boolean);
  barrasFocais.push({clickId: null, label: "GERAL", sub: "todas as siglas", perf: totalGeral.sla});

  const ordenadasPorPerf = [...data.unidades].sort((a,b)=> (a.perf===null||a.perf===undefined?999:a.perf) - (b.perf===null||b.perf===undefined?999:b.perf));
  const piores = ordenadasPorPerf.slice(0,5);
  const melhores = [...ordenadasPorPerf].reverse().slice(0,5);

  return `
    <div class="kpi-grid">
      <div class="kpi-card ${slaKpiClass(totalGeral.sla)}">
        <div class="label">Performance Geral</div>
        <div class="value">${fmtPct(totalGeral.sla)}</div>
        <div class="hint">Meta ${META_PERFORMANCE}%</div>
      </div>
      <div class="kpi-card ok">
        <div class="label">Entregue (total)</div>
        <div class="value">${fmtInt(totalGeral.entregue)}</div>
        <div class="hint">${data.periodo ? "Período: "+data.periodo : "Expedido: "+fmtInt(totalGeral.exped)}</div>
      </div>
      <div class="kpi-card ${unidadesAtencao>0?'warn':'ok'}">
        <div class="label">Siglas na meta</div>
        <div class="value">${unidadesOk} / ${data.unidades.length}</div>
        <div class="hint">${unidadesAtencao} abaixo da meta</div>
      </div>
      <div class="kpi-card ${totalGeral.foraDoPrazo>0?'warn':'ok'}">
        <div class="label">Atrasos (fora do prazo)</div>
        <div class="value">${fmtInt(totalGeral.foraDoPrazo)}</div>
        <div class="hint">Cliente: ${fmtInt(totalGeral.atrasCli)} · Transp.: ${fmtInt(totalGeral.atrasTrans)}</div>
      </div>
    </div>

    <div class="pg-dash-grid">
      <div class="panel">
        <div class="panel-header">Performance por SAC vs. Meta</div>
        <div style="padding:30px 18px 10px;">
          ${pgBarChartFocalHTML(barrasFocais, META_PERFORMANCE)}
        </div>
        <div class="footer-note">Clique numa barra para abrir o detalhe daquele Focal na sub-aba "Por Focal".</div>
      </div>
      <div class="pg-donuts-col">
        <div class="panel">
          <div class="panel-header">Siglas na Meta</div>
          ${pgDonutHTML([
            {label:"Na meta", qtd:unidadesOk, cor:"var(--green)"},
            {label:"Abaixo da meta", qtd:unidadesAtencao, cor:"var(--red)"}
          ], data.unidades.length, "siglas")}
        </div>
        <div class="panel">
          <div class="panel-header">Composição das Entregas</div>
          ${pgDonutHTML([
            {label:"No prazo", qtd:totalGeral.noPrazoEnt, cor:"var(--green)"},
            {label:"Atraso cliente", qtd:totalGeral.atrasCli, cor:"var(--amber)"},
            {label:"Atraso transportador", qtd:totalGeral.atrasTrans, cor:"var(--red)"}
          ], totalGeral.entregue, "entregues")}
        </div>
      </div>
    </div>

    <div class="pg-top-grid">
      <div class="panel">
        <div class="panel-header" style="background:var(--green);">Top 5 — Melhor Performance</div>
        ${pgTop5TableHTML(melhores)}
      </div>
      <div class="panel">
        <div class="panel-header" style="background:var(--red);">Atenção — 5 Menores Performances</div>
        ${pgTop5TableHTML(piores)}
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; gap:8px; margin:14px 0 4px; flex-wrap:wrap;">
      <button type="button" class="btn btn-primary btn-sm" id="perfGeralFechamentoBtn" title="Baixa o Excel de fechamento (PRINCIPAL + uma aba por SAC + PERF SIGLA), no modelo que vai para o gestor">Exportar Fechamento (Excel)</button>
      <button type="button" class="btn btn-ghost btn-sm" id="perfGeralExportFocaisBtn" title="Baixa um Excel com uma aba para cada Focal, com as mesmas cores">Exportar todos os Focais (Excel)</button>
    </div>
  `;
}

function visaoGeralHTML(data, unidadesMap){
  const totalGeral = computeTotais(data.unidades);
  const siglasClassificadas = todasSiglasFocais();
  const naoClassificadas = data.unidades.filter(u => !siglasClassificadas.has(u.sigla));
  const unidadesOk = data.unidades.filter(u => u.sla !== null && u.sla >= 98).length;
  const unidadesAtencao = data.unidades.length - unidadesOk;

  return `
    <div class="kpi-grid">
      <div class="kpi-card ${slaKpiClass(totalGeral.sla)}">
        <div class="label">SLA Geral (todas as unidades)</div>
        <div class="value">${fmtPct(totalGeral.sla)}</div>
        <div class="hint">Meta: 98%</div>
      </div>
      <div class="kpi-card ok">
        <div class="label">Total entregue no período</div>
        <div class="value">${fmtInt(totalGeral.entregue)}</div>
        <div class="hint">${data.periodo ? "Período: " + data.periodo : "Importado em " + fmtDate(data.importadoEm)}</div>
      </div>
      <div class="kpi-card ${unidadesAtencao>0?'warn':'ok'}">
        <div class="label">Unidades dentro da meta</div>
        <div class="value">${unidadesOk} / ${data.unidades.length}</div>
        <div class="hint">${unidadesAtencao} unidade(s) abaixo de 98% de SLA</div>
      </div>
      <div class="kpi-card ${naoClassificadas.length>0?'warn':'ok'}">
        <div class="label">Unidades sem Focal atribuído</div>
        <div class="value">${naoClassificadas.length}</div>
        <div class="hint">${naoClassificadas.length ? naoClassificadas.map(u=>u.sigla).join(", ") : "Todas as unidades estão atribuídas"}</div>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; margin-bottom:10px;">
      <button type="button" class="btn btn-primary btn-sm" id="perfGeralFechamentoBtn" style="margin-right:8px;" title="Baixa o Excel de fechamento (PRINCIPAL + uma aba por SAC + PERF SIGLA), no modelo que vai para o gestor">Exportar Fechamento (Excel)</button>
      <button type="button" class="btn btn-ghost btn-sm" id="perfGeralExportFocaisBtn" title="Baixa um Excel com uma aba para cada Focal, com as mesmas cores">Exportar todos os Focais (Excel)</button>
    </div>

    ${FOCAIS.map(f => focalMiniPanelHTML(f, unidadesMap)).join("")}

    ${naoClassificadas.length ? `
      <div class="panel">
        <div class="panel-header">Unidades sem Focal definido</div>
        <p class="section-desc" style="padding:0 18px;">Essas siglas apareceram no relatório importado mas ainda não foram atribuídas a nenhum Focal (SAC). Atualize a lista de Focais para incluí-las na consolidação por responsável.</p>
        <div class="table-wrap">
          <table class="perf-table">
            <thead><tr><th class="th-unidade">Unidade</th><th class="th-entregue">Entregue</th><th class="th-sla">SLA</th><th class="th-total">Total</th></tr></thead>
            <tbody>
              ${naoClassificadas.map(u => `
                <tr>
                  <td class="perf-unidade">${u.sigla}</td>
                  <td class="perf-entregue">${u.entregue}</td>
                  <td class="${slaClass(u.sla)}">${fmtPct(u.sla)}</td>
                  <td class="perf-total">${u.total}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    ` : ""}
  `;
}

function focalMiniPanelHTML(focal, unidadesMap){
  if(focal.unidades.length === 0){
    return `
      <div class="panel">
        <div class="panel-header">${focal.titulo} <span class="badge badge-gray" style="margin-left:8px;">Aguardando definição das unidades</span></div>
        <div class="table-wrap">
          <table class="perf-table">
            <thead><tr><th class="th-unidade">Unidade</th><th class="th-entregue">Entregue</th><th class="th-sla">SLA</th><th class="th-total">Total</th></tr></thead>
            <tbody>
              ${Array.from({length: focal.placeholders||2}).map(()=> `
                <tr class="placeholder-row"><td class="perf-unidade">—</td><td>—</td><td>—</td><td>—</td></tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div class="footer-note">Espaços reservados para as unidades deste Focal — serão preenchidos assim que as unidades forem definidas.</div>
      </div>
    `;
  }

  const G = geralDoFocal(focal, unidadesMap);
  const linhas = G.linhas, comDados = G.comDados, totais = G.totais;
  const semDadosCount = linhas.length - comDados.length;
  const nomeCurto = focal.titulo.split("—")[0].trim();

  return `
    <div class="panel" data-export-focal="${focal.id}">
      <div class="panel-header" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <span>${focal.titulo}</span>
        <span>
          <span style="padding:4px 10px; border-radius:6px; font-size:12.5px; font-weight:700; ${slaBadgeStyle(totais.sla)}">SLA ${fmtPct(totais.sla)}</span>
          <button type="button" class="link-btn" style="color:#fff; margin-left:12px;" onclick="window.perfGeralIrPara('${focal.id}')">Ver detalhado →</button>
        </span>
      </div>
      <div class="table-wrap">
        <table class="perf-table">
          <thead><tr>
            <th class="th-unidade">Unidade</th><th class="th-entregue">Entregue</th><th class="th-noprazo">No Prazo</th><th class="th-foraprazo">Fora do Prazo</th><th class="th-sla">SLA</th><th class="th-total">Total</th>
          </tr></thead>
          <tbody>
            ${linhas.map(l => l.semDados ? `
              <tr class="placeholder-row"><td class="perf-unidade">${l.sigla}</td><td colspan="5">Ainda sem dados importados</td></tr>
            ` : `
              <tr>
                <td class="perf-unidade">${l.sigla}${l.combinaSiglas ? ` <span style="font-weight:400;font-size:11px;opacity:.85;">(${l.combinaSiglas.join("+")})</span>` : ""}</td>
                <td class="perf-entregue">${l.entregue}</td>
                <td class="perf-noprazo">${l.noPrazoEnt}</td>
                <td class="perf-foraprazo">${l.foraDoPrazo}</td>
                <td class="${slaClass(l.sla)}">${fmtPct(l.sla)}</td>
                <td class="perf-total">${l.total}</td>
              </tr>
            `).join("")}
            ${G.clientes.map(c => `
              <tr>
                <td class="perf-unidade">${escHtml(c.sigla)} <span style="font-weight:400;font-size:11px;opacity:.85;">(pagadora)</span></td>
                <td class="perf-entregue">${c.totais.entregue}</td>
                <td class="perf-noprazo">${c.totais.noPrazoEnt}</td>
                <td class="perf-foraprazo">${c.totais.foraDoPrazo}</td>
                <td class="${slaClass(c.totais.sla)}">${fmtPct(c.totais.sla)}</td>
                <td class="perf-total">${c.totais.total}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr class="perf-total-row">
              <td>TOTAL ${nomeCurto} (GERAL)</td>
              <td>${totais.entregue}</td>
              <td>${totais.noPrazoEnt}</td>
              <td>${totais.foraDoPrazo}</td>
              <td>${fmtPct(totais.sla)}</td>
              <td>${totais.total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      ${semDadosCount>0 ? `<div class="footer-note">${semDadosCount} unidade(s) deste Focal ainda sem dados no relatório importado.</div>` : ""}
    </div>
  `;
}

// TELA 2 — dashboard individual de um Focal, na ordem:
//   1) tabela das UNIDADES (Do Valle paga)   2) tabela de cada PAGADORA (a empresa paga)   3) GERAL (1 + 2)
function focalDashboardHTML(focal, data, unidadesMap){
  if(focal.unidades.length === 0){
    return `
      <div class="panel">
        <div class="panel-header">${focal.titulo}</div>
        <div class="empty">As unidades deste Focal ainda serão definidas (${focal.placeholders||2} espaço(s) reservado(s)). Assim que forem informadas, este painel passa a exibir os dados automaticamente, sem necessidade de nenhuma configuração adicional.</div>
      </div>
    `;
  }

  const G = geralDoFocal(focal, unidadesMap);
  const linhas = G.linhas, comDados = G.comDados, totais = G.totais;
  const nomeCurto = focal.titulo.split("—")[0].trim();
  const temUnidades = unidadesNormaisDoFocal(focal).length > 0;
  const nPagadoras = unidadesPagadoraDoFocal(focal).length;
  const periodo = data.periodo || (G.clientes[0] && G.clientes[0].periodo) || "";

  const kpis = `
    <div class="kpi-grid">
      <div class="kpi-card ${slaKpiClass(totais.sla)}">
        <div class="label">SLA do Focal (geral)</div>
        <div class="value">${fmtPct(totais.sla)}</div>
        <div class="hint">Meta: 98%</div>
      </div>
      <div class="kpi-card ok">
        <div class="label">Total entregue</div>
        <div class="value">${fmtInt(totais.entregue)}</div>
        <div class="hint">${periodo ? "Período: " + periodo : ""}</div>
      </div>
      <div class="kpi-card warn">
        <div class="label">Fora do prazo</div>
        <div class="value">${fmtInt(totais.foraDoPrazo)}</div>
        <div class="hint">Atraso de cliente + transportadora</div>
      </div>
      <div class="kpi-card ok">
        <div class="label">Unidades / Pagadoras</div>
        <div class="value">${unidadesNormaisDoFocal(focal).length} / ${nPagadoras}</div>
        <div class="hint">${temUnidades ? (linhas.length - comDados.length) + " unidade(s) sem dados no período" : "Este Focal não tem unidade: só pagadoras"}</div>
      </div>
    </div>`;

  const tabelaUnidades = !temUnidades ? "" : `
    <div class="panel" id="focalDetalhePanel">
      <div class="panel-header">
        <span>1 · ${focal.titulo} — SLA e Performance por Unidade (Do Valle paga)</span>
      </div>
      <div class="table-wrap perf-table-wrap">
        <table class="perf-table perf-table-full" id="focalDetalheTabela">
          <thead><tr>
            <th class="th-unidade">Unidade (Sigla)</th><th class="th-entregue">Entregue</th><th class="th-noprazo">No Prazo</th><th class="th-foraprazo">Fora Do Prazo</th><th class="th-cliente">Cliente</th><th class="th-transp">Transportadora</th><th class="th-sla">SLA</th><th class="th-previstas">Entregas Previstas</th><th class="th-abertoatraso">Aberto Atrasado</th><th class="th-abertonoprazo">Aberto No Prazo</th><th class="th-total">Total</th>
          </tr></thead>
          <tbody>
            ${linhas.map(l => l.semDados ? `
              <tr class="placeholder-row"><td class="perf-unidade">${l.sigla}</td><td colspan="10">Ainda sem dados importados neste período</td></tr>
            ` : `
              <tr>
                <td class="perf-unidade">${l.sigla}${l.combinaSiglas ? ` (${l.combinaSiglas.join("+")})` : ""}</td>
                <td class="perf-entregue">${l.entregue}</td>
                <td class="perf-noprazo">${l.noPrazoEnt}</td>
                <td class="perf-foraprazo">${l.foraDoPrazo}</td>
                <td class="perf-cliente">${l.atrasCli}</td>
                <td class="perf-transp">${l.atrasTrans}</td>
                <td class="${slaClass(l.sla)}">${fmtPct(l.sla)}</td>
                <td class="perf-previstas">${l.exped}</td>
                <td class="perf-abertoatraso">${l.abertoAtrasado || ""}</td>
                <td class="perf-abertonoprazo">${l.abertoNoPrazo}</td>
                <td class="perf-total">${l.total}</td>
              </tr>
            `).join("")}
          </tbody>
          <tfoot>
            <tr class="perf-total-row">
              <td>TOTAL UNIDADES ${nomeCurto}</td>
              ${(() => { const t = G.unidades || computeTotais([]); return `<td>${t.entregue}</td><td>${t.noPrazoEnt}</td><td>${t.foraDoPrazo}</td><td>${t.atrasCli}</td><td>${t.atrasTrans}</td><td>${fmtPct(t.sla)}</td><td>${t.exped}</td><td>${t.abertoAtrasado || ""}</td><td>${t.abertoNoPrazo}</td><td>${t.total}</td>`; })()}
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="footer-note">Dados vindos automaticamente da aba Performance. Importado em ${fmtDate(data.importadoEm)}. <button type="button" class="link-btn" onclick="window.perfGeralIrPara('geral')">← Voltar para a Visão Geral</button></div>
    </div>`;

  // 3) GERAL = unidades (Do Valle paga) + pagadora(s) (grupo paga). Mostra de onde vem cada parte
  //    e fecha numa linha TOTAL GERAL — mesmo padrão visual das outras tabelas, pronto pra imprimir.
  const fat = faturamentoDoFocal(focal), fatTot = faturamentoTotalGeral();
  const fatPct = fatTot > 0 && fat.temDados ? (fat.total / fatTot * 100).toFixed(1).replace(".", ",") + "% do faturamento total" : "";
  const partesGeral = [];
  if(G.unidades) partesGeral.push({rotulo:"Unidades · Do Valle → Grupo", t:G.unidades});
  if(FOCAIS_PAGADOR_SEM_UNIDADE.includes(focal.id)){
    if(G.pagadora) partesGeral.push({rotulo:"Pagadoras · Grupo → Do Valle", t:G.pagadora});
  } else {
    G.clientes.forEach(c => partesGeral.push({rotulo:`${c.pagador} · pagadora`, t:c.totais}));
  }
  const linhaGeral = p => `
              <tr>
                <td class="perf-unidade">${escHtml(p.rotulo)}</td>
                <td class="perf-entregue">${p.t.entregue}</td>
                <td class="perf-noprazo">${p.t.noPrazoEnt}</td>
                <td class="perf-foraprazo">${p.t.foraDoPrazo}</td>
                <td class="perf-cliente">${p.t.atrasCli}</td>
                <td class="perf-transp">${p.t.atrasTrans}</td>
                <td class="${slaClass(p.t.sla)}">${fmtPct(p.t.sla)}</td>
                <td class="perf-previstas">${p.t.exped}</td>
                <td class="perf-abertoatraso">${p.t.abertoAtrasado || ""}</td>
                <td class="perf-abertonoprazo">${p.t.abertoNoPrazo}</td>
                <td class="perf-total">${p.t.total}</td>
              </tr>`;
  const geral = `
    <div class="panel geral-panel" id="focalGeralPanel" style="margin-top:22px;">
      <div class="panel-header" style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
        <span>${G.temDados ? "3 · " : ""}Geral ${escHtml(nomeCurto)} — unidades + pagadora</span>
        <span style="display:flex; align-items:center; gap:10px;">
          <button type="button" class="btn btn-ghost btn-sm" id="focalExportBtn" title="Baixar as tabelas deste SAC (unidades, pagadora e geral) em Excel (.xlsx) com as mesmas cores">Exportar Excel</button>
        </span>
      </div>
      <div class="geral-resumo">
        <div class="geral-chip geral-chip-sla" style="${slaBadgeStyle(totais.sla)}"><span>SLA GERAL</span><strong>${fmtPct(totais.sla)}</strong></div>
        <div class="geral-chip"><span>ENTREGUE</span><strong>${fmtInt(totais.entregue)}</strong></div>
        <div class="geral-chip"><span>FORA DO PRAZO</span><strong>${fmtInt(totais.foraDoPrazo)}</strong></div>
        <div class="geral-chip geral-chip-fat"><span>FATURAMENTO</span><strong>${fat.temDados ? fmtMoeda(fat.total) : "—"}</strong>${fatPct ? `<em>${fatPct}</em>` : ""}</div>
      </div>
      <div class="table-wrap perf-table-wrap">
        <table class="perf-table perf-table-full" id="focalGeralTabela">
          <thead><tr>
            <th class="th-unidade">Origem</th><th class="th-entregue">Entregue</th><th class="th-noprazo">No Prazo</th><th class="th-foraprazo">Fora Do Prazo</th><th class="th-cliente">Cliente</th><th class="th-transp">Transportadora</th><th class="th-sla">SLA</th><th class="th-previstas">Entregas Previstas</th><th class="th-abertoatraso">Aberto Atrasado</th><th class="th-abertonoprazo">Aberto No Prazo</th><th class="th-total">Total</th>
          </tr></thead>
          <tbody>
            ${partesGeral.length ? partesGeral.map(linhaGeral).join("") : `<tr class="placeholder-row"><td class="perf-unidade">${escHtml(nomeCurto)}</td><td colspan="10">Ainda sem dados importados</td></tr>`}
          </tbody>
          <tfoot>
            <tr class="perf-total-row">
              <td>TOTAL GERAL ${escHtml(nomeCurto)}</td>
              <td>${totais.entregue}</td><td>${totais.noPrazoEnt}</td><td>${totais.foraDoPrazo}</td><td>${totais.atrasCli}</td><td>${totais.atrasTrans}</td><td>${fmtPct(totais.sla)}</td>
              <td>${totais.exped}</td><td>${totais.abertoAtrasado || ""}</td><td>${totais.abertoNoPrazo}</td><td>${totais.total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div class="footer-note">${G.temDados ? "Soma de tudo do " + escHtml(nomeCurto) + " (unidades + pagadora). Vai para o fechamento." + (fat.temDados ? " Faturamento pelo focal: " + fmtMoeda(fat.total) + (fatPct ? " — " + fatPct : "") + "." : "") : "Ainda sem dados importados para o " + escHtml(nomeCurto) + "."}</div>
    </div>`;

  return kpis + tabelaUnidades + clientesPremiumHTML(focal) + geral;
}

/* ================= CONTROLE DE ENTREGAS (CSV) ================= */
const REMETENTES_DESEJADOS = ["TEC E ARM MIGUEL BARTOLOMEU", "TECIDOS E ARMARINHOS MIGUEL BA"];

function entregasHTML(){
  return `
    <h2 class="section-title">Controle de Entregas</h2>
    <p class="section-desc">Importe o arquivo CSV de CTRCs expedidos e recebidos (.csv / .sswweb). Todas as linhas do arquivo são exibidas. Reimportar atualiza os registros já cadastrados (pelo Série/Número CTRC) e adiciona os novos.</p>

    <div class="panel">
      <div class="panel-header">Importar arquivo</div>
      <form class="add-form" id="formEntregasArquivo">
        <div class="field"><label>Arquivo (.csv / .sswweb / .txt)</label><input type="file" id="entregasArquivoInput" accept=".csv,.sswweb,.txt,text/plain"></div>
        <div class="field" style="max-width:200px;">
          <button type="submit" class="btn btn-primary">Processar arquivo</button>
        </div>
        <div class="field full">
          <button type="button" class="link-btn" id="toggleEntregasColarTexto">ou colar o texto manualmente</button>
        </div>
      </form>
      <div id="entregasColarTextoWrap" style="display:none; padding:0 18px 16px;">
        <textarea id="entregasTextoManual" rows="6" style="width:100%; font-family:monospace; font-size:11.5px; padding:8px; border:1px solid var(--line); border-radius:6px;" placeholder="Cole aqui o conteúdo do arquivo..."></textarea>
        <div style="margin-top:8px;"><button type="button" class="btn btn-ghost btn-sm" id="processarEntregasTextoManual">Processar texto colado</button></div>
      </div>
      <div class="footer-note" id="entregasImportStatus"></div>
    </div>

    <div class="panel" id="entregasTablePanel">
      <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <span>Entregas</span>
        <div class="toolbar-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="entregasExportBtn" title="Baixar esta tabela em Excel (.xlsx), respeitando os filtros aplicados">Exportar Excel</button>
        </div>
      </div>
      <div class="ent-filtros">
        <div class="ent-filtro">
          <label for="entregasBusca">Documento</label>
          <input type="text" id="entregasBusca" placeholder="Série/Número CTRC ou Nota Fiscal" autocomplete="off">
        </div>
        <div class="ent-filtro">
          <label>Unidade Receptora</label>
          <div class="multiselect" id="msEntUnidRec">
            <button type="button" class="multiselect-btn" id="msEntUnidRecBtn">Todas</button>
            <div class="multiselect-panel" id="msEntUnidRecPanel"></div>
          </div>
        </div>
        <div class="ent-filtro">
          <label>Pagador</label>
          <div class="multiselect" id="msEntPagador">
            <button type="button" class="multiselect-btn" id="msEntPagadorBtn">Todos</button>
            <div class="multiselect-panel" id="msEntPagadorPanel"></div>
          </div>
        </div>
        <div class="ent-filtro">
          <label>Unidade</label>
          <div class="multiselect" id="msEntUnidade">
            <button type="button" class="multiselect-btn" id="msEntUnidadeBtn">Todas</button>
            <div class="multiselect-panel" id="msEntUnidadePanel"></div>
          </div>
        </div>
        <div class="ent-filtro ent-filtro-acoes">
          <button type="button" class="btn btn-ghost btn-sm" id="limparFiltrosEntregas">Limpar filtros</button>
        </div>
      </div>
      <div class="ent-contagem-row"><span class="footer-note" id="entregasContagem"></span><button type="button" class="link-btn danger" id="limparEntregas">Limpar todas as entregas importadas</button></div>
      <div class="table-wrap" id="entregasTableWrap"></div>
    </div>
  `;
}

function parseEntregasCsv(text){
  text = text.replace(/\r\n/g, "\n").replace(/\uFFFD/g, " ");
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  if(lines.length < 2) return {periodo:"", rows:[]};

  const periodoMatch = lines[0].match(/PERIODO:\s*([\d/]+)\s*A\s*([\d/]+)/i);
  const periodo = periodoMatch ? `${periodoMatch[1]} a ${periodoMatch[2]}` : "";

  const headerLine = lines.find(l => l.startsWith("1;"));
  if(!headerLine) return {periodo, rows: []};
  const headers = headerLine.split(";").map(h => h.trim());
  const colIndex = (name) => headers.indexOf(name);

  const idx = {
    ctrc: colIndex("CTRC/SUBCON"),
    emissao: colIndex("EMISSAO"),
    remetente: colIndex("NOME REMETENTE"),
    destinatario: colIndex("NOME DESTINATARIO"),
    praca: colIndex("PRACA"),
    cidadeDestino: colIndex("CIDADE DESTINO"),
    nfiscal: colIndex("NFISCAL"),
    ultimaOcorrencia: colIndex("ULTIMA OCORRENC"),
    dataPrevEntrega: colIndex("DATA PREV ENTREGA")
  };

  const rows = [];
  lines.forEach(l => {
    if(!l.startsWith("3;")) return;
    const parts = l.split(";");
    const get = (i) => (i>=0 && i<parts.length ? parts[i].trim() : "");
    rows.push({
      ctrc: get(idx.ctrc), emissao: get(idx.emissao), remetente: get(idx.remetente),
      destinatario: get(idx.destinatario), praca: get(idx.praca), cidadeDestino: get(idx.cidadeDestino),
      nfiscal: get(idx.nfiscal), ultimaOcorrencia: get(idx.ultimaOcorrencia), dataPrevEntrega: get(idx.dataPrevEntrega)
    });
  });
  return {periodo, rows};
}

function filtraRemetentesDesejados(rows){
  const set = new Set(REMETENTES_DESEJADOS.map(r=>r.toUpperCase()));
  return rows.filter(r => set.has((r.remetente||"").toUpperCase()));
}

function readFileAsLatin1(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler o arquivo"));
    reader.readAsText(file, "ISO-8859-1");
  });
}

/* Leitor do arquivo "CTRCs EXPEDIDOS E RECEBIDOS" (SSW). Formato: linha 0 = título/período,
   linha 1 = cabeçalho (começa com "1;"), linhas de dados começam com "2;", última linha "9;".
   As colunas são localizadas pelo NOME do cabeçalho (sem acento/maiúsculas), não pela posição. */
const ENTREGAS_COLUNAS = {
  ctrc:             ["SERIE/NUMERO CTRC"],
  notasFiscais:     ["NOTAS FISCAIS"],
  pagador:          ["CLIENTE PAGADOR"],
  cnpjPagador:      ["CNPJ PAGADOR"],
  destinatario:     ["CLIENTE DESTINATARIO"],
  cidade:           ["CIDADE DE ENTREGA"],
  uf:               ["UF DE ENTREGA"],
  unidadeReceptora: ["UNIDADE RECEPTORA"],
  codOcorrencia:    ["CODIGO DA ULTIMA OCORRENCIA"],
  complemento:      ["COMPLEMENTO DA ULTIMA OCORRENCIA"],
  previsao:         ["PREVISAO DE ENTREGA"],
  unidade:          ["UNIDADE DA ULTIMA OCORRENCIA"]
};

// Colunas mostradas na tela e no Excel, na ordem pedida.
const ENTREGAS_COLUNAS_EXIBICAO = [
  {campo:"ctrc",             titulo:"Série/Número CTRC"},
  {campo:"notasFiscais",     titulo:"Notas Fiscais"},
  {campo:"pagador",          titulo:"Cliente Pagador"},
  {campo:"cnpjPagador",      titulo:"CNPJ Pagador", exibir:formatarCnpjExibicao},
  {campo:"destinatario",     titulo:"Cliente Destinatário"},
  {campo:"cidade",           titulo:"Cidade de Entrega"},
  {campo:"uf",               titulo:"UF de Entrega", centro:true},
  {campo:"unidadeReceptora", titulo:"Unidade Receptora", centro:true},
  {campo:"codOcorrencia",    titulo:"Código da Última Ocorrência", centro:true},
  {campo:"complemento",      titulo:"Complemento da Última Ocorrência"},
  {campo:"previsao",         titulo:"Previsão de Entrega", centro:true}
];

const KEY_CONTROLE_ENTREGAS = "tambasa_controle_entregas";
const entNorm = s => String(s == null ? "" : s).replace(/\u00a0/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

// Notas Fiscais: descarta a série (tudo que vem antes da barra). "1/856074" -> "856074";
// "1/1911136, 1/1911133" -> "1911136, 1911133". Idempotente (pode rodar de novo sem efeito).
function limparNotasFiscais(v){
  return String(v == null ? "" : v).replace(/\u00a0/g, " ").split(/[,;]+/)
    .map(t => t.trim().replace(/^.*\//, "").trim()).filter(Boolean).join(", ");
}

function parseControleEntregas(text){
  text = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\uFFFD/g, " ");
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  const periodoMatch = (lines[0] || "").match(/PERIODO[^:]*:\s*([\d/]+)\s*A\s*([\d/]+)/i);
  const periodo = periodoMatch ? `${periodoMatch[1]} a ${periodoMatch[2]}` : "";

  const headerLine = lines.find(l => l.startsWith("1;"));
  if(!headerLine) return {periodo, rows:[], totalArquivo:0};
  const headers = headerLine.split(";").map(entNorm);
  const idx = {};
  Object.keys(ENTREGAS_COLUNAS).forEach(campo => {
    idx[campo] = -1;
    for(const n of ENTREGAS_COLUNAS[campo]){ const i = headers.indexOf(n); if(i !== -1){ idx[campo] = i; break; } }
  });
  if(idx.ctrc === -1) return {periodo, rows:[], totalArquivo:0};

  const rows = [];
  lines.forEach(l => {
    if(!l.startsWith("2;")) return;
    const parts = l.split(";");
    const get = campo => (idx[campo] >= 0 && idx[campo] < parts.length) ? limparCelulaOcorrencia(parts[idx[campo]]) : "";
    const r = {};
    Object.keys(ENTREGAS_COLUNAS).forEach(campo => { r[campo] = get(campo); });
    r.notasFiscais = limparNotasFiscais(r.notasFiscais);
    if(r.ctrc) rows.push(r);
  });
  return {periodo, rows, totalArquivo: rows.length};
}

function carregarControleEntregas(){
  try{
    const l = JSON.parse(localStorage.getItem(KEY_CONTROLE_ENTREGAS) || "[]") || [];
    l.forEach(e => { e.notasFiscais = limparNotasFiscais(e.notasFiscais); });   // corrige também dados já salvos
    return l;
  }catch(e){ return []; }
}

// Importa e faz upsert por Série/Número CTRC (mantém o histórico entre importações).
function importControleEntregas(parsed){
  const porCtrc = new Map(carregarControleEntregas().map(e => [e.ctrc, e]));
  let novos = 0, atualizados = 0;
  parsed.rows.forEach(r => {
    if(porCtrc.has(r.ctrc)) atualizados++; else novos++;
    porCtrc.set(r.ctrc, r);
  });
  localStorage.setItem(KEY_CONTROLE_ENTREGAS, JSON.stringify(Array.from(porCtrc.values())));
  return {totalArquivo: parsed.totalArquivo, novos, atualizados, total: porCtrc.size};
}

function attachEntregasEvents(){
  const form = document.getElementById("formEntregasArquivo");
  const statusEl = document.getElementById("entregasImportStatus");

  function processar(text, origemVazia){
    const parsed = parseControleEntregas(text);
    if(parsed.rows.length === 0){
      statusEl.textContent = origemVazia;
      return false;
    }
    try{
      const r = importControleEntregas(parsed);
      statusEl.textContent = `Período ${parsed.periodo || "-"}: ${r.totalArquivo} linha(s) no arquivo — ${r.novos} nova(s), ${r.atualizados} atualizada(s). Total cadastrado: ${r.total}.`;
    }catch(err){
      console.error("Erro ao salvar entregas:", err);
      statusEl.textContent = "Não foi possível salvar os dados (" + (err.message || err) + "). O armazenamento do navegador pode estar cheio.";
      return false;
    }
    refreshEntregasView();
    return true;
  }

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const fileInput = document.getElementById("entregasArquivoInput");
    const file = fileInput.files[0];
    if(!file){ statusEl.textContent = "Selecione o arquivo."; return; }
    try{
      const text = await readFileAsLatin1(file);
      if(processar(text, "Não encontrei linhas de dados nesse arquivo. Confira se é o arquivo certo.")) fileInput.value = "";
    }catch(err){
      console.error("Erro ao importar entregas:", err);
      statusEl.textContent = "Não foi possível ler esse arquivo (" + (err.message||err) + "). Tente colar o texto manualmente.";
    }
  });

  document.getElementById("toggleEntregasColarTexto").addEventListener("click", ()=>{
    const wrap = document.getElementById("entregasColarTextoWrap");
    wrap.style.display = wrap.style.display === "none" ? "block" : "none";
  });

  document.getElementById("processarEntregasTextoManual").addEventListener("click", ()=>{
    const ta = document.getElementById("entregasTextoManual");
    if(!ta.value.trim()){ statusEl.textContent = "Cole o texto antes de processar."; return; }
    if(processar(ta.value, "Não encontrei linhas de dados nesse texto.")) ta.value = "";
  });

  document.getElementById("limparEntregas").addEventListener("click", ()=>{
    if(!confirm("Remover todas as entregas importadas?")) return;
    localStorage.setItem(KEY_CONTROLE_ENTREGAS, "[]");
    refreshEntregasView();
  });

  document.getElementById("entregasBusca").addEventListener("input", renderEntregasTable);
  document.getElementById("limparFiltrosEntregas").addEventListener("click", ()=>{
    document.getElementById("entregasBusca").value = "";
    entregasSelUnidRec = []; entregasSelPagador = []; entregasSelUnidade = [];
    refreshEntregasView();
  });
  document.getElementById("entregasExportBtn").addEventListener("click", exportarEntregasExcel);

  refreshEntregasView();
}

// Seleções atuais dos filtros de múltipla escolha (vazio = "Todas")
let entregasSelUnidRec = [];
let entregasSelPagador = [];
let entregasSelUnidade = [];

function closeMultiSelect(panelId){
  const panel = document.getElementById(panelId);
  if(panel) panel.classList.remove("open");
}

// Todo filtro de múltipla escolha criado por buildMultiSelect se registra
// aqui — assim o fechamento ao clicar fora e o fechamento dos "irmãos" ao
// abrir um novo funcionam pra QUALQUER filtro do site (atual ou futuro),
// sem precisar listar os IDs na mão toda vez que uma aba nova cria um filtro
// (foi exatamente esquecer de listar msOcorFocal/msOcorUnidade aqui que
// deixava os dois painéis abertos ao mesmo tempo, tampando a tabela).
const MULTISELECT_PAINEIS_REGISTRADOS = new Set();

document.addEventListener("click", (e)=>{
  MULTISELECT_PAINEIS_REGISTRADOS.forEach(panelId => {
    const wrapperId = panelId.replace(/Panel$/, "");
    if(!e.target.closest("#" + wrapperId)) closeMultiSelect(panelId);
  });
});

// Monta um filtro de múltipla escolha (checkboxes) reutilizável: botão que
// mostra o resumo da seleção + painel com as opções disponíveis nos dados.
function buildMultiSelect({btnId, panelId, options, selected, allLabel, onChange, searchable}){
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  if(!btn || !panel) return;
  MULTISELECT_PAINEIS_REGISTRADOS.add(panelId);

  btn.textContent = selected.length === 0
    ? allLabel
    : (selected.length === 1 ? selected[0] : `${selected.length} selecionadas`);
  btn.title = selected.join(", ");

  const searchBoxHtml = searchable ? `<input type="text" class="multiselect-search" placeholder="Buscar...">` : "";
  panel.innerHTML = `
    ${searchBoxHtml}
    <label class="multiselect-option multiselect-all">
      <input type="checkbox" data-all="1" ${selected.length===0?"checked":""}> <strong>${allLabel}</strong>
    </label>
    ${options.map(o => `
      <label class="multiselect-option" data-value="${o.replace(/"/g,'&quot;')}">
        <input type="checkbox" value="${o.replace(/"/g,'&quot;')}" ${selected.includes(o)?"checked":""}>
        <span>${o.length>70 ? o.slice(0,70)+"…" : o}</span>
      </label>
    `).join("")}
  `;

  btn.onclick = (e)=>{
    e.stopPropagation();
    const isOpen = panel.classList.contains("open");
    MULTISELECT_PAINEIS_REGISTRADOS.forEach(id => closeMultiSelect(id));
    if(!isOpen) panel.classList.add("open");
  };

  panel.querySelector('[data-all="1"]').addEventListener("change", (e)=>{
    if(e.target.checked) selected.splice(0, selected.length);
    onChange();
  });

  panel.querySelectorAll('input[type="checkbox"]:not([data-all])').forEach(cb=>{
    cb.addEventListener("change", ()=>{
      const v = cb.value;
      const i = selected.indexOf(v);
      if(cb.checked && i === -1) selected.push(v);
      if(!cb.checked && i !== -1) selected.splice(i, 1);
      onChange();
    });
  });

  if(searchable){
    panel.querySelector(".multiselect-search").addEventListener("click", e=> e.stopPropagation());
    panel.querySelector(".multiselect-search").addEventListener("input", (e)=>{
      const q = e.target.value.trim().toUpperCase();
      panel.querySelectorAll(".multiselect-option:not(.multiselect-all)").forEach(opt=>{
        opt.style.display = opt.dataset.value.toUpperCase().includes(q) ? "flex" : "none";
      });
    });
  }
}

// Reconstroi os filtros com base nos valores que existem nos dados e re-renderiza a tabela.
function refreshEntregasView(){
  const list = carregarControleEntregas();
  const opcoes = campo => [...new Set(list.map(e => e[campo]).filter(Boolean))].sort((a,b)=> a.localeCompare(b, "pt-BR"));

  const unidsRec = opcoes("unidadeReceptora");
  entregasSelUnidRec = entregasSelUnidRec.filter(v => unidsRec.includes(v));
  buildMultiSelect({
    btnId:"msEntUnidRecBtn", panelId:"msEntUnidRecPanel", options:unidsRec, selected:entregasSelUnidRec,
    allLabel:"Todas", onChange:()=>{ refreshEntregasView(); }, searchable:true
  });

  const pagadores = opcoes("pagador");
  entregasSelPagador = entregasSelPagador.filter(v => pagadores.includes(v));
  buildMultiSelect({
    btnId:"msEntPagadorBtn", panelId:"msEntPagadorPanel", options:pagadores, selected:entregasSelPagador,
    allLabel:"Todos", onChange:()=>{ refreshEntregasView(); }, searchable:true
  });

  const unidades = opcoes("unidade");
  entregasSelUnidade = entregasSelUnidade.filter(v => unidades.includes(v));
  buildMultiSelect({
    btnId:"msEntUnidadeBtn", panelId:"msEntUnidadePanel", options:unidades, selected:entregasSelUnidade,
    allLabel:"Todas", onChange:()=>{ refreshEntregasView(); }, searchable:true
  });

  renderEntregasTable();
}

// Aplica os filtros da tela (Documento, Unidade Receptora, Pagador, Unidade) e ordena por previsão de entrega.
function entregasFiltradas(){
  let list = carregarControleEntregas();
  const busca = entNorm(document.getElementById("entregasBusca")?.value || "");
  if(busca) list = list.filter(e => entNorm(e.ctrc).includes(busca) || entNorm(e.notasFiscais).includes(busca));
  if(entregasSelUnidRec.length) list = list.filter(e => entregasSelUnidRec.includes(e.unidadeReceptora));
  if(entregasSelPagador.length) list = list.filter(e => entregasSelPagador.includes(e.pagador));
  if(entregasSelUnidade.length) list = list.filter(e => entregasSelUnidade.includes(e.unidade));
  const chave = e => brDateToISO(e.previsao) || "9999-99-99";
  return list.slice().sort((a,b)=> chave(a).localeCompare(chave(b)) || (a.ctrc||"").localeCompare(b.ctrc||""));
}

function entregasTextoCelula(e, c){
  const bruto = e[c.campo] || "";
  return c.exibir ? c.exibir(bruto) : (bruto || "-");
}

function renderEntregasTable(){
  const wrap = document.getElementById("entregasTableWrap");
  if(!wrap) return;
  const total = carregarControleEntregas().length;
  const list = entregasFiltradas();
  const contagem = document.getElementById("entregasContagem");
  if(contagem) contagem.textContent = total ? `Exibindo ${list.length} de ${total} entrega(s).` : "";

  if(list.length === 0){
    wrap.innerHTML = `<div class="empty">${total ? "Nenhuma entrega encontrada para esse filtro." : "Nenhuma entrega importada ainda."}</div>`;
    return;
  }
  wrap.innerHTML = `
    <table id="entregasTable">
      <thead><tr>${ENTREGAS_COLUNAS_EXIBICAO.map(c => `<th>${escHtml(c.titulo)}</th>`).join("")}</tr></thead>
      <tbody>
        ${list.map(e => `<tr>${ENTREGAS_COLUNAS_EXIBICAO.map(c =>
          `<td style="${c.campo==="complemento" || c.campo==="pagador" || c.campo==="destinatario" ? "max-width:260px; white-space:normal;" : (c.campo==="notasFiscais" ? "min-width:110px; max-width:200px; white-space:normal; word-break:break-word;" : "")}${c.centro ? " text-align:center;" : ""}">${escHtml(entregasTextoCelula(e, c))}</td>`
        ).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
}

// Exporta para Excel no mesmo padrão de Ocorrências / Documentos em Atraso
// (exportar-ocorrencias.js), em uma única planilha geral, respeitando os filtros da tela.
async function exportarEntregasExcel(){
  const list = entregasFiltradas();
  if(list.length === 0){ alert("Não há entregas para exportar com esse filtro."); return; }

  const colunas = ENTREGAS_COLUNAS_EXIBICAO.map(c => ({titulo:c.titulo, tipo:c.centro ? "centro" : "texto"}));
  const grupos = [{
    focal: "Entregas",
    subtitulo: `${list.length} entrega(s)`,
    linhas: list.map(e => ENTREGAS_COLUNAS_EXIBICAO.map(c => c.campo === "cnpjPagador" ? formatarCnpjExibicao(e.cnpjPagador || "").replace(/^-$/, "") : (e[c.campo] || "")))
  }];

  const filtros = [];
  const busca = (document.getElementById("entregasBusca").value || "").trim();
  if(busca) filtros.push(`Documento: "${busca}"`);
  if(entregasSelUnidRec.length) filtros.push(`Unidade Receptora: ${entregasSelUnidRec.join(", ")}`);
  if(entregasSelPagador.length) filtros.push(`Pagador: ${entregasSelPagador.join(", ")}`);
  if(entregasSelUnidade.length) filtros.push(`Unidade: ${entregasSelUnidade.join(", ")}`);

  await exportarOcorrenciasPorFocal({
    titulo: "CONTROLE DE ENTREGAS",
    rotuloItem: "entrega(s)",
    semResumo: true,
    filtroTexto: filtros.length ? "Filtro aplicado — " + filtros.join("  •  ") : "Sem filtros: todas as entregas importadas.",
    rodape: "",
    colunas, grupos
  }, `Controle_de_Entregas_${dataParaArquivo()}.xlsx`);
}

/* ================= OCORRÊNCIAS (código 69 — Entrega Realizada com Ressalva) =================
   Lê o relatório de ocorrências do SSW (.sswweb / .csv), identifica as linhas
   do(s) código(s) suportado(s) (ver OCORRENCIAS_CODIGOS_SUPORTADOS), define o
   focal responsável (regra PAGADOR > UNIDADE, ver definirFocalOcorrencia) e
   organiza tudo na tabela abaixo. Integra com "Controle de Entregas" porque
   usa a MESMA fonte de dados (relatório do SSW) e a MESMA estrutura de Focais
   — sem lógica duplicada. */

// Cada campo aceita mais de um nome de cabeçalho possível, pra aguentar
// pequenas variações entre exportações do SSW sem quebrar o import.
const OCORRENCIAS_COLUNAS = {
  ctrc:          ["CTRC"],
  remetente:     ["NOME REMETENTE"],
  pagador:       ["NOME PAGADOR"],
  cnpjPagador:   ["CNPJ PAGADOR", "CNPJ_PAGADOR", "CGC PAGADOR", "CGCPAGADOR", "CNPJ/CPF PAGADOR", "CPF/CNPJ PAGADOR", "CNPJ CPF PAGADOR"],
  destino:       ["DESTINO"],
  valMercad:     ["VALMERCAD"],
  valFrete:      ["VALFRETE"],
  comple:        ["COMPLE ULT OCORRENCIA"],
  ultOcor:       ["ULTIMA OCORRENCIA"],
  pendencia:     ["DESCRICAO ULT OCOR PENDENCIA"],
  ocorCodigo:    ["OCOR BUSCA"],
  codUltOcor:    ["COD ULT OCOR"],
  ocorDescricao: ["DESCRICAO OCOR  BUSCA", "DESCRICAO OCOR BUSCA"],
  dominio:       ["DOMINIO"],
  unidade:       ["UNIDADE"],
  nf:            ["NRO NF", "NUMERO NF", "NRO. NF", "NF"],
  destinatario:  ["NOME DESTINATARIO"]
};

// Modelo de colunas combinado para a tela e para o Excel desta aba (só código
// 69). Mexer aqui muda as duas coisas juntas — não duplica lista em outro
// lugar. "campo" é a chave do objeto de ocorrência (ver parseOcorrenciasSsw);
// "formatar" (opcional) transforma o valor bruto antes de mostrar.
function formatarValorOcorrencia(v){
  if(!v) return "-";
  return "R$ " + money(numeroOcorrenciaBR(v));
}
// Exibe o CNPJ com máscara (00.000.000/0000-00) quando tiver os 14 dígitos;
// senão mostra como veio (CPF ou valor incompleto).
function formatarCnpjExibicao(v){
  const d = normalizarCnpj(v);
  if(d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return v || "-";
}
const OCORRENCIAS_COLUNAS_EXIBICAO = [
  {campo:"ctrc",         titulo:"CTRC"},
  {campo:"remetente",    titulo:"Nome Remetente"},
  {campo:"pagador",      titulo:"Nome Pagador"},
  {campo:"cnpjPagador",  titulo:"CNPJ Pagador", exibir:formatarCnpjExibicao},
  {campo:"valFrete",     titulo:"Valfrete",  formatar:formatarValorOcorrencia},
  {campo:"valMercad",    titulo:"Valmercad", formatar:formatarValorOcorrencia},
  {campo:"ocor",         titulo:"Cod Ult Ocor"},
  {campo:"nf",           titulo:"Nro NF"},
  {campo:"destinatario", titulo:"Nome Destinatário"},
  {campo:"unidade",      titulo:"Unidade"},
  {campo:"origem",       titulo:"Sistema"}
];

function limparCelulaOcorrencia(s){
  return String(s == null ? "" : s).replace(/\u00a0/g, " ").trim();
}

// Lê o arquivo (cabeçalho na 1ª linha, separado por ";") e devolve TODAS as
// linhas já convertidas — o filtro pelo(s) código(s) suportado(s) é feito à
// parte em filtrarOcorrenciasSuportadas, pra podermos avisar o usuário
// quantas linhas do arquivo eram de outros códigos (ainda não suportados).
function parseOcorrenciasSsw(text){
  text = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const linhas = text.split("\n").filter(l => l.trim().length > 0);
  if(linhas.length < 2) return {rows: [], totalArquivo: 0};

  const headers = linhas[0].split(";").map(h => limparCelulaOcorrencia(h).toUpperCase());
  const idxPor = (nomes) => {
    for(const n of nomes){
      const i = headers.indexOf(n);
      if(i !== -1) return i;
    }
    return -1;
  };
  const idx = {};
  Object.keys(OCORRENCIAS_COLUNAS).forEach(campo => { idx[campo] = idxPor(OCORRENCIAS_COLUNAS[campo]); });

  if(idx.ctrc === -1) return {rows: [], totalArquivo: 0}; // não parece o arquivo certo

  const rows = [];
  for(let i = 1; i < linhas.length; i++){
    const parts = linhas[i].split(";");
    if(parts.length < 2) continue;
    const get = (campo) => (idx[campo] >= 0 && idx[campo] < parts.length) ? limparCelulaOcorrencia(parts[idx[campo]]) : "";

    const ctrc = get("ctrc");
    if(!ctrc) continue;

    rows.push({
      ctrc,
      remetente: get("remetente"),
      pagador: get("pagador"),
      cnpjPagador: get("cnpjPagador"),
      destino: get("destino"),
      valMercad: get("valMercad"),
      valFrete: get("valFrete"),
      comple: get("comple"),
      ultOcor: get("ultOcor"),
      pendencia: get("pendencia"),
      ocor: get("ocorCodigo") || get("codUltOcor"),
      busca: get("ocorDescricao"),
      dominio: get("dominio"),
      unidade: get("unidade"),
      nf: get("nf"),
      destinatario: get("destinatario")
    });
  }
  return {rows, totalArquivo: rows.length};
}

function filtrarOcorrenciasSuportadas(rows){
  return rows.filter(r => OCORRENCIAS_CODIGOS_SUPORTADOS.includes(String(r.ocor || "").trim()));
}

// Importa e faz upsert por CTRC (mesmo padrão do Controle de Entregas):
// atualiza as ocorrências já cadastradas e adiciona as novas, recalculando o
// focal responsável a cada importação.
function importOcorrencias(parsed, origem){
  const suportadas = filtrarOcorrenciasSuportadas(parsed.rows);
  const existentes = load(KEYS.ocorrencias);
  const porCtrc = new Map(existentes.map(o => [o.ctrc, o]));
  let novos = 0, atualizados = 0;
  suportadas.forEach(r => {
    const focal = definirFocalOcorrencia(r.pagador, r.unidade, r.cnpjPagador);
    const item = {...r, focal: focal.titulo, focalOrigem: focal.origem, origem: origem || r.origem || ""};
    if(porCtrc.has(r.ctrc)){
      Object.assign(porCtrc.get(r.ctrc), item);
      atualizados++;
    } else {
      porCtrc.set(r.ctrc, {id: uid(), ...item});
      novos++;
    }
  });
  save(KEYS.ocorrencias, Array.from(porCtrc.values()));
  return {
    totalArquivo: parsed.rows.length,
    suportadas: suportadas.length,
    ignoradas: parsed.rows.length - suportadas.length,
    novos, atualizados
  };
}

/* Bloco de importação genérico (usado 2x em Ocorrências-69 e 2x em
   Atrasos-150) — um painel por sistema, porque VAL (Rede Do Valle) e RVA
   (Real Vale) são relatórios separados no SSW. As duas importações caem na
   MESMA lista (upsert por CTRC em importOcorrencias/importAtrasos), então
   importar os dois arquivos "junta" os dados automaticamente, sem duplicar. */
function blocoImportacaoDocumentoHTML(cfg){
  return `
    <div class="panel">
      <div class="panel-header">${cfg.titulo}</div>
      <form class="add-form" id="${cfg.formId}">
        <div class="field"><label>Arquivo (.sswweb / .csv / .txt)</label><input type="file" id="${cfg.inputId}" accept=".sswweb,.csv,.txt,text/plain"></div>
        <div class="field" style="max-width:200px;">
          <button type="submit" class="btn btn-primary">Processar arquivo</button>
        </div>
        <div class="field full">
          <button type="button" class="link-btn" id="${cfg.toggleId}">ou colar o texto manualmente</button>
        </div>
      </form>
      <div id="${cfg.wrapId}" style="display:none; padding:0 18px 16px;">
        <textarea id="${cfg.textareaId}" rows="6" style="width:100%; font-family:monospace; font-size:11.5px; padding:8px; border:1px solid var(--line); border-radius:6px;" placeholder="Cole aqui o conteúdo do arquivo..."></textarea>
        <div style="margin-top:8px;"><button type="button" class="btn btn-ghost btn-sm" id="${cfg.processarId}">Processar texto colado</button></div>
      </div>
      <div class="footer-note" id="${cfg.statusId}"></div>
    </div>
  `;
}

// cfg: {formId, inputId, toggleId, wrapId, textareaId, processarId, statusId,
// nomeFonte ("VAL"/"RVA"), parseFn(text), importFn(parsed, origem), relatarFn(result, statusEl), refreshFn}
function wireImportacaoDocumento(cfg){
  const form = document.getElementById(cfg.formId);
  const statusEl = document.getElementById(cfg.statusId);
  if(!form || !statusEl) return;

  function processar(text){
    const parsed = cfg.parseFn(text);
    const result = cfg.importFn(parsed, cfg.nomeFonte);
    cfg.relatarFn(result, statusEl);
    cfg.refreshFn();
  }

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const fileInput = document.getElementById(cfg.inputId);
    const file = fileInput.files && fileInput.files[0];
    if(!file){ statusEl.textContent = "Escolha um arquivo antes de processar."; return; }
    try{
      const text = await readFileAsLatin1(file);
      processar(text);
      fileInput.value = "";
    }catch(err){
      console.error("Erro ao importar ("+cfg.nomeFonte+"):", err);
      statusEl.textContent = "Não foi possível ler esse arquivo.";
    }
  });

  document.getElementById(cfg.toggleId).addEventListener("click", ()=>{
    const w = document.getElementById(cfg.wrapId);
    w.style.display = w.style.display === "none" ? "block" : "none";
  });
  document.getElementById(cfg.processarId).addEventListener("click", ()=>{
    const textarea = document.getElementById(cfg.textareaId);
    const text = textarea.value;
    if(!text.trim()) return;
    processar(text);
    textarea.value = "";
  });
}

/* ================= CADASTRO DE CNPJ — TELA (dentro de Ocorrências) =======
   Editável: cadastrar, alterar e excluir CNPJ -> Sigla/Grupo. Usado pela
   regra CNPJ > Pagador > Unidade tanto nas Ocorrências (69) quanto nos
   Documentos em Atraso (150) — por isso fica visível nas duas, no topo da
   tela, e qualquer alteração recalcula o focal dos documentos já
   importados na hora (recalcularFocalComCadastroCnpj). */
function cnpjCadastroSecaoHTML(){
  return `
    <div class="panel" id="cnpjCadastroPanel">
      <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <span>Cadastro de CNPJ — Pagador / Grupo</span>
        <button type="button" class="btn btn-ghost btn-sm" id="cnpjCadastroToggleBtn">Mostrar / ocultar</button>
      </div>
      <div id="cnpjCadastroCorpo" style="display:none;">
        <p class="section-desc">O sistema identifica o pagador <strong>primeiro pelo CNPJ</strong> — mesmo que o nome venha diferente ou abreviado no relatório do SSW. Se o CNPJ não estiver cadastrado aqui, o sistema tenta pelo nome do pagador e, por último, pela unidade. Cadastre abaixo o CNPJ e a <strong>sigla</strong> do Focal/unidade correspondente (a mesma sigla usada em Confirmação de Filiais, ex.: EGO, TLC, RIT, USE, IVC, CW3, AL2, NWF, TNG, TOP, SPR...).</p>
        <div id="cnpjCadastroPendentesWrap"></div>
        <form class="add-form" id="formCnpjCadastro">
          <input type="hidden" id="cnpjCadastroEditId" value="">
          <div class="field"><label>CNPJ / CPF</label><input type="text" id="cnpjCadastroCnpjInput" placeholder="Ex: 38.475.768/0001-94"></div>
          <div class="field"><label>Nome / Grupo</label><input type="text" id="cnpjCadastroNomeInput" placeholder="Ex: Expresso Goiás e Logística"></div>
          <div class="field" style="max-width:160px;"><label>Sigla</label><input type="text" id="cnpjCadastroSiglaInput" placeholder="Ex: EGO" style="text-transform:uppercase;" maxlength="5"></div>
          <div class="field" style="max-width:170px;">
            <button type="submit" class="btn btn-primary" id="cnpjCadastroSalvarBtn">Cadastrar</button>
          </div>
          <div class="field full" id="cnpjCadastroCancelWrap" style="display:none; max-width:160px;">
            <button type="button" class="btn btn-ghost btn-sm" id="cnpjCadastroCancelBtn">Cancelar edição</button>
          </div>
        </form>
        <div class="table-wrap" id="cnpjCadastroTableWrap"></div>
      </div>
    </div>
  `;
}

// CNPJs que apareceram em ocorrências (69) ou documentos em atraso (150)
// SEM focal definido, mas COM CNPJ preenchido no arquivo — ou seja, é um
// caso de "repassar para cadastro/ajuste": o CNPJ existe no documento, só
// falta cadastrar. Agrupa por CNPJ pra não repetir a mesma empresa várias
// vezes na lista.
function pendentesCadastroCnpj(){
  const todos = [...load(KEYS.ocorrencias), ...load(KEYS.atrasos)];
  const mapa = new Map();
  todos.forEach(o => {
    if(o.focalOrigem !== "indefinido") return;
    const norm = normalizarCnpj(o.cnpjPagador);
    if(!norm) return;
    if(buscarCnpjCadastro(norm)) return; // já cadastrado (caso raro: cadastro mudou e ainda não recalculou)
    if(!mapa.has(norm)) mapa.set(norm, {cnpj: o.cnpjPagador, nome: o.pagador, unidades: new Set(), qtd: 0});
    const item = mapa.get(norm);
    if(o.unidade) item.unidades.add(o.unidade);
    item.qtd++;
  });
  return [...mapa.values()];
}

function renderCnpjCadastroPendentes(){
  const wrap = document.getElementById("cnpjCadastroPendentesWrap");
  if(!wrap) return;
  const pendentes = pendentesCadastroCnpj();
  if(pendentes.length === 0){ wrap.innerHTML = ""; return; }
  wrap.innerHTML = `
    <div class="ocor-status-banner">
      <div style="width:100%;">
        <div class="ocor-status-title">${pendentes.length} CNPJ(s) de pagador sem cadastro (caíram sem focal)</div>
        <div class="ocor-status-sub" style="margin-bottom:8px;">Apareceram em ocorrências ou documentos em atraso mas não têm sigla vinculada. Clique em "Cadastrar" para preencher o formulário.</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>CNPJ</th><th>Nome (como veio no arquivo)</th><th>Unidade(s)</th><th>Qtd. docs</th><th></th></tr></thead>
            <tbody>
              ${pendentes.map(p => `
                <tr>
                  <td>${escHtml(formatarCnpjExibicao(p.cnpj))}</td>
                  <td>${escHtml(p.nome || "-")}</td>
                  <td>${escHtml([...p.unidades].join(", ") || "-")}</td>
                  <td>${p.qtd}</td>
                  <td><button type="button" class="link-btn cnpjCadastroPendenteBtn" data-cnpj="${escHtml(p.cnpj)}" data-nome="${escHtml(p.nome||"")}">Cadastrar</button></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  wrap.querySelectorAll(".cnpjCadastroPendenteBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("cnpjCadastroCorpo").style.display = "";
      document.getElementById("cnpjCadastroCnpjInput").value = btn.dataset.cnpj || "";
      document.getElementById("cnpjCadastroNomeInput").value = btn.dataset.nome || "";
      document.getElementById("cnpjCadastroSiglaInput").focus();
      document.getElementById("cnpjCadastroPanel").scrollIntoView({behavior:"smooth", block:"start"});
    });
  });
}

function renderCnpjCadastroTable(){
  const wrap = document.getElementById("cnpjCadastroTableWrap");
  if(!wrap) return;
  const lista = [...CNPJ_CADASTRO].sort((a,b) => (a.sigla||"").localeCompare(b.sigla||"") || (a.cnpj||"").localeCompare(b.cnpj||""));
  if(lista.length === 0){ wrap.innerHTML = `<div class="empty">Nenhum CNPJ cadastrado ainda.</div>`; return; }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>CNPJ</th><th>Nome / Grupo</th><th>Sigla</th><th>Focal vinculado</th><th></th></tr></thead>
      <tbody>
        ${lista.map(c => `
          <tr>
            <td>${escHtml(formatarCnpjExibicao(c.cnpj))}</td>
            <td>${escHtml(c.nome || "-")}</td>
            <td><strong>${escHtml(c.sigla || "-")}</strong></td>
            <td>${escHtml((focalPorSigla(c.sigla) || {}).titulo || "— sem focal (cai na unidade) —")}</td>
            <td style="white-space:nowrap;">
              <button type="button" class="link-btn cnpjCadastroEditarBtn" data-id="${c.id}">Editar</button>
              &nbsp;·&nbsp;
              <button type="button" class="link-btn danger cnpjCadastroExcluirBtn" data-id="${c.id}">Excluir</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  wrap.querySelectorAll(".cnpjCadastroEditarBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = CNPJ_CADASTRO.find(c => c.id === btn.dataset.id);
      if(!item) return;
      document.getElementById("cnpjCadastroEditId").value = item.id;
      document.getElementById("cnpjCadastroCnpjInput").value = item.cnpj || "";
      document.getElementById("cnpjCadastroNomeInput").value = item.nome || "";
      document.getElementById("cnpjCadastroSiglaInput").value = item.sigla || "";
      document.getElementById("cnpjCadastroSalvarBtn").textContent = "Salvar alteração";
      document.getElementById("cnpjCadastroCancelWrap").style.display = "";
    });
  });
  wrap.querySelectorAll(".cnpjCadastroExcluirBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      if(!confirm("Excluir este CNPJ do cadastro?")) return;
      CNPJ_CADASTRO = CNPJ_CADASTRO.filter(c => c.id !== btn.dataset.id);
      salvarCnpjCadastro();
      recalcularFocalComCadastroCnpj();
      renderCnpjCadastroTable();
      renderCnpjCadastroPendentes();
    });
  });
}

// Toda vez que o cadastro de CNPJ muda, os documentos já importados (69 e
// 150) precisam ser reavaliados — sem isso, um documento que já caiu como
// "Sem focal definido" continuaria assim mesmo depois de cadastrar o CNPJ.
function recalcularFocalComCadastroCnpj(){
  [KEYS.ocorrencias, KEYS.atrasos].forEach(key => {
    const lista = load(key);
    lista.forEach(item => {
      const focal = definirFocalOcorrencia(item.pagador, item.unidade, item.cnpjPagador);
      item.focal = focal.titulo;
      item.focalOrigem = focal.origem;
    });
    save(key, lista);
  });
  if(document.getElementById("ocorrenciasKpiWrap")) refreshOcorrenciasView();
  if(document.getElementById("atrasosKpiWrap")) refreshAtrasosView();
}

function attachCnpjCadastroEvents(){
  const toggleBtn = document.getElementById("cnpjCadastroToggleBtn");
  const corpo = document.getElementById("cnpjCadastroCorpo");
  if(toggleBtn && corpo){
    toggleBtn.addEventListener("click", () => {
      corpo.style.display = corpo.style.display === "none" ? "" : "none";
    });
  }

  function limparFormulario(){
    document.getElementById("cnpjCadastroEditId").value = "";
    document.getElementById("cnpjCadastroCnpjInput").value = "";
    document.getElementById("cnpjCadastroNomeInput").value = "";
    document.getElementById("cnpjCadastroSiglaInput").value = "";
    document.getElementById("cnpjCadastroSalvarBtn").textContent = "Cadastrar";
    document.getElementById("cnpjCadastroCancelWrap").style.display = "none";
  }

  const cancelBtn = document.getElementById("cnpjCadastroCancelBtn");
  if(cancelBtn) cancelBtn.addEventListener("click", limparFormulario);

  const form = document.getElementById("formCnpjCadastro");
  if(form){
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const editId = document.getElementById("cnpjCadastroEditId").value;
      const cnpj = document.getElementById("cnpjCadastroCnpjInput").value.trim();
      const nome = document.getElementById("cnpjCadastroNomeInput").value.trim();
      const sigla = document.getElementById("cnpjCadastroSiglaInput").value.trim().toUpperCase();
      const cnpjNorm = normalizarCnpj(cnpj);
      if(!cnpjNorm){ alert("Informe o CNPJ (ou CPF) do pagador."); return; }
      if(!sigla){ alert("Informe a sigla do Focal/unidade correspondente."); return; }

      const duplicado = CNPJ_CADASTRO.find(c => normalizarCnpj(c.cnpj) === cnpjNorm && c.id !== editId);
      if(duplicado){ alert("Esse CNPJ já está cadastrado (sigla " + duplicado.sigla + ")."); return; }

      if(editId){
        const item = CNPJ_CADASTRO.find(c => c.id === editId);
        if(item){ item.cnpj = cnpj; item.nome = nome; item.sigla = sigla; }
      } else {
        CNPJ_CADASTRO.push({id: uid(), cnpj, nome, sigla});
      }
      salvarCnpjCadastro();
      recalcularFocalComCadastroCnpj();
      renderCnpjCadastroTable();
      renderCnpjCadastroPendentes();
      limparFormulario();
    });
  }

  renderCnpjCadastroTable();
  renderCnpjCadastroPendentes();
}

function ocorrenciasHTML(){
  return `
    <h2 class="section-title">Ocorrências</h2>
    <p class="section-desc">Acompanhe os relatórios de ocorrência do SSW. Selecione a aba do código que deseja analisar.</p>

    ${cnpjCadastroSecaoHTML()}

    <div class="ocor-nav">
      <div class="ocor-tabs" role="tablist" aria-label="Código de ocorrência">
        <button type="button" role="tab" class="ocor-tab ocorMainBtn" data-main="c69">
          <span class="ocor-tab-code">69</span>
          <span class="ocor-tab-text">
            <span class="ocor-tab-title">Entrega realizada com ressalva</span>
            <span class="ocor-tab-sub">Código 69</span>
          </span>
          <span class="ocor-tab-count" id="ocorTabCount69">0</span>
        </button>
        <button type="button" role="tab" class="ocor-tab ocorMainBtn" data-main="c150">
          <span class="ocor-tab-code">150</span>
          <span class="ocor-tab-text">
            <span class="ocor-tab-title">Documentos em atraso</span>
            <span class="ocor-tab-sub">Código 150</span>
          </span>
          <span class="ocor-tab-count" id="ocorTabCount150">0</span>
        </button>
      </div>
      <div class="ocor-subtabs" id="ocorSubtabs" role="tablist" aria-label="Visão">
        <span class="ocor-subtabs-label">Visão</span>
        <div class="ocor-seg">
          <button type="button" role="tab" class="ocor-seg-btn ocorrenciasAbaBtn" data-aba="dashboard">Dashboard</button>
          <button type="button" role="tab" class="ocor-seg-btn ocorrenciasAbaBtn" data-aba="focal">Por Focal</button>
        </div>
      </div>
    </div>

    <div id="ocorrenciasAbaDashboard">
      <p class="section-desc">Existem dois campos porque são dois sistemas diferentes: <strong>VAL</strong> (Rede Do Valle) e <strong>RVA</strong> (Real Vale). Importe os dois arquivos — o painel junta tudo automaticamente pela CTRC, sem duplicar.</p>
      ${blocoImportacaoDocumentoHTML({
        titulo: "Importar ocorrências VAL — Rede Do Valle (código 69)",
        formId: "formOcorrenciasValArquivo", inputId: "ocorrenciasValArquivoInput",
        toggleId: "toggleOcorrenciasValColarTexto", wrapId: "ocorrenciasValColarTextoWrap",
        textareaId: "ocorrenciasValTextoManual", processarId: "processarOcorrenciasValTextoManual",
        statusId: "ocorrenciasValImportStatus"
      })}
      ${blocoImportacaoDocumentoHTML({
        titulo: "Importar ocorrências RVA — Real Vale (código 69)",
        formId: "formOcorrenciasRvaArquivo", inputId: "ocorrenciasRvaArquivoInput",
        toggleId: "toggleOcorrenciasRvaColarTexto", wrapId: "ocorrenciasRvaColarTextoWrap",
        textareaId: "ocorrenciasRvaTextoManual", processarId: "processarOcorrenciasRvaTextoManual",
        statusId: "ocorrenciasRvaImportStatus"
      })}
      <div id="ocorrenciasKpiWrap"></div>
      <div id="ocorrenciasBreakdownWrap"></div>
    </div>

    <div id="ocorrenciasAbaFocal" style="display:none;">
      <div class="panel" id="ocorrenciasTablePanel">
        <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <span>Ocorrências por Focal</span>
          <div class="toolbar-actions">
            <button type="button" class="btn btn-ghost btn-sm" id="ocorrenciasExportBtn" title="Baixar esta tabela em Excel (.xlsx), respeitando os filtros aplicados">Exportar Excel</button>
            <button type="button" class="btn btn-ghost btn-sm" id="ocorrenciasFullscreenBtn">Tela cheia</button>
          </div>
        </div>
        <div class="toolbar">
          <label class="check-inline">
            Buscar: <input type="text" class="small-input" id="ocorrenciasBusca" placeholder="CTRC, remetente, pagador, NF ou destinatário..." style="width:240px;">
          </label>
          <label class="check-inline">
            Focal:
            <div class="multiselect" id="msOcorFocal">
              <button type="button" class="multiselect-btn" id="msOcorFocalBtn">Todos</button>
              <div class="multiselect-panel" id="msOcorFocalPanel"></div>
            </div>
          </label>
        <label class="check-inline">
          Unidade:
          <div class="multiselect" id="msOcorUnidade">
            <button type="button" class="multiselect-btn" id="msOcorUnidadeBtn">Todas</button>
            <div class="multiselect-panel" id="msOcorUnidadePanel"></div>
          </div>
        </label>
        <button type="button" class="link-btn danger" id="limparOcorrencias">Limpar ocorrências importadas</button>
        </div>
        <div class="table-wrap" id="ocorrenciasTableWrap"></div>
      </div>
    </div>

    <div id="ocorrenciasAbaAtrasos" style="display:none;">
      ${atrasosSecaoHTML()}
    </div>
  `;
}

let ocorrenciasSelFocal = [];
let ocorrenciasSelUnidade = [];
let ocorrenciasAbaAtiva = "dashboard";

// Abas internas: nível 1 = código (69 / 150); nível 2 = visão do código 69
// (Dashboard / Por Focal). "aba" continua sendo dashboard | focal | atrasos.
let ocorrenciasUltimaVisao69 = "dashboard";

function trocarAbaOcorrencias(aba){
  ocorrenciasAbaAtiva = aba;
  if(aba !== "atrasos") ocorrenciasUltimaVisao69 = aba;
  const principal = aba === "atrasos" ? "c150" : "c69";
  document.querySelectorAll(".ocorMainBtn").forEach(b=>{
    const ativo = b.dataset.main === principal;
    b.classList.toggle("active", ativo);
    b.setAttribute("aria-selected", ativo ? "true" : "false");
  });
  document.querySelectorAll(".ocorrenciasAbaBtn").forEach(b=>{
    const ativo = b.dataset.aba === aba;
    b.classList.toggle("active", ativo);
    b.setAttribute("aria-selected", ativo ? "true" : "false");
  });
  const sub = document.getElementById("ocorSubtabs");
  if(sub) sub.style.display = aba === "atrasos" ? "none" : "";
  const dash = document.getElementById("ocorrenciasAbaDashboard");
  const foc = document.getElementById("ocorrenciasAbaFocal");
  const atr = document.getElementById("ocorrenciasAbaAtrasos");
  if(dash) dash.style.display = aba === "dashboard" ? "" : "none";
  if(foc) foc.style.display = aba === "focal" ? "" : "none";
  if(atr) atr.style.display = aba === "atrasos" ? "" : "none";
}

// Contadores nas abas principais (69 / 150).
function atualizarContadoresAbasOcorrencias(){
  const c69 = document.getElementById("ocorTabCount69");
  const c150 = document.getElementById("ocorTabCount150");
  if(c69) c69.textContent = load(KEYS.ocorrencias).length;
  if(c150) c150.textContent = load(KEYS.atrasos).length;
}

function relatarImportacaoOcorrencia(result, statusEl){
  if(!result || result.totalArquivo === 0){
    statusEl.textContent = "Não encontrei linhas de ocorrência nesse arquivo. Confira se é o relatório do SSW com as colunas CTRC / NOME PAGADOR / UNIDADE etc.";
    return;
  }
  const partes = [`${result.novos} nova(s)`, `${result.atualizados} atualizada(s)`];
  if(result.ignoradas > 0){
    partes.push(`${result.ignoradas} ignorada(s) — código de ocorrência diferente de ${OCORRENCIAS_CODIGOS_SUPORTADOS.join("/")}`);
  }
  statusEl.textContent = `Arquivo com ${result.totalArquivo} linha(s): ${partes.join(", ")}.`;
}

function attachOcorrenciasEvents(){
  wireImportacaoDocumento({
    formId:"formOcorrenciasValArquivo", inputId:"ocorrenciasValArquivoInput",
    toggleId:"toggleOcorrenciasValColarTexto", wrapId:"ocorrenciasValColarTextoWrap",
    textareaId:"ocorrenciasValTextoManual", processarId:"processarOcorrenciasValTextoManual",
    statusId:"ocorrenciasValImportStatus", nomeFonte:"VAL",
    parseFn: parseOcorrenciasSsw, importFn: importOcorrencias,
    relatarFn: relatarImportacaoOcorrencia, refreshFn: refreshOcorrenciasView
  });
  wireImportacaoDocumento({
    formId:"formOcorrenciasRvaArquivo", inputId:"ocorrenciasRvaArquivoInput",
    toggleId:"toggleOcorrenciasRvaColarTexto", wrapId:"ocorrenciasRvaColarTextoWrap",
    textareaId:"ocorrenciasRvaTextoManual", processarId:"processarOcorrenciasRvaTextoManual",
    statusId:"ocorrenciasRvaImportStatus", nomeFonte:"RVA",
    parseFn: parseOcorrenciasSsw, importFn: importOcorrencias,
    relatarFn: relatarImportacaoOcorrencia, refreshFn: refreshOcorrenciasView
  });

  document.getElementById("limparOcorrencias").addEventListener("click", ()=>{
    if(!confirm("Remover todas as ocorrências importadas?")) return;
    save(KEYS.ocorrencias, []);
    refreshOcorrenciasView();
  });

  document.getElementById("ocorrenciasBusca").addEventListener("input", renderOcorrenciasTable);

  const fsBtn = document.getElementById("ocorrenciasFullscreenBtn");
  if(fsBtn){
    fsBtn.addEventListener("click", ()=> toggleFullscreen("ocorrenciasTablePanel"));
    updateFullscreenBtnLabel("ocorrenciasTablePanel", "ocorrenciasFullscreenBtn");
  }

  const expBtn = document.getElementById("ocorrenciasExportBtn");
  if(expBtn) expBtn.addEventListener("click", exportarOcorrenciasExcel);

  document.querySelectorAll(".ocorMainBtn").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      trocarAbaOcorrencias(btn.dataset.main === "c150" ? "atrasos" : ocorrenciasUltimaVisao69);
    });
  });
  document.querySelectorAll(".ocorrenciasAbaBtn").forEach(btn=>{
    btn.addEventListener("click", ()=> trocarAbaOcorrencias(btn.dataset.aba));
  });
  trocarAbaOcorrencias(ocorrenciasAbaAtiva);

  refreshOcorrenciasView();

  // Documentos em Atraso vive dentro da própria aba Ocorrências (3ª aba
  // interna), então liga os eventos dela junto.
  attachAtrasosEvents();

  // Cadastro de CNPJ (topo da tela) — vale tanto para 69 quanto para 150.
  attachCnpjCadastroEvents();
}

function refreshOcorrenciasView(){
  const list = load(KEYS.ocorrencias);

  const focais = [...new Set(list.map(o=>o.focal).filter(Boolean))].sort();
  ocorrenciasSelFocal = ocorrenciasSelFocal.filter(v => focais.includes(v));
  buildMultiSelect({
    btnId:"msOcorFocalBtn", panelId:"msOcorFocalPanel", options:focais, selected:ocorrenciasSelFocal,
    allLabel:"Todos", onChange:()=>{ refreshOcorrenciasView(); }
  });

  const unidades = [...new Set(list.map(o=>o.unidade).filter(Boolean))].sort();
  ocorrenciasSelUnidade = ocorrenciasSelUnidade.filter(v => unidades.includes(v));
  buildMultiSelect({
    btnId:"msOcorUnidadeBtn", panelId:"msOcorUnidadePanel", options:unidades, selected:ocorrenciasSelUnidade,
    allLabel:"Todas", onChange:()=>{ refreshOcorrenciasView(); }
  });

  renderOcorrenciasKpis();
  renderOcorrenciasBreakdown();
  renderOcorrenciasTable();
  atualizarContadoresAbasOcorrencias();
  renderCnpjCadastroPendentes();
}

// "1.234,56" -> 1234.56 (texto do SSW, formato BR) — usado só pra somar
// Valmercad/Valfrete nos cards do Dashboard.
function numeroOcorrenciaBR(str){
  const s = String(str||"").trim();
  if(!s) return 0;
  const limpo = s.replace(/[^\d,.-]/g,"").replace(/\./g,"").replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? 0 : n;
}

// Ícones em SVG (traço fino, monocromático) usados no dashboard de
// Ocorrências, no lugar de emoji — mantém a cara séria/corporativa do resto
// do painel. Usam stroke="currentColor" pra herdar a cor do elemento pai.
const OCOR_ICON_BOX = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7.5 12 3 3 7.5 12 12l9-4.5z"/><path d="M3 7.5v9L12 21l9-4.5v-9"/><path d="M12 12v9"/></svg>`;
const OCOR_ICON_COIN = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.3 9.6c0-1.15 1.1-2.1 2.7-2.1s2.7.9 2.7 1.85c0 2.3-5.4 1.65-5.4 4 0 1.05 1.2 1.85 2.7 1.85s2.7-.85 2.7-2"/><path d="M12 6v12"/></svg>`;
const OCOR_ICON_TRUCK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="1.5" y="7" width="12.5" height="9"/><path d="M14 10h4l3.5 3.2V16H14z"/><circle cx="6" cy="18.2" r="1.7"/><circle cx="17.3" cy="18.2" r="1.7"/></svg>`;
const OCOR_ICON_ALERT = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 22 20H2L12 3.5z"/><path d="M12 10v4"/><path d="M12 17h.01"/></svg>`;
const OCOR_ICON_CHECK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.3 10.5 15 16 9.3"/></svg>`;

function renderOcorrenciasKpis(){
  const wrap = document.getElementById("ocorrenciasKpiWrap");
  if(!wrap) return;
  const list = load(KEYS.ocorrencias);
  const semFocal = list.filter(o => o.focalOrigem === "indefinido").length;
  const valorMercadTotal = list.reduce((s,o)=> s + numeroOcorrenciaBR(o.valMercad), 0);
  const valorFreteTotal = list.reduce((s,o)=> s + numeroOcorrenciaBR(o.valFrete), 0);
  const pctSemFocal = list.length ? Math.round(semFocal/list.length*100) : 0;

  // Banner de status: se sobra ocorrência sem focal, chama atenção antes de
  // qualquer outra coisa; se está tudo certo, mostra uma confirmação.
  const banner = list.length === 0 ? "" : (semFocal > 0 ? `
    <div class="ocor-status-banner">
      <span class="ocor-status-icon">${OCOR_ICON_ALERT}</span>
      <div>
        <div class="ocor-status-title">${semFocal} ocorrência${semFocal>1?'s':''} sem focal definido (${pctSemFocal}% do total)</div>
        <div class="ocor-status-sub">Pagador e unidade não estão cadastrados em Confirmação de Filiais — confira na aba "Por Focal".</div>
      </div>
    </div>
  ` : `
    <div class="ocor-status-banner is-ok">
      <span class="ocor-status-icon">${OCOR_ICON_CHECK}</span>
      <div>
        <div class="ocor-status-title">Todas as ocorrências têm focal definido</div>
        <div class="ocor-status-sub">${list.length} ocorrência${list.length>1?'s':''} de código 69 importada${list.length>1?'s':''}, todas com responsável identificado.</div>
      </div>
    </div>
  `);

  wrap.innerHTML = `
    ${banner}
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-top"><span class="kpi-icon">${OCOR_ICON_BOX}</span><div class="label">Ocorrências (69)</div></div>
        <div class="value">${list.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span class="kpi-icon">${OCOR_ICON_COIN}</span><div class="label">Valor de mercadoria</div></div>
        <div class="value" style="font-size:20px;">R$ ${money(valorMercadTotal)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span class="kpi-icon">${OCOR_ICON_TRUCK}</span><div class="label">Valor de frete</div></div>
        <div class="value" style="font-size:20px;">R$ ${money(valorFreteTotal)}</div>
      </div>
      <div class="kpi-card ${semFocal>0?'alert':'ok'}">
        <div class="kpi-top"><span class="kpi-icon">${semFocal>0?OCOR_ICON_ALERT:OCOR_ICON_CHECK}</span><div class="label">Sem focal definido</div></div>
        <div class="value">${semFocal}${list.length?` <span style="font-size:13px; font-weight:700; opacity:.65;">(${pctSemFocal}%)</span>`:''}</div>
        <div class="hint">Pagador e unidade não cadastrados</div>
      </div>
    </div>
  `;
}

// Duas listas de ranking do Dashboard: quantas ocorrências 69 cada Focal tem
// e quantas cada Unidade tem — ordenadas da maior quantidade para a menor,
// com uma barra proporcional (visual tipo dashboard, não tabela crua).
function contagemPorCampo(list, campo, rotuloVazio){
  const mapa = new Map();
  list.forEach(o => {
    const chave = o[campo] || rotuloVazio;
    mapa.set(chave, (mapa.get(chave)||0) + 1);
  });
  return [...mapa.entries()].sort((a,b)=> b[1]-a[1]);
}

function rankingOcorrenciasHTML(linhas, rotuloAlerta){
  const max = Math.max(1, ...linhas.map(([,qtd])=>qtd));
  // Mostra os 5 primeiros direto; o resto fica num "ver mais" recolhível,
  // pra não virar uma lista enorme quando tem muitos focais/unidades.
  const principais = linhas.slice(0,5);
  const restante = linhas.slice(5);
  let html = `<div class="ocor-rank-list">`;
  principais.forEach((par, i) => {
    html += `
        <div class="ocor-rank-item ${par[0]===rotuloAlerta ? 'ocor-rank-item-alert' : ''}">
          <div class="ocor-rank-top">
            <span class="ocor-rank-name"><span class="ocor-rank-badge">${i+1}</span>${escHtml(par[0])}</span>
            <span class="ocor-rank-value">${par[1]}</span>
          </div>
          <div class="ocor-rank-bar-track"><div class="ocor-rank-bar-fill" style="width:${Math.round(par[1]/max*100)}%"></div></div>
        </div>`;
  });
  html += `</div>`;
  if(restante.length){
    html += `
      <details class="ocor-rank-more">
        <summary>Ver mais ${restante.length}</summary>
        <div class="ocor-rank-list">
          ${restante.map((par,i) => `
            <div class="ocor-rank-item ${par[0]===rotuloAlerta ? 'ocor-rank-item-alert' : ''}">
              <div class="ocor-rank-top">
                <span class="ocor-rank-name"><span class="ocor-rank-badge">${i+6}</span>${escHtml(par[0])}</span>
                <span class="ocor-rank-value">${par[1]}</span>
              </div>
              <div class="ocor-rank-bar-track"><div class="ocor-rank-bar-fill" style="width:${Math.round(par[1]/max*100)}%"></div></div>
            </div>
          `).join("")}
        </div>
      </details>`;
  }
  return html;
}

// Paleta usada nos donuts de resumo — tons de azul/marinho do próprio
// painel, com o dourado só como destaque do maior valor (sóbrio, sem
// misturar cores muito saturadas).
const OCOR_DONUT_CORES = ["#0f1c47","#2c4bb0","#6b8fd4","#9aa3c2","#c99a2e"];
const OCOR_DONUT_COR_OUTROS = "#d7dbe8";

// Donut (conic-gradient) + legenda com os maiores contribuintes de uma
// contagem (por Focal ou por Unidade), agrupando o resto em "Outros".
function ocorDonutHTML(linhas, totalLabel){
  const total = linhas.reduce((s,[,qtd])=>s+qtd, 0);
  if(total === 0) return `<div class="empty" style="padding:18px;">Sem dados.</div>`;
  const top = linhas.slice(0,5);
  const outros = linhas.slice(5).reduce((s,[,qtd])=>s+qtd, 0);
  const fatias = top.map(([chave,qtd],i) => ({chave, qtd, cor: OCOR_DONUT_CORES[i % OCOR_DONUT_CORES.length]}));
  if(outros > 0) fatias.push({chave:"Outros", qtd:outros, cor: OCOR_DONUT_COR_OUTROS});

  let acumulado = 0;
  const stops = fatias.map(f => {
    const inicio = acumulado/total*360;
    acumulado += f.qtd;
    const fim = acumulado/total*360;
    return `${f.cor} ${inicio}deg ${fim}deg`;
  }).join(", ");

  const legenda = fatias.map(f => `
    <div class="ocor-legend-item">
      <span class="ocor-legend-dot" style="background:${f.cor};"></span>
      <span class="ocor-legend-name" title="${escHtml(f.chave)}">${escHtml(f.chave)}</span>
      <span class="ocor-legend-value">${f.qtd}</span>
      <span class="ocor-legend-pct">${Math.round(f.qtd/total*100)}%</span>
    </div>
  `).join("");

  return `
    <div class="ocor-donut-row">
      <div class="ocor-donut" style="background:conic-gradient(${stops});">
        <div class="ocor-donut-center"><span class="n">${total}</span><span class="l">${escHtml(totalLabel)}</span></div>
      </div>
      <div class="ocor-legend">${legenda}</div>
    </div>
  `;
}

function renderOcorrenciasBreakdown(){
  const wrap = document.getElementById("ocorrenciasBreakdownWrap");
  if(!wrap) return;
  const list = load(KEYS.ocorrencias);

  if(list.length === 0){
    wrap.innerHTML = `<div class="empty">Importe um arquivo para ver o resumo por Focal e por Unidade.</div>`;
    return;
  }

  const porFocal = contagemPorCampo(list, "focal", "Sem focal definido");
  const porUnidade = contagemPorCampo(list, "unidade", "Sem unidade");
  const valorMercadTotal = list.reduce((s,o)=> s + numeroOcorrenciaBR(o.valMercad), 0);
  const valorFreteTotal = list.reduce((s,o)=> s + numeroOcorrenciaBR(o.valFrete), 0);
  const maiorValor = Math.max(1, valorMercadTotal, valorFreteTotal);

  wrap.innerHTML = `
    <div class="ocor-rank-grid">
      <div class="panel">
        <div class="panel-header">Distribuição por Focal</div>
        ${ocorDonutHTML(porFocal, "ocorrências")}
        <div style="padding:14px 18px 16px;">${rankingOcorrenciasHTML(porFocal, "Sem focal definido")}</div>
      </div>
      <div class="panel">
        <div class="panel-header">Distribuição por Unidade</div>
        ${ocorDonutHTML(porUnidade, "ocorrências")}
        <div style="padding:14px 18px 16px;">${rankingOcorrenciasHTML(porUnidade, "Sem unidade")}</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">Resumo financeiro</div>
      <div class="ocor-fin-card">
        <div class="ocor-fin-row">
          <div class="ocor-fin-top"><span class="ocor-fin-label">Valor de mercadoria</span><span class="ocor-fin-value">R$ ${money(valorMercadTotal)}</span></div>
          <div class="ocor-fin-track"><div class="ocor-fin-fill" style="width:${Math.round(valorMercadTotal/maiorValor*100)}%; background:var(--navy-4);"></div></div>
        </div>
        <div class="ocor-fin-row">
          <div class="ocor-fin-top"><span class="ocor-fin-label">Valor de frete</span><span class="ocor-fin-value">R$ ${money(valorFreteTotal)}</span></div>
          <div class="ocor-fin-track"><div class="ocor-fin-fill" style="width:${Math.round(valorFreteTotal/maiorValor*100)}%; background:var(--gold);"></div></div>
        </div>
      </div>
    </div>
  `;
}

// Lista de ocorrências já filtrada (busca + focal + unidade) e ordenada por CTRC.
// A tela e a exportação para Excel usam esta mesma lista.
function ocorrenciasFiltradas(){
  let list = load(KEYS.ocorrencias);
  const busca = (document.getElementById("ocorrenciasBusca").value || "").trim().toUpperCase();
  if(busca){
    list = list.filter(o =>
      (o.ctrc||"").toUpperCase().includes(busca) ||
      (o.remetente||"").toUpperCase().includes(busca) ||
      (o.pagador||"").toUpperCase().includes(busca) ||
      (o.cnpjPagador||"").toUpperCase().includes(busca) ||
      (normalizarCnpj(busca) && normalizarCnpj(o.cnpjPagador).includes(normalizarCnpj(busca))) ||
      (o.nf||"").toUpperCase().includes(busca) ||
      (o.destinatario||"").toUpperCase().includes(busca)
    );
  }
  if(ocorrenciasSelFocal.length > 0) list = list.filter(o => ocorrenciasSelFocal.includes(o.focal));
  if(ocorrenciasSelUnidade.length > 0) list = list.filter(o => ocorrenciasSelUnidade.includes(o.unidade));
  list.sort((a,b)=> (a.ctrc||"").localeCompare(b.ctrc||""));
  return list;
}

// Agrupa a lista (já filtrada) por Focal, em ordem alfabética — com o grupo
// "Sem focal definido" sempre por último e marcado, porque é o que precisa
// de ação. Cada grupo vira uma linha de cabeçalho + as linhas normais, na
// MESMA tabela — assim a exportação para Excel (que lê a tabela da tela)
// sai organizada por focal automaticamente, sem lógica duplicada.
function agruparOcorrenciasPorFocal(list){
  const mapa = new Map();
  list.forEach(o => {
    const chave = o.focal || "Sem focal definido";
    if(!mapa.has(chave)) mapa.set(chave, []);
    mapa.get(chave).push(o);
  });
  const chaves = [...mapa.keys()].sort((a,b)=>{
    if(a === "Sem focal definido") return 1;
    if(b === "Sem focal definido") return -1;
    return a.localeCompare(b);
  });
  return chaves.map(chave => ({focal: chave, itens: mapa.get(chave)}));
}

function linhaOcorrencia(o){
  const alerta = o.focalOrigem === "indefinido";
  return `
    <tr class="${alerta ? 'row-alert' : ''}">
      ${OCORRENCIAS_COLUNAS_EXIBICAO.map(c => {
        const bruto = o[c.campo] || "";
        const texto = c.formatar ? c.formatar(bruto) : (c.exibir ? c.exibir(bruto) : (bruto || "-"));
        return `<td style="max-width:200px; white-space:normal;">${escHtml(texto)}</td>`;
      }).join("")}
    </tr>
  `;
}

function renderOcorrenciasTable(){
  const wrap = document.getElementById("ocorrenciasTableWrap");
  if(!wrap) return;
  const list = ocorrenciasFiltradas();

  if(list.length === 0){
    wrap.innerHTML = `<div class="empty">Nenhuma ocorrência encontrada para esse filtro.</div>`;
    return;
  }

  const grupos = agruparOcorrenciasPorFocal(list);
  const totalCols = OCORRENCIAS_COLUNAS_EXIBICAO.length;

  wrap.innerHTML = `
    <table id="ocorrenciasTable">
      <thead><tr>
        ${OCORRENCIAS_COLUNAS_EXIBICAO.map(c => `<th>${escHtml(c.titulo)}</th>`).join("")}
      </tr></thead>
      <tbody>
        ${grupos.map(g => `
          <tr class="ocor-group-row${g.focal==='Sem focal definido' ? ' ocor-group-row-alert' : ''}">
            <td colspan="${totalCols}">${escHtml(g.focal)} <span class="ocor-group-count">${g.itens.length} ocorrência(s)</span></td>
          </tr>
          ${g.itens.map(linhaOcorrencia).join("")}
        `).join("")}
      </tbody>
    </table>
  `;
}

// Exporta as ocorrências (código 69) para Excel: UMA ABA POR FOCAL + aba RESUMO.
// Respeita os filtros aplicados na tela (busca, focal, unidade). O arquivo é montado
// direto dos dados em exportar-ocorrencias.js (valores como número, filtro, totais).
async function exportarOcorrenciasExcel(){
  const list = ocorrenciasFiltradas();
  if(list.length === 0){ alert("Não há ocorrências para exportar com esse filtro."); return; }

  const colunas = OCORRENCIAS_COLUNAS_EXIBICAO.map(c => ({
    titulo: c.titulo,
    tipo: c.formatar ? "moeda" : (["ocor", "unidade", "origem"].includes(c.campo) ? "centro" : "texto")
  }));
  const grupos = agruparOcorrenciasPorFocal(list).map(g => ({
    focal: g.focal,
    semFocal: g.focal === "Sem focal definido",
    linhas: g.itens.map(o => OCORRENCIAS_COLUNAS_EXIBICAO.map(c => {
      const bruto = o[c.campo];
      if(c.formatar) return bruto ? numeroOcorrenciaBR(bruto) : null;   // moeda -> número de verdade
      return bruto == null ? "" : String(bruto);
    }))
  }));

  const filtros = [];
  const busca = (document.getElementById("ocorrenciasBusca").value || "").trim();
  if(busca) filtros.push(`Busca: "${busca}"`);
  if(ocorrenciasSelFocal.length) filtros.push(`Focal: ${ocorrenciasSelFocal.join(", ")}`);
  if(ocorrenciasSelUnidade.length) filtros.push(`Unidade: ${ocorrenciasSelUnidade.join(", ")}`);

  await exportarOcorrenciasPorFocal({
    titulo: "OCORRÊNCIAS — CÓDIGO 69 (ENTREGA REALIZADA COM RESSALVA)",
    filtroTexto: filtros.length ? "Filtro aplicado — " + filtros.join("  •  ") : "Sem filtros: todas as ocorrências importadas.",
    rodape: "O focal responsável foi definido automaticamente pela regra PAGADOR > UNIDADE.",
    colunas, grupos
  }, `Ocorrencias_69_por_Focal_${dataParaArquivo()}.xlsx`);
}

/* ================= DOCUMENTOS EM ATRASO =================
   Lê o relatório de documentos em atraso do SSW (.sswweb / .csv), já vem com
   UM CTRC por linha em atraso (não precisa filtrar por código de ocorrência
   como na aba Ocorrências). Define o focal responsável com a MESMA regra
   (PAGADOR > UNIDADE, ver definirFocalOcorrencia) e organiza tudo em tabela,
   com dashboard por Focal e por Filial (UNID_ENTREGA). Reaproveita as
   funções genéricas já usadas em Ocorrências (contagemPorCampo, ocorDonutHTML,
   rankingOcorrenciasHTML, agruparOcorrenciasPorFocal, readFileAsLatin1,
   buildMultiSelect, exportarTabelasExcel etc.) — sem duplicar lógica. */

// Cada campo aceita mais de um nome de cabeçalho possível, pra aguentar
// pequenas variações entre exportações do SSW sem quebrar o import.
const ATRASOS_COLUNAS = {
  ctrc:            ["CTRC"],
  remetente:       ["REMETENTE"],
  destinatario:    ["DESTINATARIO"],
  pagador:         ["PAGADOR"],
  cnpjPagador:     ["CNPJ_PAGADOR", "CNPJ PAGADOR", "CGC_PAGADOR", "CGC PAGADOR", "CNPJ/CPF PAGADOR", "CPF/CNPJ PAGADOR", "CNPJ CPF PAGADOR"],
  unidade:         ["UNID_ENTREGA"],
  nf:              ["NOTA_FISCAL"],
  frete:           ["FRETE"],
  prevEntrega:     ["PREV_ENTREGA"],
  codOcorrencia:   ["COD_OCORRENCIA"],
  descrOcorrencia: ["DESCR_OCORRENCIA"],
  diasAtraso:      ["DIAS_ATRASO"]
};

// Modelo de colunas combinado para a tela e para o Excel desta aba — as 11
// colunas pedidas, exatamente nessa ordem. Mexer aqui muda as duas coisas
// juntas (não duplica lista em outro lugar).
const ATRASOS_COLUNAS_EXIBICAO = [
  {campo:"ctrc",            titulo:"CTRC"},
  {campo:"remetente",       titulo:"Remetente"},
  {campo:"destinatario",    titulo:"Destinatário"},
  {campo:"pagador",         titulo:"Pagador"},
  {campo:"cnpjPagador",     titulo:"CNPJ Pagador", exibir:formatarCnpjExibicao},
  {campo:"unidade",         titulo:"Unid. Entrega"},
  {campo:"nf",              titulo:"Nota Fiscal"},
  {campo:"frete",           titulo:"Frete", formatar:formatarValorOcorrencia},
  {campo:"prevEntrega",     titulo:"Prev. Entrega"},
  {campo:"codOcorrencia",   titulo:"Cód. Ocorrência"},
  {campo:"descrOcorrencia", titulo:"Descr. Ocorrência"},
  {campo:"diasAtraso",      titulo:"Dias de Atraso"},
  {campo:"origem",          titulo:"Sistema"}
];

// "17" / "-3" -> número inteiro (dias de atraso vêm em texto simples do SSW).
function numeroAtrasoBR(str){
  const n = parseInt(String(str||"").replace(/[^\d-]/g,""), 10);
  return isNaN(n) ? 0 : n;
}

// Lê o arquivo (cabeçalho na 1ª linha, separado por ";") e devolve todas as
// linhas já convertidas. Diferente da aba Ocorrências, aqui NÃO existe
// filtro por código — o próprio relatório do SSW já traz só os documentos
// em atraso, um CTRC por linha.
function parseAtrasosSsw(text){
  text = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const linhas = text.split("\n").filter(l => l.trim().length > 0);
  if(linhas.length < 2) return {rows: [], totalArquivo: 0};

  const headers = linhas[0].split(";").map(h => limparCelulaOcorrencia(h).toUpperCase());
  const idxPor = (nomes) => {
    for(const n of nomes){
      const i = headers.indexOf(n);
      if(i !== -1) return i;
    }
    return -1;
  };
  const idx = {};
  Object.keys(ATRASOS_COLUNAS).forEach(campo => { idx[campo] = idxPor(ATRASOS_COLUNAS[campo]); });

  if(idx.ctrc === -1) return {rows: [], totalArquivo: 0}; // não parece o arquivo certo

  const rows = [];
  for(let i = 1; i < linhas.length; i++){
    const parts = linhas[i].split(";");
    if(parts.length < 2) continue;
    const get = (campo) => (idx[campo] >= 0 && idx[campo] < parts.length) ? limparCelulaOcorrencia(parts[idx[campo]]) : "";

    const ctrc = get("ctrc");
    if(!ctrc) continue;

    rows.push({
      ctrc,
      remetente: get("remetente"),
      destinatario: get("destinatario"),
      pagador: get("pagador"),
      cnpjPagador: get("cnpjPagador"),
      unidade: get("unidade"),
      nf: get("nf"),
      frete: get("frete"),
      prevEntrega: get("prevEntrega"),
      codOcorrencia: get("codOcorrencia"),
      descrOcorrencia: get("descrOcorrencia"),
      diasAtraso: get("diasAtraso")
    });
  }
  return {rows, totalArquivo: rows.length};
}

// Importa e faz upsert por CTRC (mesmo padrão das outras abas): atualiza os
// documentos já cadastrados e adiciona os novos, recalculando o focal a
// cada importação.
function importAtrasos(parsed, origem){
  const existentes = load(KEYS.atrasos);
  const porCtrc = new Map(existentes.map(a => [a.ctrc, a]));
  let novos = 0, atualizados = 0;
  parsed.rows.forEach(r => {
    const focal = definirFocalOcorrencia(r.pagador, r.unidade, r.cnpjPagador);
    const item = {...r, focal: focal.titulo, focalOrigem: focal.origem, origem: origem || r.origem || ""};
    if(porCtrc.has(r.ctrc)){
      Object.assign(porCtrc.get(r.ctrc), item);
      atualizados++;
    } else {
      porCtrc.set(r.ctrc, {id: uid(), ...item});
      novos++;
    }
  });
  save(KEYS.atrasos, Array.from(porCtrc.values()));
  return {totalArquivo: parsed.rows.length, novos, atualizados};
}

function atrasosSecaoHTML(){
  return `
    <p class="section-desc">Importe o relatório de <strong>documentos em atraso (código 150)</strong> do SSW (.sswweb / .csv / .txt), com as colunas CTRC, REMETENTE, DESTINATARIO, PAGADOR, UNID_ENTREGA, NOTA_FISCAL, FRETE, PREV_ENTREGA, COD_OCORRENCIA, DESCR_OCORRENCIA e DIAS_ATRASO. O focal é definido automaticamente: primeiro pelo <strong>PAGADOR</strong> (lista de pagadores prioritários) e, se não estiver nessa lista, pela <strong>UNID_ENTREGA</strong> (Filial) — mesma estrutura de <strong>Confirmação de Filiais</strong>. Reimportar atualiza os documentos já cadastrados (pela CTRC).</p>

    <p class="section-desc">Existem dois campos porque são dois sistemas diferentes: <strong>VAL</strong> (Rede Do Valle) e <strong>RVA</strong> (Real Vale). Importe os dois arquivos — o painel junta tudo automaticamente pela CTRC, sem duplicar.</p>
    ${blocoImportacaoDocumentoHTML({
      titulo: "Importar documentos em atraso VAL — Rede Do Valle (código 150)",
      formId: "formAtrasosValArquivo", inputId: "atrasosValArquivoInput",
      toggleId: "toggleAtrasosValColarTexto", wrapId: "atrasosValColarTextoWrap",
      textareaId: "atrasosValTextoManual", processarId: "processarAtrasosValTextoManual",
      statusId: "atrasosValImportStatus"
    })}
    ${blocoImportacaoDocumentoHTML({
      titulo: "Importar documentos em atraso RVA — Real Vale (código 150)",
      formId: "formAtrasosRvaArquivo", inputId: "atrasosRvaArquivoInput",
      toggleId: "toggleAtrasosRvaColarTexto", wrapId: "atrasosRvaColarTextoWrap",
      textareaId: "atrasosRvaTextoManual", processarId: "processarAtrasosRvaTextoManual",
      statusId: "atrasosRvaImportStatus"
    })}

    <div id="atrasosKpiWrap"></div>
    <div id="atrasosBreakdownWrap"></div>

    <div class="panel" id="atrasosTablePanel">
      <div class="panel-header" style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
        <span>Documentos em Atraso — por Focal / Filial</span>
        <div class="toolbar-actions">
          <button type="button" class="btn btn-ghost btn-sm" id="atrasosExportBtn" title="Baixar esta tabela em Excel (.xlsx), respeitando os filtros aplicados">Exportar Excel</button>
          <button type="button" class="btn btn-ghost btn-sm" id="atrasosFullscreenBtn">Tela cheia</button>
        </div>
      </div>
      <div class="toolbar">
        <label class="check-inline">
          Buscar: <input type="text" class="small-input" id="atrasosBusca" placeholder="CTRC, remetente, destinatário, pagador ou NF..." style="width:240px;">
        </label>
        <label class="check-inline">
          Focal:
          <div class="multiselect" id="msAtrasoFocal">
            <button type="button" class="multiselect-btn" id="msAtrasoFocalBtn">Todos</button>
            <div class="multiselect-panel" id="msAtrasoFocalPanel"></div>
          </div>
        </label>
        <label class="check-inline">
          Filial:
          <div class="multiselect" id="msAtrasoUnidade">
            <button type="button" class="multiselect-btn" id="msAtrasoUnidadeBtn">Todas</button>
            <div class="multiselect-panel" id="msAtrasoUnidadePanel"></div>
          </div>
        </label>
        <button type="button" class="link-btn danger" id="limparAtrasos">Limpar documentos importados</button>
      </div>
      <div class="table-wrap" id="atrasosTableWrap"></div>
    </div>
  `;
}

let atrasosSelFocal = [];
let atrasosSelUnidade = [];
let atrasosSortCampo = null;   // null = tabela agrupada por Focal (padrão)
let atrasosSortDir = 1;        // 1 = crescente, -1 = decrescente

function relatarImportacaoAtraso(result, statusEl){
  if(!result || result.totalArquivo === 0){
    statusEl.textContent = "Não encontrei linhas nesse arquivo. Confira se é o relatório do SSW com as colunas CTRC / REMETENTE / DESTINATARIO / PAGADOR / UNID_ENTREGA / NOTA_FISCAL / FRETE / PREV_ENTREGA / COD_OCORRENCIA / DESCR_OCORRENCIA / DIAS_ATRASO.";
    return;
  }
  statusEl.textContent = `Arquivo com ${result.totalArquivo} linha(s): ${result.novos} novo(s), ${result.atualizados} atualizado(s).`;
}

function attachAtrasosEvents(){
  wireImportacaoDocumento({
    formId:"formAtrasosValArquivo", inputId:"atrasosValArquivoInput",
    toggleId:"toggleAtrasosValColarTexto", wrapId:"atrasosValColarTextoWrap",
    textareaId:"atrasosValTextoManual", processarId:"processarAtrasosValTextoManual",
    statusId:"atrasosValImportStatus", nomeFonte:"VAL",
    parseFn: parseAtrasosSsw, importFn: importAtrasos,
    relatarFn: relatarImportacaoAtraso, refreshFn: refreshAtrasosView
  });
  wireImportacaoDocumento({
    formId:"formAtrasosRvaArquivo", inputId:"atrasosRvaArquivoInput",
    toggleId:"toggleAtrasosRvaColarTexto", wrapId:"atrasosRvaColarTextoWrap",
    textareaId:"atrasosRvaTextoManual", processarId:"processarAtrasosRvaTextoManual",
    statusId:"atrasosRvaImportStatus", nomeFonte:"RVA",
    parseFn: parseAtrasosSsw, importFn: importAtrasos,
    relatarFn: relatarImportacaoAtraso, refreshFn: refreshAtrasosView
  });

  document.getElementById("limparAtrasos").addEventListener("click", ()=>{
    if(!confirm("Remover todos os documentos em atraso importados?")) return;
    save(KEYS.atrasos, []);
    refreshAtrasosView();
  });

  document.getElementById("atrasosBusca").addEventListener("input", renderAtrasosTable);

  const fsBtn = document.getElementById("atrasosFullscreenBtn");
  if(fsBtn){
    fsBtn.addEventListener("click", ()=> toggleFullscreen("atrasosTablePanel"));
    updateFullscreenBtnLabel("atrasosTablePanel", "atrasosFullscreenBtn");
  }

  const expBtn = document.getElementById("atrasosExportBtn");
  if(expBtn) expBtn.addEventListener("click", exportarAtrasosExcel);

  refreshAtrasosView();
}

function refreshAtrasosView(){
  const list = load(KEYS.atrasos);

  const focais = [...new Set(list.map(a=>a.focal).filter(Boolean))].sort();
  atrasosSelFocal = atrasosSelFocal.filter(v => focais.includes(v));
  buildMultiSelect({
    btnId:"msAtrasoFocalBtn", panelId:"msAtrasoFocalPanel", options:focais, selected:atrasosSelFocal,
    allLabel:"Todos", onChange:()=>{ refreshAtrasosView(); }
  });

  const unidades = [...new Set(list.map(a=>a.unidade).filter(Boolean))].sort();
  atrasosSelUnidade = atrasosSelUnidade.filter(v => unidades.includes(v));
  buildMultiSelect({
    btnId:"msAtrasoUnidadeBtn", panelId:"msAtrasoUnidadePanel", options:unidades, selected:atrasosSelUnidade,
    allLabel:"Todas", onChange:()=>{ refreshAtrasosView(); }
  });

  renderAtrasosKpis();
  renderAtrasosBreakdown();
  renderAtrasosTable();
  atualizarContadoresAbasOcorrencias();
  renderCnpjCadastroPendentes();
}

function renderAtrasosKpis(){
  const wrap = document.getElementById("atrasosKpiWrap");
  if(!wrap) return;
  const list = load(KEYS.atrasos);
  const semFocal = list.filter(a => a.focalOrigem === "indefinido").length;
  const valorFreteTotal = list.reduce((s,a)=> s + numeroOcorrenciaBR(a.frete), 0);
  const mediaDias = list.length ? Math.round(list.reduce((s,a)=> s + numeroAtrasoBR(a.diasAtraso), 0) / list.length) : 0;
  const criticos = list.filter(a => numeroAtrasoBR(a.diasAtraso) > 5).length;
  const pctSemFocal = list.length ? Math.round(semFocal/list.length*100) : 0;

  const banner = list.length === 0 ? "" : (semFocal > 0 ? `
    <div class="ocor-status-banner">
      <span class="ocor-status-icon">${OCOR_ICON_ALERT}</span>
      <div>
        <div class="ocor-status-title">${semFocal} documento${semFocal>1?'s':''} sem focal definido (${pctSemFocal}% do total)</div>
        <div class="ocor-status-sub">Pagador e filial não estão cadastrados em Confirmação de Filiais — confira na aba "Por Focal / Filial".</div>
      </div>
    </div>
  ` : `
    <div class="ocor-status-banner is-ok">
      <span class="ocor-status-icon">${OCOR_ICON_CHECK}</span>
      <div>
        <div class="ocor-status-title">Todos os documentos têm focal definido</div>
        <div class="ocor-status-sub">${list.length} documento${list.length>1?'s':''} em atraso importado${list.length>1?'s':''}, todos com responsável identificado.</div>
      </div>
    </div>
  `);

  wrap.innerHTML = `
    ${banner}
    <div class="kpi-grid">
      <div class="kpi-card ${list.length>0?'alert':'ok'}">
        <div class="kpi-top"><span class="kpi-icon">${OCOR_ICON_BOX}</span><div class="label">Documentos em atraso</div></div>
        <div class="value">${list.length}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-top"><span class="kpi-icon">${OCOR_ICON_TRUCK}</span><div class="label">Valor de frete em atraso</div></div>
        <div class="value" style="font-size:20px;">R$ ${money(valorFreteTotal)}</div>
      </div>
      <div class="kpi-card ${criticos>0?'alert':'ok'}">
        <div class="kpi-top"><span class="kpi-icon">${OCOR_ICON_ALERT}</span><div class="label">Mais de 5 dias de atraso</div></div>
        <div class="value">${criticos}</div>
        <div class="hint">Média geral: ${mediaDias} dia(s)</div>
      </div>
      <div class="kpi-card ${semFocal>0?'alert':'ok'}">
        <div class="kpi-top"><span class="kpi-icon">${semFocal>0?OCOR_ICON_ALERT:OCOR_ICON_CHECK}</span><div class="label">Sem focal definido</div></div>
        <div class="value">${semFocal}${list.length?` <span style="font-size:13px; font-weight:700; opacity:.65;">(${pctSemFocal}%)</span>`:''}</div>
        <div class="hint">Pagador e filial não cadastrados</div>
      </div>
    </div>
  `;
}

function renderAtrasosBreakdown(){
  const wrap = document.getElementById("atrasosBreakdownWrap");
  if(!wrap) return;
  const list = load(KEYS.atrasos);

  if(list.length === 0){
    wrap.innerHTML = `<div class="empty">Importe um arquivo para ver o resumo por Focal e por Filial.</div>`;
    return;
  }

  const porFocal = contagemPorCampo(list, "focal", "Sem focal definido");
  const porUnidade = contagemPorCampo(list, "unidade", "Sem filial");
  const valorFreteTotal = list.reduce((s,a)=> s + numeroOcorrenciaBR(a.frete), 0);

  wrap.innerHTML = `
    <div class="ocor-rank-grid">
      <div class="panel">
        <div class="panel-header">Distribuição por Focal</div>
        ${ocorDonutHTML(porFocal, "documentos")}
        <div style="padding:14px 18px 16px;">${rankingOcorrenciasHTML(porFocal, "Sem focal definido")}</div>
      </div>
      <div class="panel">
        <div class="panel-header">Distribuição por Filial</div>
        ${ocorDonutHTML(porUnidade, "documentos")}
        <div style="padding:14px 18px 16px;">${rankingOcorrenciasHTML(porUnidade, "Sem filial")}</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-header">Resumo financeiro</div>
      <div class="ocor-fin-card">
        <div class="ocor-fin-row">
          <div class="ocor-fin-top"><span class="ocor-fin-label">Valor de frete em atraso</span><span class="ocor-fin-value">R$ ${money(valorFreteTotal)}</span></div>
          <div class="ocor-fin-track"><div class="ocor-fin-fill" style="width:100%; background:var(--gold);"></div></div>
        </div>
      </div>
    </div>
  `;
}

function atrasosFiltrados(){
  let list = load(KEYS.atrasos);
  const busca = (document.getElementById("atrasosBusca").value || "").trim().toUpperCase();
  if(busca){
    list = list.filter(a =>
      (a.ctrc||"").toUpperCase().includes(busca) ||
      (a.remetente||"").toUpperCase().includes(busca) ||
      (a.destinatario||"").toUpperCase().includes(busca) ||
      (a.pagador||"").toUpperCase().includes(busca) ||
      (a.cnpjPagador||"").toUpperCase().includes(busca) ||
      (normalizarCnpj(busca) && normalizarCnpj(a.cnpjPagador).includes(normalizarCnpj(busca))) ||
      (a.nf||"").toUpperCase().includes(busca)
    );
  }
  if(atrasosSelFocal.length > 0) list = list.filter(a => atrasosSelFocal.includes(a.focal));
  if(atrasosSelUnidade.length > 0) list = list.filter(a => atrasosSelUnidade.includes(a.unidade));

  if(atrasosSortCampo){
    // Clique num cabeçalho da tabela (tipo Excel): ordena por qualquer
    // coluna, numericamente quando fizer sentido (Frete/Dias de Atraso) e
    // por texto (ignorando acentuação/caixa) nas demais.
    const campo = atrasosSortCampo;
    const numerico = campo === "diasAtraso" || campo === "frete";
    list.sort((a,b)=>{
      let va = a[campo] || "", vb = b[campo] || "";
      if(numerico){
        va = campo === "frete" ? numeroOcorrenciaBR(va) : numeroAtrasoBR(va);
        vb = campo === "frete" ? numeroOcorrenciaBR(vb) : numeroAtrasoBR(vb);
        return (va - vb) * atrasosSortDir;
      }
      return String(va).localeCompare(String(vb), 'pt-BR', {sensitivity:'base'}) * atrasosSortDir;
    });
  } else {
    // Padrão (sem coluna escolhida): maior atraso primeiro — é o que mais
    // precisa de atenção — dentro de cada grupo de Focal.
    list.sort((a,b)=> numeroAtrasoBR(b.diasAtraso) - numeroAtrasoBR(a.diasAtraso));
  }
  return list;
}

// CTRC e Nota Fiscal são CÓDIGOS, não quantidades: mesmo sendo só dígitos,
// não podem virar número ao exportar pro Excel (vira "3.141" com ponto de
// milhar, perde zero à esquerda, etc.). A classe "cel-texto" avisa o
// exportador genérico (exportar-excel.js) pra manter essas células como
// texto puro — mesma regra que a aba Ocorrências já usa.
const ATRASOS_CAMPOS_TEXTO = new Set(["ctrc", "nf"]);

function linhaAtraso(a){
  const alerta = numeroAtrasoBR(a.diasAtraso) > 5;
  return `
    <tr class="${alerta ? 'row-alert' : ''}">
      ${ATRASOS_COLUNAS_EXIBICAO.map(c => {
        const bruto = a[c.campo] || "";
        const texto = c.formatar ? c.formatar(bruto) : (c.exibir ? c.exibir(bruto) : (bruto || "-"));
        const classeTexto = ATRASOS_CAMPOS_TEXTO.has(c.campo) ? " cel-texto" : "";
        return `<td class="${classeTexto.trim()}" style="max-width:200px; white-space:normal;">${escHtml(texto)}</td>`;
      }).join("")}
    </tr>
  `;
}

// Cabeçalho clicável (tipo Excel): clicar ordena por aquela coluna; clicar
// de novo na mesma coluna inverte a direção. Enquanto uma coluna estiver
// escolhida, a tabela mostra a lista "achatada" (sem agrupar por Focal),
// porque as duas coisas juntas não fazem sentido visualmente.
function theadAtrasosHTML(){
  return `<tr>
    ${ATRASOS_COLUNAS_EXIBICAO.map(c => {
      const ativo = atrasosSortCampo === c.campo;
      const seta = ativo ? (atrasosSortDir === 1 ? " ▲" : " ▼") : "";
      return `<th class="th-sortable${ativo?' th-sort-ativo':''}" data-campo="${c.campo}" title="Clique para ordenar por ${escHtml(c.titulo)}" style="cursor:pointer; user-select:none;">${escHtml(c.titulo)}${seta}</th>`;
    }).join("")}
  </tr>`;
}

function renderAtrasosTable(){
  const wrap = document.getElementById("atrasosTableWrap");
  if(!wrap) return;
  const list = atrasosFiltrados();

  if(list.length === 0){
    wrap.innerHTML = `<div class="empty">Nenhum documento em atraso encontrado para esse filtro.</div>`;
    return;
  }

  const totalCols = ATRASOS_COLUNAS_EXIBICAO.length;
  const resetBtn = atrasosSortCampo ? `<button type="button" class="link-btn" id="atrasosResetOrdenacao">↺ Voltar a agrupar por Focal</button>` : "";

  let corpo;
  if(atrasosSortCampo){
    corpo = list.map(linhaAtraso).join("");
  } else {
    const grupos = agruparOcorrenciasPorFocal(list);
    corpo = grupos.map(g => `
      <tr class="ocor-group-row${g.focal==='Sem focal definido' ? ' ocor-group-row-alert' : ''}">
        <td colspan="${totalCols}">${escHtml(g.focal)} <span class="ocor-group-count">${g.itens.length} documento(s)</span></td>
      </tr>
      ${g.itens.map(linhaAtraso).join("")}
    `).join("");
  }

  wrap.innerHTML = `
    ${resetBtn ? `<div style="padding:8px 2px;">${resetBtn}</div>` : ""}
    <table id="atrasosTable">
      <thead>${theadAtrasosHTML()}</thead>
      <tbody>${corpo}</tbody>
    </table>
  `;

  wrap.querySelectorAll("#atrasosTable th[data-campo]").forEach(th=>{
    th.addEventListener("click", ()=>{
      const campo = th.dataset.campo;
      if(atrasosSortCampo === campo){
        atrasosSortDir = -atrasosSortDir;
      } else {
        atrasosSortCampo = campo;
        atrasosSortDir = 1;
      }
      renderAtrasosTable();
    });
  });
  const resetEl = document.getElementById("atrasosResetOrdenacao");
  if(resetEl) resetEl.addEventListener("click", ()=>{
    atrasosSortCampo = null;
    atrasosSortDir = 1;
    renderAtrasosTable();
  });
}

// Monta, fora da tela, uma tabela só com as 11 colunas combinadas — sem a
// coluna FOCAL — e chama o exportador genérico já usado no resto do site
// (exportar-excel.js). Respeita o filtro aplicado na tela.
// Exporta em várias abas: a primeira é um "Dashboard" com o mesmo resumo que
// aparece na tela (KPIs + distribuição por Focal/Filial/Sistema), e depois
// uma aba POR FOCAL, só com os documentos daquele Focal. A última coluna de
// cada aba de documentos (Sistema) mostra se o registro veio da importação
// VAL (Rede Do Valle) ou RVA (Real Vale).
async function exportarAtrasosExcel(){
  const list = atrasosFiltrados();
  if(list.length === 0){ alert("Não há documentos em atraso para exportar com esse filtro."); return; }

  const tabelasTemp = [];
  function novaTabelaTemp(classe){
    const t = document.createElement("table");
    t.className = classe;
    t.style.position = "absolute";
    t.style.left = "-9999px";
    t.style.top = "0";
    document.body.appendChild(t);
    tabelasTemp.push(t);
    return t;
  }

  // Cores do próprio painel (mesmas usadas no cabeçalho do Excel).
  const NAVY = "0F1C47", GOLD = "C99A2E", RED = "B42318", GREEN = "1C7A43";
  const FAIXA = "E7EAF4", LISTRA = "F6F7FB", TXT = "1C2333", MUTED = "5B6178";

  function st(props){ return Object.entries(props).map(([k,v])=>`${k}:${v}`).join(";"); }
  // Barra de título de seção (uma célula mesclada, fundo navy).
  function linhaSecao(titulo){
    return `<tr><td colspan="3" style="${st({"background-color":"#"+NAVY,color:"#FFFFFF","font-weight":700,"font-size":"11.5px"})}">${escHtml(titulo.toUpperCase())}</td></tr>`;
  }
  // Linha de indicador: rótulo à esquerda (fundo claro) + valor em destaque à direita.
  function linhaKpi(label, valor, tom){
    const cor = tom === "alerta" ? RED : tom === "ok" ? GREEN : NAVY;
    return `<tr>
      <td style="${st({"background-color":"#"+FAIXA,color:"#"+MUTED,"font-weight":600,"font-size":"10.5px"})}">${escHtml(label)}</td>
      <td colspan="2" style="${st({color:"#"+cor,"font-weight":700,"font-size":"14px"})}">${escHtml(valor)}</td>
    </tr>`;
  }
  function linhaEspaco(){
    return `<tr><td colspan="3" style="font-size:5px;">&nbsp;</td></tr>`;
  }
  function linhaCabTabela(){
    return `<tr>
      <td style="${st({"background-color":"#"+FAIXA,color:"#"+NAVY,"font-weight":700,"font-size":"10px"})}">Nome</td>
      <td style="${st({"background-color":"#"+FAIXA,color:"#"+NAVY,"font-weight":700,"font-size":"10px","text-align":"right"})}">Documentos</td>
      <td style="${st({"background-color":"#"+FAIXA,color:"#"+NAVY,"font-weight":700,"font-size":"10px","text-align":"right"})}">%</td>
    </tr>`;
  }
  function linhaRank(nome, qtd, pct, i, alerta){
    const fundo = i % 2 === 0 ? "FFFFFF" : LISTRA;
    return `<tr>
      <td style="${st({"background-color":"#"+fundo,color: alerta ? "#"+RED : "#"+TXT,"font-weight": alerta ? 700 : 500})}">${escHtml(nome || "—")}</td>
      <td style="${st({"background-color":"#"+fundo,"text-align":"right"})}">${qtd}</td>
      <td style="${st({"background-color":"#"+fundo,"text-align":"right",color:"#"+GOLD,"font-weight":700})}">${pct}%</td>
    </tr>`;
  }
  function blocoRanking(titulo, linhas, total, rotuloAlerta){
    return linhaSecao(titulo) + linhaCabTabela() +
      linhas.map(([nome,qtd],i) => linhaRank(nome, qtd, total?Math.round(qtd/total*100):0, i, nome===rotuloAlerta)).join("") +
      linhaEspaco();
  }

  const semFocal = list.filter(a => a.focalOrigem === "indefinido").length;
  const valorFreteTotal = list.reduce((s,a)=> s + numeroOcorrenciaBR(a.frete), 0);
  const mediaDias = list.length ? Math.round(list.reduce((s,a)=> s + numeroAtrasoBR(a.diasAtraso), 0) / list.length) : 0;
  const criticos = list.filter(a => numeroAtrasoBR(a.diasAtraso) > 5).length;
  const pctSemFocal = list.length ? Math.round(semFocal/list.length*100) : 0;
  const porFocal = contagemPorCampo(list, "focal", "Sem focal definido");
  const porUnidade = contagemPorCampo(list, "unidade", "Sem filial");
  const porOrigem = contagemPorCampo(list, "origem", "Sem sistema definido");

  // ---------- Aba 1: Dashboard — visual limpo, cores do painel, fácil de ler ----------
  const dashTable = novaTabelaTemp("atrasos-export-dashboard");
  dashTable.innerHTML = `<tbody>
    ${linhaSecao("Resumo geral")}
    ${linhaKpi("Documentos em atraso", String(list.length), list.length>0 ? "alerta" : "ok")}
    ${linhaKpi("Valor de frete em atraso", "R$ " + money(valorFreteTotal), null)}
    ${linhaKpi("Mais de 5 dias de atraso", `${criticos}  (média geral: ${mediaDias} dia(s))`, criticos>0 ? "alerta" : "ok")}
    ${linhaKpi("Sem focal definido", `${semFocal}  (${pctSemFocal}%)`, semFocal>0 ? "alerta" : "ok")}
    ${linhaEspaco()}
    ${blocoRanking("Distribuição por Focal", porFocal, list.length, "Sem focal definido")}
    ${blocoRanking("Distribuição por Filial", porUnidade, list.length, "Sem filial")}
    ${blocoRanking("Distribuição por Sistema (VAL / RVA)", porOrigem, list.length, "Sem sistema definido")}
  </tbody>`;

  const sheets = [{
    nome: "Dashboard",
    titulo: "Documentos em Atraso — Dashboard",
    subtitulo: atrasosSelFocal.length ? `Focal: ${atrasosSelFocal.join(", ")}` : "",
    tabela: dashTable,
    rodape: semFocal>0
      ? `${semFocal} documento(s) sem focal definido (${pctSemFocal}% do total) — pagador e filial não estão cadastrados em Confirmação de Filiais.`
      : "Todos os documentos têm focal definido."
  }];

  // ---------- Uma aba por Focal, com as colunas da tela (a última é o Sistema: VAL/RVA) ----------
  const grupos = agruparOcorrenciasPorFocal(list);
  grupos.forEach(g => {
    const t = novaTabelaTemp("atrasos-export-table");
    t.innerHTML = `
      <thead><tr>${ATRASOS_COLUNAS_EXIBICAO.map(c=>`<th>${escHtml(c.titulo.toUpperCase())}</th>`).join("")}</tr></thead>
      <tbody>
        ${g.itens.map(a => `<tr>${ATRASOS_COLUNAS_EXIBICAO.map(c => {
          const bruto = a[c.campo] || "";
          const texto = c.formatar ? c.formatar(bruto) : (c.exibir ? c.exibir(bruto) : (c.campo === "origem" ? (bruto || "—") : bruto));
          const classeTexto = ATRASOS_CAMPOS_TEXTO.has(c.campo) ? " class=\"cel-texto\"" : "";
          return `<td${classeTexto}>${escHtml(texto)}</td>`;
        }).join("")}</tr>`).join("")}
      </tbody>
    `;
    sheets.push({
      nome: g.focal,
      titulo: `Documentos em Atraso — ${g.focal}`,
      subtitulo: `${g.itens.length} documento(s)`,
      tabela: t,
      rodape: "Última coluna (Sistema) indica se o documento veio da importação VAL (Rede Do Valle) ou RVA (Real Vale)."
    });
  });

  try{
    await exportarTabelasExcel(sheets, `Documentos_Atraso_${dataParaArquivo()}.xlsx`);
  } finally {
    tabelasTemp.forEach(t => t.remove());
  }
}

/* ================= INIT ================= */
function initMobileMenu(){
  const menuBtn = document.getElementById("menuBtn");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  if(!menuBtn) return;
  menuBtn.addEventListener("click", ()=>{
    sidebar.classList.toggle("open");
    overlay.classList.toggle("show");
  });
  overlay.addEventListener("click", closeMobileSidebar);
}

// Botão de recolher/expandir o menu lateral (deixa só os ícones, dando mais
// espaço pra tela — igual ao padrão pedido). Lembra a escolha entre sessões.
function initSidebarCollapse(){
  const KEY = "painel_sidebar_collapsed";
  const btn = document.getElementById("sidebarCollapseBtn");
  if(!btn) return;
  function aplicar(collapsed){
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    btn.innerHTML = collapsed ? "›" : "‹";
    btn.title = collapsed ? "Expandir menu" : "Recolher menu";
    try{ localStorage.setItem(KEY, collapsed ? "1" : "0"); }catch(e){}
  }
  let collapsed = false;
  try{ collapsed = localStorage.getItem(KEY) === "1"; }catch(e){}
  aplicar(collapsed);
  btn.addEventListener("click", ()=> aplicar(!document.body.classList.contains("sidebar-collapsed")));
}

/* ---------- Auditoria de focal (garantia contra "documento na carteira errada") ----------
   Para cada documento (69 e 150) cujo CNPJ de pagador é de um Cliente Premium com Focal,
   confere se o focal gravado é o esperado. Devolve a lista de divergências. */
function auditarFocaisPremium(){
  const divergencias = [];
  [[KEYS.ocorrencias,"Ocorrências (69)"],[KEYS.atrasos,"Docs em atraso (150)"]].forEach(([key, rotulo]) => {
    load(key).forEach(item => {
      const prem = buscarClientePremium(item.cnpjPagador);
      if(!prem || !prem.focalId) return;
      const focalPrem = FOCAIS.find(f => f.id === prem.focalId);
      if(!focalPrem) return;
      const esperado = definirFocalOcorrencia(item.pagador, item.unidade, item.cnpjPagador).titulo;
      if(item.focal !== esperado){
        divergencias.push({tela: rotulo, ctrc: item.ctrc, pagador: item.pagador, unidade: item.unidade, gravado: item.focal, esperado});
      }
    });
  });
  return divergencias;
}

// Versão da regra de focal: ao mudar a regra, bump aqui -> todos os documentos já
// importados são recalculados UMA vez (sem precisar reimportar nem mexer no cadastro).
const REGRA_FOCAL_VERSAO = "2026-10-carteira-do-pagador-v2";
function aplicarRegraFocalVersionada(){
  try{
    if(localStorage.getItem("tambasa_regra_focal_versao") === REGRA_FOCAL_VERSAO) return;
    // Premium padrão que tinha restrição de unidades passa a valer em todas as unidades.
    const padraoCnpjs = new Set(CLIENTES_PREMIUM_PADRAO.filter(c => !c.unidades).map(c => normalizarCnpj(c.cnpj)));
    let mudouPrem = false;
    CLIENTES_PREMIUM.forEach(c => { if(padraoCnpjs.has(normalizarCnpj(c.cnpj)) && c.unidades){ c.unidades = ""; mudouPrem = true; } });
    if(mudouPrem) salvarClientesPremium();
    [KEYS.ocorrencias, KEYS.atrasos].forEach(key => {
      const lista = load(key);
      if(!lista.length) return;
      lista.forEach(item => {
        const focal = definirFocalOcorrencia(item.pagador, item.unidade, item.cnpjPagador);
        item.focal = focal.titulo;
        item.focalOrigem = focal.origem;
      });
      save(key, lista);
    });
    localStorage.setItem("tambasa_regra_focal_versao", REGRA_FOCAL_VERSAO);
  }catch(e){ console.error("Falha ao recalcular focais:", e); }
}

document.addEventListener("DOMContentLoaded", ()=>{
  ensureConfirmacoes();
  aplicarRegraFocalVersionada();
  const divs = auditarFocaisPremium();
  if(divs.length) console.warn("[Focal] " + divs.length + " documento(s) premium fora do Focal esperado:", divs);
  renderNav();
  renderApp();
  setTodayLabel();
  initMobileMenu();
  initSidebarCollapse();
});


/* ---------- Visual Do Valle (modo apresentação) ---------- */
(function(){
  const KEY = "painel_visual";
  const LOGOS = { tambasa:"logo.png", dovalle:"logo-dovalle.png" };
  function aplicar(tema){
    const dv = tema === "dovalle";
    document.body.classList.toggle("theme-dovalle", dv);
    document.querySelectorAll("img[data-brand-logo]").forEach(img=>{
      img.src = dv ? LOGOS.dovalle : LOGOS.tambasa;
      img.alt = dv ? "Do Valle Transportadora" : "Tambasa Atacadistas";
    });
    const lbl = document.getElementById("themeSwitchLabel");
    if(lbl) lbl.textContent = dv ? "Voltar ao visual Tambasa" : "Visual Do Valle";
    document.title = dv ? "Do Valle | Painel de Controle" : "Tambasa | Painel de Controle";
    try{ localStorage.setItem(KEY, tema); }catch(e){}
  }
  document.addEventListener("DOMContentLoaded", ()=>{
    let atual = "tambasa";
    try{ atual = localStorage.getItem(KEY) || "tambasa"; }catch(e){}
    aplicar(atual);
    const btn = document.getElementById("themeSwitch");
    if(btn) btn.addEventListener("click", ()=>{
      atual = document.body.classList.contains("theme-dovalle") ? "tambasa" : "dovalle";
      aplicar(atual);
    });
  });
})();
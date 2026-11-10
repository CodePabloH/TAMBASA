/* =====================================================================
   COMPARAÇÃO SACFLOW — ANTES x DEPOIS de uma data de entrada.
   Aba independente (mesmo molde do "Impacto Supervisão"): guarda os próprios dados, mês a mês,
   e NÃO mistura com a aba SacFlow nem com nenhuma outra tela.

   Fonte dos dados: o "Relatório de SLA" do SacFlow (tabela "Performance da equipe"):
     Atendente · Atend. · Taxa de acerto · TPR (acertos/total) · TRS (acertos/total) · TR (acertos/total)
       TPR = tempo de primeira resposta · TRS = tempo de respostas seguintes · TR = tempo de resolução

   Cálculos (sempre refeitos a partir das contagens, nunca de percentuais digitados):
     total de eventos  = TPR.total + TRS.total + TR.total
     acertos           = TPR.acertos + TRS.acertos + TR.acertos
     violações         = total − acertos
     taxa de acerto    = acertos ÷ total          (bate com o relatório: 63,32 % = 1 − 938/2.557)

   TUDO É EDITÁVEL: data de entrada, quantos meses antes/depois e cada número de cada atendente.
   Janela de meses: N meses ANTES do mês de entrada e N meses DEPOIS. Se a entrada foi no dia 1,
   o mês da entrada já conta como 1º mês "depois". Se foi no meio do mês, esse mês aparece como
   "Entrada (parcial)" e fica FORA das médias.
   ===================================================================== */
(function(){
  "use strict";

  const KEY = "valle_sacflow_comparacao_v1";
  const MESES_ABR = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const TIPOS = [
    {k:"tpr", nome:"Primeira resposta (TPR)", curto:"TPR", cor:"#3d86c6"},
    {k:"trs", nome:"Respostas seguintes (TRS)", curto:"TRS", cor:"#ffa30a"},
    {k:"tr",  nome:"Resolução (TR)", curto:"TR", cor:"#8e5bd6"}
  ];
  const SUBS = [
    {id:"dados", label:"Período e Importação"},
    {id:"geral", label:"Visão Geral"},
    {id:"sla", label:"SLA por tipo"},
    {id:"atend", label:"Por atendente"},
    {id:"editar", label:"Corrigir dados do mês"}
  ];
  const COR = {geral:"#141a14"};
  const EXEMPLO = `Relatório de SLA — exportado do SacFlow
Período: 01/09/2026 a 20/09/2026

Usuários	Atend.	Taxa de acerto	TPR	TRS	TR
Monique P.
Atendente SAC	73	70.86%	30/58 (51.72%)	155/198 (78.28%)	46/70 (65.71%)
Camila M.
Supervisor SAC	1	0%	-	-	0/1 (0%)
Jessica F.
Atendente SAC	13	70%	4/10 (40%)	19/27 (70.37%)	12/13 (92.31%)
Pabline Q.
Atendente SAC	60	71.17%	26/52 (50%)	140/188 (74.47%)	34/41 (82.93%)
Ester C.
Atendente SAC	71	46.92%	12/56 (21.43%)	59/129 (45.74%)	51/75 (68%)
Camila R.
Atendente SAC	28	62.04%	7/17 (41.18%)	44/65 (67.69%)	16/26 (61.54%)
Chrishyna L.
CRM - Cadastro Comercial	6	73.91%	5/6 (83.33%)	10/11 (90.91%)	2/6 (33.33%)
Zélia S.
Atendente SAC	110	62.53%	42/96 (43.75%)	210/288 (72.92%)	55/107 (51.4%)
Keslley C.
Atendente SAC	131	61.15%	36/98 (36.73%)	224/351 (63.82%)	102/143 (71.33%)
Pablo H
Atendente SAC	8	73.33%	3/3 (100%)	5/6 (83.33%)	3/6 (50%)
Stephanne J
Recepcionista	60	59.17%	19/58 (32.76%)	129/186 (69.35%)	23/45 (51.11%)
Nicolly N.
Recepcionista	24	79.34%	17/22 (77.27%)	64/77 (83.12%)	15/22 (68.18%)`;

  /* ---------------- armazenamento ---------------- */
  function padrao(){
    return {cfg:{antes_rot:"Antes da entrada", depois_rot:"Depois da entrada", entrada:"2026-09-01", antes:3, depois:3}, mes:{}};
  }
  function carregar(){
    try{
      const o = JSON.parse(LS.getItem(KEY) || "null");
      if(o && o.cfg){ const p = padrao(); return {cfg:Object.assign(p.cfg, o.cfg), mes:o.mes || {}}; }
    }catch(e){ /* ignora */ }
    return padrao();
  }
  let D = carregar();
  let sub = "dados";
  let mesEdit = null;                 // mês aberto em "Corrigir dados do mês"
  let msg = {txt:"", ok:false};
  function gravar(){
    try{ LS.setItem(KEY, JSON.stringify(D)); return true; }
    catch(e){ alert("Não consegui salvar no navegador (espaço cheio?)."); return false; }
  }

  /* ---------------- utilidades ---------------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const isN = v => typeof v === "number" && isFinite(v);
  const num = v => (isN(v) ? v : 0);
  const fN = v => num(v).toLocaleString("pt-BR", {maximumFractionDigits:0});
  const fN1 = v => num(v).toLocaleString("pt-BR", {maximumFractionDigits:1});
  const fP = v => (v == null || !isFinite(v)) ? "—" : v.toFixed(1).replace(".", ",") + "%";
  const fP2 = v => (v == null || !isFinite(v)) ? "—" : v.toFixed(2).replace(".", ",") + "%";
  const fMin = v => {                           // minutos -> "35 min" / "2h 05min"
    if(v == null || !isFinite(v)) return "—";
    if(v < 60) return fN1(v) + " min";
    const h = Math.floor(v / 60), m = Math.round(v - h * 60);
    return h + "h" + (m ? " " + String(m).padStart(2, "0") + "min" : "");
  };
  const mesKey = n => Math.floor(n / 12) + "-" + String(n % 12 + 1).padStart(2, "0");
  const mesRot = k => { const [y, m] = k.split("-"); return MESES_ABR[+m - 1] + "/" + y; };
  const fData = iso => { if(!iso) return "—"; const [y, m, d] = iso.split("-"); return d + "/" + m + "/" + y; };
  const sem = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const nkey = s => sem(s).replace(/\s+/g, " ").replace(/\.+$/, "").trim();     // "Pablo H" = "Pablo H."
  function lerNum(txt){
    let t = String(txt == null ? "" : txt).trim().replace(/[\s%]/g, "");
    if(t === "") return null;
    if(t.indexOf(",") !== -1) t = t.replace(/\./g, "").replace(",", ".");
    const n = Number(t);
    return isFinite(n) ? n : null;
  }
  const lerInt = txt => { const n = lerNum(txt); return n == null ? null : Math.max(0, Math.round(n)); };
  const ultimoDia = k => { const [y, m] = k.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

  /* ---------------- janela de meses ---------------- */
  function janela(){
    const c = D.cfg;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(c.entrada || "") || /^(\d{4})-(\d{2})-(\d{2})$/.exec("2026-09-01");
    const y = +m[1], mm = +m[2], d = +m[3];
    const base = y * 12 + (mm - 1);
    const nA = Math.max(1, Math.min(24, parseInt(c.antes, 10) || 3));
    const nD = Math.max(1, Math.min(24, parseInt(c.depois, 10) || 3));
    const antes = [], depois = [];
    for(let i = nA; i >= 1; i--) antes.push(mesKey(base - i));
    const parcial = d > 1;
    const ini = parcial ? base + 1 : base;
    for(let i = 0; i < nD; i++) depois.push(mesKey(ini + i));
    const cols = antes.map(k => ({k, tipo:"antes"}));
    if(parcial) cols.push({k:mesKey(base), tipo:"trans"});
    depois.forEach(k => cols.push({k, tipo:"depois"}));
    return {antes, depois, parcial, mesEntrada:mesKey(base), cols, marca:antes.length};
  }
  const ROT_TIPO = {antes:"Antes", trans:"Entrada (parcial)", depois:"Depois"};

  /* ---------------- cálculo por mês ---------------- */
  // célula [acertos, total] válida?
  const par = c => Array.isArray(c) && isN(c[0]) && isN(c[1]);
  function totaisMes(mo){
    // soma dos atendentes: por tipo {a,t}, mais eventos, atendimentos e nº de atendentes
    if(!mo || !mo.atend || !mo.atend.length) return null;
    const r = {tpr:{a:0, t:0}, trs:{a:0, t:0}, tr:{a:0, t:0}, n:0, nAt:0, temN:false};
    mo.atend.forEach(x => {
      r.nAt++;
      TIPOS.forEach(tp => { if(par(x[tp.k])){ r[tp.k].a += x[tp.k][0]; r[tp.k].t += x[tp.k][1]; } });
      if(isN(x.n)){ r.n += x.n; r.temN = true; }
    });
    r.t = r.tpr.t + r.trs.t + r.tr.t;
    r.a = r.tpr.a + r.trs.a + r.tr.a;
    if(!r.t) return null;
    return r;
  }
  const mesDados = k => totaisMes(D.mes[k]);
  const taxa = (a, t) => (t > 0 ? a / t * 100 : null);

  // soma de vários meses (só os que têm dado) -> taxa "agrupada" (pooled)
  function periodo(meses){
    const r = {tpr:{a:0, t:0}, trs:{a:0, t:0}, tr:{a:0, t:0}, a:0, t:0, n:0, temN:false, nMes:0, meses:[]};
    meses.forEach(k => {
      const m = mesDados(k); if(!m) return;
      r.nMes++; r.meses.push(k);
      TIPOS.forEach(tp => { r[tp.k].a += m[tp.k].a; r[tp.k].t += m[tp.k].t; });
      r.a += m.a; r.t += m.t;
      if(m.temN){ r.n += m.n; r.temN = true; }
    });
    return r.nMes ? r : null;
  }
  // média mensal simples de um campo extra (tempo médio, atendimentos com SLA)
  function mediaExtra(meses, campo){
    const v = meses.map(k => D.mes[k] && D.mes[k].extra && D.mes[k].extra[campo]).filter(isN);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }
  const viol = o => o ? o.t - o.a : null;


  /* ---------------- equipe e produtividade ----------------
     Equipe do mês = atendentes que aparecem no relatório com algum evento de SLA (ou atendimento) naquele mês.
     Para não punir mês parcial, a produtividade é medida por ATENDENTE-DIA: volume ÷ (atendentes × dias cobertos pelo relatório). */
  const fN2 = v => num(v).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
  const diasMes = k => {
    const mo = D.mes[k];
    if(mo && mo.ini && mo.fim){ const d = (Date.parse(mo.fim) - Date.parse(mo.ini)) / 864e5 + 1; if(isFinite(d) && d >= 1) return Math.round(d); }
    return ultimoDia(k);
  };
  function prodMes(k){
    const mo = D.mes[k], m = mesDados(k); if(!mo || !m) return null;
    const ativos = mo.atend.filter(x => (isN(x.n) && x.n > 0) || TIPOS.some(tp => par(x[tp.k]) && x[tp.k][1] > 0)).length;
    if(!ativos) return null;
    const dias = diasMes(k), ad = ativos * dias;
    return {ativos, dias, ad, t:m.t, a:m.a, viol:m.t - m.a, n:m.temN ? m.n : null, taxa:taxa(m.a, m.t),
      evAt:m.t / ativos, evAtDia:m.t / ad, atAtDia:m.temN ? m.n / ad : null, violAtDia:(m.t - m.a) / ad};
  }
  function prodPeriodo(meses){
    const r = {ad:0, t:0, a:0, nad:0, n:0, ativosSoma:0, nMes:0};
    meses.forEach(k => { const p = prodMes(k); if(!p) return; r.nMes++; r.ad += p.ad; r.t += p.t; r.a += p.a; r.ativosSoma += p.ativos; if(p.n != null){ r.n += p.n; r.nad += p.ad; } });
    if(!r.nMes) return null;
    return {ativos:r.ativosSoma / r.nMes, evAtDia:r.t / r.ad, violAtDia:(r.t - r.a) / r.ad, atAtDia:r.nad ? r.n / r.nad : null, taxa:taxa(r.a, r.t)};
  }

  /* ---------------- comparação ---------------- */
  // tipo "pct": variação em pontos percentuais; demais: variação em %. melhor: "maior" | "menor" | "neutro"
  function comparar(antes, depois, tipo, melhor){
    if(antes == null || depois == null) return {txt:"sem dados dos dois lados", cls:"neutro", seta:"", delta:null};
    const delta = depois - antes;
    let txt;
    if(tipo === "pct") txt = (delta >= 0 ? "+" : "−") + Math.abs(delta).toFixed(1).replace(".", ",") + " p.p.";
    else if(antes === 0) txt = delta === 0 ? "0%" : "novo";
    else { const p = delta / Math.abs(antes) * 100; txt = (p >= 0 ? "+" : "−") + Math.abs(p).toFixed(1).replace(".", ",") + "%"; }
    let bom = null;
    if(Math.abs(delta) >= 1e-9 && melhor !== "neutro") bom = (melhor || "maior") === "maior" ? delta > 0 : delta < 0;
    return {txt, cls:bom == null ? "neutro" : (bom ? "bom" : "ruim"), seta:delta > 1e-9 ? "▲" : (delta < -1e-9 ? "▼" : "■"), delta};
  }

  function metricas(J){
    const A = periodo(J.antes), P = periodo(J.depois);
    const pa = (o, k) => (o ? (k ? taxa(o[k].a, o[k].t) : taxa(o.a, o.t)) : null);
    const mensal = (o, v) => (o && v != null ? v / o.nMes : null);
    const L = [];
    L.push({id:"geral", nome:"Taxa de acerto (geral)", a:pa(A), d:pa(P), tipo:"pct", fmt:fP2, melhor:"maior"});
    TIPOS.forEach(tp => L.push({id:tp.k, nome:"Taxa de acerto · " + tp.curto, a:pa(A, tp.k), d:pa(P, tp.k), tipo:"pct", fmt:fP2, melhor:"maior"}));
    L.push({id:"viol", nome:"Violações / mês", a:mensal(A, A && viol(A)), d:mensal(P, P && viol(P)), tipo:"n", fmt:fN, melhor:"menor"});
    L.push({id:"ev", nome:"Eventos com SLA / mês", a:mensal(A, A && A.t), d:mensal(P, P && P.t), tipo:"n", fmt:fN, melhor:"neutro"});
    const PA = prodPeriodo(J.antes), PD = prodPeriodo(J.depois);
    L.push({id:"ativos", nome:"Atendentes na equipe (média)", a:PA && PA.ativos, d:PD && PD.ativos, tipo:"n", fmt:fN1, melhor:"neutro", prod:true});
    L.push({id:"evAtDia", nome:"Eventos de SLA / atendente / dia", a:PA && PA.evAtDia, d:PD && PD.evAtDia, tipo:"n", fmt:fN2, melhor:"maior", prod:true});
    L.push({id:"atAtDia", nome:"Atendimentos / atendente / dia", a:PA && PA.atAtDia, d:PD && PD.atAtDia, tipo:"n", fmt:fN2, melhor:"maior", prod:true});
    L.push({id:"violAtDia", nome:"Violações / atendente / dia", a:PA && PA.violAtDia, d:PD && PD.violAtDia, tipo:"n", fmt:fN2, melhor:"menor", prod:true});
    L.push({id:"atend", nome:"Atendimentos / mês", a:A && A.temN ? A.n / A.nMes : null, d:P && P.temN ? P.n / P.nMes : null, tipo:"n", fmt:fN, melhor:"neutro"});
    [["tmTpr", "Tempo médio · TPR"], ["tmTrs", "Tempo médio · TRS"], ["tmTr", "Tempo médio · TR"]].forEach(([c, nome]) => {
      L.push({id:c, nome, a:mediaExtra(J.antes, c), d:mediaExtra(J.depois, c), tipo:"n", fmt:fMin, melhor:"menor", opcional:true});
    });
    const algumParcial = k => J.antes.concat(J.depois).some(x => mesDados(x) && parcialMes(x));
    L.forEach(m => { m.nota = notaCob(J, m); if(["viol", "ev", "atend"].includes(m.id) && algumParcial()) m.nota += " · inclui mês parcial (volume menor)"; });
    return L;
  }
  function notaCob(J, m){
    if(m.prod){ const c = ms => ms.filter(k => prodMes(k)).length; return `${c(J.antes)}/${J.antes.length} meses antes · ${c(J.depois)}/${J.depois.length} depois`; }
    const c = (ms) => ms.filter(k => (m.opcional ? (D.mes[k] && D.mes[k].extra && isN(D.mes[k].extra[m.id])) : mesDados(k))).length;
    return `${c(J.antes)}/${J.antes.length} meses antes · ${c(J.depois)}/${J.depois.length} depois`;
  }

  /* ---------------- gráficos (SVG com estilo embutido) ----------------
     Todos os atributos visuais ficam DENTRO do SVG (nada de classe CSS), por isso o mesmo desenho serve
     na tela, no Excel (vira imagem PNG) e no PDF. Cada função devolve o texto do <svg>.
     Regras de honestidade: barras partem do zero; linhas de taxa podem recortar o eixo (o eixo mostra os valores);
     mês parcial aparece tracejado/oco e com a etiqueta "parcial"; atendente com poucos eventos aparece esmaecido. */
  const FONTE = "Segoe UI, Arial, Helvetica, sans-serif";
  const CU = {tinta:"#141a14", mudo:"#667360", grade:"#e3e8df", antes:"#8b95a8", depois:"#2f8a2a", bom:"#2f8a2a", ruim:"#b3261e", acerto:"#3aa55a", viol:"#e5484d", ouro:"#5cb531", ambar:"#a8710a"};
  let _uid = 0;
  const svgAbre = (W, H, rot) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" class="cs-chart" role="img" aria-label="${esc(rot || "")}" font-family="${FONTE}">`;
  function T(x, y, txt, o){
    o = o || {};
    return `<text x="${(+x).toFixed(1)}" y="${(+y).toFixed(1)}" font-size="${o.s || 11}" fill="${o.c || CU.mudo}" font-weight="${o.w || 500}" text-anchor="${o.a || "start"}"${o.i ? ' font-style="italic"' : ""}${o.halo ? ' stroke="#fff" stroke-width="3" paint-order="stroke" stroke-linejoin="round"' : ""}>${esc(txt)}</text>`;
  }
  const passo = (range, n) => { const raw = range / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  const vazioSvg = txt => `<div class="cs-vazio">${txt || "Sem dados nos meses desta comparação — importe ou digite os números na aba “Período e Importação”."}</div>`;
  const ehSvg = s => typeof s === "string" && s.indexOf("<svg") === 0;
  const parcialMes = k => { const mo = D.mes[k]; return !!(mo && periodoMes(k).parcial); };
  const sinalPP = d => (d >= 0 ? "+" : "−") + Math.abs(d).toFixed(1).replace(".", ",") + " p.p.";

  // legenda em linha, alinhada à direita
  function legenda(itens, xFim, y){
    let x = xFim, s = "";
    itens.slice().reverse().forEach(it => {
      const w = 22 + it.nome.length * 6.1;
      x -= w;
      if(it.forma === "hatch") s += `<rect x="${x}" y="${y - 9}" width="11" height="11" rx="2" fill="#fff" stroke="${CU.ambar}" stroke-dasharray="3 2"/>`;
      else if(it.forma === "linha") s += `<line x1="${x - 2}" x2="${x + 13}" y1="${y - 3.5}" y2="${y - 3.5}" stroke="${it.cor}" stroke-width="2.6" stroke-linecap="round"/><circle cx="${x + 5.5}" cy="${y - 3.5}" r="3.2" fill="${it.cor}"/>`;
      else s += `<rect x="${x}" y="${y - 9}" width="11" height="11" rx="3" fill="${it.cor}"/>`;
      s += T(x + 16, y, it.nome, {s:11, c:CU.tinta, w:600});
      x -= 10;
    });
    return s;
  }
  // zonas ANTES / DEPOIS + linha da data de entrada
  function zonas(J, g){
    const xm = g.pl + g.bw * J.marca;
    let s = `<rect x="${g.pl}" y="${g.pt}" width="${xm - g.pl}" height="${g.ih}" fill="#9aa595" fill-opacity=".10"/>`
      + `<rect x="${xm}" y="${g.pt}" width="${g.W - g.pr - xm}" height="${g.ih}" fill="#2fb36b" fill-opacity=".09"/>`
      + T(g.pl + 8, g.pt - 10, "ANTES", {s:11, w:800, c:"#5b6482"}) + T(xm + 8, g.pt - 10, "DEPOIS", {s:11, w:800, c:CU.depois});
    return {xm, s};
  }
  function marcaEntrada(g, xm){
    return `<line x1="${xm}" x2="${xm}" y1="${g.pt - 6}" y2="${g.pt + g.ih}" stroke="${CU.ouro}" stroke-width="2" stroke-dasharray="5 4"/>`
      + T(xm, g.H - 6, "▲ entrada " + fData(D.cfg.entrada), {s:10.5, w:800, c:CU.ambar, a:"middle"});
  }
  function rotulosMes(J, g, yBase){
    let s = "";
    J.cols.forEach((c, i) => {
      const cx = g.pl + g.bw * i + g.bw / 2, par_ = parcialMes(c.k);
      s += T(cx, yBase, mesRot(c.k), {s:11.5, c:CU.tinta, w:700, a:"middle"});
      if(par_) s += T(cx, yBase + 12, "parcial", {s:9.5, c:CU.ambar, w:800, a:"middle"});
      else if(c.tipo === "trans") s += T(cx, yBase + 12, "entrada", {s:9.5, c:CU.ambar, w:800, a:"middle"});
      if(!mesDados(c.k)) s += T(cx, yBase + 12, "sem dados", {s:9.5, c:"#a0a89b", w:600, a:"middle", i:true});
    });
    return s;
  }

  /* 1) taxa mês a mês (linhas) */
  function grafLinha(J, o){
    const W = o.W || 640, H = o.H || 300, pl = 52, pr = 18, pt = 44, pb = 62;
    const n = J.cols.length, iw = W - pl - pr, ih = H - pt - pb, bw = iw / n;
    const todos = [];
    o.series.forEach(s => s.vals.forEach(v => { if(v != null) todos.push(v); }));
    if(!todos.length) return vazioSvg();
    let mn = Math.min.apply(null, todos), mx = Math.max.apply(null, todos);
    if(o.medias) [o.medias.antes, o.medias.depois].forEach(v => { if(v != null){ mn = Math.min(mn, v); mx = Math.max(mx, v); } });
    const st = passo(Math.max(mx - mn, 5), 4);
    mn = Math.max(0, Math.floor((mn - st * 0.5) / st) * st);
    mx = Math.ceil((mx + st * 0.5) / st) * st;
    if(o.teto) mx = Math.min(mx, o.teto);
    if(mx <= mn) mx = mn + st;
    const g = {W, H, pl, pr, pt, ih, bw};
    const y = v => pt + ih - (v - mn) / (mx - mn) * ih;
    const z = zonas(J, g);
    let s = svgAbre(W, H, o.titulo) + z.s;
    for(let v = mn; v <= mx + 1e-9; v += st){
      s += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="${CU.grade}"/>` + T(pl - 8, y(v) + 4, o.fmtEixo(v), {s:10.5, a:"end"});
    }
    s += rotulosMes(J, g, pt + ih + 18);
    // médias ponderadas de cada período (soma das contagens, não média de percentuais)
    if(o.medias){
      [[o.medias.antes, pl, z.xm, CU.antes, "média antes"], [o.medias.depois, z.xm, W - pr, CU.depois, "média depois"]].forEach(([v, x1, x2, cor, rot]) => {
        if(v == null) return;
        s += `<line x1="${x1 + 5}" x2="${x2 - 5}" y1="${y(v)}" y2="${y(v)}" stroke="${cor}" stroke-width="1.6" stroke-dasharray="6 4" opacity=".9"/>`
          + T(x1 + 8, y(v) + 14, rot + " " + o.fmtVal(v), {s:10, w:800, c:cor, a:"start", halo:true});
      });
    }
    o.series.forEach(se => {
      const pts = se.vals.map((v, i) => v == null ? null : [pl + bw * i + bw / 2, y(v), v, i]);
      // área suave sob a série principal
      if(se.area){
        let seg = [];
        const fecha = () => { if(seg.length > 1) s += `<path d="M${seg[0][0].toFixed(1)} ${y(mn)} ${seg.map(p => "L" + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ")} L${seg[seg.length - 1][0].toFixed(1)} ${y(mn)}Z" fill="${se.cor}" fill-opacity=".10"/>`; seg = []; };
        pts.forEach(p => { if(p) seg.push(p); else fecha(); }); fecha();
      }
      let d = "", ult = false;
      pts.forEach(p => { if(!p){ ult = false; return; } d += (ult ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1) + " "; ult = true; });
      s += `<path d="${d}" fill="none" stroke="${se.cor}" stroke-width="${se.espessa ? 3.2 : 2.2}" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach(p => {
        if(!p) return;
        const par_ = parcialMes(J.cols[p[3]].k);
        s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${se.espessa ? 5 : 4}" fill="${par_ ? "#fff" : se.cor}" stroke="${se.cor}" stroke-width="2"><title>${esc(se.nome)} · ${mesRot(J.cols[p[3]].k)}: ${esc(o.fmtVal(p[2]))}${par_ ? " (mês parcial)" : ""}</title></circle>`;
        if(se.rotulo) s += T(p[0], p[1] - 11, o.fmtVal(p[2]), {s:11, w:800, c:se.cor === CU.tinta ? CU.tinta : se.cor, a:"middle", halo:true});
      });
    });
    s += marcaEntrada(g, z.xm);
    const leg = o.series.map(se => ({nome:se.nome, cor:se.cor, forma:"linha"}));
    if(J.cols.some(c => parcialMes(c.k))) leg.push({nome:"○ mês parcial", cor:CU.ambar, forma:"nenhuma"});
    s += legenda(leg.filter(l => l.forma !== "nenhuma"), W - pr, 14);
    if(J.cols.some(c => parcialMes(c.k))) s += T(pl, 14, "○ = mês parcial", {s:10.5, w:700, c:CU.ambar});
    return s + "</svg>";
  }

  /* 2) acertos × violações por mês (barras empilhadas, a partir do zero) */
  function grafEmpilhado(J, o){
    o = o || {};
    const W = o.W || 640, H = o.H || 300, pl = 52, pr = 18, pt = 56, pb = 62;
    const n = J.cols.length, iw = W - pl - pr, ih = H - pt - pb, bw = iw / n;
    const dados = J.cols.map(c => mesDados(c.k));
    if(!dados.some(Boolean)) return vazioSvg();
    const maxT = Math.max.apply(null, dados.map(m => m ? m.t : 0));
    const st = passo(maxT * 1.2, 4), mx = Math.ceil(maxT * 1.28 / st) * st;
    const g = {W, H, pl, pr, pt, ih, bw};
    const y = v => pt + ih - v / mx * ih;
    const z = zonas(J, g), hid = "h" + (++_uid);
    let s = svgAbre(W, H, "Acertos e violações por mês") + `<defs><pattern id="${hid}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#fff" stroke-opacity=".55" stroke-width="2.6"/></pattern></defs>` + z.s;
    for(let v = 0; v <= mx + 1e-9; v += st) s += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="${CU.grade}"/>` + T(pl - 8, y(v) + 4, fN(v), {s:10.5, a:"end"});
    s += rotulosMes(J, g, pt + ih + 18);
    const w = Math.min(64, bw * 0.58);
    dados.forEach((m, i) => {
      if(!m) return;
      const cx = pl + bw * i + bw / 2, x = cx - w / 2, v = m.t - m.a, par_ = parcialMes(J.cols[i].k);
      const yA = y(m.a), yT = y(m.t);
      s += `<rect x="${x}" y="${yA}" width="${w}" height="${Math.max(0, pt + ih - yA)}" fill="${CU.acerto}"><title>${mesRot(J.cols[i].k)} · acertos: ${fN(m.a)}</title></rect>`
        + `<rect x="${x}" y="${yT}" width="${w}" height="${Math.max(0, yA - yT)}" fill="${CU.viol}"><title>${mesRot(J.cols[i].k)} · violações: ${fN(v)} (${fP(100 - m.a / m.t * 100)} dos eventos)</title></rect>`;
      if(par_) s += `<rect x="${x}" y="${yT}" width="${w}" height="${Math.max(0, pt + ih - yT)}" fill="url(#${hid})"/><rect x="${x}" y="${yT}" width="${w}" height="${Math.max(0, pt + ih - yT)}" fill="none" stroke="${CU.ambar}" stroke-width="1.4" stroke-dasharray="4 3"/>`;
      if(yA - yT >= 17) s += T(cx, yT + (yA - yT) / 2 + 4, fN(v), {s:11, w:800, c:"#fff", a:"middle"});
      if(pt + ih - yA >= 17) s += T(cx, yA + (pt + ih - yA) / 2 + 4, fN(m.a), {s:11, w:800, c:"#fff", a:"middle"});
      s += T(cx, yT - 18, fN(m.t) + " eventos", {s:10.5, w:700, c:CU.tinta, a:"middle"}) + T(cx, yT - 6, fP(m.a / m.t * 100) + " ok", {s:10.5, w:800, c:CU.depois, a:"middle"});
    });
    s += marcaEntrada(g, z.xm);
    const leg = [{nome:"Acertos", cor:CU.acerto}, {nome:"Violações", cor:CU.viol}];
    if(J.cols.some(c => parcialMes(c.k))) leg.push({nome:"mês parcial", cor:CU.ambar, forma:"hatch"});
    s += legenda(leg, W - pr, 14);
    return s + "</svg>";
  }

  /* 3) antes × depois por tipo de SLA (barras agrupadas, de 0 a 100 %) */
  function grafTipos(J, M, o){
    o = o || {};
    const W = o.W || 640, H = o.H || 300, pl = 46, pr = 14, pt = 40, pb = 56;
    const get = id => M.find(m => m.id === id);
    const grupos = [["geral", "Geral"], ["tpr", "Primeira resposta (TPR)"], ["trs", "Resp. seguintes (TRS)"], ["tr", "Resolução (TR)"]].map(([id, nome]) => ({m:get(id), nome}));
    if(!grupos.some(x => x.m.a != null || x.m.d != null)) return vazioSvg();
    const iw = W - pl - pr, ih = H - pt - pb, gw = iw / grupos.length, bw = Math.min(46, gw * 0.3);
    const y = v => pt + ih - v / 100 * ih;
    let s = svgAbre(W, H, "Taxa de acerto por tipo, antes e depois");
    for(let v = 0; v <= 100; v += 25) s += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" stroke="${CU.grade}"/>` + T(pl - 8, y(v) + 4, v + "%", {s:10.5, a:"end"});
    grupos.forEach((gr, i) => {
      const cx = pl + gw * i + gw / 2, m = gr.m, c = comparar(m.a, m.d, m.tipo, m.melhor);
      [[m.a, cx - bw - 2, CU.antes, "Antes"], [m.d, cx + 2, c.cls === "ruim" ? CU.ruim : CU.depois, "Depois"]].forEach(([v, x, cor, rot]) => {
        if(v == null){ s += T(x + bw / 2, y(0) - 6, "—", {s:12, a:"middle"}); return; }
        s += `<rect x="${x}" y="${y(v)}" width="${bw}" height="${pt + ih - y(v)}" rx="4" fill="${cor}"><title>${esc(gr.nome)} · ${rot}: ${fP2(v)}</title></rect>` + T(x + bw / 2, y(v) - 6, fP(v), {s:11.5, w:800, c:cor, a:"middle"});
      });
      s += T(cx, pt + ih + 17, gr.nome, {s:11, w:700, c:CU.tinta, a:"middle"});
      if(c.delta != null){
        const bom = c.cls === "bom", ruim = c.cls === "ruim", cor = bom ? CU.bom : (ruim ? CU.ruim : CU.mudo), bg = bom ? "#eaf7ee" : (ruim ? "#fdecea" : "#eef0ec"), txt = (c.seta ? c.seta + " " : "") + sinalPP(c.delta);
        const pw = txt.length * 6.6 + 16;
        s += `<rect x="${cx - pw / 2}" y="${pt + ih + 26}" width="${pw}" height="19" rx="9.5" fill="${bg}"/>` + T(cx, pt + ih + 39.5, txt, {s:11, w:800, c:cor, a:"middle"});
      }
    });
    s += legenda([{nome:"Antes", cor:CU.antes}, {nome:"Depois", cor:CU.depois}], W - pr, 14);
    return s + "</svg>";
  }

  /* 4) dois anéis: cumprimento geral antes × depois */
  function grafAneis(J, M, o){
    o = o || {};
    const W = o.W || 640, H = o.H || 270, g = M.find(m => m.id === "geral");
    const A = periodo(J.antes), P = periodo(J.depois);
    if(g.a == null && g.d == null) return vazioSvg();
    const c = comparar(g.a, g.d, g.tipo, g.melhor), r = 66, sw = 18, cy = 112, circ = 2 * Math.PI * r;
    const anel = (cx, v, cor, rot, per) => {
      let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e8ece4" stroke-width="${sw}"/>`;
      if(v != null) s += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${cor}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${(circ * Math.max(0, Math.min(100, v)) / 100).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"><title>${rot}: ${fP2(v)}</title></circle>`;
      s += T(cx, cy + 9, v == null ? "—" : fP(v), {s:28, w:800, c:CU.tinta, a:"middle"}) + T(cx, cy + r + 34, rot, {s:12, w:800, c:cor, a:"middle", ls:1})
        + T(cx, cy + r + 50, per ? fN(per.a) + " acertos de " + fN(per.t) + " eventos" : "sem dados", {s:11, a:"middle"});
      return s;
    };
    const cor2 = c.cls === "ruim" ? CU.ruim : CU.depois;
    let s = svgAbre(W, H, "Cumprimento geral do SLA, antes e depois");
    s += anel(W * 0.22, g.a, CU.antes, "ANTES", A) + anel(W * 0.78, g.d, cor2, "DEPOIS", P);
    const cx = W / 2;
    s += `<path d="M${cx - 34} ${cy - 6} H${cx + 30} M${cx + 20} ${cy - 16} L${cx + 32} ${cy - 6} L${cx + 20} ${cy + 4}" fill="none" stroke="#b5bdb0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    if(c.delta != null){
      const bom = c.cls === "bom", ruim = c.cls === "ruim", txt = (c.seta ? c.seta + " " : "") + sinalPP(c.delta), pw = txt.length * 8.4 + 22;
      s += `<rect x="${cx - pw / 2}" y="${cy + 14}" width="${pw}" height="26" rx="13" fill="${bom ? "#eaf7ee" : (ruim ? "#fdecea" : "#eef0ec")}"/>` + T(cx, cy + 32, txt, {s:14, w:800, c:bom ? CU.bom : (ruim ? CU.ruim : CU.mudo), a:"middle"});
      s += T(cx, cy + 56, "variação", {s:10.5, a:"middle"});
    }
    return s + "</svg>";
  }

  /* 5) haltere por atendente: ponto cinza = antes, ponto colorido = depois */
  function grafHaltere(J, L, o){
    o = o || {};
    L = L.filter(x => x.a && x.d && x.a.taxa != null && x.d.taxa != null);
    if(!L.length) return vazioSvg("É preciso ter o atendente nos meses de antes <b>e</b> de depois para comparar.");
    const W = o.W || 760, rowH = 28, pt = 46, pb = 26, pl = 168, pr = 92, H = pt + L.length * rowH + pb;
    let mn = 100, mx = 0;
    L.forEach(x => { mn = Math.min(mn, x.a.taxa, x.d.taxa); mx = Math.max(mx, x.a.taxa, x.d.taxa); });
    const st = passo(Math.max(mx - mn, 10), 5);
    mn = Math.max(0, Math.floor((mn - st * 0.3) / st) * st); mx = Math.min(100, Math.ceil((mx + st * 0.3) / st) * st);
    if(mx <= mn) mx = mn + st;
    const x = v => pl + (v - mn) / (mx - mn) * (W - pl - pr);
    let s = svgAbre(W, H, "Taxa de acerto por atendente, antes e depois");
    for(let v = mn; v <= mx + 1e-9; v += st) s += `<line x1="${x(v)}" x2="${x(v)}" y1="${pt - 6}" y2="${H - pb}" stroke="${CU.grade}"/>` + T(x(v), H - 8, v + "%", {s:10.5, a:"middle"});
    L.forEach((it, i) => {
      const cy = pt + i * rowH + rowH / 2, pouco = it.a.t < MIN_EVENTOS || it.d.t < MIN_EVENTOS, cor = it.delta >= 0 ? CU.bom : CU.ruim, op = pouco ? 0.45 : 1;
      s += `<g opacity="${op}">` + `<line x1="${x(it.a.taxa)}" x2="${x(it.d.taxa)}" y1="${cy}" y2="${cy}" stroke="${cor}" stroke-width="4" stroke-linecap="round" opacity=".55"/>`
        + `<circle cx="${x(it.a.taxa)}" cy="${cy}" r="6" fill="${CU.antes}"><title>${esc(it.nome)} · antes: ${fP2(it.a.taxa)} (${fN(it.a.t)} eventos)</title></circle>`
        + `<circle cx="${x(it.d.taxa)}" cy="${cy}" r="6.5" fill="${cor}"><title>${esc(it.nome)} · depois: ${fP2(it.d.taxa)} (${fN(it.d.t)} eventos)</title></circle></g>`
        + T(pl - 12, cy + 4, it.nome + (pouco ? " *" : ""), {s:11.5, w:600, c:CU.tinta, a:"end"})
        + T(W - pr + 12, cy + 4, sinalPP(it.delta), {s:11.5, w:800, c:cor});
    });
    s += legenda([{nome:"Antes", cor:CU.antes}, {nome:"Depois (melhorou)", cor:CU.bom}, {nome:"Depois (piorou)", cor:CU.ruim}], W - 10, 16);
    if(L.some(it => it.a.t < MIN_EVENTOS || it.d.t < MIN_EVENTOS)) s += T(pl - 12, 16, "* menos de " + MIN_EVENTOS + " eventos (esmaecido)", {s:10, i:true, a:"end"});
    return s + "</svg>";
  }

  /* 6) mapa de calor atendente × mês */
  function corCalor(v){
    const st = [[40, [214, 69, 69]], [65, [240, 192, 72]], [90, [47, 138, 42]]];
    if(v <= st[0][0]) return st[0][1]; if(v >= st[2][0]) return st[2][1];
    const [a, b] = v <= st[1][0] ? [st[0], st[1]] : [st[1], st[2]], t = (v - a[0]) / (b[0] - a[0]);
    return a[1].map((c, i) => Math.round(c + (b[1][i] - c) * t));
  }
  function grafCalor(J, L, o){
    o = o || {};
    const mapas = J.cols.map(c => {
      const mp = new Map(), mo = D.mes[c.k];
      (mo && mo.atend || []).forEach(x => {
        const key = nkey(x.nome); if(!key) return;
        const r = mp.get(key) || {a:0, t:0};
        TIPOS.forEach(tp => { if(par(x[tp.k])){ r.a += x[tp.k][0]; r.t += x[tp.k][1]; } });
        mp.set(key, r);
      });
      return mp;
    });
    const rows = L.map(it => ({it, cel:mapas.map(mp => { const r = mp.get(it.k); return r && r.t ? r : null; })})).filter(r => r.cel.some(Boolean));
    if(!rows.length) return vazioSvg();
    rows.sort((p, q) => ((q.it.a ? q.it.a.t : 0) + (q.it.d ? q.it.d.t : 0)) - ((p.it.a ? p.it.a.t : 0) + (p.it.d ? p.it.d.t : 0)));
    const n = J.cols.length, pl = 150, cw = o.cw || 66, ch = 28, pt = 58, dw = 84, W = pl + n * cw + dw + 16, H = pt + rows.length * ch + 40;
    let s = svgAbre(W, H, "Taxa de acerto por atendente e mês");
    const xm = pl + cw * J.marca;
    s += T(pl + 4, 14, "ANTES", {s:10.5, w:800, c:"#5b6482"}) + T(xm + 4, 14, "DEPOIS", {s:10.5, w:800, c:CU.depois});
    J.cols.forEach((c, i) => {
      s += T(pl + cw * i + cw / 2, pt - 20, mesRot(c.k), {s:11, w:700, c:CU.tinta, a:"middle"});
      if(parcialMes(c.k)) s += T(pl + cw * i + cw / 2, pt - 9, "parcial", {s:9, w:800, c:CU.ambar, a:"middle"});
    });
    s += T(pl + n * cw + dw / 2, pt - 20, "Variação", {s:11, w:700, c:CU.tinta, a:"middle"}) + T(pl + n * cw + dw / 2, pt - 9, "antes → depois", {s:9, a:"middle"});
    rows.forEach((r, ri) => {
      const yy = pt + ri * ch;
      s += T(pl - 10, yy + ch / 2 + 4, r.it.nome, {s:11.5, w:600, c:CU.tinta, a:"end"});
      r.cel.forEach((cel, i) => {
        const x0 = pl + cw * i;
        if(!cel){ s += `<rect x="${x0 + 1.5}" y="${yy + 1.5}" width="${cw - 3}" height="${ch - 3}" rx="4" fill="#f3f5f1"/>` + T(x0 + cw / 2, yy + ch / 2 + 4, "—", {s:11, c:"#b5bdb0", a:"middle"}); return; }
        const v = cel.a / cel.t * 100, rgb = corCalor(v), lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]), pouco = cel.t < MIN_EVENTOS;
        s += `<rect x="${x0 + 1.5}" y="${yy + 1.5}" width="${cw - 3}" height="${ch - 3}" rx="4" fill="rgb(${rgb.join(",")})" opacity="${pouco ? 0.5 : 1}"><title>${esc(r.it.nome)} · ${mesRot(J.cols[i].k)}: ${fP2(v)} (${fN(cel.a)}/${fN(cel.t)} eventos${pouco ? " — poucos dados" : ""})</title></rect>`
          + T(x0 + cw / 2, yy + ch / 2 + 4, Math.round(v) + "%" + (pouco ? "*" : ""), {s:11.5, w:800, c:lum < 150 ? "#fff" : "#1b2a1b", a:"middle"});
      });
      const dl = r.it.delta;
      s += T(pl + n * cw + dw / 2, yy + ch / 2 + 4, dl == null ? "—" : sinalPP(dl), {s:11.5, w:800, c:dl == null ? CU.mudo : (dl >= 0 ? CU.bom : CU.ruim), a:"middle"});
    });
    s += `<line x1="${xm}" x2="${xm}" y1="${pt - 4}" y2="${pt + rows.length * ch}" stroke="${CU.ouro}" stroke-width="2" stroke-dasharray="5 4"/>`;
    // escala de cor
    const ly = H - 22;
    s += T(pl, ly + 9, "Escala:", {s:10.5, w:700, c:CU.tinta});
    [30, 50, 65, 80, 95].forEach((v, i) => { s += `<rect x="${pl + 48 + i * 40}" y="${ly}" width="38" height="12" rx="3" fill="rgb(${corCalor(v).join(",")})"/>` + T(pl + 48 + i * 40 + 19, ly + 23, v + "%", {s:9, a:"middle"}); });
    s += T(pl + 48 + 5 * 40 + 14, ly + 10, "* menos de " + MIN_EVENTOS + " eventos (esmaecido)", {s:10, i:true});
    return s + "</svg>";
  }


  /* 7) equipe (barras) × produtividade ou performance (linha, eixo à direita) */
  function grafEquipe(J, o){
    o = o || {};
    const modo = o.modo || "prod";                       // "prod" = eventos por atendente/dia · "taxa" = taxa de acerto
    const W = o.W || 640, H = o.H || 310, pl = 46, pr = 56, pt = 62, pb = 62;
    const n = J.cols.length, iw = W - pl - pr, ih = H - pt - pb, bw = iw / n;
    const P = J.cols.map(c => prodMes(c.k));
    if(!P.some(Boolean)) return vazioSvg();
    const maxA = Math.max.apply(null, P.map(p => p ? p.ativos : 0));
    const stA = passo(maxA * 1.3, 4), mxA = Math.ceil(maxA * 1.3 / stA) * stA;
    const lv = P.map(p => p ? (modo === "taxa" ? p.taxa : p.evAtDia) : null);
    const maxL = Math.max.apply(null, lv.filter(v => v != null));
    let stL = passo(maxL * 1.2, 4), mxL = modo === "taxa" ? 100 : Math.ceil(maxL * 1.25 / stL) * stL;
    if(modo === "taxa") stL = 25;
    const g = {W, H, pl, pr, pt, ih, bw};
    const yA = v => pt + ih - v / mxA * ih, yL = v => pt + ih - v / mxL * ih;
    const z = zonas(J, g), corL = modo === "taxa" ? CU.depois : "#e08a00";
    const fL = modo === "taxa" ? fP : fN2;
    let s = svgAbre(W, H, "Equipe e " + (modo === "taxa" ? "performance" : "produtividade")) + z.s;
    for(let v = 0; v <= mxA + 1e-9; v += stA) s += `<line x1="${pl}" x2="${W - pr}" y1="${yA(v)}" y2="${yA(v)}" stroke="${CU.grade}"/>` + T(pl - 8, yA(v) + 4, fN(v), {s:10.5, a:"end"});
    for(let v = 0; v <= mxL + 1e-9; v += stL) s += T(W - pr + 8, yL(v) + 4, modo === "taxa" ? v + "%" : fN1(v), {s:10.5, c:corL, w:700});
    s += T(4, pt - 22, "atendentes", {s:10, w:700}) + T(W - 4, pt - 22, modo === "taxa" ? "taxa de acerto" : "eventos/atend./dia", {s:10, w:700, c:corL, a:"end"});
    s += rotulosMes(J, g, pt + ih + 18);
    const w = Math.min(56, bw * 0.52);
    P.forEach((p, i) => {
      if(!p) return;
      const cx = pl + bw * i + bw / 2, ant = i < J.marca;
      s += `<rect x="${cx - w / 2}" y="${yA(p.ativos)}" width="${w}" height="${pt + ih - yA(p.ativos)}" rx="4" fill="${ant ? CU.antes : "#3aa55a"}" opacity=".85"><title>${mesRot(J.cols[i].k)} · ${p.ativos} atendentes · ${p.dias} dias no relatório</title></rect>`
        + T(cx, pt + ih - 8, String(p.ativos), {s:13, w:800, c:"#fff", a:"middle"});
    });
    let d = "", ult = false;
    lv.forEach((v, i) => { if(v == null){ ult = false; return; } d += (ult ? "L" : "M") + (pl + bw * i + bw / 2).toFixed(1) + " " + yL(v).toFixed(1) + " "; ult = true; });
    s += `<path d="${d}" fill="none" stroke="${corL}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
    lv.forEach((v, i) => { if(v == null) return; const cx = pl + bw * i + bw / 2; s += `<circle cx="${cx}" cy="${yL(v)}" r="5" fill="#fff" stroke="${corL}" stroke-width="2.4"><title>${mesRot(J.cols[i].k)}: ${fL(v)}</title></circle>` + T(cx, yL(v) - 11, fL(v), {s:11.5, w:800, c:corL, a:"middle", halo:true}); });
    s += marcaEntrada(g, z.xm);
    s += legenda([{nome:"Atendentes (antes)", cor:CU.antes}, {nome:"Atendentes (depois)", cor:"#3aa55a"}, {nome:modo === "taxa" ? "Taxa de acerto" : "Eventos por atendente/dia", cor:corL, forma:"linha"}], W - pr, 14);
    return s + "</svg>";
  }
  function tabelaProdutividade(J, idTab){
    let h = `<table class="cs-table" id="${idTab}"><thead><tr><th class="cs-th-mes">Mês</th><th>Atendentes</th><th>Dias no relatório</th><th>Eventos SLA</th><th>Eventos / atend.</th><th>Eventos / atend. / dia</th><th>Atend. / atend. / dia</th><th>Violações / atend. / dia</th><th>Taxa de acerto</th></tr></thead><tbody>`;
    J.cols.forEach(c => {
      const p = prodMes(c.k), dec = (v, f) => p && v != null ? `<td class="cs-n" data-xlnum="${v}" data-xlfmt="${f}">${fN2(v)}</td>` : `<td class="cs-n cel-texto">—</td>`;
      h += `<tr class="cs-r-${c.tipo}">${tdMes(c)}${tdN(p && p.ativos)}${tdN(p && p.dias)}${tdN(p && p.t)}${dec(p && p.evAt, "#,##0.00")}${dec(p && p.evAtDia, "#,##0.00")}${dec(p && p.atAtDia, "#,##0.00")}${dec(p && p.violAtDia, "#,##0.00")}${tdP(p && p.taxa)}</tr>`;
    });
    const lin = (rot, ms, cls) => { const q = prodPeriodo(ms); return `<tr class="${cls}"><td class="cel-texto">${rot}</td><td class="cs-n cel-texto" style="text-align:right"${q ? ` data-xlnum="${q.ativos}" data-xlfmt="#,##0.0"` : ""}>${q ? fN1(q.ativos) : "—"}</td><td></td><td></td><td></td>`
      + [q && q.evAtDia, q && q.atAtDia, q && q.violAtDia].map(v => `<td class="cs-n cel-texto" style="text-align:right"${v != null && v !== false ? ` data-xlnum="${v}" data-xlfmt="#,##0.00"` : ""}>${v == null || v === false ? "—" : fN2(v)}</td>`).join("")
      + `<td class="cs-n cel-texto" style="text-align:right"${q && q.taxa != null ? ` data-xlnum="${q.taxa / 100}" data-xlfmt="0.00%"` : ""}>${q ? fP2(q.taxa) : "—"}</td></tr>`; };
    return h + `</tbody><tfoot>${lin("Média ANTES", J.antes, "cs-tot-antes")}${lin("Média DEPOIS", J.depois, "cs-tot-depois")}</tfoot></table>`;
  }


  /* 8) variação de cada indicador (barras divergentes: verde = melhorou, vermelho = piorou) */
  function grafVariacao(J, M, o){
    o = o || {};
    const L = M.filter(m => !["tpr", "trs", "tr"].includes(m.id) && (!m.opcional || (m.a != null && m.d != null))).map(m => ({m, c:comparar(m.a, m.d, m.tipo, m.melhor)})).filter(x => x.c.delta != null && x.m.a);
    if(!L.length) return vazioSvg();
    L.forEach(x => { x.rel = x.c.delta / Math.abs(x.m.a) * 100; });
    const peso = x => (x.c.cls === "bom" ? 0 : (x.c.cls === "ruim" ? 2 : 1));
    L.sort((p, q) => peso(p) - peso(q) || Math.abs(q.rel) - Math.abs(p.rel));
    const W = o.W || 860, rowH = 34, pt = 38, pb = 16, pl = 250, pr = 190, H = pt + L.length * rowH + pb;
    const mx = Math.max(10, Math.ceil(Math.max.apply(null, L.map(x => Math.abs(x.rel))) / 10) * 10), zx = pl + (W - pl - pr) / 2, k = ((W - pl - pr) / 2 - 78) / mx;
    let s = svgAbre(W, H, "Variação de cada indicador");
    s += T(zx - 8, 16, "◀ piorou / caiu", {s:10.5, w:700, c:CU.mudo, a:"end"}) + T(zx + 8, 16, "subiu ▶", {s:10.5, w:700, c:CU.mudo});
    s += T(W - pr + 14, 16, "antes → depois", {s:10.5, w:700, c:CU.mudo});
    L.forEach((x, i) => {
      const cy = pt + i * rowH + rowH / 2, cor = x.c.cls === "bom" ? CU.bom : (x.c.cls === "ruim" ? CU.ruim : CU.antes), w = Math.max(3, Math.abs(x.rel) * k);
      if(i % 2 === 0) s += `<rect x="4" y="${cy - rowH / 2 + 1}" width="${W - 8}" height="${rowH - 2}" rx="6" fill="#f6f8f4"/>`;
      s += T(pl - 14, cy + 4, x.m.nome, {s:12, w:700, c:CU.tinta, a:"end"});
      s += `<rect x="${x.rel >= 0 ? zx : zx - w}" y="${cy - 9}" width="${w}" height="18" rx="4" fill="${cor}"><title>${esc(x.m.nome)}: ${esc(x.c.txt)}</title></rect>`;
      s += T(x.rel >= 0 ? zx + w + 7 : zx - w - 7, cy + 4, (x.rel >= 0 ? "+" : "−") + Math.abs(x.rel).toFixed(1).replace(".", ",") + "%", {s:12, w:800, c:cor === CU.antes ? CU.mudo : cor, a:x.rel >= 0 ? "start" : "end"});
      s += T(W - pr + 14, cy + 4, x.m.fmt(x.m.a) + " → " + x.m.fmt(x.m.d), {s:12, w:600, c:CU.tinta});
    });
    s += `<line x1="${zx}" x2="${zx}" y1="${pt - 4}" y2="${H - pb + 4}" stroke="#8b95a8" stroke-width="1.4"/>`;
    return s + "</svg>";
  }
  /* 9) cartão com mini-evolução (sparkline) */
  function grafTile(J, t){
    const W = 300, H = 176, pl = 16, pr = 16, y0 = 100, y1 = 148;
    const c = comparar(t.a, t.d, t.tipo, t.melhor);
    const vals = t.vals, n = J.cols.length, bw = (W - pl - pr) / n;
    const pts = vals.map((v, i) => v == null ? null : [pl + bw * i + bw / 2, v, i]).filter(Boolean);
    if(pts.length < 1) return "";
    let mn = Math.min.apply(null, pts.map(p => p[1])), mx = Math.max.apply(null, pts.map(p => p[1]));
    if(mx - mn < 1e-9){ mn -= 1; mx += 1; }
    const pad = (mx - mn) * 0.15; mn -= pad; mx += pad;
    const y = v => y1 - (v - mn) / (mx - mn) * (y1 - y0);
    const cor = c.cls === "ruim" ? CU.ruim : (c.cls === "bom" ? CU.bom : CU.mudo), corD = c.cls === "ruim" ? CU.ruim : CU.depois;
    const xm = pl + bw * J.marca;
    let s = svgAbre(W, H, t.nome) + `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="#fff" stroke="#dde3d9"/>`;
    s += `<rect x="${pl}" y="${y0 - 14}" width="${xm - pl}" height="${y1 - y0 + 28}" fill="#9aa595" fill-opacity=".10"/><rect x="${xm}" y="${y0 - 14}" width="${W - pr - xm}" height="${y1 - y0 + 28}" fill="#2fb36b" fill-opacity=".09"/>`;
    s += T(pl, 22, t.nome, {s:11.5, w:800, c:CU.mudo}) + T(pl, 60, t.d == null ? "—" : t.fmt(t.d), {s:30, w:800, c:CU.tinta});
    s += T(pl, 78, "antes: " + (t.a == null ? "—" : t.fmt(t.a)), {s:11.5, w:600, c:CU.mudo});
    if(c.delta != null){
      const txt = (c.seta ? c.seta + " " : "") + c.txt, pw = txt.length * 7.6 + 18, bg = c.cls === "bom" ? "#eaf7ee" : (c.cls === "ruim" ? "#fdecea" : "#eef0ec");
      s += `<rect x="${W - pr - pw}" y="34" width="${pw}" height="24" rx="12" fill="${bg}"/>` + T(W - pr - pw / 2, 51, txt, {s:13, w:800, c:cor, a:"middle"});
    }
    let d = "";
    pts.forEach((p, i) => { d += (i ? "L" : "M") + p[0].toFixed(1) + " " + y(p[1]).toFixed(1) + " "; });
    if(pts.length > 1) s += `<path d="M${pts[0][0].toFixed(1)} ${y1 + 8} ${d.replace(/^M/, "L")} L${pts[pts.length - 1][0].toFixed(1)} ${y1 + 8}Z" fill="${CU.depois}" fill-opacity=".10"/>`;
    s += `<path d="${d}" fill="none" stroke="${CU.tinta}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    pts.forEach(p => {
      const dep = p[2] >= J.marca;
      s += `<circle cx="${p[0].toFixed(1)}" cy="${y(p[1]).toFixed(1)}" r="4.6" fill="${dep ? corD : CU.antes}" stroke="#fff" stroke-width="1.6"><title>${mesRot(J.cols[p[2]].k)}: ${esc(t.fmt(p[1]))}</title></circle>`;
      if(pts.length <= 7) s += T(p[0], y(p[1]) - 9, t.fmtC(p[1]), {s:10, w:700, c:dep ? corD : CU.mudo, a:"middle", halo:true});
    });
    J.cols.forEach((cc, i) => { s += T(pl + bw * i + bw / 2, H - 8, MESES_ABR[+cc.k.slice(5) - 1], {s:10, c:"#7a8576", a:"middle"}); });
    s += `<line x1="${xm}" x2="${xm}" y1="${y0 - 14}" y2="${y1 + 14}" stroke="${CU.ouro}" stroke-width="1.6" stroke-dasharray="4 3"/>`;
    return s + "</svg>";
  }
  function tilesEvolucao(J, M){
    const get = id => M.find(m => m.id === id);
    const pm = J.cols.map(c => prodMes(c.k));
    const f2 = v => fN2(v).replace(/,00$/, "");
    const defs = [
      {id:"geral", nome:"TAXA DE ACERTO (SLA)", vals:serieTaxa(J), fmtC:v => v.toFixed(0) + "%"},
      {id:"ativos", nome:"ATENDENTES NA EQUIPE", vals:pm.map(p => p && p.ativos), fmtC:v => fN(v)},
      {id:"evAtDia", nome:"EVENTOS / ATENDENTE / DIA", vals:pm.map(p => p && p.evAtDia), fmtC:v => fN1(v)},
      {id:"violAtDia", nome:"VIOLAÇÕES / ATENDENTE / DIA", vals:pm.map(p => p && p.violAtDia), fmtC:v => fN1(v)},
      {id:"atAtDia", nome:"ATENDIMENTOS / ATENDENTE / DIA", vals:pm.map(p => p && p.atAtDia), fmtC:v => fN1(v)}
    ];
    return defs.map(d => { const m = get(d.id); return Object.assign({}, d, {a:m.a, d:m.d, tipo:m.tipo, melhor:m.melhor, fmt:m.fmt}); })
      .filter(d => d.vals.filter(v => v != null).length >= 2 && (d.a != null || d.d != null));
  }


  function leituras(J, M){
    const get = id => M.find(m => m.id === id), r = [];
    const g = get("geral"), cg = comparar(g.a, g.d, g.tipo, g.melhor);
    if(cg.delta != null) r.push(`Cumprimento do SLA ${cg.cls === "bom" ? "melhorou" : (cg.cls === "ruim" ? "piorou" : "ficou estável")}: ${fP(g.a)} → ${fP(g.d)} (${cg.txt}).`);
    const e = get("ativos"), p = get("evAtDia");
    if(e.a != null && e.d != null){
      r.push(`Equipe: ${fN1(e.a)} → ${fN1(e.d)} atendentes` + (p.a != null && p.d != null ? `; cada atendente passou de ${fN2(p.a)} para ${fN2(p.d)} eventos de SLA por dia (${comparar(p.a, p.d, "n", "maior").txt}).` : "."));
    }
    const v = get("viol"), cv = comparar(v.a, v.d, v.tipo, v.melhor);
    if(cv.delta != null) r.push(`Violações por mês: ${fN(v.a)} → ${fN(v.d)} (${cv.txt})` + (J.cols.some(c => mesDados(c.k) && parcialMes(c.k)) ? " — há mês parcial, compare com cautela." : "."));
    const L = linhasAtendente(J).filter(x => x.delta != null && x.a.t >= MIN_EVENTOS && x.d.t >= MIN_EVENTOS);
    if(L.length){ const top = L[0]; r.push(`Maior evolução individual: ${top.nome} (${sinalPP(top.delta)}); ${L.filter(x => x.delta >= 0).length} de ${L.length} atendentes melhoraram.`); }
    return r;
  }

  const caixaGraf = svg => (ehSvg(svg) ? `<div class="cs-chart-wrap">${svg}</div>` : svg);
  const serieTaxa = (J, k) => J.cols.map(c => { const m = mesDados(c.k); return m ? (k ? taxa(m[k].a, m[k].t) : taxa(m.a, m.t)) : null; });
  function graficoTaxaMes(J, M, o){
    o = o || {};
    const get = id => M.find(m => m.id === id);
    return grafLinha(J, Object.assign({titulo:"Taxa de acerto por mês", teto:100, fmtVal:fP, fmtEixo:v => v.toFixed(0) + "%", medias:{antes:get("geral").a, depois:get("geral").d},
      series:[{nome:"Geral", cor:CU.tinta, vals:serieTaxa(J), rotulo:true, area:true, espessa:true}].concat(TIPOS.map(tp => ({nome:tp.curto, cor:tp.cor, vals:serieTaxa(J, tp.k)})))}, o));
  }

  /* ---------------- cartões ---------------- */
  function cartao(m){
    const fmt = m.fmt;
    if(m.a == null || m.d == null){
      return `<div class="cs-card cs-neutro"><span class="cs-card-t">${esc(m.nome)}</span>
        <div class="cs-card-par"><div><small>Antes</small><b>${m.a == null ? "—" : fmt(m.a)}</b></div><div><small>Depois</small><b>${m.d == null ? "—" : fmt(m.d)}</b></div></div>
        <span class="cs-chip">sem dados dos dois lados</span><small class="cs-card-n">${esc(m.nota || "")}</small></div>`;
    }
    const c = comparar(m.a, m.d, m.tipo, m.melhor);
    return `<div class="cs-card cs-${c.cls === "bom" ? "bom" : (c.cls === "ruim" ? "ruim" : "neutro")}"><span class="cs-card-t">${esc(m.nome)}</span>
      <div class="cs-card-par"><div><small>Antes</small><b>${fmt(m.a)}</b></div><div class="cs-seta">→</div><div><small>Depois</small><b>${fmt(m.d)}</b></div></div>
      <span class="cs-chip">${c.seta} ${c.txt}</span><small class="cs-card-n">${esc(m.nota || "")}</small></div>`;
  }
  const chipCmp = c => `<span class="cs-chip ${c.cls === "bom" ? "bom" : (c.cls === "ruim" ? "ruim" : "")}">${c.seta ? c.seta + " " : ""}${esc(c.txt)}</span>`;
  function mini(m){
    const c = comparar(m.a, m.d, m.tipo, m.melhor);
    return `<div class="cs-mini"><small>${esc(m.nome)}</small><div class="cs-mini-v"><span>${m.a == null ? "—" : m.fmt(m.a)}</span><i>→</i><b>${m.d == null ? "—" : m.fmt(m.d)}</b></div>${chipCmp(c)}</div>`;
  }

  /* ---------------- tabelas (tela e versão estática p/ Excel) ---------------- */
  const tdMes = c => `<td class="cs-mes cel-texto">${mesRot(c.k)} <span class="cs-badge cs-b-${c.tipo}">${ROT_TIPO[c.tipo]}</span></td>`;
  const tdN = v => `<td class="cs-n"${v == null ? "" : ` data-xlnum="${num(v)}" data-xlfmt="#,##0"`}>${v == null ? "—" : esc(fN(v))}</td>`;
  const tdP = v => `<td class="cs-n cs-perf">${fP2(v)}</td>`;
  const tdT = v => `<td class="cs-n">${v == null ? "—" : fMin(v)}</td>`;
  const marcaRow = nCols => `<tr class="cs-marca"><td colspan="${nCols}" class="cel-texto">▼ Data de entrada — ${fData(D.cfg.entrada)} ▼</td></tr>`;
  function linhasComMarca(J, nCols, fnLinha){
    let h = "";
    J.cols.forEach((c, i) => { if(i === J.marca) h += marcaRow(nCols); h += fnLinha(c); });
    return h;
  }
  // período real coberto pelo relatório do mês ("01/09 a 20/09") e se é parcial
  function periodoMes(k){
    const mo = D.mes[k];
    if(!mo || !mo.ini || !mo.fim) return {txt:"", parcial:false};
    const f = iso => iso.slice(8, 10) + "/" + iso.slice(5, 7);
    const cheio = mo.ini === k + "-01" && mo.fim === k + "-" + String(ultimoDia(k)).padStart(2, "0");
    return {txt:f(mo.ini) + " a " + f(mo.fim), parcial:!cheio};
  }

  function tabelaMeses(J, idTab){
    const cab = ["Período do relatório", "Atend.", "Eventos SLA", "Acertos", "Violações", "Taxa geral", "TPR", "TRS", "TR"];
    let h = `<table class="cs-table" id="${idTab}"><thead><tr><th class="cs-th-mes">Mês</th>${cab.map(t => `<th>${t}</th>`).join("")}</tr></thead><tbody>`;
    h += linhasComMarca(J, 10, c => {
      const m = mesDados(c.k), p = periodoMes(c.k);
      return `<tr class="cs-r-${c.tipo}">${tdMes(c)}<td class="cel-texto" style="text-align:center">${m ? (p.txt ? esc(p.txt) + (p.parcial ? ' <span class="cs-badge cs-b-trans">parcial</span>' : "") : "—") : "—"}</td>`
        + `${tdN(m && m.temN ? m.n : null)}${tdN(m && m.t)}${tdN(m && m.a)}${tdN(m && m.t - m.a)}${tdP(m && taxa(m.a, m.t))}`
        + TIPOS.map(tp => tdP(m && taxa(m[tp.k].a, m[tp.k].t))).join("") + "</tr>";
    });
    const lin = (rot, meses, cls) => {
      const o = periodo(meses);
      return `<tr class="${cls}"><td class="cel-texto">${rot}</td><td class="cel-texto"></td>${tdN(o && o.temN ? o.n : null)}${tdN(o && o.t)}${tdN(o && o.a)}${tdN(o && o.t - o.a)}${tdP(o && taxa(o.a, o.t))}`
        + TIPOS.map(tp => tdP(o && taxa(o[tp.k].a, o[tp.k].t))).join("") + "</tr>";
    };
    h += `</tbody><tfoot>${lin("Total ANTES", J.antes, "cs-tot-antes")}${lin("Total DEPOIS", J.depois, "cs-tot-depois")}</tfoot></table>`;
    return h;
  }

  /* ---------------- por atendente ---------------- */
  // agrega, por atendente (chave normalizada), os meses de um período
  function atendentesPeriodo(meses){
    const mp = new Map();
    meses.forEach(k => {
      const mo = D.mes[k]; if(!mo || !mo.atend) return;
      mo.atend.forEach(x => {
        const key = nkey(x.nome); if(!key) return;
        const o = mp.get(key) || {nome:x.nome, cargo:x.cargo || "", n:0, temN:false, tpr:{a:0, t:0}, trs:{a:0, t:0}, tr:{a:0, t:0}};
        if(x.cargo) o.cargo = x.cargo;
        TIPOS.forEach(tp => { if(par(x[tp.k])){ o[tp.k].a += x[tp.k][0]; o[tp.k].t += x[tp.k][1]; } });
        if(isN(x.n)){ o.n += x.n; o.temN = true; }
        mp.set(key, o);
      });
    });
    mp.forEach(o => { o.t = o.tpr.t + o.trs.t + o.tr.t; o.a = o.tpr.a + o.trs.a + o.tr.a; o.taxa = taxa(o.a, o.t); });
    return mp;
  }
  function linhasAtendente(J){
    const A = atendentesPeriodo(J.antes), P = atendentesPeriodo(J.depois);
    const keys = new Set([...A.keys(), ...P.keys()]);
    return [...keys].map(k => {
      const a = A.get(k) && A.get(k).t ? A.get(k) : null, d = P.get(k) && P.get(k).t ? P.get(k) : null;
      const ref = P.get(k) || A.get(k);
      return {k, nome:ref.nome, cargo:ref.cargo, a, d, delta:(a && d && a.taxa != null && d.taxa != null) ? d.taxa - a.taxa : null};
    }).filter(x => x.a || x.d).sort((x, y) => {
      if(x.delta == null && y.delta == null) return x.nome.localeCompare(y.nome);
      if(x.delta == null) return 1; if(y.delta == null) return -1;
      return y.delta - x.delta;
    });
  }
  const MIN_EVENTOS = 20;            // abaixo disso a taxa de um atendente é pouco confiável
  function tabelaAtendentes(J, idTab){
    const L = linhasAtendente(J);
    let h = `<table class="cs-table" id="${idTab}"><thead><tr><th class="cs-th-mes">Atendente</th><th>Cargo</th><th>Eventos antes</th><th>Taxa antes</th><th>Eventos depois</th><th>Taxa depois</th><th>Variação (p.p.)</th><th>TPR depois</th><th>TRS depois</th><th>TR depois</th></tr></thead><tbody>`;
    if(!L.length) h += `<tr><td class="cel-texto" colspan="10">Sem atendentes nos meses desta comparação.</td></tr>`;
    L.forEach(x => {
      const cl = x.delta == null ? "" : (x.delta >= 0 ? "cs-pos" : "cs-neg");
      const pouco = (x.a && x.a.t < MIN_EVENTOS) || (x.d && x.d.t < MIN_EVENTOS);
      h += `<tr><td class="cs-mes cel-texto">${esc(x.nome)}${pouco ? ' <span class="cs-badge cs-b-trans" title="Menos de ' + MIN_EVENTOS + ' eventos de SLA: a taxa oscila muito">poucos dados</span>' : ""}</td><td class="cel-texto">${esc(x.cargo)}</td>`
        + `${tdN(x.a && x.a.t)}${tdP(x.a && x.a.taxa)}${tdN(x.d && x.d.t)}${tdP(x.d && x.d.taxa)}`
        + `<td class="cs-n ${cl}">${x.delta == null ? (x.a && !x.d ? "saiu" : (!x.a && x.d ? "novo" : "—")) : (x.delta >= 0 ? "+" : "−") + Math.abs(x.delta).toFixed(1).replace(".", ",")}</td>`
        + TIPOS.map(tp => tdP(x.d && taxa(x.d[tp.k].a, x.d[tp.k].t))).join("") + "</tr>";
    });
    return h + "</tbody></table>";
  }

  /* ---------------- sub-abas ---------------- */
  const painel = (titulo, corpo, extra) => `<div class="panel"><div class="panel-header cs-ph"><span>${titulo}</span>${extra || ""}</div><div class="cs-pbody">${corpo}</div></div>`;
  const resumoPeriodoTxt = J => {
    const a = J.antes, d = J.depois;
    return `Antes: <b>${mesRot(a[0])}</b> a <b>${mesRot(a[a.length - 1])}</b> · Depois: <b>${mesRot(d[0])}</b> a <b>${mesRot(d[d.length - 1])}</b>`
      + (J.parcial ? ` · <b>${mesRot(J.mesEntrada)}</b> (mês da entrada) fica de fora das médias` : "");
  };

  function subDados(J){
    const c = D.cfg;
    const cfg = `
      <form class="cs-form" onsubmit="return false">
        <label>Nome do ANTES<input type="text" data-sfc-cfg="antes_rot" value="${esc(c.antes_rot)}"></label>
        <label>Nome do DEPOIS<input type="text" data-sfc-cfg="depois_rot" value="${esc(c.depois_rot)}"></label>
        <label>Data de entrada<input type="date" data-sfc-cfg="entrada" value="${esc(c.entrada)}"></label>
        <label>Meses ANTES<input type="number" min="1" max="24" data-sfc-cfg="antes" value="${esc(c.antes)}"></label>
        <label>Meses DEPOIS<input type="number" min="1" max="24" data-sfc-cfg="depois" value="${esc(c.depois)}"></label>
      </form>
      <p class="cs-hint">${resumoPeriodoTxt(J)}. Mude qualquer campo e a janela de meses se ajusta na hora.</p>`;

    const opcoes = J.cols.map(x => `<option value="${x.k}">${mesRot(x.k)} — ${ROT_TIPO[x.tipo]}</option>`).join("");
    const imp = `
      <div class="cs-imp">
        <label>Mês deste relatório <span class="cs-sm">(se o texto trouxer o período, ele manda)</span>
          <select id="sfcImpMes">${opcoes}</select></label>
        <label class="cs-imp-arq">Arquivo (PDF do SacFlow, .txt ou .csv)<input type="file" id="sfcImpArq" accept=".csv,.txt,text/plain,.pdf"></label>
        <button type="button" class="btn btn-primary" id="sfcImpBtn">Importar arquivo</button>
      </div>
      <button type="button" class="link-btn" id="sfcImpToggle">colar o texto da tabela “Performance da equipe”</button>
      <div id="sfcImpColar" style="display:none">
        <textarea id="sfcImpTxt" rows="8" placeholder="Cole aqui a tabela “Performance da equipe” do Relatório de SLA do SacFlow..."></textarea>
        <button type="button" class="btn btn-ghost btn-sm" id="sfcImpTxtBtn">Importar texto colado</button>
        <button type="button" class="btn btn-ghost btn-sm" id="sfcImpEx">Inserir exemplo do formato</button>
      </div>
      <div class="cs-msg ${msg.txt ? (msg.ok ? "cs-msg-ok" : "cs-msg-err") : ""}" id="sfcImpMsg">${esc(msg.txt)}</div>
      <p class="cs-hint">Importe <b>um relatório por mês</b>. Reimportar um mês <b>substitui</b> o que já estava lá. <b>PDF do SacFlow:</b> escolha o arquivo e clique em “Importar arquivo” — o PDF é uma imagem, então o painel lê os números por reconhecimento de texto (precisa de internet, leva de 20 s a 1 min) e confere cada célula pela conta; o período vem do nome do arquivo (ex.: relatorio_sla_011026_201026.pdf). O que não bater fica marcado “conferir”. Também dá para colar a tabela copiada da tela do SacFlow ou digitar em <b>Corrigir dados do mês</b>. Se o relatório não cobre o mês inteiro (ex.: 01/09 a 20/09), o mês aparece como <b>parcial</b>: as taxas continuam valendo, mas os volumes “por mês” ficam menores.</p>`;

    const ok = b => b ? `<span class="cs-ok">✓</span>` : `<span class="cs-no">—</span>`;
    let sit = `<div class="table-wrap"><table class="cs-table cs-sit"><thead><tr><th class="cs-th-mes">Mês</th><th>Período do relatório</th><th>Atendentes</th><th>Taxa geral</th><th>Dados</th><th></th></tr></thead><tbody>`;
    sit += linhasComMarca(J, 6, x => {
      const m = mesDados(x.k), p = periodoMes(x.k);
      return `<tr class="cs-r-${x.tipo}">${tdMes(x)}<td>${p.txt ? esc(p.txt) + (p.parcial ? ' <span class="cs-badge cs-b-trans">parcial</span>' : "") : "—"}</td>`
        + `<td>${m ? m.nAt : "—"}</td><td>${m ? fP2(taxa(m.a, m.t)) : "—"}</td><td>${ok(m)}</td>`
        + `<td><button type="button" class="link-btn" data-sfc-ed="${x.k}">${m ? "editar" : "digitar"}</button> ${m ? `<button type="button" class="link-btn danger" data-sfc-limpar="${x.k}">limpar mês</button>` : ""}</td></tr>`;
    });
    sit += `</tbody></table></div>`;
    return painel("1 · Período da comparação", cfg) + painel("2 · Relatório de SLA de um mês (colar ou enviar arquivo)", imp) + painel("3 · Situação dos dados na janela", sit);
  }

  function subGeral(J){
    const M = metricas(J);
    const cmps = M.map(m => comparar(m.a, m.d, m.tipo, m.melhor));
    const julg = M.map((m, i) => ({m, c:cmps[i]})).filter(x => x.m.melhor !== "neutro" && x.c.delta != null);
    const bons = julg.filter(x => x.c.cls === "bom").length, ruins = julg.filter(x => x.c.cls === "ruim").length;
    const seg = julg.map(x => `<i class="${x.c.cls}" title="${esc(x.m.nome)}: ${esc(x.c.txt)}"></i>`).join("");
    const linha = J.cols.map((c, i) => (i === J.marca ? `<span class="cs-tl-marca" title="Entrada ${fData(D.cfg.entrada)}">▼</span>` : "") + `<span class="cs-tl-mes ${c.tipo}">${mesRot(c.k)}</span>`).join("");
    const hero = `<div class="cs-hero">
      <div class="cs-hero-l">
        <small>COMPARAÇÃO SACFLOW</small>
        <h3>${esc(D.cfg.antes_rot)} <i>→</i> ${esc(D.cfg.depois_rot)}</h3>
        <p>Entrada em <b>${fData(D.cfg.entrada)}</b> · ${resumoPeriodoTxt(J).replace(/<\/?b>/g, "")}</p>
        <div class="cs-tl">${linha}</div>
      </div>
      <div class="cs-hero-r">
        <div class="cs-score"><b>${bons}</b><span>de ${julg.length || "—"}</span></div>
        <div class="cs-score-t">indicadores melhoraram${ruins ? `<br><em>${ruins} pioraram</em>` : ""}</div>
        <div class="cs-seg">${seg}</div>
      </div>
    </div>`;

    const get = id => M.find(m => m.id === id);
    const frases = ["geral", "viol"].map(id => {
      const m = get(id), c = comparar(m.a, m.d, m.tipo, m.melhor);
      if(c.delta == null) return `${esc(m.nome)}: faltam dados para comparar.`;
      return `<b>${esc(m.nome)}</b> ${c.cls === "neutro" ? "ficou estável" : (c.cls === "bom" ? "melhorou" : "piorou")}: ${m.fmt(m.a)} → ${m.fmt(m.d)} (${esc(c.txt)})`;
    });
    const porTipo = TIPOS.map(tp => ({tp, m:get(tp.k)})).map(x => ({tp:x.tp, m:x.m, c:comparar(x.m.a, x.m.d, x.m.tipo, x.m.melhor)})).filter(x => x.c.delta != null);
    if(porTipo.length > 1){
      const up = porTipo.slice().sort((a, b) => b.c.delta - a.c.delta);
      frases.push(`Por tipo: maior avanço em <b>${up[0].tp.curto}</b> (${esc(up[0].c.txt)}); ${up[up.length - 1].c.delta < 0 ? "maior queda" : "menor avanço"} em <b>${up[up.length - 1].tp.curto}</b> (${esc(up[up.length - 1].c.txt)}).`);
    }
    const temParcial = J.cols.some(c => mesDados(c.k) && parcialMes(c.k));
    const aviso = temParcial ? `<div class="cs-aviso"><b>Atenção:</b> há mês(es) com relatório <b>parcial</b> (barras tracejadas, pontos ocos). As <b>taxas</b> continuam valendo; os <b>volumes</b> (eventos, violações, atendimentos) ficam menores nesses meses e não devem ser comparados mês contra mês.</div>` : "";

    const g1 = graficoTaxaMes(J, M, {W:640, H:300}), g2 = grafEmpilhado(J, {W:640, H:300});
    const frente = (titulo, sub, m, minis, graf, icone) => {
      const c = comparar(m.a, m.d, m.tipo, m.melhor);
      return `<div class="cs-front ${c.cls}">
        <div class="cs-front-h"><span class="cs-front-ico">${icone}</span><div><b>${esc(titulo)}</b><small>${esc(sub)}</small></div></div>
        <div class="cs-front-main">
          <div><small>${esc(m.nome)} — depois</small><div class="cs-big">${m.d == null ? "—" : m.fmt(m.d)}</div><div class="cs-antes">antes: <b>${m.a == null ? "—" : m.fmt(m.a)}</b></div></div>
          <div class="cs-delta ${c.cls}"><span>${c.seta || "■"}</span><b>${esc(c.txt)}</b></div>
        </div>${caixaGraf(graf)}
        <div class="cs-minis">${minis.map(mini).join("")}</div>
      </div>`;
    };
    const ICO_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.3 2.4 2.4 4.6-5"/></svg>';
    const ICO_VIOL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3.5 19h17z"/><path d="M12 10v4.2"/><path d="M12 16.9v.1"/></svg>';
    const fr = [
      frente("Cumprimento do SLA mês a mês", "acertos ÷ eventos com SLA (TPR + TRS + TR) — linhas tracejadas = média de cada período", get("geral"), [get("tpr"), get("trs"), get("tr")], g1, ICO_OK),
      frente("Acertos e violações por mês", "eventos que não atingiram o SLA — menos é melhor", get("viol"), [get("ev"), get("atend")], g2, ICO_VIOL)
    ];
    const tempos = ["tmTpr", "tmTrs", "tmTr"].map(get).filter(m => m.a != null || m.d != null);
    const dica = `<p class="cs-hint">Cada indicador compara os meses <b>antes</b> com os meses <b>depois</b> (só meses com dado; as taxas somam as contagens de todos os meses, não fazem média de percentuais). Verde = melhorou, vermelho = piorou; volumes (eventos e atendimentos) não têm “melhor” ou “pior”. Nos gráficos de linha o eixo não começa em zero para destacar a variação — leia os valores no eixo; as barras sempre partem do zero. Para o relatório, use <b>Exportar Excel</b> ou <b>Exportar PDF</b> (levam os gráficos).</p>`;
    return hero + `<div class="cs-frases">${frases.map(f => `<div>${f}</div>`).join("")}</div>` + aviso
      + `<div class="cs-prod-titulo">O que evoluiu</div><div class="cs-tiles">${tilesEvolucao(J, M).map(t => grafTile(J, t)).join("")}</div>`
      + painel("Variação de cada indicador — antes → depois", caixaGraf(grafVariacao(J, M, {W:900})) + `<p class="cs-hint">Verde = melhorou · vermelho = piorou · cinza = volume (sem melhor/pior). A porcentagem é a variação relativa; os valores reais estão à direita.</p>`)
      + `<details class="cs-det"><summary>Ver detalhes: por tipo de SLA, equipe, violações e tempos</summary>`
      + `<div class="cs-grid2">${painel("Cumprimento geral — antes × depois", caixaGraf(grafAneis(J, M, {W:640, H:270})))}${painel("Por tipo de SLA — antes × depois", caixaGraf(grafTipos(J, M, {W:640, H:290})))}</div>`
      + subProdutividade(J, M)
      + `<div class="cs-grid2">${fr.join("")}</div>`
      + (tempos.length ? painel("Tempo médio (informado a mão)", `<div class="cs-cards">${tempos.map(cartao).join("")}</div>`) : "") + dica + `</details>`;
  }

  function subProdutividade(J, M){
    const get = id => M.find(m => m.id === id);
    const ca = get("ativos"), ce = get("evAtDia"), cv = get("violAtDia"), cg = get("geral");
    let frase = "";
    if(ca.a != null && ca.d != null && ce.a != null && ce.d != null){
      const dEq = ca.d - ca.a, pEq = ca.a ? dEq / ca.a * 100 : 0, pProd = ce.a ? (ce.d - ce.a) / ce.a * 100 : 0, dTx = cg.d != null && cg.a != null ? cg.d - cg.a : null;
      const sg = v => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1).replace(".", ",") + "%";
      frase = `<div class="cs-frases"><div>Equipe: <b>${fN1(ca.a)} → ${fN1(ca.d)}</b> atendentes (${sg(pEq)}). Cada atendente passou de <b>${fN2(ce.a)}</b> para <b>${fN2(ce.d)}</b> eventos de SLA por dia (${sg(pProd)})`
        + (dTx != null ? ` e a taxa de acerto foi de <b>${fP(cg.a)}</b> para <b>${fP(cg.d)}</b> (${sinalPP(dTx)}).` : ".") + `</div></div>`;
    }
    const cards = `<div class="cs-cards">${["ativos", "evAtDia", "atAtDia", "violAtDia"].map(id => cartao(get(id))).join("")}</div>`;
    return `<div class="cs-prod-titulo">Equipe e produtividade</div>` + frase
      + `<div class="cs-grid2">${painel("Equipe × produtividade por mês", caixaGraf(grafEquipe(J, {modo:"prod", W:640, H:310})))}${painel("Equipe × performance por mês", caixaGraf(grafEquipe(J, {modo:"taxa", W:640, H:310})))}</div>`
      + painel("Produtividade — antes × depois", cards + `<p class="cs-hint">Equipe = atendentes com algum evento de SLA no relatório do mês (se alguém não deve contar, remova-o em <b>Corrigir dados do mês</b>). Produtividade por <b>atendente-dia</b> = volume ÷ (atendentes × dias cobertos pelo relatório), assim um mês parcial não parece menos produtivo.</p>`);
  }

  function subSLA(J){
    const M = metricas(J), get = id => M.find(m => m.id === id);
    const g = graficoTaxaMes(J, M, {W:900, H:320});
    const cards = `<div class="cs-cards">${["geral", "tpr", "trs", "tr"].map(id => cartao(get(id))).join("")}</div>`;
    const ref = `<p class="cs-hint"><b>TPR</b> = tempo de primeira resposta · <b>TRS</b> = tempo de respostas seguintes · <b>TR</b> = tempo de resolução. Taxa de acerto = acertos ÷ total de eventos do tipo.</p>`;
    return painel("Cumprimento do SLA por tipo", cards + `${caixaGraf(grafTipos(J, M, {W:900, H:300}))}` + caixaGraf(g) + ref)
      + painel("Acertos e violações por mês", caixaGraf(grafEmpilhado(J, {W:900, H:320})))
      + painel("Números por mês", `<div class="table-wrap">${tabelaMeses(J, "sfcTabMeses")}</div>
        <p class="cs-hint">Os números vêm da soma dos atendentes de cada mês. Para corrigir, abra a aba <b>Corrigir dados do mês</b>.</p>`);
  }

  function subAtend(J){
    const Lt = linhasAtendente(J), L = Lt.filter(x => x.delta != null);
    const melhor = L.filter(x => x.delta >= 0).length;
    const resumo = L.length ? `<p class="cs-hint cs-top"><b>${melhor}</b> de <b>${L.length}</b> atendentes melhoraram a taxa de acerto depois da entrada. Atendentes com poucos eventos de SLA oscilam muito — aparecem esmaecidos e com “poucos dados”.</p>` : "";
    return painel("Taxa de acerto por atendente — antes × depois", resumo + caixaGraf(grafHaltere(J, Lt, {W:820})))
      + painel("Mapa de calor — taxa de acerto de cada atendente, mês a mês", caixaGraf(grafCalor(J, Lt)) + `<p class="cs-hint">Cada célula é a taxa do atendente naquele mês (acertos ÷ eventos). Células cinza = sem relatório do atendente no mês.</p>`)
      + painel("Atendente a atendente", `<div class="table-wrap">${tabelaAtendentes(J, "sfcTabAtend")}</div>
        <p class="cs-hint">Os atendentes são ligados pelo nome (sem diferenciar maiúsculas, acentos nem o ponto final: “Pablo H” = “Pablo H.”). Se o mesmo atendente aparecer escrito diferente em dois meses, corrija o nome na aba <b>Corrigir dados do mês</b>.</p>`);
  }

  function subEditar(J){
    const meses = J.cols.map(c => c.k);
    if(!mesEdit || !meses.includes(mesEdit)) mesEdit = (meses.find(k => D.mes[k]) || meses[J.marca] || meses[0]);
    const k = mesEdit, mo = D.mes[k] || {atend:[], extra:{}};
    const opc = J.cols.map(x => `<option value="${x.k}" ${x.k === k ? "selected" : ""}>${mesRot(x.k)} — ${ROT_TIPO[x.tipo]}${D.mes[x.k] ? " ✓" : ""}</option>`).join("");
    const inp = (path, v, cls) => `<td class="cs-n"><input class="cs-in ${cls || ""}" data-sfc="${esc(path)}" value="${v == null ? "" : esc(String(v).replace(".", ","))}" placeholder="—" inputmode="decimal"></td>`;
    const inpT = (path, v) => `<td class="cel-texto"><input class="cs-in cs-in-t" data-sfc="${esc(path)}" value="${esc(v || "")}"></td>`;
    let t = `<table class="cs-table"><thead><tr><th rowspan="2" class="cs-th-mes">Atendente</th><th rowspan="2">Cargo</th><th rowspan="2">Atend.</th>${TIPOS.map(tp => `<th colspan="2">${tp.curto}</th>`).join("")}<th rowspan="2">Taxa</th><th rowspan="2"></th></tr>`
      + `<tr>${TIPOS.map(() => "<th>Acertos</th><th>Total</th>").join("")}</tr></thead><tbody>`;
    if(!mo.atend.length) t += `<tr><td class="cel-texto" colspan="${4 + TIPOS.length * 2 + 1}">Nenhum atendente neste mês. Use “+ Adicionar atendente” ou importe o relatório.</td></tr>`;
    mo.atend.forEach((x, i) => {
      const a = TIPOS.reduce((s, tp) => s + (par(x[tp.k]) ? x[tp.k][0] : 0), 0), tt = TIPOS.reduce((s, tp) => s + (par(x[tp.k]) ? x[tp.k][1] : 0), 0);
      const erro = TIPOS.some(tp => par(x[tp.k]) && x[tp.k][0] > x[tp.k][1]);
      t += `<tr${erro ? ' title="Acertos maiores que o total — confira"' : (x.rev ? ` title="${esc(x.rev)}"` : "")}>${x.rev ? `<td class="cel-texto"><span class="cs-badge cs-b-trans" title="${esc(x.rev)}">conferir</span><input class="cs-in cs-in-t" data-sfc="${i}|nome" value="${esc(x.nome || "")}"></td>` : inpT(`${i}|nome`, x.nome)}${inpT(`${i}|cargo`, x.cargo)}${inp(`${i}|n`, x.n)}`
        + TIPOS.map(tp => inp(`${i}|${tp.k}|0`, par(x[tp.k]) ? x[tp.k][0] : null) + inp(`${i}|${tp.k}|1`, par(x[tp.k]) ? x[tp.k][1] : null)).join("")
        + `<td class="cs-n cs-perf ${erro ? "cs-neg" : ""}">${erro ? "⚠" : fP2(taxa(a, tt))}</td><td><button type="button" class="link-btn danger" data-sfc-del="${i}" title="Remover este atendente">remover</button></td></tr>`;
    });
    const tm = mesDados(k);
    if(tm) t += `</tbody><tfoot><tr class="cs-tot-antes"><td class="cel-texto">EQUIPE</td><td></td>${tdN(tm.temN ? tm.n : null)}${TIPOS.map(tp => tdN(tm[tp.k].a) + tdN(tm[tp.k].t)).join("")}${tdP(taxa(tm.a, tm.t))}<td></td></tr></tfoot>`;
    else t += "</tbody>";
    t += "</table>";
    const ex = mo.extra || {};
    const extra = `<div class="cs-form">
      <label>Atendimentos com SLA <span class="cs-sm">(opcional)</span><input type="text" data-sfc-ex="comSla" value="${ex.comSla == null ? "" : esc(String(ex.comSla))}" placeholder="ex.: 512"></label>
      <label>Tempo médio TPR (min)<input type="text" data-sfc-ex="tmTpr" value="${ex.tmTpr == null ? "" : esc(String(ex.tmTpr).replace(".", ","))}" placeholder="ex.: 35"></label>
      <label>Tempo médio TRS (min)<input type="text" data-sfc-ex="tmTrs" value="${ex.tmTrs == null ? "" : esc(String(ex.tmTrs).replace(".", ","))}" placeholder="ex.: 20"></label>
      <label>Tempo médio TR (min)<input type="text" data-sfc-ex="tmTr" value="${ex.tmTr == null ? "" : esc(String(ex.tmTr).replace(".", ","))}" placeholder="ex.: 120 (= 2h)"></label>
    </div>
    <p class="cs-hint">Os tempos médios aparecem no relatório do SacFlow ao lado de cada tipo (ex.: “35min”, “2h”). Digite em minutos; deixe em branco se não quiser compará-los.</p>`;
    const per = `<div class="cs-form">
      <label>Período do relatório — de<input type="date" data-sfc-per="ini" value="${esc(mo.ini || "")}"></label>
      <label>até<input type="date" data-sfc-per="fim" value="${esc(mo.fim || "")}"></label>
    </div>`;
    return painel("Mês a corrigir", `<div class="cs-form"><label>Mês<select id="sfcMesEdit">${opc}</select></label></div>${per}`)
      + painel(`Atendentes — ${mesRot(k)} <span class="cs-sm">(clique na célula para editar)</span>`,
          `<div class="table-wrap">${t}</div><div class="cs-acoes"><button type="button" class="btn btn-ghost btn-sm" id="sfcAddAt">+ Adicionar atendente</button></div>
           <p class="cs-hint">A taxa é sempre recalculada: acertos ÷ total. Tipo sem registro (“-” no relatório) deixe os dois campos em branco.</p>`)
      + painel("Dados do mês que não são por atendente", extra);
  }

  /* ---------------- montagem ---------------- */
  function conteudoSub(J){
    switch(sub){
      case "geral": return subGeral(J);
      case "sla": return subSLA(J);
      case "atend": return subAtend(J);
      case "editar": return subEditar(J);
      default: return subDados(J);
    }
  }
  function renderizar(){
    const raiz = document.getElementById("sfcRoot");
    if(!raiz) return;
    const J = janela();
    raiz.querySelector("#sfcSubnav").innerHTML = SUBS.map(t => `<button type="button" class="pg-subtab-btn ${sub === t.id ? "active" : ""}" data-sfc-sub="${t.id}">${t.label}</button>`).join("");
    raiz.querySelector("#sfcConteudo").innerHTML = conteudoSub(J);
    ligarSub();
  }
  function comparacaoHTML(){
    return `<div id="sfcRoot">
      <div class="cs-topo">
        <div>
          <h2 class="section-title">Comparação SacFlow — Antes × Depois</h2>
          <p class="section-desc">Compara os meses <strong>antes</strong> e <strong>depois</strong> de uma data de entrada usando o <strong>Relatório de SLA</strong> do SacFlow (cumprimento por tipo, violações e atendentes). Aba independente — tem importação própria e não mistura com a aba SacFlow nem com as outras telas.</p>
        </div>
        <div class="cs-exp-btns"><button type="button" class="btn btn-primary" id="sfcExportar" title="Baixar o relatório desta comparação em Excel (.xlsx) com dashboard, gráficos e tabelas">Exportar Excel</button><button type="button" class="btn btn-ghost" id="sfcExportarPdf" title="Baixar o relatório desta comparação em PDF com os gráficos">Exportar PDF</button></div>
      </div>
      <div class="pg-subtabs" id="sfcSubnav"></div>
      <div id="sfcConteudo"></div>
    </div>`;
  }

  /* ---------------- edição ---------------- */
  function setCampo(path, valor, texto){
    const mo = D.mes[mesEdit]; if(!mo) return;
    const p = path.split("|"), i = +p[0], x = mo.atend[i]; if(!x) return;
    delete x.rev;                       // quem mexeu na linha já conferiu
    if(p[1] === "nome" || p[1] === "cargo"){ x[p[1]] = String(texto || "").trim(); return; }
    if(p[1] === "n"){ x.n = valor == null ? null : Math.round(valor); return; }
    const k = p[1], j = +p[2];
    const cur = par(x[k]) ? x[k].slice() : [null, null];
    cur[j] = valor == null ? null : Math.round(valor);
    x[k] = (cur[0] == null && cur[1] == null) ? null : [cur[0], cur[1]];
    // meia célula vazia = a outra vale como 0 só se houver número; senão mantém incompleta e fica fora da conta
    if(x[k] && (x[k][0] == null || x[k][1] == null)){ if(x[k][0] == null) x[k][0] = 0; if(x[k][1] == null) x[k][1] = x[k][0]; }
  }
  function garantirMes(k){
    if(!D.mes[k]) D.mes[k] = {ini:k + "-01", fim:k + "-" + String(ultimoDia(k)).padStart(2, "0"), atend:[], extra:{}};
    return D.mes[k];
  }

  function ligarSub(){
    const raiz = document.getElementById("sfcRoot");
    raiz.querySelectorAll("[data-sfc-sub]").forEach(b => b.onclick = () => { sub = b.dataset.sfcSub; renderizar(); });
    raiz.querySelectorAll("[data-sfc-cfg]").forEach(i => {
      i.onchange = () => {
        const k = i.dataset.sfcCfg;
        D.cfg[k] = (k === "antes" || k === "depois") ? Math.max(1, Math.min(24, parseInt(i.value, 10) || 1)) : i.value;
        if(k === "entrada" && !i.value) D.cfg.entrada = padrao().cfg.entrada;
        gravar(); renderizar();
      };
    });
    raiz.querySelectorAll("[data-sfc-limpar]").forEach(b => b.onclick = () => {
      const m = b.dataset.sfcLimpar;
      if(!confirm("Apagar os dados de " + mesRot(m) + " desta comparação?")) return;
      delete D.mes[m]; gravar(); renderizar();
    });
    raiz.querySelectorAll("[data-sfc-ed]").forEach(b => b.onclick = () => { mesEdit = b.dataset.sfcEd; sub = "editar"; renderizar(); });
    if(sub === "dados") ligarImportacao();
    if(sub === "editar") ligarEdicao();
  }

  function ligarEdicao(){
    const raiz = document.getElementById("sfcRoot");
    const $ = id => document.getElementById(id);
    $("sfcMesEdit").onchange = e => { mesEdit = e.target.value; renderizar(); };
    $("sfcAddAt").onclick = () => { garantirMes(mesEdit).atend.push({nome:"Novo atendente", cargo:"", n:null, tpr:null, trs:null, tr:null}); gravar(); renderizar(); };
    raiz.querySelectorAll("input[data-sfc]").forEach(i => {
      i.onfocus = () => i.select();
      i.onchange = () => {
        const txt = i.value.trim(), path = i.dataset.sfc, tipoTexto = /\|(nome|cargo)$/.test(path);
        if(tipoTexto){ setCampo(path, null, txt); gravar(); renderizar(); return; }
        const v = txt === "" ? null : lerInt(txt);
        if(txt !== "" && v == null){ i.value = ""; return; }
        setCampo(path, v); gravar(); renderizar();
      };
    });
    raiz.querySelectorAll("[data-sfc-del]").forEach(b => b.onclick = () => {
      const mo = D.mes[mesEdit]; if(!mo) return;
      const x = mo.atend[+b.dataset.sfcDel];
      if(!confirm("Remover " + (x ? x.nome : "este atendente") + " de " + mesRot(mesEdit) + "?")) return;
      mo.atend.splice(+b.dataset.sfcDel, 1);
      if(!mo.atend.length && !Object.keys(mo.extra || {}).some(k => mo.extra[k] != null)) delete D.mes[mesEdit];
      gravar(); renderizar();
    });
    raiz.querySelectorAll("[data-sfc-ex]").forEach(i => i.onchange = () => {
      const mo = garantirMes(mesEdit), k = i.dataset.sfcEx, txt = i.value.trim();
      const v = txt === "" ? null : lerNum(txt);
      if(txt !== "" && v == null){ i.value = ""; return; }
      mo.extra = mo.extra || {}; mo.extra[k] = v;
      gravar(); renderizar();
    });
    raiz.querySelectorAll("[data-sfc-per]").forEach(i => i.onchange = () => {
      if(i.value && !/^(19|20)\d\d-\d\d-\d\d$/.test(i.value)) return;
      const mo = garantirMes(mesEdit); mo[i.dataset.sfcPer] = i.value || null;
      gravar(); renderizar();
    });
  }

  /* ---------------- importação ---------------- */
  const CARGOS = /(CRM\s*-\s*Cadastro Comercial|Atendente SAC|Supervisor(?:a)? SAC|Supervisor(?:a)?|Coordenador(?:a)?(?: SAC)?|Recepcionista|Atendente|Analista[A-Za-zÀ-ú ]*|Assistente[A-Za-zÀ-ú ]*)/i;
  function separaNome(seg){
    seg = seg.trim();
    const m = CARGOS.exec(seg);
    if(m && m.index > 0) return {nome:seg.slice(0, m.index).trim(), cargo:seg.slice(m.index).trim()};
    const tk = seg.split(" ");
    let nome = tk[0] || "";
    if(tk[1] && /^[A-ZÀ-Ú]\.?$/.test(tk[1])) nome += " " + tk[1];
    return {nome, cargo:tk.slice(nome.split(" ").length).join(" ")};
  }
  // lê a tabela "Performance da equipe" (texto copiado da tela ou CSV exportado)
  function lerRelatorio(texto){
    const flat = String(texto || "").replace(/ /g, " ").replace(/["“”]/g, " ").replace(/[\t\r\n;|]+/g, " ").replace(/\s+/g, " ");
    const SEP = "[\\s,]+";
    const CEL = "(?:-|—|–|(\\d+)\\s*\\/\\s*(\\d+)(?:\\s*\\(\\s*[\\d.,]+\\s*%\\s*\\))?)";
    const re = new RegExp("(^|[^\\d/.,%])(\\d+)" + SEP + "(?:-|\\d+(?:[.,]\\d+)?\\s*%)" + SEP + CEL + SEP + CEL + SEP + CEL, "g");
    const rows = []; let prev = 0, m, primeiro = true;
    while((m = re.exec(flat))){
      const ini = m.index + m[1].length;
      let seg = flat.slice(prev, ini);
      if(primeiro){
        const i = seg.search(/Tend[eê]ncia/i);
        seg = i >= 0 ? seg.slice(i + 9) : seg.replace(/.*\bTR\b/, "");
        primeiro = false;
      }
      seg = seg.replace(/Exportar CSV/ig, "").replace(/Usu[aá]rios\s+Atend\.?\s+Taxa de acerto\s+TPR\s+TRS\s+TR/ig, "").trim();
      prev = re.lastIndex;
      const cel = (a, b) => (a != null && b != null ? [+a, +b] : null);
      const nc = separaNome(seg);
      if(!nc.nome) continue;
      rows.push({nome:nc.nome, cargo:nc.cargo, n:+m[2], tpr:cel(m[3], m[4]), trs:cel(m[5], m[6]), tr:cel(m[7], m[8])});
    }
    // período: "dd/mm/aaaa a dd/mm/aaaa"
    let periodo = null;
    const pm = /(\d{2})\/(\d{2})\/(\d{4})\s*(?:a|à|até|-|–)\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(flat);
    if(pm) periodo = {ini:`${pm[3]}-${pm[2]}-${pm[1]}`, fim:`${pm[6]}-${pm[5]}-${pm[4]}`};
    const cs = /Atendimentos com SLA\D{0,6}(\d[\d.]*)/i.exec(flat);
    return {rows, periodo, comSla:cs ? lerInt(cs[1]) : null};
  }
  // período pelo nome do arquivo: relatorio_sla_010926_200926.pdf (ddmmaa_ddmmaa)
  function periodoDoNome(nome){
    const m = /(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(nome || "");
    if(!m) return null;
    const ok = (d, mo) => +d >= 1 && +d <= 31 && +mo >= 1 && +mo <= 12;
    if(!ok(m[1], m[2]) || !ok(m[4], m[5])) return null;
    return {ini:`20${m[3]}-${m[2]}-${m[1]}`, fim:`20${m[6]}-${m[5]}-${m[4]}`};
  }
  function aviso(t, ok){
    msg = {txt:t, ok:!!ok};
    const el = document.getElementById("sfcImpMsg");
    if(el){ el.textContent = t; el.className = "cs-msg " + (ok ? "cs-msg-ok" : "cs-msg-err"); }
  }
  async function lerArquivo(file){
    const buf = await file.arrayBuffer();
    try{ return new TextDecoder("utf-8", {fatal:true}).decode(buf); }
    catch(e){ return new TextDecoder("windows-1252").decode(buf); }
  }
  function processar(texto, nomeArq){
    const r = lerRelatorio(texto);
    if(!r.rows.length) return aviso("Não achei linhas de atendente. Cole a tabela “Performance da equipe” (Atendente, Atend., Taxa de acerto, TPR, TRS, TR). Use “Inserir exemplo do formato” para ver como deve ficar.");
    salvarRelatorio(r.rows, r.periodo || periodoDoNome(nomeArq), r.comSla, "");
  }
  // grava as linhas lidas (texto ou PDF) no mês certo e avisa o resultado
  function salvarRelatorio(rows, per, comSla, extraMsg){
    let mes = document.getElementById("sfcImpMes").value;
    if(per){
      const k = per.ini.slice(0, 7);
      if(per.fim.slice(0, 7) !== k) return aviso(`O período ${fData(per.ini)} a ${fData(per.fim)} atravessa dois meses. Importe um relatório por mês (ex.: um de ${fData(per.ini)} até o fim do mês e outro do dia 1 em diante).`);
      mes = k;
    }
    const mo = D.mes[mes] ? D.mes[mes] : null;
    const jaTinha = !!(mo && mo.atend && mo.atend.length);
    D.mes[mes] = {ini:per ? per.ini : mes + "-01", fim:per ? per.fim : mes + "-" + String(ultimoDia(mes)).padStart(2, "0"), atend:rows, extra:Object.assign({}, mo && mo.extra, comSla != null ? {comSla} : {})};
    if(!gravar()) return;
    const t = totaisMes(D.mes[mes]);
    mesEdit = mes;
    renderizar();
    const dentro = janela().cols.some(c => c.k === mes);
    aviso(`${mesRot(mes)}${per ? " (" + fData(per.ini) + " a " + fData(per.fim) + ")" : ""}: ${rows.length} atendente(s) importado(s)` + (t ? `, ${fN(t.t)} eventos de SLA, taxa de acerto ${fP2(taxa(t.a, t.t))}.` : ".") + (jaTinha ? " (substituiu o que já havia no mês)" : "") + (dentro ? "" : " Atenção: esse mês está fora da janela atual (confira a data de entrada e os meses antes/depois).") + (extraMsg || ""), !extraMsg || extraMsg.indexOf("CONFERIR") < 0);
  }

  /* ---------------- leitura do PDF (OCR) ----------------
     O PDF exportado pelo SacFlow é uma imagem. O painel desenha a página, acha a tabela “Performance da equipe”,
     lê os números (duas passadas) e CONFERE cada célula pela conta: acertos ÷ total tem que dar o percentual
     que está escrito no relatório. Linha que não bate fica marcada “conferir” em “Corrigir dados do mês”. */
  const TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  let ocrOcupado = false;
  function carregarScript(url){
    return new Promise((ok, erro) => {
      if(window.Tesseract) return ok();
      const sc = document.createElement("script"); sc.src = url;
      sc.onload = () => ok();
      sc.onerror = () => erro(new Error("Não consegui baixar o leitor de imagem (OCR). Verifique a internet e tente de novo."));
      document.head.appendChild(sc);
    });
  }
  function parseCel(t){
    if(t === "-") return {vazio:true};
    let m = /^(\d+)\s*\/\s*(\d+)\s*\(\s*([\d.,]+)\s*%\s*\)$/.exec(t);
    if(m) return {a:+m[1], t:+m[2], p:lerNum(m[3])};
    m = /^(\d+)\s*\(\s*([\d.,]+)\s*%\s*\)$/.exec(t);       // “/” sumiu na leitura: ex. “40 (40%)”
    return m ? {dmg:true, p:lerNum(m[2])} : null;
  }
  const celOk = c => !!c && (c.vazio || (c.a != null && c.t > 0 && c.a <= c.t && Math.abs(c.a / c.t * 100 - c.p) <= 0.0051));
  function lerLinhaOCR(linha){
    const l = linha.replace(/[|©®°]/g, " ").replace(/\s+/g, " ").trim();
    const m = /^(?:(\d+)\s+)?(\d+(?:[.,]\d+)?)\s*%\s+(.*)$/.exec(l);
    if(!m) return null;
    const cels = [], re = /-|\d+\s*\/\s*\d+\s*\(\s*[\d.,]+\s*%\s*\)|\d+\s*\(\s*[\d.,]+\s*%\s*\)/g;
    let c; while((c = re.exec(m[3]))) cels.push(parseCel(c[0]));
    const tx = lerNum(m[2]);
    return {n:m[1] != null ? +m[1] : null, taxa:(tx != null && tx >= 0 && tx <= 100) ? tx : null, cels};
  }
  const limpaTxt = t => String(t).replace(/[^A-Za-zÀ-ÿ .\-]/g, " ").replace(/\s+/g, " ").trim();
  function lerNomesOCR(txt){
    const L = txt.split(/\n/).map(limpaTxt).filter(x => x.replace(/[ .\-]/g, "").length > 1);
    const out = [];
    L.forEach(l => {
      if(CARGOS.test(l) || /\b(SAC|Comercial|Recepcion\w*)\b/i.test(l)){ if(out.length && !out[out.length - 1].cargo) out[out.length - 1].cargo = l; }
      else out.push({nome:l, cargo:""});
    });
    return out;
  }
  function lev(a, b){
    const d = []; for(let i = 0; i <= a.length; i++){ d[i] = [i]; } for(let j = 1; j <= b.length; j++) d[0][j] = j;
    for(let i = 1; i <= a.length; i++) for(let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
    return d[a.length][b.length];
  }
  // nome lido por OCR -> nome já conhecido de outro mês (corrige letra trocada)
  function ajustaNome(nome){
    const k = nkey(nome); if(k.length < 4) return nome;
    const conhecidos = new Map();
    Object.keys(D.mes).forEach(m => (D.mes[m].atend || []).forEach(x => conhecidos.set(nkey(x.nome), x.nome)));
    if(conhecidos.has(k)) return conhecidos.get(k);
    let melhor = null, empate = false;
    conhecidos.forEach((orig, ck) => { const d = lev(k, ck); if(d <= 2){ if(!melhor || d < melhor.d){ melhor = {d, orig}; empate = false; } else if(d === melhor.d) empate = true; } });
    return melhor && !empate ? melhor.orig : nome;
  }
  function cargoConhecido(nome){
    const k = nkey(nome); let c = "";
    Object.keys(D.mes).forEach(m => (D.mes[m].atend || []).forEach(x => { if(nkey(x.nome) === k && x.cargo) c = x.cargo; }));
    return c;
  }
  function consolidarOCR(passes, nomes){
    const nL = Math.max.apply(null, passes.map(p => p.length));
    const rows = [];
    for(let i = 0; i < nL; i++){
      const cand = passes.map(p => p[i]).filter(Boolean);
      const rev = [];
      const nn = cand.map(c => c.n).filter(v => v != null);
      const n = nn.length ? nn[0] : null;
      if(nn.length > 1 && nn.some(v => v !== nn[0])) rev.push("Atend. incerto");
      if(n == null) rev.push("Atend. não lido");
      const taxaLida = (cand.map(c => c.taxa).filter(v => v != null) || [])[0];
      const bons = cand.filter(c => c.cels.length === 3);
      const cel = [null, null, null];
      for(let k = 0; k < 3; k++){
        const opts = bons.map(c => c.cels[k]).filter(Boolean);
        const ok = opts.find(celOk);
        if(ok) cel[k] = ok;
        else { const dm = opts.find(o => o.dmg); cel[k] = dm ? {dmg:true, p:dm.p} : null; }
      }
      // conserta célula danificada pela conta da linha
      cel.forEach((c, k) => {
        if(!c || !c.dmg) return;
        let sa = 0, st = 0; cel.forEach((o, j) => { if(j !== k && celOk(o) && !o.vazio){ sa += o.a; st += o.t; } });
        const achados = [];
        for(let t = 1; t <= 800; t++){ const a = Math.round(c.p * t / 100); if(a <= t && Math.abs(a / t * 100 - c.p) <= 0.0051){
          if(taxaLida == null || Math.abs((sa + a) / (st + t) * 100 - taxaLida) <= 0.0051) achados.push([a, t]); } }
        if(achados.length === 1) cel[k] = {a:achados[0][0], t:achados[0][1], p:c.p};
        else if(achados.length > 1){ cel[k] = {a:achados[0][0], t:achados[0][1], p:c.p}; rev.push(TIPOS[k].curto + " incerto"); }
        else{ cel[k] = null; rev.push(TIPOS[k].curto + " ilegível"); }
      });
      if(!bons.length) rev.push("linha mal lida");
      const par3 = cel.map(c => (c && !c.vazio && c.a != null) ? [c.a, c.t] : null);
      // a taxa da linha tem que bater com a soma das células (quando a taxa foi lida)
      const A = par3.reduce((s, c) => s + (c ? c[0] : 0), 0), T = par3.reduce((s, c) => s + (c ? c[1] : 0), 0);
      const tx = cand.map(c => c.taxa).filter(v => v != null);
      if(T && tx.length && !tx.some(v => Math.abs(A / T * 100 - v) <= 0.03) && !rev.length) rev.push("taxa da linha não bate");
      rows.push({nome:"", cargo:"", n, tpr:par3[0], trs:par3[1], tr:par3[2], rev:rev.length ? rev.join("; ") : undefined});
    }
    rows.forEach((r, i) => {
      const nm = nomes[i];
      if(nm){ r.nome = ajustaNome(nm.nome); r.cargo = nm.cargo || cargoConhecido(r.nome); }
      else{ r.nome = "Atendente " + (i + 1); r.rev = (r.rev ? r.rev + "; " : "") + "nome não lido"; }
    });
    if(nomes.length !== rows.length) rows.forEach(r => { r.rev = (r.rev ? r.rev + "; " : "") + "confira o nome (a leitura achou " + nomes.length + " nomes e " + rows.length + " linhas)"; });
    return rows;
  }
  async function lerPDF(file){
    if(ocrOcupado) return;
    ocrOcupado = true;
    let W = null;
    try{
      aviso("Lendo o PDF (reconhecimento de texto na imagem)… na primeira vez pode levar até 1 minuto.", true);
      await carregarScript(TESS_URL);
      if(typeof pdfjsLib === "undefined") throw new Error("Biblioteca de leitura de PDF não carregou. Verifique a internet e recarregue a página.");
      if(typeof ensurePdfWorker === "function") await ensurePdfWorker();
      const pdf = await pdfjsLib.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;
      const page = await pdf.getPage(1);
      const v0 = page.getViewport({scale:1}), vp = page.getViewport({scale:2740 / v0.width});
      const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
      await page.render({canvasContext:cv.getContext("2d"), viewport:vp}).promise;
      const y0 = Math.floor(cv.height * 0.45);
      const tab = document.createElement("canvas"); tab.width = cv.width; tab.height = cv.height - y0;
      tab.getContext("2d").drawImage(cv, 0, y0, cv.width, tab.height, 0, 0, cv.width, tab.height);
      const recorte = (xa, xb, ya, esc) => {
        const c = document.createElement("canvas"), k = esc || 1;
        c.width = Math.round((xb - xa) * k); c.height = Math.round((tab.height - ya) * k);
        const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = "high";
        g.drawImage(tab, xa, ya, xb - xa, tab.height - ya, 0, 0, c.width, c.height); return c;
      };
      W = await Tesseract.createWorker("eng");
      await W.setParameters({tessedit_pageseg_mode:"6"});
      // 1) achar o cabeçalho da tabela (palavra “Atend.”)
      const r1 = await W.recognize(tab);
      let words = (r1.data && r1.data.words) || [];
      const cab = words.filter(w => /^Atend\.?$/i.test(String(w.text).replace(/[^A-Za-z.]/g, ""))).sort((a, b) => b.bbox.y0 - a.bbox.y0)[0];
      if(!cab) throw new Error("Não achei a tabela “Performance da equipe” neste PDF. Confira se é o Relatório de SLA do SacFlow.");
      const k = tab.width / 2740, xAt = cab.bbox.x0, yTab = Math.round(cab.bbox.y1 + 21 * k);
      // 2) números (duas passadas) e nomes
      await W.setParameters({tessedit_char_whitelist:"0123456789./%()- ", tessedit_pageseg_mode:"6"});
      const passes = [];
      for(const esc of [1, 1.5]){
        const r = await W.recognize(recorte(xAt - 2 * k, xAt + 1602 * k, yTab, esc));
        passes.push(r.data.text.split(/\n/).filter(l => l.trim()).map(lerLinhaOCR).filter(Boolean));
      }
      await W.setParameters({tessedit_char_whitelist:"", tessedit_pageseg_mode:"6"});
      const rn = await W.recognize(recorte(xAt - 358 * k, xAt + 2 * k, yTab, 1));
      const nomes = lerNomesOCR(rn.data.text);
      const rows = consolidarOCR(passes.filter(p => p.length), nomes);
      if(!rows.length) throw new Error("Não consegui ler linhas de atendente neste PDF.");
      const rev = rows.filter(r => r.rev);
      const msgRev = rev.length
        ? ` CONFERIR: ${rev.length} de ${rows.length} linha(s) ficaram marcadas (${rev.map(r => r.nome).join(", ")}) — abra “Corrigir dados do mês”. Confira também a grafia dos nomes.`
        : ` Todas as ${rows.length} linhas bateram com a conta (acertos ÷ total = percentual do relatório). Confira só a grafia dos nomes.`;
      salvarRelatorio(rows, periodoDoNome(file.name), null, msgRev);
    }catch(e){
      console.error(e);
      aviso("Não consegui ler o PDF: " + (e.message || e) + " Você ainda pode colar a tabela ou digitar em “Corrigir dados do mês”.");
    }finally{
      ocrOcupado = false;
      if(W){ try{ await W.terminate(); }catch(x){ /* ignora */ } }
    }
  }
  function ligarImportacao(){
    const $ = id => document.getElementById(id);
    $("sfcImpToggle").onclick = () => { const w = $("sfcImpColar"); w.style.display = w.style.display === "none" ? "block" : "none"; };
    $("sfcImpEx").onclick = () => { $("sfcImpTxt").value = EXEMPLO; };
    $("sfcImpBtn").onclick = async () => {
      const f = $("sfcImpArq").files[0];
      if(!f){ aviso("Selecione um arquivo."); return; }
      if(/\.pdf$/i.test(f.name)){ await lerPDF(f); $("sfcImpArq").value = ""; return; }
      try{ processar(await lerArquivo(f), f.name); $("sfcImpArq").value = ""; }
      catch(e){ aviso("Não consegui ler o arquivo: " + (e.message || e)); }
    };
    $("sfcImpTxtBtn").onclick = () => {
      const t = $("sfcImpTxt").value;
      if(!t.trim()){ aviso("Cole o texto antes de importar."); return; }
      processar(t, "");
    };
  }

  /* ---------------- exportar (relatório separado: Excel e PDF, ambos com os gráficos) ---------------- */
  const xlNum = m => {                         // valor numérico "de verdade" para o Excel
    const f = m.fmt === fP2 ? '0.00%' : (m.fmt === fMin ? '0.0" min"' : (m.fmt === fN1 ? '#,##0.0' : (m.fmt === fN2 ? '#,##0.00' : '#,##0')));
    return {f, conv:v => (m.fmt === fP2 ? v / 100 : v)};
  };
  function tabelaResumoExport(J){
    const M = metricas(J).filter(m => !m.opcional || m.a != null || m.d != null);
    let h = `<table class="cs-table" id="sfcTabResumo"><thead><tr><th class="cs-th-mes">Indicador</th><th>Antes</th><th>Depois</th><th>Variação</th><th>Leitura</th><th>Cobertura</th></tr></thead><tbody>`;
    M.forEach(m => {
      const c = comparar(m.a, m.d, m.tipo, m.melhor), x = xlNum(m);
      const leit = c.delta == null ? "sem dados" : (m.melhor === "neutro" ? "volume (sem melhor/pior)" : (c.cls === "bom" ? "melhorou" : (c.cls === "ruim" ? "piorou" : "estável")));
      const attr = v => v == null ? "" : ` data-xlnum="${x.conv(v)}" data-xlfmt="${x.f}"`;
      const dAttr = c.delta == null ? "" : (m.tipo === "pct" ? ` data-xlnum="${c.delta / 100}" data-xlfmt="+0.00%;-0.00%;0.00%"` : (m.a ? ` data-xlnum="${c.delta / Math.abs(m.a)}" data-xlfmt="+0.0%;-0.0%;0.0%"` : ""));
      h += `<tr><td class="cs-mes cel-texto">${esc(m.nome)}</td><td class="cs-n cel-texto" style="text-align:right"${attr(m.a)}>${m.a == null ? "—" : esc(m.fmt(m.a))}</td><td class="cs-n cel-texto" style="text-align:right"${attr(m.d)}>${m.d == null ? "—" : esc(m.fmt(m.d))}</td>`
        + `<td class="cs-n cel-texto cs-${c.cls === "bom" ? "pos" : (c.cls === "ruim" ? "neg" : "neu")}" style="text-align:right"${dAttr}>${c.delta == null ? "—" : esc(c.txt)}</td><td class="cel-texto" style="text-align:center">${leit}</td><td class="cel-texto">${esc(m.nota)}</td></tr>`;
    });
    return h + "</tbody></table>";
  }
  // matriz atendente × mês (taxa de acerto) para uma aba própria do Excel
  function tabelaAtendMes(J, idTab){
    const L = linhasAtendente(J);
    const mapas = J.cols.map(c => {
      const mp = new Map(), mo = D.mes[c.k];
      (mo && mo.atend || []).forEach(x => {
        const key = nkey(x.nome); if(!key) return;
        const r = mp.get(key) || {a:0, t:0};
        TIPOS.forEach(tp => { if(par(x[tp.k])){ r.a += x[tp.k][0]; r.t += x[tp.k][1]; } });
        mp.set(key, r);
      });
      return mp;
    });
    let h = `<table class="cs-table" id="${idTab}"><thead><tr><th class="cs-th-mes">Atendente</th>${J.cols.map(c => `<th>${mesRot(c.k)}<br>${ROT_TIPO[c.tipo]}</th>`).join("")}<th>Variação (p.p.)</th></tr></thead><tbody>`;
    L.forEach(it => {
      h += `<tr><td class="cs-mes cel-texto">${esc(it.nome)}</td>` + mapas.map(mp => { const r = mp.get(it.k); return r && r.t ? `<td class="cs-n cs-perf">${fP2(r.a / r.t * 100)}</td>` : `<td class="cs-n cel-texto">—</td>`; }).join("")
        + `<td class="cs-n cel-texto ${it.delta == null ? "" : (it.delta >= 0 ? "cs-pos" : "cs-neg")}" style="text-align:right"${it.delta == null ? "" : ` data-xlnum="${it.delta / 100}" data-xlfmt="+0.00%;-0.00%;0.00%"`}>${it.delta == null ? "—" : sinalPP(it.delta)}</td></tr>`;
    });
    return h + "</tbody></table>";
  }

  // SVG -> PNG (data URL) usando só o navegador
  function svgParaPng(svg, escala){
    return new Promise((ok, erro) => {
      const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
      const w = m ? +m[1] : 800, h = m ? +m[2] : 400, k = escala || 2;
      const img = new Image();
      img.onload = () => {
        const cv = document.createElement("canvas"); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
        const cx = cv.getContext("2d"); cx.fillStyle = "#ffffff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
        ok({png:cv.toDataURL("image/png"), jpg:cv.toDataURL("image/jpeg", 0.92), w, h});
      };
      img.onerror = () => erro(new Error("não consegui desenhar um dos gráficos"));
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    });
  }
  // gráficos que acompanham o relatório (os mesmos da tela)
  function graficosExport(J){
    const M = metricas(J), Lt = linhasAtendente(J);
    return [
      {id:"var", titulo:"Variação de cada indicador — antes → depois", svg:grafVariacao(J, M, {W:900})},
      {id:"p_linha", titulo:"Taxa de acerto mês a mês", svg:graficoTaxaMes(J, M, {W:900, H:300})},
      {id:"p_eqp", titulo:"Equipe × produtividade por mês", svg:grafEquipe(J, {modo:"prod", W:900, H:300})},
      {id:"aneis", titulo:"Cumprimento geral — antes × depois", svg:grafAneis(J, M, {W:640, H:270})},
      {id:"tipos", titulo:"Por tipo de SLA — antes × depois", svg:grafTipos(J, M, {W:640, H:290})},
      {id:"eqp", titulo:"Equipe × produtividade por mês", svg:grafEquipe(J, {modo:"prod", W:640, H:310})},
      {id:"eqt", titulo:"Equipe × performance por mês", svg:grafEquipe(J, {modo:"taxa", W:640, H:310})},
      {id:"linha", titulo:"Cumprimento do SLA mês a mês", svg:graficoTaxaMes(J, M, {W:900, H:320})},
      {id:"emp", titulo:"Acertos e violações por mês", svg:grafEmpilhado(J, {W:900, H:320})},
      {id:"halt", titulo:"Taxa de acerto por atendente — antes × depois", svg:grafHaltere(J, Lt, {W:900})},
      {id:"calor", titulo:"Mapa de calor — atendente × mês", svg:grafCalor(J, Lt, {cw:74})}
    ].filter(g => ehSvg(g.svg));
  }
  async function rasterizarGraficos(J){
    const lista = graficosExport(J);
    for(const g of lista) Object.assign(g, await svgParaPng(g.svg, 2));
    return lista;
  }
  const subExport = J => `${D.cfg.antes_rot} × ${D.cfg.depois_rot} · entrada em ${fData(D.cfg.entrada)} · antes ${mesRot(J.antes[0])}–${mesRot(J.antes[J.antes.length - 1])}, depois ${mesRot(J.depois[0])}–${mesRot(J.depois[J.depois.length - 1])}`;
  const RODAPE = "Comparação SacFlow — Relatório de SLA. Taxa de acerto = acertos ÷ eventos (TPR + TRS + TR); taxas dos períodos somam as contagens dos meses. Mês parcial: taxas valem, volumes ficam menores.";
  const semDados = J => { if(J.cols.some(c => mesDados(c.k))) return false; alert("Ainda não há dados nos meses desta comparação. Importe ou digite o relatório de SLA de pelo menos um mês."); return true; };
  const nomeArq = ext => `Comparacao_SacFlow_${(typeof dataParaArquivo === "function") ? dataParaArquivo() : new Date().toISOString().slice(0, 10)}.${ext}`;

  // aba "Dashboard" do Excel: faixa de título, quadro de indicadores colorido e os gráficos como imagens
  function montarDashboardExcel(wb, J, imgs){
    const ws = wb.addWorksheet("Dashboard", {views:[{showGridLines:false}]});
    const NC = 12, VERDE = "FF2F8A2A", VERM = "FFB3261E", CINZA = "FF667360", FONT = "Arial";
    for(let i = 1; i <= NC; i++) ws.getColumn(i).width = 15;
    const faixa = (r, txt, tam, cor, fundo, alt) => {
      const row = ws.getRow(r); row.height = alt;
      const c = row.getCell(1); c.value = txt;
      c.font = {name:FONT, size:tam, bold:true, color:{argb:cor}}; c.alignment = {vertical:"middle", horizontal:"left", indent:1};
      for(let i = 1; i <= NC; i++) row.getCell(i).fill = {type:"pattern", pattern:"solid", fgColor:{argb:fundo}};
      ws.mergeCells(r, 1, r, NC);
    };
    faixa(1, "SacFlow — Comparação antes × depois", 16, "FFFFFFFF", "FF141A14", 30);
    faixa(2, subExport(J), 9.5, "FFCFE9BD", "FF141A14", 20);
    ws.getRow(3).height = 8;
    // quadro de indicadores
    const cab = ws.getRow(4); cab.height = 22;
    [["Indicador", 1, 4], ["Antes", 5, 6], ["Depois", 7, 8], ["Variação", 9, 10], ["Leitura", 11, 12]].forEach(([t, a, b]) => {
      const c = cab.getCell(a); c.value = t; c.font = {name:FONT, size:10, bold:true, color:{argb:"FFFFFFFF"}}; c.alignment = {vertical:"middle", horizontal:a === 1 ? "left" : "center", indent:a === 1 ? 1 : 0};
      for(let i = a; i <= b; i++) cab.getCell(i).fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF2B3A2B"}};
      if(b > a) ws.mergeCells(4, a, 4, b);
    });
    let r = 5;
    metricas(J).filter(m => !m.opcional || m.a != null || m.d != null).forEach((m, i) => {
      const c = comparar(m.a, m.d, m.tipo, m.melhor), x = xlNum(m), row = ws.getRow(r); row.height = 21;
      const zebra = i % 2 ? "FFF6F8F4" : "FFFFFFFF";
      const leit = c.delta == null ? "sem dados" : (m.melhor === "neutro" ? "volume" : (c.cls === "bom" ? "melhorou" : (c.cls === "ruim" ? "piorou" : "estável")));
      const cor = c.cls === "bom" ? VERDE : (c.cls === "ruim" ? VERM : CINZA);
      const put = (col, val, o) => {
        const ce = row.getCell(col); ce.value = val; if(o.f) ce.numFmt = o.f;
        ce.font = {name:FONT, size:10.5, bold:!!o.b, color:{argb:o.cor || "FF1C2333"}}; ce.alignment = {vertical:"middle", horizontal:o.h || "center", indent:o.h === "left" ? 1 : 0};
      };
      put(1, m.nome, {h:"left", b:true});
      put(5, m.a == null ? "—" : x.conv(m.a), {f:x.f});
      put(7, m.d == null ? "—" : x.conv(m.d), {f:x.f, b:true});
      put(9, c.delta == null ? "—" : (m.tipo === "pct" ? c.delta / 100 : (m.a ? c.delta / Math.abs(m.a) : "novo")), {f:m.tipo === "pct" ? "+0.00%;-0.00%;0.00%" : "+0.0%;-0.0%;0.0%", b:true, cor});
      put(11, (c.seta ? c.seta + " " : "") + leit, {b:true, cor});
      for(let k = 1; k <= NC; k++) { const ce = row.getCell(k); ce.fill = {type:"pattern", pattern:"solid", fgColor:{argb:zebra}}; ce.border = {bottom:{style:"thin", color:{argb:"FFE3E8DF"}}}; }
      [[1, 4], [5, 6], [7, 8], [9, 10], [11, 12]].forEach(([a, b]) => ws.mergeCells(r, a, r, b));
      r++;
    });
    r++;
    // gráficos: duas colunas (6 colunas de 15 ≈ 640 px cada)
    const PX = 640;
    let col = 0, topo = r, alt = 0;
    imgs.filter(im => !/^p_/.test(im.id)).forEach(im => {
      const larg = im.w > 700 ? 2 : 1;                    // gráficos largos ocupam a linha inteira
      if(larg === 2 && col !== 0){ topo += alt; col = 0; alt = 0; }
      if(col === 1 && larg === 1 && false) return;
      const wpx = larg === 2 ? PX * 2 - 8 : PX - 8, hpx = Math.round(im.h * wpx / im.w);
      const t = ws.getRow(topo).getCell(1);
      if(col === 0){ ws.getRow(topo).height = 20; }
      const celT = ws.getRow(topo).getCell(col * 6 + 1);
      celT.value = im.titulo; celT.font = {name:FONT, size:11, bold:true, color:{argb:"FF141A14"}};
      const id = wb.addImage({base64:im.png, extension:"png"});
      ws.addImage(id, {tl:{col:col * 6, row:topo}, ext:{width:wpx, height:hpx}});
      const linhas = Math.ceil(hpx / 20) + 2;
      alt = Math.max(alt, linhas);
      if(larg === 2 || col === 1){ topo += alt; col = 0; alt = 0; } else col = 1;
    });
    if(col === 1) topo += alt;
    const nota = ws.getRow(topo + 1).getCell(1);
    nota.value = RODAPE + " Exportado em " + new Date().toLocaleString("pt-BR") + " — Painel de Controle";
    nota.font = {name:FONT, size:9, italic:true, color:{argb:"FF6B7286"}}; nota.alignment = {wrapText:true, vertical:"top"};
    ws.mergeCells(topo + 1, 1, topo + 1, NC); ws.getRow(topo + 1).height = 28;
    ws.pageSetup = {orientation:"portrait", fitToPage:true, fitToWidth:1, fitToHeight:0};
  }


  // aba "Impressão": uma página A4 em pé, fundo branco, letra grande, resultado em PALAVRAS (serve em impressão preto e branco)
  function montarImpressaoExcel(wb, J, imgs){
    const ws = wb.addWorksheet("Impressão", {views:[{showGridLines:false}], properties:{tabColor:{argb:"FF2F8A2A"}}});
    const NC = 8, FONT = "Arial", M = metricas(J), get = id => M.find(m => m.id === id);
    for(let i = 1; i <= NC; i++) ws.getColumn(i).width = 12.6;
    const borda = (st, cor) => ({style:st, color:{argb:cor || "FF141A14"}});
    const mescla = (r, a, b) => { if(b > a) ws.mergeCells(r, a, r, b); };
    // título
    let r = 1;
    const t1 = ws.getRow(r); t1.height = 32; t1.getCell(1).value = "SacFlow — Comparação antes × depois";
    t1.getCell(1).font = {name:FONT, size:20, bold:true, color:{argb:"FF141A14"}}; t1.getCell(1).alignment = {vertical:"middle"}; mescla(r, 1, NC);
    for(let i = 1; i <= NC; i++) t1.getCell(i).border = {bottom:borda("thick")};
    r++; const t2 = ws.getRow(r); t2.height = 30; t2.getCell(1).value = subExport(J);
    t2.getCell(1).font = {name:FONT, size:9.5, color:{argb:"FF4B5563"}}; t2.getCell(1).alignment = {vertical:"middle", wrapText:true}; mescla(r, 1, NC);
    r++; ws.getRow(r).height = 8; r++;
    // 4 indicadores grandes
    const KP = [["geral", "TAXA DE ACERTO (SLA)"], ["ativos", "ATENDENTES NA EQUIPE"], ["evAtDia", "EVENTOS / ATEND. / DIA"], ["violAtDia", "VIOLAÇÕES / ATEND. / DIA"]];
    const base = r;
    [18, 36, 26, 18].forEach((h, i) => { ws.getRow(base + i).height = h; });
    KP.forEach(([id, rot], i) => {
      const m = get(id), c = comparar(m.a, m.d, m.tipo, m.melhor), a = 1 + i * 2, b = a + 1;
      const bom = c.cls === "bom", ruim = c.cls === "ruim", cor = bom ? "FF1E7D3C" : (ruim ? "FFB3261E" : "FF4B5563"), fundo = bom ? "FFE6F4EA" : (ruim ? "FFFDECEA" : "FFF2F3F1");
      const status = c.delta == null ? "SEM DADOS" : (id === "ativos" ? (c.delta < 0 ? "EQUIPE MENOR" : (c.delta > 0 ? "EQUIPE MAIOR" : "IGUAL")) : (bom ? "MELHOROU" : (ruim ? "PIOROU" : "ESTÁVEL")));
      const vals = [[rot, 8.5, "FF4B5563"], [(m.a == null ? "—" : m.fmt(m.a)) + "  →  " + (m.d == null ? "—" : m.fmt(m.d)), 15, "FF141A14"], [c.delta == null ? "—" : ((c.seta ? c.seta + " " : "") + c.txt), 16, cor], [status, 9.5, cor]];
      vals.forEach(([txt, sz, cl], k) => {
        const row = ws.getRow(base + k), ce = row.getCell(a); ce.value = txt;
        ce.font = {name:FONT, size:sz, bold:true, color:{argb:cl}}; ce.alignment = {vertical:"middle", horizontal:"center", wrapText:true};
        for(let q = a; q <= b; q++){
          const x = row.getCell(q); x.fill = {type:"pattern", pattern:"solid", fgColor:{argb:fundo}};
          x.border = {left:q === a ? borda("medium") : undefined, right:q === b ? borda("medium") : undefined, top:k === 0 ? borda("medium") : undefined, bottom:k === 3 ? borda("medium") : undefined};
        }
        mescla(base + k, a, b);
      });
    });
    r = base + 4; ws.getRow(r).height = 10; r++;
    // tabela de todos os indicadores
    const cab = ws.getRow(r); cab.height = 22;
    [["INDICADOR", 1, 3], ["ANTES", 4, 4], ["DEPOIS", 5, 5], ["VARIAÇÃO", 6, 6], ["RESULTADO", 7, 8]].forEach(([t, a, b]) => {
      const ce = cab.getCell(a); ce.value = t; ce.font = {name:FONT, size:10, bold:true, color:{argb:"FF141A14"}}; ce.alignment = {vertical:"middle", horizontal:a === 1 ? "left" : "center", indent:a === 1 ? 1 : 0};
      for(let q = a; q <= b; q++) cab.getCell(q).border = {top:borda("medium"), bottom:borda("medium")};
      cab.getCell(a).fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FFE5E7E3"}};
      for(let q = a; q <= b; q++) cab.getCell(q).fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FFE5E7E3"}};
      mescla(r, a, b);
    });
    r++;
    M.filter(m => !m.opcional || m.a != null || m.d != null).forEach((m, i) => {
      const c = comparar(m.a, m.d, m.tipo, m.melhor), x = xlNum(m), row = ws.getRow(r); row.height = 20;
      const bom = c.cls === "bom", ruim = c.cls === "ruim", cor = bom ? "FF1E7D3C" : (ruim ? "FFB3261E" : "FF4B5563");
      const res = c.delta == null ? "sem dados" : (m.melhor === "neutro" ? "volume" : (bom ? "MELHOROU" : (ruim ? "PIOROU" : "estável")));
      const put = (col, val, o) => { const ce = row.getCell(col); ce.value = val; if(o.f) ce.numFmt = o.f; ce.font = {name:FONT, size:10.5, bold:!!o.b, color:{argb:o.cor || "FF141A14"}}; ce.alignment = {vertical:"middle", horizontal:o.h || "center", indent:o.h === "left" ? 1 : 0}; };
      put(1, m.nome, {h:"left"}); put(4, m.a == null ? "—" : x.conv(m.a), {f:x.f}); put(5, m.d == null ? "—" : x.conv(m.d), {f:x.f, b:true});
      put(6, c.delta == null ? "—" : (m.tipo === "pct" ? c.delta / 100 : (m.a ? c.delta / Math.abs(m.a) : "novo")), {f:m.tipo === "pct" ? "+0.00%;-0.00%;0.00%" : "+0.0%;-0.0%;0.0%", b:true, cor});
      put(7, (c.seta ? c.seta + " " : "") + res, {b:true, cor});
      for(let q = 1; q <= NC; q++) row.getCell(q).border = {bottom:borda("thin", "FFB5BDB0")};
      if(i % 2) for(let q = 1; q <= NC; q++) row.getCell(q).fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FFF6F8F4"}};
      mescla(r, 1, 3); mescla(r, 7, 8); r++;
    });
    r++;
    // leitura
    const lh = ws.getRow(r); lh.height = 20; lh.getCell(1).value = "LEITURA";
    lh.getCell(1).font = {name:FONT, size:10, bold:true, color:{argb:"FF141A14"}}; for(let q = 1; q <= NC; q++) lh.getCell(q).border = {bottom:borda("medium")}; mescla(r, 1, NC); r++;
    leituras(J, M).forEach(tx => {
      const row = ws.getRow(r); row.height = tx.length > 105 ? 30 : 18; row.getCell(1).value = "•  " + tx;
      row.getCell(1).font = {name:FONT, size:10.5, color:{argb:"FF141A14"}}; row.getCell(1).alignment = {vertical:"middle", wrapText:true, indent:1}; mescla(r, 1, NC); r++;
    });
    r++;
    // gráficos (largura total ≈ 8 colunas)
    const PX = 735;
    ["p_linha", "p_eqp"].forEach(id => {
      const im = imgs.find(x => x.id === id); if(!im) return;
      const hpx = Math.round(im.h * PX / im.w), rt = ws.getRow(r); rt.height = 18; rt.getCell(1).value = im.titulo.toUpperCase();
      rt.getCell(1).font = {name:FONT, size:10, bold:true, color:{argb:"FF141A14"}}; mescla(r, 1, NC);
      ws.addImage(wb.addImage({base64:im.png, extension:"png"}), {tl:{col:0, row:r}, ext:{width:PX, height:hpx}});
      r += Math.ceil(hpx / 20) + 2;
    });
    const nt = ws.getRow(r); nt.getCell(1).value = RODAPE; nt.height = 36;
    nt.getCell(1).font = {name:FONT, size:8, italic:true, color:{argb:"FF6B7286"}}; nt.getCell(1).alignment = {wrapText:true, vertical:"top"}; mescla(r, 1, NC);
    ws.pageSetup = {paperSize:9, orientation:"portrait", fitToPage:true, fitToWidth:1, fitToHeight:1, horizontalCentered:true, margins:{left:0.35, right:0.35, top:0.4, bottom:0.4, header:0.2, footer:0.2}, printArea:"A1:H" + r};
  }

  async function exportar(){
    const J = janela(); if(semDados(J)) return;
    const b = document.getElementById("sfcExportar"), rot = b ? b.textContent : "";
    if(b){ b.disabled = true; b.textContent = "Gerando Excel…"; }
    const area = document.createElement("div");
    area.className = "cs-export-area";
    area.innerHTML = `<div>${tabelaResumoExport(J)}${tabelaMeses(J, "sfcTabMesesX")}${tabelaAtendentes(J, "sfcTabAtendX")}${tabelaAtendMes(J, "sfcTabAtMesX")}${tabelaProdutividade(J, "sfcTabProdX")}</div>`;
    document.body.appendChild(area);
    try{
      if(typeof exportarTabelasExcel !== "function"){ alert("Exportador de Excel indisponível."); return; }
      let imgs = [];
      try{ imgs = await rasterizarGraficos(J); }catch(e){ console.warn("Gráficos fora do Excel:", e); }
      const sub = subExport(J), q = s => area.querySelector(s);
      await exportarTabelasExcel([
        {nome:"Resumo", titulo:"SacFlow — comparação antes x depois", subtitulo:sub, tabela:q("#sfcTabResumo"), rodape:RODAPE},
        {nome:"SLA por mês", titulo:"SacFlow — SLA mês a mês", subtitulo:sub, tabela:q("#sfcTabMesesX"), rodape:RODAPE},
        {nome:"Por atendente", titulo:"SacFlow — atendente a atendente", subtitulo:sub, tabela:q("#sfcTabAtendX"), rodape:RODAPE},
        {nome:"Equipe e produtividade", titulo:"SacFlow — equipe e produtividade por mês", subtitulo:sub, tabela:q("#sfcTabProdX"), rodape:RODAPE + " Produtividade por atendente-dia = volume ÷ (atendentes × dias do relatório)."},
        {nome:"Atendente por mês", titulo:"SacFlow — taxa de acerto de cada atendente, mês a mês", subtitulo:sub, tabela:q("#sfcTabAtMesX"), rodape:RODAPE}
      ], nomeArq("xlsx"), {antes: wb => { montarImpressaoExcel(wb, J, imgs); montarDashboardExcel(wb, J, imgs); }});
    } finally { area.remove(); if(b){ b.disabled = false; b.textContent = rot; } }
  }

  async function exportarPdf(){
    const J = janela(); if(semDados(J)) return;
    const lib = window.jspdf && window.jspdf.jsPDF;
    if(!lib){ alert("Não consegui carregar a biblioteca de PDF (jsPDF). Verifique a internet e recarregue a página."); return; }
    const b = document.getElementById("sfcExportarPdf"), rot = b ? b.textContent : "";
    if(b){ b.disabled = true; b.textContent = "Gerando PDF…"; }
    try{
      const imgs = await rasterizarGraficos(J), im = id => imgs.find(x => x.id === id);
      const doc = new lib({orientation:"landscape", unit:"mm", format:"a4", compress:true}), PW = 297, PH = 210, mg = 10;
      const topo = (tit) => {
        doc.setFillColor(20, 26, 20); doc.rect(0, 0, PW, 20, "F");
        doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(tit, mg, 10);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(207, 233, 189); doc.text(subExport(J), mg, 16);
      };
      const rodape = n => { doc.setFontSize(7.5); doc.setTextColor(107, 114, 134); doc.text(doc.splitTextToSize(RODAPE, PW - 2 * mg - 20), mg, PH - 6); doc.text("pág. " + n, PW - mg, PH - 6, {align:"right"}); };
      const caber = (g, x, y, w, h) => { if(!g) return 0; const k = Math.min(w / g.w, h / g.h), ww = g.w * k, hh = g.h * k; doc.addImage(g.jpg || g.png, g.jpg ? "JPEG" : "PNG", x + (w - ww) / 2, y, ww, hh, undefined, "FAST"); return hh; };
      const tit = (t, x, y) => { doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(20, 26, 20); doc.text(t, x, y); };
      let pg = 1;
      // página 1: indicadores + anéis + por tipo
      topo("SacFlow — Comparação antes × depois");
      const M = metricas(J).filter(m => !m.opcional || m.a != null || m.d != null);
      const corpo = M.map(m => { const c = comparar(m.a, m.d, m.tipo, m.melhor); return [m.nome, m.a == null ? "—" : m.fmt(m.a), m.d == null ? "—" : m.fmt(m.d), c.delta == null ? "—" : c.txt.replace("−", "-"), c.delta == null ? "sem dados" : (m.melhor === "neutro" ? "volume" : (c.cls === "bom" ? "melhorou" : (c.cls === "ruim" ? "piorou" : "estável")))]; });
      if(typeof doc.autoTable === "function"){
        doc.autoTable({startY:25, margin:{left:mg, right:PW / 2 + 4}, head:[["Indicador", "Antes", "Depois", "Variação", "Leitura"]], body:corpo, theme:"grid",
          styles:{fontSize:7.5, cellPadding:1.4, lineColor:[227, 232, 223]}, headStyles:{fillColor:[43, 58, 43], textColor:255, fontSize:7.5},
          columnStyles:{1:{halign:"right"}, 2:{halign:"right"}, 3:{halign:"right", fontStyle:"bold"}, 4:{halign:"center"}},
          didParseCell:d => { if(d.section === "body" && d.column.index >= 3){ const t = String(d.cell.text[0] || ""); if(/melhorou/.test(corpo[d.row.index][4])) d.cell.styles.textColor = [47, 138, 42]; else if(/piorou/.test(corpo[d.row.index][4])) d.cell.styles.textColor = [179, 38, 30]; } }});
      }
      const xd = PW / 2 + 8, wd = PW / 2 - mg - 8;
      tit("Cumprimento geral — antes × depois", xd, 28); const h1 = caber(im("aneis"), xd, 31, wd, 62);
      tit("Por tipo de SLA — antes × depois", xd, 31 + h1 + 8); caber(im("tipos"), xd, 34 + h1 + 8, wd, 90);
      rodape(pg);
      // página 2: equipe e produtividade
      if(im("eqp")){
        doc.addPage(); pg++; topo("Equipe e produtividade");
        tit("Equipe × produtividade (eventos de SLA por atendente por dia)", mg, 27); const he = caber(im("eqp"), mg, 30, (PW - 3 * mg) / 2, 90);
        tit("Equipe × performance (taxa de acerto)", PW / 2 + 2, 27); caber(im("eqt"), PW / 2 + 2, 30, (PW - 3 * mg) / 2, 90);
        if(typeof doc.autoTable === "function"){
          const pm = metricas(J).filter(m => m.prod), cp = pm.map(m => { const c = comparar(m.a, m.d, m.tipo, m.melhor); return [m.nome, m.a == null ? "—" : m.fmt(m.a), m.d == null ? "—" : m.fmt(m.d), c.delta == null ? "—" : c.txt.replace("−", "-")]; });
          doc.autoTable({startY:30 + he + 8, margin:{left:mg, right:mg}, head:[["Indicador", "Antes", "Depois", "Variação"]], body:cp, theme:"grid", styles:{fontSize:8.5, cellPadding:1.6, lineColor:[227, 232, 223]}, headStyles:{fillColor:[43, 58, 43], textColor:255}, columnStyles:{1:{halign:"right"}, 2:{halign:"right"}, 3:{halign:"right", fontStyle:"bold"}}});
        }
        rodape(pg);
      }
      // página: evolução mensal
      doc.addPage(); pg++; topo("Evolução mês a mês");
      tit("Cumprimento do SLA por mês", mg, 27); const h2 = caber(im("linha"), mg, 30, PW - 2 * mg, 86);
      tit("Acertos e violações por mês", mg, 30 + h2 + 7); caber(im("emp"), mg, 33 + h2 + 7, PW - 2 * mg, 84);
      rodape(pg);
      // páginas 3+: atendentes
      if(im("halt")){ doc.addPage(); pg++; topo("Atendentes — antes × depois"); tit("Taxa de acerto por atendente", mg, 27); caber(im("halt"), mg, 30, PW - 2 * mg, PH - 44); rodape(pg); }
      if(im("calor")){ doc.addPage(); pg++; topo("Atendentes — mês a mês"); tit("Mapa de calor: taxa de acerto de cada atendente por mês", mg, 27); caber(im("calor"), mg, 30, PW - 2 * mg, PH - 44); rodape(pg); }
      doc.save(nomeArq("pdf"));
    }catch(err){
      console.error(err); alert("Não foi possível gerar o PDF: " + (err.message || err));
    }finally{ if(b){ b.disabled = false; b.textContent = rot; } }
  }

  /* ---------------- API ---------------- */
  window.sacflowComparacaoHTML = comparacaoHTML;
  window.attachSacflowComparacao = function(){
    const b = document.getElementById("sfcExportar");
    if(b) b.onclick = exportar;
    const p = document.getElementById("sfcExportarPdf");
    if(p) p.onclick = exportarPdf;
    renderizar();
  };
  window.sacflowComparacaoRefresh = function(){ D = carregar(); renderizar(); };
  // para testes
  window.__sfc = {lerLinhaOCR, consolidarOCR, lerNomesOCR, lerRelatorio, periodoDoNome, metricas: () => metricas(janela()), janela, estado: () => D};
})();

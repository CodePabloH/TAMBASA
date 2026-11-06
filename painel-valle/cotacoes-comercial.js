/* =====================================================================
   COMERCIAL · COTAÇÕES — BI da equipe comercial (Rede Do Valle)  v2
   Alimentado pelo relatório de cotações do SSW (.sswweb / .csv, separado por ";").

   • Filtros com MULTI-SELEÇÃO: usuário, equipe, unidade, situação, tipo de frete + período.
   • Produtividade (cotações, cotações por dia), valor cotado (PROPOSTA ATUAL),
     valor emitido (FRETE CTRC) e conversão pela SITUACAO:
         CTRC EMI          = CONVERTIDA (já tem CTRC emitido cobrando o frete)
         COTADO / COT FIXO = NÃO CONVERTIDA (ainda, ou não)
         demais (CANCELAD, COT CLI, CONTRAT…) = "outras": ficam fora da taxa de conversão
         (a caixa "incluir outras na base" muda isso).
   • Clique num usuário (tabela, bolha ou barra) e abre a FICHA COMPLETA dele.
   • Reimportar o arquivo ATUALIZA as cotações pelo número (COTADO → CTRC EMI em tempo real).
   Dados ficam no navegador (localStorage). Aba independente das demais.
   ===================================================================== */
(function(){
  "use strict";

  const KEY = "valle_comercial_cotacoes_v1";
  const EQUIPES = ["mtz", "filial", "outros"];
  const EQ_NOME = {mtz:"MTZ", filial:"Filiais", outros:"Outros"};
  const EQ_LONGO = {mtz:"Time MTZ", filial:"Filiais", outros:"Outros usuários"};
  const EQ_COR  = {mtz:"#2f78b8", filial:"#4f9d2d", outros:"#8a9585"};
  const PADRAO_EQ = {mtz:["chrishyn", "gabilima", "stephane", "jucieli"], filial:["karlareg", "jenniffe", "izadora"]};
  const COR_SIT = {"CTRC EMI":"#4f9d2d", "COTADO":"#2f78b8", "COT FIXO":"#d99a1c", "CANCELAD":"#cf3d35", "COT CLI":"#8a9585", "CONTRAT":"#7a5ab0"};
  const COR_EXTRA = ["#8a9585", "#7a5ab0", "#2a9d8f", "#b5651d"];
  const VERDE = "#4f9d2d", AZUL = "#2f78b8", AMBAR = "#d99a1c", CINZA = "#b8c0b3";
  const SIS = ["VAL", "RVA"];
  const SIS_NOME = {VAL:"Rede Do Valle", RVA:"Real Vale"};
  const SIS_COR = {VAL:"#2f78b8", RVA:"#c7811a"};
  const sisDe = x => x.sy || "VAL";
  const DIAS_SEM = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  /* ---------------- utilidades ---------------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const semAcento = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const normCab = s => semAcento(s).toUpperCase().replace(/\s+/g, " ").trim();
  const brl = v => (v || 0).toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
  const brlK = v => {
    v = v || 0;
    if(Math.abs(v) >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", {maximumFractionDigits:2}) + " mi";
    if(Math.abs(v) >= 1e4) return "R$ " + (v / 1e3).toLocaleString("pt-BR", {maximumFractionDigits:1}) + " mil";
    return brl(v);
  };
  const int = v => (v || 0).toLocaleString("pt-BR");
  const dec1 = v => v == null ? "—" : v.toLocaleString("pt-BR", {minimumFractionDigits:1, maximumFractionDigits:1});
  const pct = (a, b) => b > 0 ? (a / b * 100) : null;
  const fPct = v => v == null ? "—" : dec1(v) + "%";
  const lerNum = t => {
    const s = String(t == null ? "" : t).replace(/[^\d,.\-]/g, "").replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };
  const fData = iso => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "";
  const fDia = iso => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) : "";
  const dataOk = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "") && +v.slice(0, 4) >= 2000;
  const diasEntre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 864e5);
  const somaDias = (iso, n) => { const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10) + n)); return d.toISOString().slice(0, 10); };
  const ufDe = t => { const m = String(t || "").match(/\/\s*([A-Za-z]{2})\s*$/); return m ? m[1].toUpperCase() : ""; };
  const sortAlpha = (a, b) => String(a).localeCompare(String(b), "pt-BR");

  function decodificar(buf){
    try{ return new TextDecoder("utf-8", {fatal:true}).decode(buf); }
    catch(e){ return new TextDecoder("windows-1252").decode(buf); }
  }

  /* ---------------- armazenamento ---------------- */
  function padrao(){ return {rows:{}, equipes:{mtz:PADRAO_EQ.mtz.slice(), filial:PADRAO_EQ.filial.slice()}, imports:[]}; }
  function carregar(){
    try{
      const o = JSON.parse(LS.getItem(KEY) || "null");
      if(o && o.rows){
        const p = padrao();
        const rows = {};
        // versão anterior não separava sistemas: tudo que já estava salvo é VAL
        Object.keys(o.rows).forEach(k => { const x = o.rows[k]; if(!x.sy) x.sy = "VAL"; rows[x.sy + ":" + x.id] = x; });
        return {rows, equipes:Object.assign(p.equipes, o.equipes || {}), imports:o.imports || []};
      }
    }catch(e){ /* ignora */ }
    return padrao();
  }
  let D = carregar();
  function gravar(){
    try{ LS.setItem(KEY, JSON.stringify(D)); return true; }
    catch(e){ alert("Não consegui salvar no navegador (espaço cheio?)."); return false; }
  }

  /* estado de tela (não persiste) */
  const MS = ["usuarios", "equipes", "sis", "unidades", "sits", "tf"];
  const F = {de:"", ate:"", leitura:"todas", base:false, busca:"", metrica:"n", topModo:"geral", sel:{}};
  MS.forEach(k => F.sel[k] = new Set());
  const S = {ordem:"n", dir:-1};
  let msg = "";
  let perfilAberto = null;

  /* ---------------- leitura do arquivo ---------------- */
  function splitCSV(texto){
    const linhas = [];
    let cur = [], campo = "", asp = false;
    for(let i = 0; i < texto.length; i++){
      const c = texto[i];
      if(asp){
        if(c === '"'){ if(texto[i + 1] === '"'){ campo += '"'; i++; } else asp = false; }
        else campo += c;
      }else if(c === '"'){ asp = true; }
      else if(c === ";"){ cur.push(campo); campo = ""; }
      else if(c === "\n" || c === "\r"){
        if(c === "\r" && texto[i + 1] === "\n") i++;
        cur.push(campo); campo = "";
        if(cur.length > 1 || cur[0] !== "") linhas.push(cur);
        cur = [];
      }else campo += c;
    }
    cur.push(campo);
    if(cur.length > 1 || cur[0] !== "") linhas.push(cur);
    return linhas;
  }

  const COLS = {
    id:"COTACAO", unid:"UNIDADE INCLUSAO", user:"USUARIO INCLUSAO", pagador:"NOME PAGADOR",
    vend:"VENDEDOR", orig:"ORIGEM", dest:"DESTINO", nf:"VALOR NF", peso:"PESO", tf:"TIPO FRETE",
    ini:"PROPOSTA INICIAL", atual:"PROPOSTA ATUAL", dh:"DATA HORA INCLUSAO",
    sit:"SITUACAO", ctrc:"CTRC", emi:"DATA EMISSAO CTRC", fctrc:"FRETE CTRC"
  };
  const OBRIG = ["id", "user", "atual", "dh", "sit"];

  function dataBR(t){
    const m = String(t || "").match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}:\d{2}))?/);
    return m ? {d:`${m[3]}-${m[2]}-${m[1]}`, h:m[4] || ""} : {d:"", h:""};
  }

  function interpretar(texto){
    const linhas = splitCSV(texto);
    if(!linhas.length) return {erro:"Arquivo vazio."};
    const cab = linhas[0].map(normCab);
    const idx = {};
    Object.keys(COLS).forEach(k => { idx[k] = cab.indexOf(COLS[k]); });
    const falta = OBRIG.filter(k => idx[k] < 0).map(k => COLS[k]);
    if(falta.length) return {erro:"Não parece o relatório de cotações do SSW. Colunas não encontradas: " + falta.join(", ") + "."};
    const g = (r, k) => idx[k] < 0 ? "" : String(r[idx[k]] == null ? "" : r[idx[k]]).trim();
    const out = [];
    let ignoradas = 0;
    for(let i = 1; i < linhas.length; i++){
      const r = linhas[i];
      const id = g(r, "id").replace(/\D/g, "");
      if(!id){ ignoradas++; continue; }
      const dh = dataBR(g(r, "dh")), em = dataBR(g(r, "emi"));
      out.push({
        id, un:g(r, "unid").toUpperCase(), us:g(r, "user").toLowerCase(), pg:g(r, "pagador"), vd:g(r, "vend"),
        or:g(r, "orig"), de:g(r, "dest"), nf:lerNum(g(r, "nf")), ps:lerNum(g(r, "peso")), tf:g(r, "tf").toUpperCase(),
        pi:lerNum(g(r, "ini")), pa:lerNum(g(r, "atual")), dt:dh.d, hr:dh.h, st:g(r, "sit").toUpperCase(),
        ct:g(r, "ctrc"), em:em.d, fc:lerNum(g(r, "fctrc"))
      });
    }
    return {rows:out, ignoradas};
  }

  function importarTexto(texto, nome, sis){
    sis = sis || "VAL";
    const r = interpretar(texto);
    if(r.erro){ msg = {ok:false, t:r.erro}; return false; }
    if(!r.rows.length){ msg = {ok:false, t:"Nenhuma cotação encontrada no arquivo."}; return false; }
    let novos = 0, atualizados = 0, viraram = 0;
    r.rows.forEach(x => {
      x.sy = sis;
      const chave = sis + ":" + x.id;
      const ant = D.rows[chave];
      if(!ant) novos++;
      else{
        if(JSON.stringify(ant) !== JSON.stringify(x)) atualizados++;
        if(ant.st !== x.st && x.st === "CTRC EMI") viraram++;
      }
      D.rows[chave] = x;
    });
    D.imports.unshift({sis, nome:nome || "texto colado", em:new Date().toISOString(), n:r.rows.length, novos, atualizados, viraram});
    D.imports = D.imports.slice(0, 30);
    if(!gravar()) return false;
    msg = {ok:true, t:`[${sis}] ${nome || "Texto"}: ${int(r.rows.length)} cotações lidas — ${int(novos)} novas, ${int(atualizados)} atualizadas`
      + (viraram ? `, ${int(viraram)} que viraram CTRC EMI (convertidas)` : "") + (r.ignoradas ? `, ${r.ignoradas} linhas ignoradas` : "") + "."};
    return true;
  }

  /* ---------------- classificação ---------------- */
  const classe = st => st === "CTRC EMI" ? "conv" : (st === "COTADO" || st === "COT FIXO") ? "aberta" : "outra";
  const LEITURA_ROT = {conv:"Convertida", aberta:"Não convertida", outra:"Outra"};
  function equipeDe(us){
    if(D.equipes.mtz.indexOf(us) >= 0) return "mtz";
    if(D.equipes.filial.indexOf(us) >= 0) return "filial";
    return "outros";
  }
  function corSit(st, i){ return COR_SIT[st] || COR_EXTRA[(i || 0) % COR_EXTRA.length]; }
  const ORDEM_SIT = ["CTRC EMI", "COTADO", "COT FIXO"];
  const ordemSit = st => { const i = ORDEM_SIT.indexOf(st); return i < 0 ? 99 : i; };
  const tfDe = x => x.tf || "—";

  /* ---------------- filtros e agregações ---------------- */
  function todas(){ return Object.keys(D.rows).map(k => D.rows[k]); }
  function passa(x, semUsuario){
    const s = F.sel;
    if(dataOk(F.de) && (!x.dt || x.dt < F.de)) return false;
    if(dataOk(F.ate) && (!x.dt || x.dt > F.ate)) return false;
    if(s.equipes.size && !s.equipes.has(equipeDe(x.us))) return false;
    if(!semUsuario && s.usuarios.size && !s.usuarios.has(x.us)) return false;
    if(s.sis.size && !s.sis.has(sisDe(x))) return false;
    if(s.unidades.size && !s.unidades.has(x.un)) return false;
    if(s.sits.size && !s.sits.has(x.st)) return false;
    if(s.tf.size && !s.tf.has(tfDe(x))) return false;
    if(F.leitura !== "todas" && classe(x.st) !== F.leitura) return false;
    return true;
  }
  const filtradas = semUsuario => todas().filter(x => passa(x, semUsuario));

  function zero(){ return {n:0, frete:0, conv:0, fConv:0, fEmit:0, aberta:0, fAberta:0, outra:0, fOutra:0, cotado:0, fixo:0, tc:0, ntc:0, dias:new Set()}; }
  function somar(a, x){
    const c = classe(x.st);
    a.n++; a.frete += x.pa; if(x.dt) a.dias.add(x.dt);
    if(c === "conv"){
      a.conv++; a.fConv += x.pa; a.fEmit += (x.fc > 0 ? x.fc : x.pa);
      if(x.em && x.dt){ a.tc += Math.max(0, diasEntre(x.dt, x.em)); a.ntc++; }
    }else if(c === "aberta"){ a.aberta++; a.fAberta += x.pa; if(x.st === "COTADO") a.cotado++; else a.fixo++; }
    else{ a.outra++; a.fOutra += x.pa; }
    return a;
  }
  const resumo = rows => rows.reduce(somar, zero());
  const baseQtd = a => F.base ? a.n : a.conv + a.aberta;
  const baseVal = a => F.base ? a.frete : a.fConv + a.fAberta;
  const taxaQtd = a => pct(a.conv, baseQtd(a));
  const taxaVal = a => pct(a.fConv, baseVal(a));
  const ticket = a => a.n ? a.frete / a.n : null;
  const porDiaAtivo = a => a.dias.size ? a.n / a.dias.size : null;
  const tempoConv = a => a.ntc ? a.tc / a.ntc : null;

  function agrupar(rows, chave){
    const m = {};
    rows.forEach(x => { const k = chave(x); if(k == null || k === "") return; m[k] = m[k] || Object.assign(zero(), {k}); somar(m[k], x); });
    return Object.keys(m).map(k => m[k]);
  }
  function usuariosAgr(rows){
    const lista = agrupar(rows, x => x.us);
    lista.forEach(u => { u.us = u.k; u.eq = equipeDe(u.k); });
    return lista;
  }
  function seriesDia(rows){
    const m = {};
    rows.forEach(x => { if(!x.dt) return; m[x.dt] = m[x.dt] || {d:x.dt, n:0, conv:0, frete:0, fConv:0}; const o = m[x.dt]; o.n++; o.frete += x.pa; if(x.st === "CTRC EMI"){ o.conv++; o.fConv += x.pa; } });
    return Object.keys(m).sort().map(k => m[k]);
  }
  // série contínua (dias sem cotação = 0) para sparklines
  function serieContinua(rows, campo){
    const dias = seriesDia(rows);
    if(!dias.length) return [];
    const m = {}; dias.forEach(d => m[d.d] = d);
    const out = []; let d = dias[0].d; const fim = dias[dias.length - 1].d, lim = 400;
    for(let i = 0; d <= fim && i < lim; i++){ out.push(m[d] ? m[d][campo] : 0); d = somaDias(d, 1); }
    return out;
  }

  /* ---------------- gráficos (SVG) ---------------- */
  function spark(vals, cor, w, h){
    w = w || 110; h = h || 28;
    if(!vals || vals.length < 2) return `<svg class="cq-spark" viewBox="0 0 ${w} ${h}"></svg>`;
    const max = Math.max.apply(null, vals) || 1, n = vals.length;
    const pts = vals.map((v, i) => `${(i / (n - 1) * (w - 2) + 1).toFixed(1)},${(h - 3 - v / max * (h - 6)).toFixed(1)}`);
    return `<svg class="cq-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polygon points="1,${h} ${pts.join(" ")} ${w - 1},${h}" fill="${cor}" opacity=".18"/><polyline points="${pts.join(" ")}" fill="none" stroke="${cor}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  function donut(itens, total, centro){
    const R = 62, r = 40, cx = 80, cy = 80;
    if(!total) return `<div class="cq-vazio">Sem dados no filtro.</div>`;
    let ang = -Math.PI / 2, arcos = "";
    itens.filter(i => i.v > 0).forEach(i => {
      const frac = i.v / total;
      if(frac >= 0.9999){ arcos += `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${i.cor}" stroke-width="${R - r}"><title>${esc(i.rot)}: ${int(i.v)}</title></circle>`; return; }
      const a2 = ang + frac * 2 * Math.PI, g = a2 - ang > Math.PI ? 1 : 0;
      const p = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
      arcos += `<path d="M ${p(R, ang)} A ${R} ${R} 0 ${g} 1 ${p(R, a2)} L ${p(r, a2)} A ${r} ${r} 0 ${g} 0 ${p(r, ang)} Z" fill="${i.cor}"><title>${esc(i.rot)}: ${int(i.v)}</title></path>`;
      ang = a2;
    });
    return `<svg class="cq-donut" viewBox="0 0 160 160" role="img" aria-label="Cotações por situação">${arcos}
      <text x="80" y="77" text-anchor="middle" class="cq-donut-n">${esc(centro.a)}</text>
      <text x="80" y="94" text-anchor="middle" class="cq-donut-l">${esc(centro.b)}</text></svg>`;
  }

  function graficoDias(rows, metrica){
    const dias = seriesDia(rows);
    if(!dias.length) return `<div class="cq-vazio">Sem dados no filtro.</div>`;
    const val = d => metrica === "frete" ? d.frete : d.n, vc = d => metrica === "frete" ? d.fConv : d.conv;
    const W = 900, Ht = 230, L = 52, B = 26, T = 16, R = 10;
    const max = Math.max.apply(null, dias.map(val)) || 1;
    const bw = (W - L - R) / dias.length, larg = Math.max(4, Math.min(38, bw * 0.72));
    const yv = v => T + (Ht - T - B) * (1 - v / max);
    const fmt = v => metrica === "frete" ? brlK(v).replace("R$ ", "") : int(Math.round(v));
    let s = "";
    [0, .5, 1].forEach(f => { const v = max * f, y = yv(v); s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="cq-grid"/><text x="${L - 6}" y="${y + 3}" text-anchor="end" class="cq-eixo">${fmt(v)}</text>`; });
    const passo = Math.ceil(dias.length / 18);
    dias.forEach((d, i) => {
      const x = L + bw * i + (bw - larg) / 2;
      const tip = `${fData(d.d)} — ${d.n} cotações (${brl(d.frete)}) · ${d.conv} convertidas (${brl(d.fConv)})`;
      s += `<rect x="${x.toFixed(1)}" y="${yv(val(d)).toFixed(1)}" width="${larg.toFixed(1)}" height="${Math.max(0, Ht - B - yv(val(d))).toFixed(1)}" fill="${CINZA}" rx="2"><title>${esc(tip)}</title></rect>`;
      if(vc(d) > 0) s += `<rect x="${x.toFixed(1)}" y="${yv(vc(d)).toFixed(1)}" width="${larg.toFixed(1)}" height="${Math.max(0, Ht - B - yv(vc(d))).toFixed(1)}" fill="${VERDE}" rx="2"><title>${esc(tip)}</title></rect>`;
      if(i % passo === 0) s += `<text x="${(x + larg / 2).toFixed(1)}" y="${Ht - 8}" text-anchor="middle" class="cq-eixo">${fDia(d.d)}</text>`;
    });
    return `<svg class="cq-dias" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Evolução diária">${s}</svg>
      <div class="cq-leg"><span><i style="background:${CINZA}"></i>${metrica === "frete" ? "Frete cotado" : "Cotações"} do dia</span><span><i style="background:${VERDE}"></i>Convertidas (CTRC EMI) — pela data da cotação</span></div>`;
  }

  function heatmap(rows){
    const g = Array.from({length:7}, () => Array(24).fill(0));
    let hmin = 24, hmax = -1, max = 0, com = 0;
    rows.forEach(x => {
      if(!x.dt || !x.hr) return;
      const h = parseInt(x.hr.slice(0, 2), 10); if(isNaN(h)) return;
      const dow = (new Date(x.dt + "T12:00:00").getDay() + 6) % 7;
      g[dow][h]++; com++;
      hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
    });
    if(!com) return `<div class="cq-vazio">Sem horário de inclusão nos dados.</div>`;
    hmin = Math.max(0, Math.min(hmin, 7)); hmax = Math.min(23, Math.max(hmax, 18));
    g.forEach(l => l.forEach(v => { if(v > max) max = v; }));
    let s = `<div class="cq-heat" style="grid-template-columns:34px repeat(${hmax - hmin + 1},1fr)"><span></span>`;
    for(let h = hmin; h <= hmax; h++) s += `<span class="cq-heat-h">${h}h</span>`;
    DIAS_SEM.forEach((nome, d) => {
      s += `<span class="cq-heat-d">${nome}</span>`;
      for(let h = hmin; h <= hmax; h++){
        const v = g[d][h], a = v ? (0.12 + 0.88 * v / max) : 0;
        s += `<span class="cq-heat-c" style="${v ? `background:rgba(79,157,45,${a.toFixed(2)});color:${a > .55 ? "#fff" : "#1b2319"}` : ""}" title="${nome} ${h}h: ${v} cotações">${v || ""}</span>`;
      }
    });
    return s + `</div><p class="cq-hint cq-hint-s">Quando as cotações são feitas (dia da semana × hora de inclusão).</p>`;
  }

  function bolhas(us){
    const lista = us.filter(u => u.n > 0 && taxaQtd(u) != null);
    if(lista.length < 1) return `<div class="cq-vazio">Sem usuários com base de conversão no filtro.</div>`;
    const W = 640, Ht = 330, L = 46, B = 38, T = 14, R = 24;
    const maxN = Math.max.apply(null, lista.map(u => u.n)) * 1.12 || 1;
    const maxY = Math.min(100, Math.max(20, Math.ceil(Math.max.apply(null, lista.map(u => taxaQtd(u))) * 1.2 / 10) * 10));
    const maxF = Math.max.apply(null, lista.map(u => u.frete)) || 1;
    const X = v => L + (W - L - R) * v / maxN, Y = v => T + (Ht - T - B) * (1 - v / maxY);
    const tot = lista.reduce((a, u) => { a.c += u.conv; a.b += baseQtd(u); return a; }, {c:0, b:0});
    const mediaY = pct(tot.c, tot.b);
    let s = "";
    for(let v = 0; v <= maxY; v += maxY / 4){ s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="cq-grid"/><text x="${L - 6}" y="${Y(v) + 3}" text-anchor="end" class="cq-eixo">${Math.round(v)}%</text>`; }
    for(let i = 0; i <= 4; i++){ const v = maxN * i / 4; s += `<text x="${X(v)}" y="${Ht - 20}" text-anchor="middle" class="cq-eixo">${Math.round(v)}</text>`; }
    s += `<text x="${(L + W - R) / 2}" y="${Ht - 4}" text-anchor="middle" class="cq-eixo cq-eixo-t">cotações (volume) →</text><text transform="translate(11 ${(T + Ht - B) / 2}) rotate(-90)" text-anchor="middle" class="cq-eixo cq-eixo-t">conversão % →</text>`;
    if(mediaY != null) s += `<line x1="${L}" x2="${W - R}" y1="${Y(mediaY)}" y2="${Y(mediaY)}" class="cq-media"/><text x="${W - R - 2}" y="${Y(mediaY) - 4}" text-anchor="end" class="cq-eixo cq-media-t">média ${fPct(mediaY)}</text>`;
    lista.sort((a, b) => b.frete - a.frete).forEach(u => {
      const r = 7 + 20 * Math.sqrt(u.frete / maxF), cx = X(u.n), cy = Y(taxaQtd(u));
      s += `<g class="cq-bub" data-cqus="${esc(u.us)}"><circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${EQ_COR[u.eq]}" fill-opacity=".72" stroke="#fff" stroke-width="1.5"><title>${esc(u.us)} — ${int(u.n)} cotações · conversão ${fPct(taxaQtd(u))} · frete ${brl(u.frete)}</title></circle>${u.n >= maxN / 1.12 * 0.05 ? `<text x="${cx.toFixed(1)}" y="${(cy - r - 4).toFixed(1)}" text-anchor="middle" class="cq-bub-l">${esc(u.us)}</text>` : ""}</g>`;
    });
    return `<svg class="cq-bubsvg" viewBox="0 0 ${W} ${Ht}" role="img" aria-label="Volume x conversão por usuário">${s}</svg>
      <div class="cq-leg">${EQUIPES.map(e => `<span><i style="background:${EQ_COR[e]}"></i>${EQ_NOME[e]}</span>`).join("")}<span>tamanho da bolha = frete cotado · clique para abrir a ficha</span></div>`;
  }

  function barraDupla(pctA, cor){
    return `<span class="cq-db"><i style="width:${Math.max(0, Math.min(100, pctA || 0)).toFixed(1)}%;background:${cor}"></i></span>`;
  }

  /* ---------------- blocos ---------------- */
  function kpi(tit, val, sub, vals, cor, cls){
    return `<div class="cq-kpi ${cls || ""}"><div class="cq-kpi-t">${tit}</div><div class="cq-kpi-v">${val}</div><div class="cq-kpi-s">${sub || "&nbsp;"}</div>${vals ? spark(vals, cor || VERDE) : ""}</div>`;
  }

  function blocoHero(rows, R){
    const sn = serieContinua(rows, "n"), sf = serieContinua(rows, "frete"), sc = serieContinua(rows, "conv"), sfc = serieContinua(rows, "fConv");
    const bq = baseQtd(R);
    return `<div class="cq-hero">
      ${kpi("Cotações feitas", int(R.n), `${dec1(porDiaAtivo(R))} por dia com cotação · ${R.dias.size} dias`, sn, "#8fd16a")}
      ${kpi("Frete cotado", brlK(R.frete), `ticket médio ${ticket(R) == null ? "—" : brl(ticket(R))}`, sf, "#8fd16a")}
      ${kpi("Convertidas (CTRC EMI)", int(R.conv), `de ${int(bq)} na base${F.base ? " (todas)" : " (sem outras)"}`, sc, "#8fd16a", "cq-k-ok")}
      ${kpi("Conversão", fPct(taxaQtd(R)), `em valor: ${fPct(taxaVal(R))}`, null, null, "cq-k-big")}
      ${kpi("Frete emitido (CTRC)", brlK(R.fEmit), `proposta convertida ${brlK(R.fConv)}`, sfc, "#8fd16a", "cq-k-ok")}
      ${kpi("Ainda em aberto", brlK(R.fAberta), `${int(R.aberta)} cotações · COTADO ${int(R.cotado)} / COT FIXO ${int(R.fixo)}`, null, null, "cq-k-az")}
      ${kpi("Tempo p/ converter", tempoConv(R) == null ? "—" : dec1(tempoConv(R)) + " d", `média cotação → emissão (${int(R.ntc)} CTRCs)`, null, null)}
      ${R.outra ? kpi("Outras situações", int(R.outra), `${brlK(R.fOutra)} · ${F.base ? "incluídas na base" : "fora da taxa"}`, null, null, "cq-k-cz") : ""}
    </div>`;
  }

  function blocoFunil(rows, R){
    const sit = agrupar(rows, x => x.st || "(sem situação)").sort((a, b) => ordemSit(a.k) - ordemSit(b.k) || b.n - a.n);
    const itens = sit.map((x, i) => ({cor:corSit(x.k, i), v:x.n, rot:x.k}));
    const linhas = sit.map((x, i) => {
      const cl = classe(x.k);
      return `<tr><td><i class="cq-dot" style="background:${corSit(x.k, i)}"></i><b>${esc(x.k)}</b></td><td class="cq-tag cq-tag-${cl}">${LEITURA_ROT[cl]}</td><td class="cq-n">${int(x.n)}</td><td class="cq-n">${fPct(pct(x.n, R.n))}</td><td class="cq-n">${brl(x.frete)}</td></tr>`;
    }).join("");
    // funil
    const etapas = [
      {t:"Cotações feitas", n:R.n, v:R.frete, cor:CINZA},
      {t:"Na base de conversão" + (F.base ? " (todas)" : " (sem outras)"), n:baseQtd(R), v:baseVal(R), cor:AZUL},
      {t:"Convertidas (CTRC EMI)", n:R.conv, v:R.fConv, cor:VERDE}
    ];
    const f = etapas.map(e => `<div class="cq-fu"><div class="cq-fu-b" style="width:${Math.max(R.n ? e.n / R.n * 100 : 0, 3).toFixed(1)}%;background:${e.cor}"></div><div class="cq-fu-t"><b>${int(e.n)}</b> ${e.t} <small>${brl(e.v)}</small></div></div>`).join("");
    return `<div class="panel"><div class="panel-header">Funil e situação das cotações</div>
      <div class="cq-pbody cq-sit">
        <div class="cq-sit-g">${donut(itens, R.n, {a:fPct(taxaQtd(R)), b:"conversão"})}</div>
        <div>
          <div class="cq-funil">${f}</div>
          <div class="table-wrap"><table class="cq-table"><thead><tr><th>Situação</th><th>Leitura</th><th>Cotações</th><th>% do total</th><th>Frete (proposta)</th></tr></thead>
          <tbody>${linhas || `<tr><td colspan="5" class="cq-vazio">Sem dados.</td></tr>`}</tbody></table></div>
          <p class="cq-hint"><b>CTRC EMI</b> = convertida. <b>COTADO</b> e <b>COT FIXO</b> = ainda não convertidas. As demais ficam à parte${F.base ? " (aqui incluídas na base)" : " e fora da taxa"}.</p>
        </div></div></div>`;
  }

  function blocoEquipes(rows){
    const caixas = EQUIPES.map(e => {
      const a = resumo(rows.filter(x => equipeDe(x.us) === e));
      if(!a.n) return "";
      const nUs = new Set(rows.filter(x => equipeDe(x.us) === e).map(x => x.us)).size;
      return `<div class="cq-eqbox" style="border-top-color:${EQ_COR[e]}">
        <div class="cq-eqbox-h"><b>${EQ_LONGO[e]}</b><small>${nUs} usuário(s)</small></div>
        <div class="cq-eqbox-g"><div><span>Cotações</span><b>${int(a.n)}</b></div><div><span>Frete cotado</span><b>${brlK(a.frete)}</b></div><div><span>Conversão</span><b class="cq-verde">${fPct(taxaQtd(a))}</b></div><div><span>Frete emitido</span><b>${brlK(a.fEmit)}</b></div></div>
        ${barraDupla(taxaQtd(a), EQ_COR[e])}
      </div>`;
    }).join("");
    return caixas ? `<div class="cq-eqrow">${caixas}</div>` : "";
  }

  const COLS_TAB = [
    {k:"us", t:"Usuário", s:(a, b) => sortAlpha(a.us, b.us)},
    {k:"tend", t:"Tendência", nosort:true},
    {k:"n", t:"Cotações", s:(a, b) => a.n - b.n},
    {k:"dia", t:"Por dia", s:(a, b) => (porDiaAtivo(a) || 0) - (porDiaAtivo(b) || 0)},
    {k:"frete", t:"Frete cotado", s:(a, b) => a.frete - b.frete},
    {k:"tick", t:"Ticket médio", s:(a, b) => (ticket(a) || 0) - (ticket(b) || 0)},
    {k:"conv", t:"Convertidas", s:(a, b) => a.conv - b.conv},
    {k:"taxa", t:"Conversão", s:(a, b) => (taxaQtd(a) || 0) - (taxaQtd(b) || 0)},
    {k:"emit", t:"Frete emitido", s:(a, b) => a.fEmit - b.fEmit},
    {k:"aberto", t:"Em aberto (R$)", s:(a, b) => a.fAberta - b.fAberta},
    {k:"tc", t:"Tempo conv.", s:(a, b) => (tempoConv(a) || 0) - (tempoConv(b) || 0)}
  ];

  function tabelaUsuarios(rows, us, R){
    const col = COLS_TAB.find(c => c.k === S.ordem) || COLS_TAB[2];
    us = us.slice().sort((a, b) => S.dir * col.s(a, b) || b.n - a.n);
    const maxN = Math.max.apply(null, us.map(u => u.n).concat([1]));
    const maxT = Math.max.apply(null, us.map(u => taxaQtd(u) || 0).concat([1]));
    const marcados = F.sel.usuarios;
    const corpo = us.map((u, i) => {
      const sp = spark(serieContinua(rows.filter(x => x.us === u.us), "n"), EQ_COR[u.eq], 90, 24);
      return `<tr data-cqus="${esc(u.us)}" class="${marcados.has(u.us) ? "cq-sel" : ""}" title="Clique para abrir a ficha de ${esc(u.us)}">
        <td class="cq-chkc"><input type="checkbox" data-cqchk="${esc(u.us)}" ${marcados.has(u.us) ? "checked" : ""} title="Marcar para filtrar"></td>
        <td class="cq-rk">${i + 1}</td>
        <td><b>${esc(u.us)}</b> <span class="cq-eq cq-eq-${u.eq}">${EQ_NOME[u.eq]}</span></td>
        <td>${sp}</td>
        <td class="cq-n"><div class="cq-cb">${barraDupla(u.n / maxN * 100, EQ_COR[u.eq])}<b>${int(u.n)}</b></div></td>
        <td class="cq-n">${dec1(porDiaAtivo(u))}</td>
        <td class="cq-n">${brl(u.frete)}</td>
        <td class="cq-n">${ticket(u) == null ? "—" : brl(ticket(u))}</td>
        <td class="cq-n cq-verde">${int(u.conv)}</td>
        <td class="cq-n"><div class="cq-cb">${barraDupla((taxaQtd(u) || 0) / maxT * 100, VERDE)}<b class="cq-verde">${fPct(taxaQtd(u))}</b></div></td>
        <td class="cq-n cq-verde">${brl(u.fEmit)}</td>
        <td class="cq-n">${brl(u.fAberta)}</td>
        <td class="cq-n">${tempoConv(u) == null ? "—" : dec1(tempoConv(u)) + " d"}</td></tr>`;
    }).join("");
    const tot = `<tr class="cq-tot"><td></td><td></td><td><b>TOTAL</b></td><td></td><td class="cq-n">${int(R.n)}</td><td class="cq-n">${dec1(porDiaAtivo(R))}</td><td class="cq-n">${brl(R.frete)}</td><td class="cq-n">${ticket(R) == null ? "—" : brl(ticket(R))}</td><td class="cq-n">${int(R.conv)}</td><td class="cq-n">${fPct(taxaQtd(R))}</td><td class="cq-n">${brl(R.fEmit)}</td><td class="cq-n">${brl(R.fAberta)}</td><td class="cq-n">${tempoConv(R) == null ? "—" : dec1(tempoConv(R)) + " d"}</td></tr>`;
    const cab = COLS_TAB.map(c => c.nosort ? `<th>${c.t}</th>` : `<th class="cq-ord ${S.ordem === c.k ? "cq-ord-on" : ""}" data-cqord="${c.k}">${c.t} ${S.ordem === c.k ? (S.dir < 0 ? "▼" : "▲") : ""}</th>`).join("");
    return `<div class="table-wrap"><table class="cq-table cq-tabusr" id="cqTabUsr"><thead><tr><th></th><th>#</th>${cab}</tr></thead><tbody>${corpo || `<tr><td colspan="13" class="cq-vazio">Nenhum usuário no filtro.</td></tr>`}${tot}</tbody></table></div>
      <p class="cq-hint">Clique no nome para abrir a <b>ficha completa</b> do usuário. Use a caixinha para marcar vários e filtrar só eles. Clique nos títulos das colunas para ordenar. “Por dia” = cotações por dia em que o usuário cotou.</p>`;
  }

  function barrasUsuarios(us){
    const lista = us.filter(u => u.n > 0).sort((a, b) => b.n - a.n).slice(0, 20);
    if(!lista.length) return `<div class="cq-vazio">Sem cotações no filtro.</div>`;
    const max = Math.max.apply(null, lista.map(u => u.n));
    const W = 560, L = 92, R = 70, H = 26;
    const sc = v => v / max * (W - L - R);
    let y = 6, s = "";
    lista.forEach(u => {
      const seg = [[u.conv, VERDE, "Convertidas"], [u.aberta, AZUL, "Em aberto (COTADO + COT FIXO)"], [u.outra, CINZA, "Outras situações"]];
      let x = L;
      s += `<g class="cq-bub" data-cqus="${esc(u.us)}"><text x="${L - 8}" y="${y + 15}" text-anchor="end" class="cq-b-lab">${esc(u.us)}</text>`;
      seg.forEach(g => { if(g[0] > 0){ const w = sc(g[0]); s += `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${H - 8}" fill="${g[1]}"><title>${esc(u.us)} — ${g[2]}: ${int(g[0])}</title></rect>`; x += w; } });
      s += `<text x="${(x + 6).toFixed(1)}" y="${y + 13}" class="cq-b-val">${int(u.n)}</text></g>`;
      y += H;
    });
    return `<svg class="cq-bars" viewBox="0 0 ${W} ${y + 4}" role="img" aria-label="Cotações por usuário">${s}</svg>
      <div class="cq-leg"><span><i style="background:${VERDE}"></i>Convertidas</span><span><i style="background:${AZUL}"></i>Em aberto</span><span><i style="background:${CINZA}"></i>Outras</span></div>`;
  }

  function rankLista(itens, rotulo, mostrarN){
    // itens: acumuladores com .k ; ordenados por frete
    const lista = itens.sort((a, b) => b.frete - a.frete).slice(0, mostrarN || 8);
    if(!lista.length) return `<div class="cq-vazio">Sem dados.</div>`;
    const max = lista[0].frete || 1;
    return `<div class="table-wrap"><table class="cq-table cq-rank"><thead><tr><th>${rotulo}</th><th>Cot.</th><th>Frete cotado</th><th>Conv.</th><th>Emitido</th></tr></thead><tbody>${lista.map(a => `<tr>
      <td class="cq-rk-n"><div class="cq-cb">${barraDupla(a.frete / max * 100, AZUL)}<span title="${esc(a.k)}">${esc(String(a.k).slice(0, 34))}</span></div></td>
      <td class="cq-n">${int(a.n)}</td><td class="cq-n">${brl(a.frete)}</td><td class="cq-n cq-verde">${fPct(taxaQtd(a))}</td><td class="cq-n cq-verde">${brl(a.fEmit)}</td></tr>`).join("")}</tbody></table></div>`;
  }

  /* ---------------- detalhe ---------------- */
  function linhasDetalhe(base){
    const q = semAcento(F.busca).toLowerCase().trim();
    let rows = base || filtradas();
    if(q) rows = rows.filter(x => semAcento([x.id, x.pg, x.or, x.de, x.us, x.ct, x.vd].join(" ")).toLowerCase().indexOf(q) >= 0);
    return rows.slice().sort((a, b) => (b.dt + b.hr).localeCompare(a.dt + a.hr) || (+b.id) - (+a.id));
  }
  function tabelaDetalhe(rows, lim, semUsuario){
    return `<table class="cq-table cq-det"><thead><tr><th>Cotação</th><th>Data</th>${semUsuario ? "" : "<th>Usuário</th>"}<th>Sis.</th><th>Un.</th><th>Pagador</th><th>Origem → Destino</th><th>Frete</th><th>Situação</th><th>CTRC</th><th>Emissão</th></tr></thead><tbody>`
      + (rows.slice(0, lim).map(x => `<tr><td>${esc(x.id)}</td><td class="cq-nw">${fData(x.dt)} ${esc(x.hr)}</td>${semUsuario ? "" : `<td><a href="#" class="cq-lk" data-cqus="${esc(x.us)}">${esc(x.us)}</a></td>`}<td>${esc(sisDe(x))}</td><td>${esc(x.un)}</td><td>${esc(x.pg)}</td><td>${esc(x.or)} → ${esc(x.de)}</td>
        <td class="cq-n">${brl(x.pa)}</td><td><span class="cq-st cq-st-${classe(x.st)}">${esc(x.st)}</span></td><td>${esc(x.ct)}</td><td class="cq-nw">${fData(x.em)}</td></tr>`).join("") || `<tr><td colspan="11" class="cq-vazio">Nada encontrado.</td></tr>`) + `</tbody></table>`;
  }
  const LIM_DET = 300;
  function pintarDetalhe(){
    const body = document.getElementById("cqDetBody");
    if(!body) return;
    const rows = linhasDetalhe();
    const info = document.getElementById("cqDetInfo");
    if(info) info.textContent = `${int(rows.length)} cotações` + (rows.length > LIM_DET ? ` (mostrando as ${LIM_DET} mais recentes — o CSV leva todas)` : "");
    body.innerHTML = tabelaDetalhe(rows, LIM_DET);
  }


  /* ---------------- sistemas (VAL x RVA) ---------------- */
  function blocoSistemas(rows){
    const presentes = SIS.filter(v => rows.some(x => sisDe(x) === v));
    if(presentes.length < 2) return "";
    return `<div class="cq-eqrow">${presentes.map(v => {
      const a = resumo(rows.filter(x => sisDe(x) === v));
      const nUs = new Set(rows.filter(x => sisDe(x) === v).map(x => x.us)).size;
      return `<div class="cq-eqbox" style="border-top-color:${SIS_COR[v]}">
        <div class="cq-eqbox-h"><b>${v} — ${SIS_NOME[v]}</b><small>${nUs} usuário(s)</small></div>
        <div class="cq-eqbox-g"><div><span>Cotações</span><b>${int(a.n)}</b></div><div><span>Frete cotado</span><b>${brlK(a.frete)}</b></div><div><span>Conversão</span><b class="cq-verde">${fPct(taxaQtd(a))}</b></div><div><span>Frete emitido</span><b>${brlK(a.fEmit)}</b></div></div>
        ${barraDupla(taxaQtd(a), SIS_COR[v])}
      </div>`;
    }).join("")}</div>`;
  }

  /* ---------------- cotações feitas por dia (usuário × dia) ---------------- */
  function matrizDia(rows){
    const dias = Array.from(new Set(rows.map(x => x.dt).filter(Boolean))).sort();
    const m = {};
    rows.forEach(x => { if(!x.dt) return; m[x.us] = m[x.us] || {}; m[x.us][x.dt] = (m[x.us][x.dt] || 0) + 1; });
    const us = Object.keys(m).map(u => {
      const vals = dias.map(d => m[u][d] || 0), tot = vals.reduce((a, b) => a + b, 0), at = vals.filter(v => v > 0).length;
      let best = 0, bd = ""; dias.forEach((d, i) => { if(vals[i] > best){ best = vals[i]; bd = d; } });
      return {us:u, eq:equipeDe(u), vals, tot, at, media:at ? tot / at : null, best, bd};
    }).sort((a, b) => b.tot - a.tot);
    return {dias, us};
  }
  const dowDe = d => DIAS_SEM[(new Date(d + "T12:00:00").getDay() + 6) % 7];
  function blocoPorDia(rows){
    const M = matrizDia(rows);
    if(!M.dias.length) return "";
    const totDia = M.dias.map((d, i) => M.us.reduce((a, u) => a + u.vals[i], 0));
    let max = 0; M.us.forEach(u => u.vals.forEach(v => { if(v > max) max = v; }));
    const cab = M.dias.map(d => { const w = dowDe(d); return `<th class="${w === "Sáb" || w === "Dom" ? "cq-fds" : ""}"><span>${fDia(d)}</span><small>${w}</small></th>`; }).join("");
    const linhas = M.us.map(u => `<tr data-cqus="${esc(u.us)}" title="Abrir a ficha de ${esc(u.us)}"><td class="cq-pd-u"><b>${esc(u.us)}</b> <span class="cq-eq cq-eq-${u.eq}">${EQ_NOME[u.eq]}</span></td>${u.vals.map(v => {
        const a = v ? 0.15 + 0.85 * v / (max || 1) : 0;
        return `<td class="cq-pd-c" style="${v ? `background:rgba(79,157,45,${a.toFixed(2)});color:${a > .55 ? "#fff" : "#1b2319"}` : ""}">${v || ""}</td>`;
      }).join("")}<td class="cq-n"><b>${int(u.tot)}</b></td><td class="cq-n">${u.at}</td><td class="cq-n">${dec1(u.media)}</td><td class="cq-n">${u.best}${u.bd ? ` <small>(${fDia(u.bd)})</small>` : ""}</td></tr>`).join("");
    const rod = `<tr class="cq-tot"><td>TOTAL DO DIA</td>${totDia.map(v => `<td class="cq-pd-c">${v || ""}</td>`).join("")}<td class="cq-n">${int(totDia.reduce((a, b) => a + b, 0))}</td><td class="cq-n">${M.dias.length}</td><td class="cq-n">${dec1(totDia.reduce((a, b) => a + b, 0) / M.dias.length)}</td><td></td></tr>`;
    return `<div class="panel"><div class="panel-header">Cotações feitas por dia — por usuário
        <span class="cq-seg cq-seg-h"><button type="button" data-cqpd="copy">Copiar p/ colar</button><button type="button" data-cqpd="csv">Exportar CSV</button></span></div>
      <div class="cq-pbody"><div class="table-wrap cq-pd-w"><table class="cq-table cq-pd"><thead><tr><th class="cq-pd-u">Usuário</th>${cab}<th>Total</th><th>Dias</th><th>Média/dia</th><th>Melhor dia</th></tr></thead><tbody>${linhas}${rod}</tbody></table></div>
      <p class="cq-hint">Quantas cotações cada pessoa fez em cada dia (pela data de inclusão). Só aparecem os dias em que houve cotação. “Média/dia” considera apenas os dias em que a pessoa cotou. Use <b>Exportar CSV</b> ou <b>Copiar p/ colar</b> (cola direto no Excel) para enviar ao time.</p></div></div>`;
  }
  function linhasPorDia(rows){
    const M = matrizDia(rows);
    const L = [["Usuário"].concat(M.dias.map(fDia), ["Total", "Dias com cotação", "Média/dia", "Melhor dia"])];
    M.us.forEach(u => L.push([u.us].concat(u.vals.map(v => v || ""), [u.tot, u.at, num1(u.media), u.best ? u.best + " (" + fDia(u.bd) + ")" : ""])));
    const tot = M.dias.map((d, i) => M.us.reduce((a, u) => a + u.vals[i], 0));
    L.push(["TOTAL"].concat(tot, [tot.reduce((a, b) => a + b, 0), M.dias.length, "", ""]));
    return L;
  }
  function exportarPorDia(){ baixarCSV(`Comercial_Cotacoes_por_dia_${hoje()}.csv`, linhasPorDia(filtradas())); }
  function copiarPorDia(btn){
    const txt = linhasPorDia(filtradas()).map(l => l.join("\t")).join("\n");
    const ok = () => { const t = btn.textContent; btn.textContent = "Copiado ✓"; setTimeout(() => { btn.textContent = t; }, 1600); };
    const fallback = () => { const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select(); try{ document.execCommand("copy"); ok(); }catch(e){ alert("Não consegui copiar. Use Exportar CSV."); } ta.remove(); };
    if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, fallback); else fallback();
  }

  /* ---------------- maiores cotações ---------------- */
  function blocoMaiores(rows, R){
    if(!rows.length) return "";
    let itens, tit;
    if(F.topModo === "usuario"){
      const m = {};
      rows.forEach(x => { if(!m[x.us] || x.pa > m[x.us].pa) m[x.us] = x; });
      itens = Object.keys(m).map(u => m[u]).sort((a, b) => b.pa - a.pa).slice(0, 20);
      tit = "A maior cotação de cada usuário";
    }else{
      itens = rows.slice().sort((a, b) => b.pa - a.pa).slice(0, 15);
      tit = "As 15 maiores cotações";
    }
    const max = itens[0].pa || 1, soma = itens.reduce((a, x) => a + x.pa, 0);
    const conv = itens.filter(x => classe(x.st) === "conv").length;
    const cor = x => classe(x.st) === "conv" ? VERDE : classe(x.st) === "aberta" ? AZUL : CINZA;
    const linhas = itens.map((x, i) => `<div class="cq-top-l" data-cqus="${esc(x.us)}" title="Abrir a ficha de ${esc(x.us)}">
        <span class="cq-rk">${i + 1}</span>
        <div class="cq-top-t"><b>${esc(x.pg || "(sem pagador)")}</b><small>#${esc(x.id)} · ${esc(x.us)} · ${fData(x.dt)} · ${esc(x.or)} → ${esc(x.de)}</small></div>
        <div class="cq-top-b"><i style="width:${(x.pa / max * 100).toFixed(1)}%;background:${cor(x)}"></i></div>
        <b class="cq-top-v">${brl(x.pa)}</b><span class="cq-st cq-st-${classe(x.st)}">${esc(x.st)}</span></div>`).join("");
    return `<div class="panel"><div class="panel-header">${tit}
        <span class="cq-seg cq-seg-h"><button type="button" data-cqtop="geral" class="${F.topModo !== "usuario" ? "on" : ""}">Top 15</button><button type="button" data-cqtop="usuario" class="${F.topModo === "usuario" ? "on" : ""}">Por usuário</button></span></div>
      <div class="cq-pbody"><div class="cq-top">${linhas}</div>
      <p class="cq-hint">${F.topModo === "usuario" ? "" : `Estas ${itens.length} cotações somam <b>${brl(soma)}</b> — <b>${fPct(pct(soma, R.frete))}</b> de todo o frete cotado no filtro; ${conv} já foram convertidas. `}Cor da barra = situação (verde convertida, azul não convertida, cinza outra). Clique para abrir a ficha do usuário.</p></div></div>`;
  }

  /* ---------------- tela principal ---------------- */
  function conteudo(){
    if(!Object.keys(D.rows).length){
      return `<div class="cq-vazio cq-vazio-grande">Nenhuma cotação importada. Abra <b>Importar cotações</b> acima e carregue o arquivo do SSW para ver o painel.</div>`;
    }
    const rows = filtradas(), R = resumo(rows);
    if(!rows.length) return `<div class="cq-vazio cq-vazio-grande">Nenhuma cotação com esses filtros. Ajuste ou clique em <b>Limpar filtros</b>.</div>`;
    const us = usuariosAgr(rows);
    return `${blocoHero(rows, R)}
      ${blocoEquipes(rows)}
      ${blocoSistemas(rows)}
      ${blocoFunil(rows, R)}
      <div class="panel"><div class="panel-header">Produtividade e conversão por usuário</div>
        <div class="cq-pbody cq-2col">
          <div><div class="cq-sub-t">Volume × conversão</div>${bolhas(us)}</div>
          <div><div class="cq-sub-t">Cotações por usuário (top 20)</div>${barrasUsuarios(us)}</div>
        </div>
        <div class="cq-pbody">${tabelaUsuarios(rows, us, R)}</div>
      </div>
      ${blocoPorDia(rows)}
      <div class="panel"><div class="panel-header">Evolução diária
        <span class="cq-seg cq-seg-h" id="cqMetrica"><button type="button" data-met="n" class="${F.metrica === "n" ? "on" : ""}">Cotações</button><button type="button" data-met="frete" class="${F.metrica === "frete" ? "on" : ""}">Frete (R$)</button></span></div>
        <div class="cq-pbody">${graficoDias(rows, F.metrica)}</div></div>
      ${blocoMaiores(rows, R)}
      <div class="cq-2col cq-2col-p">
        <div class="panel"><div class="panel-header">Quando cotam — mapa de calor</div><div class="cq-pbody">${heatmap(rows)}</div></div>
        <div class="panel"><div class="panel-header">Destinos (UF)</div><div class="cq-pbody">${rankLista(agrupar(rows, x => ufDe(x.de) || "—"), "UF destino", 8)}</div></div>
      </div>
      <div class="panel"><div class="panel-header">Maiores clientes (pagador) por frete cotado</div><div class="cq-pbody">${rankLista(agrupar(rows, x => x.pg), "Cliente", 10)}</div></div>
      <div class="panel"><div class="panel-header">Cotações — detalhe</div>
        <div class="cq-pbody">
          <div class="cq-det-top">
            <input type="search" id="cqBusca" placeholder="Buscar por cotação, cliente, destino, CTRC, usuário…" value="${esc(F.busca)}">
            <span class="cq-sm" id="cqDetInfo"></span>
            <button type="button" class="btn btn-ghost btn-sm" id="cqExpDet">Exportar detalhe (CSV)</button>
          </div>
          <div class="table-wrap" id="cqDetBody"></div>
        </div></div>`;
  }

  /* ---------------- filtros (multi-seleção) ---------------- */
  const MS_ROT = {sis:"Sistema (VAL/RVA)", usuarios:"Usuário", equipes:"Equipe", unidades:"Unidade", sits:"Situação", tf:"Tipo de frete"};
  function opcoes(k){
    const t = todas();
    const cont = f => { const m = {}; t.forEach(x => { const v = f(x); if(v) m[v] = (m[v] || 0) + 1; }); return m; };
    if(k === "usuarios"){
      const m = cont(x => x.us);
      EQUIPES.slice(0, 2).forEach(e => D.equipes[e].forEach(u => { if(!(u in m)) m[u] = 0; }));
      return Object.keys(m).sort(sortAlpha).map(u => ({v:u, t:u, n:m[u], g:equipeDe(u)}));
    }
    if(k === "sis") return SIS.map(v => ({v, t:v + " — " + SIS_NOME[v], n:t.filter(x => sisDe(x) === v).length}));
    if(k === "equipes") return EQUIPES.map(e => ({v:e, t:EQ_NOME[e], n:t.filter(x => equipeDe(x.us) === e).length}));
    if(k === "unidades"){ const m = cont(x => x.un); return Object.keys(m).sort((a, b) => m[b] - m[a]).map(v => ({v, t:v, n:m[v]})); }
    if(k === "sits"){ const m = cont(x => x.st); return Object.keys(m).sort((a, b) => ordemSit(a) - ordemSit(b) || m[b] - m[a]).map(v => ({v, t:v, n:m[v]})); }
    const m = cont(x => tfDe(x)); return Object.keys(m).sort().map(v => ({v, t:v, n:m[v]}));
  }
  function msLabel(k){
    const s = [...F.sel[k]];
    if(!s.length) return "Todos";
    const nomes = k === "equipes" ? s.map(e => EQ_NOME[e]) : s;
    return nomes.length <= 2 ? nomes.join(", ") : nomes.length + " selecionados";
  }
  function msHTML(k){
    const ops = opcoes(k);
    let corpo = "";
    if(k === "usuarios"){
      EQUIPES.forEach(e => {
        const g = ops.filter(o => o.g === e); if(!g.length) return;
        corpo += `<div class="cq-ms-g">${EQ_LONGO[e]}</div>` + g.map(o => opHTML(k, o)).join("");
      });
    }else corpo = ops.map(o => opHTML(k, o)).join("");
    const acts = k === "usuarios"
      ? `<button type="button" data-msact="mtz">Time MTZ</button><button type="button" data-msact="filial">Filiais</button><button type="button" data-msact="limpar">Limpar</button>`
      : `<button type="button" data-msact="todos">Marcar todos</button><button type="button" data-msact="limpar">Limpar</button>`;
    return `<div class="cq-ms ${F.sel[k].size ? "on" : ""}" data-ms="${k}">
      <button type="button" class="cq-ms-b" aria-haspopup="true"><span class="cq-ms-l">${MS_ROT[k]}</span><b class="cq-ms-v">${esc(msLabel(k))}</b><i>▾</i></button>
      <div class="cq-ms-m" hidden>
        ${ops.length > 8 ? `<input type="search" class="cq-ms-q" placeholder="Buscar…">` : ""}
        <div class="cq-ms-acts">${acts}</div>
        <div class="cq-ms-o">${corpo || `<div class="cq-vazio">Sem opções</div>`}</div>
      </div></div>`;
  }
  const opHTML = (k, o) => `<label class="cq-ms-op" data-t="${esc(semAcento(o.t).toLowerCase())}"><input type="checkbox" data-msv="${esc(o.v)}" ${F.sel[k].has(o.v) ? "checked" : ""}><span>${esc(o.t)}</span><em>${int(o.n)}</em></label>`;

  function filtrosHTML(){
    return `<div class="cq-filtros">
      <div class="cq-f-linha">
        <label class="cq-f-d">De<input type="date" id="cqDe" value="${esc(F.de)}"></label>
        <label class="cq-f-d">Até<input type="date" id="cqAte" value="${esc(F.ate)}"></label>
        <div class="cq-seg" id="cqPeriodo"><button type="button" data-per="tudo">Tudo</button><button type="button" data-per="hoje">Último dia</button><button type="button" data-per="7">7 dias</button><button type="button" data-per="mes">Mês</button></div>
        ${MS.map(msHTML).join("")}
      </div>
      <div class="cq-f-linha cq-f-l2">
        <div class="cq-seg" id="cqLeitura"><button type="button" data-lei="todas">Todas</button><button type="button" data-lei="conv">Convertidas</button><button type="button" data-lei="aberta">Não convertidas</button><button type="button" data-lei="outra">Outras</button></div>
        <label class="cq-chk"><input type="checkbox" id="cqBase" ${F.base ? "checked" : ""}> Incluir “outras” na base da conversão</label>
        <span class="cq-f-n" id="cqFN"></span>
        <button type="button" class="btn btn-ghost btn-sm" id="cqLimpaF">Limpar filtros</button>
      </div>
    </div>`;
  }
  function pintarSeg(){
    const raiz = document.getElementById("cqRoot"); if(!raiz) return;
    raiz.querySelectorAll("#cqLeitura button").forEach(b => b.classList.toggle("on", b.dataset.lei === F.leitura));
    const ativos = MS.reduce((n, k) => n + (F.sel[k].size ? 1 : 0), 0) + (dataOk(F.de) ? 1 : 0) + (dataOk(F.ate) ? 1 : 0) + (F.leitura !== "todas" ? 1 : 0);
    const fn = raiz.querySelector("#cqFN");
    if(fn) fn.textContent = ativos ? `${ativos} filtro(s) ativo(s) · ${int(filtradas().length)} de ${int(Object.keys(D.rows).length)} cotações` : `${int(Object.keys(D.rows).length)} cotações`;
  }

  function blocoImportar(){
    const total = Object.keys(D.rows).length;
    const hist = D.imports.slice(0, 5).map(i => `<li>${new Date(i.em).toLocaleString("pt-BR")} — ${esc(i.nome)}: ${int(i.n)} cotações [${esc(i.sis || "VAL")}] (${int(i.novos)} novas, ${int(i.atualizados)} atualizadas${i.viraram ? `, ${int(i.viraram)} convertidas` : ""})</li>`).join("");
    const ds = todas().map(x => x.dt).filter(Boolean).sort();
    return `<div class="panel"><div class="panel-header">Importar cotações e equipes</div>
      <div class="cq-pbody">
        <div class="cq-impgrid">${SIS.map(v => {
          const rs = todas().filter(x => sisDe(x) === v), dd = rs.map(x => x.dt).filter(Boolean).sort();
          return `<div class="cq-impbox" style="border-top-color:${SIS_COR[v]}">
            <div class="cq-impbox-h"><b>${v}</b> <span>${SIS_NOME[v]}</span><small>${rs.length ? `${int(rs.length)} cotações · ${fData(dd[0])} a ${fData(dd[dd.length - 1])}` : "nada importado"}</small></div>
            <input type="file" id="cqArq_${v}" accept=".sswweb,.csv,.txt,text/plain" multiple>
            <div class="cq-impbox-b"><button type="button" class="btn btn-primary btn-sm" data-cqimp="${v}">Importar ${v}</button>
            <button type="button" class="link-btn danger" data-cqlimpsis="${v}" ${rs.length ? "" : "disabled"}>apagar ${v}</button></div></div>`;
        }).join("")}</div>
        <div class="cq-imp"><button type="button" class="link-btn danger" id="cqLimpar" ${total ? "" : "disabled"}>apagar todas as cotações (VAL e RVA)</button></div>
        <button type="button" class="link-btn" id="cqColarT">ou colar o texto manualmente</button>
        <div id="cqColar" style="display:none">
          <textarea id="cqTxt" rows="5" placeholder="Cole aqui o conteúdo do arquivo..."></textarea>
          <label class="cq-txtsis">Sistema <select id="cqTxtSis">${SIS.map(v => `<option value="${v}">${v} — ${SIS_NOME[v]}</option>`).join("")}</select></label>
          <button type="button" class="btn btn-ghost btn-sm" id="cqTxtBtn">Importar texto colado</button>
        </div>
        <div class="cq-msg ${msg && msg.ok === false ? "cq-msg-err" : "cq-msg-ok"}" id="cqMsg">${msg ? esc(msg.t) : ""}</div>
        <p class="cq-hint">${total ? `<b>${int(total)}</b> cotações salvas (${fData(ds[0])} a ${fData(ds[ds.length - 1])}).` : "Nenhuma cotação importada ainda."} Reimportar atualiza as cotações pelo número — é assim que o COTADO vira CTRC EMI. Lê pelo <b>nome das colunas</b>. Os filtros de unidade e tipo de frete precisam de arquivos importados nesta versão (reimporte se não aparecerem).</p>
        ${hist ? `<ul class="cq-hist">${hist}</ul>` : ""}
        <div class="cq-form">
          <label>Time MTZ <input type="text" id="cqEqMtz" value="${esc(D.equipes.mtz.join(", "))}"></label>
          <label>Filiais <input type="text" id="cqEqFil" value="${esc(D.equipes.filial.join(", "))}"></label>
        </div>
        <p class="cq-hint">Equipes: separe os usuários por vírgula (o nome de USUARIO INCLUSAO). Quem não estiver em nenhuma lista cai em “Outros”.</p>
      </div></div>`;
  }

  function raizHTML(){
    return `<div id="cqRoot">
      <div class="cq-topo">
        <div>
          <h2 class="section-title">Comercial · Cotações</h2>
          <p class="section-desc">Produtividade, frete cotado, frete emitido e conversão do time comercial (MTZ e Filiais). <b>CTRC EMI</b> = convertida · <b>COTADO / COT FIXO</b> = ainda não convertida. Marque um ou mais usuários nos filtros — ou clique num usuário para abrir a ficha dele.</p>
        </div>
        <div class="cq-expbtns">
          <button type="button" class="btn btn-primary" id="cqExpXls" title="Excel (.xlsx) com resumo, usuários, cotações por dia, maiores cotações e detalhe — respeita os filtros">Exportar Excel</button>
          <button type="button" class="btn btn-primary" id="cqExpPdf" title="PDF (A4 paisagem) com KPIs, usuários, cotações por dia e maiores cotações — respeita os filtros">Exportar PDF</button>
          <button type="button" class="btn btn-ghost" id="cqExpUsr" title="Resumo por usuário em CSV">CSV</button>
        </div>
      </div>
      <div id="cqImportar"></div>
      <div id="cqFiltros"></div>
      <div id="cqConteudo"></div>
    </div>`;
  }

  // modo: "tudo" | "filtros" | "conteudo"
  function renderizar(modo){
    const raiz = document.getElementById("cqRoot");
    if(!raiz) return;
    modo = modo || "tudo";
    if(modo === "tudo"){ raiz.querySelector("#cqImportar").innerHTML = blocoImportar(); ligarImportar(); }
    if(modo !== "conteudo"){ raiz.querySelector("#cqFiltros").innerHTML = filtrosHTML(); }
    raiz.querySelector("#cqConteudo").innerHTML = conteudo();
    pintarSeg(); pintarDetalhe();
    if(perfilAberto) abrirPerfil(perfilAberto, true);
  }

  /* ---------------- ficha do usuário ---------------- */
  function comparaLinha(rot, vU, vE, vG, fmt, maior){
    const mx = Math.max(vU || 0, vE || 0, vG || 0) || 1;
    const lin = (nome, v, cor) => `<div class="cq-cmp-l"><span>${nome}</span>${barraDupla((v || 0) / mx * 100, cor)}<b>${v == null ? "—" : fmt(v)}</b></div>`;
    const melhor = vU != null && vG != null ? (maior ? vU >= vG : vU <= vG) : null;
    return `<div class="cq-cmp"><div class="cq-cmp-t">${rot} ${melhor == null ? "" : `<em class="${melhor ? "ok" : "ruim"}">${melhor ? "acima da média" : "abaixo da média"}</em>`}</div>${lin("Usuário", vU, VERDE)}${lin("Equipe", vE, AZUL)}${lin("Geral", vG, CINZA)}</div>`;
  }

  function abrirPerfil(us, manter){
    perfilAberto = us;
    const base = filtradas(true);
    const rows = base.filter(x => x.us === us);
    const eq = equipeDe(us);
    const R = resumo(rows);
    const RE = resumo(base.filter(x => equipeDe(x.us) === eq && x.us !== us));
    const RG = resumo(base);
    let el = document.getElementById("cqDrawer");
    if(!el){
      el = document.createElement("div"); el.id = "cqDrawer"; el.className = "cq-drawer";
      document.body.appendChild(el);
    }
    const sit = agrupar(rows, x => x.st || "(sem situação)").sort((a, b) => ordemSit(a.k) - ordemSit(b.k) || b.n - a.n);
    const unidades = Array.from(new Set(rows.map(x => x.un).filter(Boolean))).join(", ") || "—";
    const ds = rows.map(x => x.dt).filter(Boolean).sort();
    const ultimas = rows.slice().sort((a, b) => (b.dt + b.hr).localeCompare(a.dt + a.hr));
    const periodoTxt = (dataOk(F.de) || dataOk(F.ate)) ? `${F.de ? fData(F.de) : "início"} a ${F.ate ? fData(F.ate) : "hoje"}` : "todo o período importado";
    el.innerHTML = `<div class="cq-dr-bg" data-cqclose></div>
      <aside class="cq-dr" role="dialog" aria-label="Ficha de ${esc(us)}">
        <div class="cq-dr-h">
          <div><div class="cq-dr-eq" style="background:${EQ_COR[eq]}">${EQ_LONGO[eq]}</div><h3>${esc(us)}</h3>
            <div class="cq-dr-s">Unidade(s): ${esc(unidades)} · ${ds.length ? `${fData(ds[0])} a ${fData(ds[ds.length - 1])}` : "sem cotações"} · filtros aplicados: ${periodoTxt}</div></div>
          <button type="button" class="cq-dr-x" data-cqclose title="Fechar (Esc)">✕</button>
        </div>
        <div class="cq-dr-b">
          ${!rows.length ? `<div class="cq-vazio cq-vazio-grande">Este usuário não tem cotações com os filtros atuais (os filtros de período, unidade, situação e tipo de frete valem aqui).</div>` : `
          <div class="cq-dr-kpis">
            ${kpi("Cotações", int(R.n), `${dec1(porDiaAtivo(R))} por dia · ${R.dias.size} dias`, serieContinua(rows, "n"), VERDE)}
            ${kpi("Frete cotado", brlK(R.frete), `ticket ${ticket(R) == null ? "—" : brl(ticket(R))}`, serieContinua(rows, "frete"), VERDE)}
            ${kpi("Conversão", fPct(taxaQtd(R)), `${int(R.conv)} de ${int(baseQtd(R))} · valor ${fPct(taxaVal(R))}`, null, null, "cq-k-ok")}
            ${kpi("Frete emitido (CTRC)", brlK(R.fEmit), `${int(R.conv)} CTRCs emitidos`, serieContinua(rows, "fConv"), VERDE, "cq-k-ok")}
            ${kpi("Em aberto", brlK(R.fAberta), `${int(R.aberta)} · COTADO ${int(R.cotado)} / COT FIXO ${int(R.fixo)}`, null, null, "cq-k-az")}
            ${kpi("Tempo p/ converter", tempoConv(R) == null ? "—" : dec1(tempoConv(R)) + " d", "cotação → emissão", null, null)}
          </div>
          <div class="cq-dr-sec"><div class="cq-sub-t">Comparação (mesmos filtros, sem este usuário na equipe)</div>
            <div class="cq-cmps">
              ${comparaLinha("Conversão %", taxaQtd(R), taxaQtd(RE), taxaQtd(RG), fPct, true)}
              ${comparaLinha("Ticket médio", ticket(R), ticket(RE), ticket(RG), brl, true)}
              ${comparaLinha("Cotações por dia", porDiaAtivo(R), porDiaAtivo(RE), porDiaAtivo(RG), dec1, true)}
              ${comparaLinha("Tempo p/ converter (dias)", tempoConv(R), tempoConv(RE), tempoConv(RG), dec1, false)}
            </div></div>
          <div class="cq-dr-sec cq-dr-2"><div><div class="cq-sub-t">Situação</div>${donut(sit.map((x, i) => ({cor:corSit(x.k, i), v:x.n, rot:x.k})), R.n, {a:fPct(taxaQtd(R)), b:"conversão"})}
              <div class="cq-leg">${sit.map((x, i) => `<span><i style="background:${corSit(x.k, i)}"></i>${esc(x.k)} ${int(x.n)}</span>`).join("")}</div></div>
            <div><div class="cq-sub-t">Quando cota</div>${heatmap(rows)}</div></div>
          <div class="cq-dr-sec"><div class="cq-sub-t">Evolução diária</div>${graficoDias(rows, "n")}</div>
          <div class="cq-dr-sec"><div class="cq-sub-t">Maiores clientes</div>${rankLista(agrupar(rows, x => x.pg), "Cliente", 6)}</div>
          <div class="cq-dr-sec"><div class="cq-sub-t">Destinos (UF)</div>${rankLista(agrupar(rows, x => ufDe(x.de) || "—"), "UF", 6)}</div>
          <div class="cq-dr-sec"><div class="cq-sub-t">Cotações de ${esc(us)} <small>(${int(ultimas.length)}${ultimas.length > 100 ? " — mostrando as 100 mais recentes" : ""})</small></div>
            <div class="table-wrap">${tabelaDetalhe(ultimas, 100, true)}</div></div>`}
        </div>
        <div class="cq-dr-f">
          <button type="button" class="btn btn-primary btn-sm" data-cqsolo="${esc(us)}">Filtrar só este usuário</button>
          <button type="button" class="btn btn-ghost btn-sm" data-cqmais="${esc(us)}">${F.sel.usuarios.has(us) ? "Tirar do filtro" : "Adicionar ao filtro"}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-cqexpus="${esc(us)}">Exportar cotações (CSV)</button>
        </div>
      </aside>`;
    el.classList.add("on");
    document.body.classList.add("cq-noscroll");
    if(!manter){ const b = el.querySelector(".cq-dr-b"); if(b) b.scrollTop = 0; }
  }
  function fecharPerfil(){
    perfilAberto = null;
    const el = document.getElementById("cqDrawer");
    if(el) el.remove();
    document.body.classList.remove("cq-noscroll");
  }

  /* ---------------- eventos ---------------- */
  async function lerArquivos(files, sis){
    if(!files || !files.length){ msg = {ok:false, t:"Escolha um arquivo primeiro."}; renderizar(); return; }
    let ultima = null, houveErro = false;
    for(const f of files){
      try{
        const ok = importarTexto(decodificar(await f.arrayBuffer()), f.name, sis);
        if(!ok) houveErro = true;
        ultima = msg;
        if(!ok) break;
      }catch(e){ msg = {ok:false, t:"Não consegui ler " + f.name + "."}; houveErro = true; break; }
    }
    if(files.length > 1 && !houveErro && ultima) msg = {ok:true, t:`${files.length} arquivos importados. Último: ` + ultima.t};
    renderizar();
  }

  function ligarImportar(){
    const raiz = document.getElementById("cqRoot");
    raiz.querySelectorAll("[data-cqimp]").forEach(b => b.onclick = () => lerArquivos(raiz.querySelector("#cqArq_" + b.dataset.cqimp).files, b.dataset.cqimp));
    raiz.querySelectorAll("[data-cqlimpsis]").forEach(b => b.onclick = () => {
      const v = b.dataset.cqlimpsis;
      if(!confirm("Apagar as cotações de " + v + " (" + SIS_NOME[v] + ") salvas neste navegador?")) return;
      Object.keys(D.rows).forEach(k => { if(sisDe(D.rows[k]) === v) delete D.rows[k]; });
      gravar(); msg = {ok:true, t:"Cotações de " + v + " apagadas."}; renderizar();
    });
    raiz.querySelector("#cqColarT").onclick = () => { const c = raiz.querySelector("#cqColar"); c.style.display = c.style.display === "none" ? "block" : "none"; };
    raiz.querySelector("#cqTxtBtn").onclick = () => {
      const t = raiz.querySelector("#cqTxt").value;
      if(!t.trim()){ msg = {ok:false, t:"Cole o texto primeiro."}; renderizar(); return; }
      importarTexto(t, "texto colado", raiz.querySelector("#cqTxtSis").value); renderizar();
    };
    raiz.querySelector("#cqLimpar").onclick = () => {
      if(!confirm("Apagar TODAS as cotações salvas neste navegador? (as equipes são mantidas)")) return;
      D.rows = {}; D.imports = []; gravar(); msg = {ok:true, t:"Cotações apagadas."}; MS.forEach(k => F.sel[k].clear()); renderizar();
    };
    const lista = v => v.split(/[,;\n]/).map(s => s.trim().toLowerCase()).filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
    raiz.querySelector("#cqEqMtz").onchange = e => { D.equipes.mtz = lista(e.target.value); D.equipes.filial = D.equipes.filial.filter(u => D.equipes.mtz.indexOf(u) < 0); gravar(); renderizar("tudo"); };
    raiz.querySelector("#cqEqFil").onchange = e => { D.equipes.filial = lista(e.target.value); D.equipes.mtz = D.equipes.mtz.filter(u => D.equipes.filial.indexOf(u) < 0); gravar(); renderizar("tudo"); };
  }

  function atualizarMs(k){
    const raiz = document.getElementById("cqRoot");
    const ms = raiz.querySelector(`.cq-ms[data-ms="${k}"]`); if(!ms) return;
    ms.classList.toggle("on", F.sel[k].size > 0);
    ms.querySelector(".cq-ms-v").textContent = msLabel(k);
    ms.querySelectorAll("input[data-msv]").forEach(i => { i.checked = F.sel[k].has(i.dataset.msv); });
  }
  const mudou = () => { renderizar("conteudo"); };
  function setPeriodo(p){
    const ds = todas().map(x => x.dt).filter(Boolean).sort();
    if(!ds.length) return;
    const fim = ds[ds.length - 1];
    if(p === "tudo"){ F.de = ""; F.ate = ""; }
    else if(p === "hoje"){ F.de = fim; F.ate = fim; }
    else if(p === "7"){ F.de = somaDias(fim, -6); F.ate = fim; }
    else if(p === "mes"){ F.de = fim.slice(0, 8) + "01"; F.ate = fim; }
    const raiz = document.getElementById("cqRoot");
    raiz.querySelector("#cqDe").value = F.de; raiz.querySelector("#cqAte").value = F.ate;
    mudou();
  }
  function limparFiltros(){
    F.de = ""; F.ate = ""; F.leitura = "todas"; F.base = false; F.busca = ""; MS.forEach(k => F.sel[k].clear());
    renderizar("filtros");
  }

  let RAIZ = null, ligado = false;
  function ligarGlobal(r){
    RAIZ = r;
    if(ligado) return;
    ligado = true;
    const raizAtual = () => RAIZ && document.body.contains(RAIZ) ? RAIZ : (RAIZ = document.getElementById("cqRoot"));
    document.addEventListener("click", e => {
      const raiz = raizAtual(); if(!raiz) return;
      const dr = e.target.closest("#cqDrawer");
      if(dr){
        if(e.target.closest("[data-cqclose]")) return fecharPerfil();
        const solo = e.target.closest("[data-cqsolo]");
        if(solo){ F.sel.usuarios.clear(); F.sel.usuarios.add(solo.dataset.cqsolo); const u = solo.dataset.cqsolo; fecharPerfil(); renderizar("filtros"); return; }
        const mais = e.target.closest("[data-cqmais]");
        if(mais){ const u = mais.dataset.cqmais; if(F.sel.usuarios.has(u)) F.sel.usuarios.delete(u); else F.sel.usuarios.add(u); renderizar("filtros"); return; }
        const ex = e.target.closest("[data-cqexpus]");
        if(ex){ exportarDetalhe(filtradas(true).filter(x => x.us === ex.dataset.cqexpus), ex.dataset.cqexpus); return; }
        return;
      }
      if(!raiz.contains(e.target)){
        raiz.querySelectorAll(".cq-ms.open").forEach(m => { m.classList.remove("open"); m.querySelector(".cq-ms-m").hidden = true; });
        return;
      }
      // menus multi-seleção
      const mb = e.target.closest(".cq-ms-b");
      const abertos = raiz.querySelectorAll(".cq-ms.open");
      if(mb){
        const ms = mb.parentElement, estava = ms.classList.contains("open");
        abertos.forEach(m => { m.classList.remove("open"); m.querySelector(".cq-ms-m").hidden = true; });
        if(!estava){ ms.classList.add("open"); const m = ms.querySelector(".cq-ms-m"); m.hidden = false; const q = m.querySelector(".cq-ms-q"); if(q) q.focus(); }
        return;
      }
      const act = e.target.closest("[data-msact]");
      if(act){
        const k = act.closest(".cq-ms").dataset.ms, a = act.dataset.msact, s = F.sel[k];
        if(a === "limpar") s.clear();
        else if(a === "todos") opcoes(k).forEach(o => s.add(o.v));
        else if(a === "mtz" || a === "filial"){ D.equipes[a].forEach(u => s.add(u)); }
        atualizarMs(k); mudou(); return;
      }
      if(!e.target.closest(".cq-ms")) abertos.forEach(m => { m.classList.remove("open"); m.querySelector(".cq-ms-m").hidden = true; });
      // segmentados
      const per = e.target.closest("[data-per]"); if(per) return setPeriodo(per.dataset.per);
      const lei = e.target.closest("[data-lei]"); if(lei){ F.leitura = lei.dataset.lei; mudou(); return; }
      const met = e.target.closest("[data-met]"); if(met){ F.metrica = met.dataset.met; mudou(); return; }
      const ord = e.target.closest("[data-cqord]"); if(ord){ const k = ord.dataset.cqord; if(S.ordem === k) S.dir = -S.dir; else { S.ordem = k; S.dir = k === "us" ? 1 : -1; } mudou(); return; }
      // caixinha de usuário na tabela
      const chk = e.target.closest("[data-cqchk]");
      if(chk){
        const u = chk.dataset.cqchk;
        if(chk.checked) F.sel.usuarios.add(u); else F.sel.usuarios.delete(u);
        atualizarMs("usuarios"); pintarSeg();
        chk.closest("tr").classList.toggle("cq-sel", chk.checked);
        e.stopPropagation(); return;
      }
      const pd = e.target.closest("[data-cqpd]");
      if(pd){ if(pd.dataset.cqpd === "csv") exportarPorDia(); else copiarPorDia(pd); return; }
      const tp = e.target.closest("[data-cqtop]"); if(tp){ F.topModo = tp.dataset.cqtop; mudou(); return; }
      // abrir ficha
      const us = e.target.closest("[data-cqus]");
      if(us){ e.preventDefault(); abrirPerfil(us.dataset.cqus); return; }
      if(e.target.id === "cqLimpaF") return limparFiltros();
      if(e.target.id === "cqExpUsr") return exportarResumo();
      if(e.target.id === "cqExpXls"){ const b = e.target; b.disabled = true; exportarExcel().catch(err => alert("Não consegui gerar o Excel: " + err.message)).then(() => { b.disabled = false; }); return; }
      if(e.target.id === "cqExpPdf"){ try{ exportarPdf(); }catch(err){ alert("Não consegui gerar o PDF: " + err.message); } return; }
      if(e.target.id === "cqExpDet") return exportarDetalhe(linhasDetalhe(), "");
    });
    document.addEventListener("change", e => {
      const raiz = raizAtual(); if(!raiz || !raiz.contains(e.target)) return;
      const t = e.target;
      if(t.dataset && t.dataset.msv !== undefined){
        const k = t.closest(".cq-ms").dataset.ms;
        if(t.checked) F.sel[k].add(t.dataset.msv); else F.sel[k].delete(t.dataset.msv);
        atualizarMs(k); mudou(); return;
      }
      if(t.id === "cqDe"){ F.de = dataOk(t.value) ? t.value : ""; mudou(); }
      else if(t.id === "cqAte"){ F.ate = dataOk(t.value) ? t.value : ""; mudou(); }
      else if(t.id === "cqBase"){ F.base = t.checked; mudou(); }
    });
    document.addEventListener("input", e => {
      const raiz = raizAtual(); if(!raiz || !raiz.contains(e.target)) return;
      const t = e.target;
      if(t.id === "cqBusca"){ F.busca = t.value; pintarDetalhe(); }
      else if(t.classList.contains("cq-ms-q")){
        const q = semAcento(t.value).toLowerCase().trim();
        t.closest(".cq-ms-m").querySelectorAll(".cq-ms-op").forEach(l => { l.style.display = !q || l.dataset.t.indexOf(q) >= 0 ? "" : "none"; });
      }
    });
    document.addEventListener("keydown", e => { if(e.key === "Escape" && perfilAberto) fecharPerfil(); });
  }

  /* ---------------- exportação (CSV com BOM, separador ;) ---------------- */
  function baixarCSV(nome, linhas){
    const csv = "﻿" + linhas.map(l => l.map(c => {
      const s = String(c == null ? "" : c);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"}));
    a.download = nome;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const hoje = () => (typeof dataParaArquivo === "function") ? dataParaArquivo() : new Date().toISOString().slice(0, 10);
  const dec = v => (v || 0).toFixed(2).replace(".", ",");
  const num1 = v => v == null ? "" : v.toFixed(1).replace(".", ",");
  function exportarResumo(){
    const rows = filtradas(), us = usuariosAgr(rows).sort((a, b) => b.n - a.n);
    const L = [["Equipe", "Usuário", "Cotações", "Cotações por dia", "Frete cotado", "Ticket médio", "Convertidas (CTRC EMI)", "Conversão % (qtd)", "Conversão % (valor)", "Frete convertido (proposta)", "Frete emitido (CTRC)", "COTADO", "COT FIXO", "Em aberto (R$)", "Outras", "Tempo p/ converter (dias)"]];
    const lin = (eq, nome, a) => L.push([eq, nome, a.n, num1(porDiaAtivo(a)), dec(a.frete), dec(a.n ? a.frete / a.n : 0), a.conv, num1(taxaQtd(a)), num1(taxaVal(a)), dec(a.fConv), dec(a.fEmit), a.cotado, a.fixo, dec(a.fAberta), a.outra, num1(tempoConv(a))]);
    us.forEach(u => lin(EQ_NOME[u.eq], u.us, u));
    lin("", "TOTAL", resumo(rows));
    baixarCSV(`Comercial_Cotacoes_Resumo_${hoje()}.csv`, L);
  }
  function exportarDetalhe(rows, quem){
    const L = [["Sistema", "Cotação", "Data", "Hora", "Usuário", "Equipe", "Unidade", "Pagador", "Origem", "Destino", "Tipo frete", "Valor NF", "Peso", "Proposta inicial", "Proposta atual", "Situação", "Leitura", "CTRC", "Emissão CTRC", "Frete CTRC"]];
    rows.forEach(x => L.push([sisDe(x), x.id, fData(x.dt), x.hr, x.us, EQ_NOME[equipeDe(x.us)], x.un, x.pg, x.or, x.de, x.tf || "", dec(x.nf), dec(x.ps), dec(x.pi), dec(x.pa), x.st, LEITURA_ROT[classe(x.st)], x.ct, fData(x.em), dec(x.fc)]));
    baixarCSV(`Comercial_Cotacoes_${quem ? quem + "_" : "Detalhe_"}${hoje()}.csv`, L);
  }


  /* ---------------- exportação Excel (.xlsx) e PDF ---------------- */
  const semNbsp = t => String(t == null ? "" : t).replace(/[  ]/g, " ");
  const nomeArquivo = (pre, ext) => `${pre}_${hoje()}.${ext}`;

  function descricaoFiltros(){
    const p = [];
    if(dataOk(F.de) || dataOk(F.ate)) p.push(`Período: ${F.de ? fData(F.de) : "início"} a ${F.ate ? fData(F.ate) : "fim"}`);
    else p.push("Período: todo o importado");
    MS.forEach(k => { if(F.sel[k].size) p.push(`${MS_ROT[k]}: ${msLabelCompleto(k)}`); });
    if(F.leitura !== "todas") p.push("Leitura: " + ({conv:"convertidas", aberta:"não convertidas", outra:"outras"}[F.leitura]));
    p.push(F.base ? "Conversão: todas as situações na base" : "Conversão: CTRC EMI ÷ (CTRC EMI + COTADO + COT FIXO)");
    return p.join("  |  ");
  }
  function msLabelCompleto(k){ return [...F.sel[k]].map(v => k === "equipes" ? EQ_NOME[v] : v).join(", "); }

  function kpisLista(R){
    return [
      ["Cotações feitas", R.n, "int"], ["Frete cotado (proposta atual)", R.frete, "brl"], ["Convertidas (CTRC EMI)", R.conv, "int"],
      ["Conversão (qtd)", taxaQtd(R), "pct"], ["Conversão (valor)", taxaVal(R), "pct"], ["Frete convertido (proposta)", R.fConv, "brl"],
      ["Frete emitido (CTRC)", R.fEmit, "brl"], ["Não convertidas (COTADO + COT FIXO)", R.aberta, "int"], ["Frete em aberto", R.fAberta, "brl"],
      ["Outras situações", R.outra, "int"], ["Frete outras situações", R.fOutra, "brl"], ["Ticket médio", ticket(R), "brl"],
      ["Cotações por dia (dias com cotação)", porDiaAtivo(R), "dec"], ["Tempo médio para converter (dias)", tempoConv(R), "dec"]
    ];
  }

  async function exportarExcel(){
    if(typeof ExcelJS === "undefined"){ alert("A biblioteca de Excel (ExcelJS) não carregou. Confira a internet e recarregue a página."); return; }
    const rows = filtradas();
    if(!rows.length){ alert("Não há cotações nos filtros atuais."); return; }
    const R = resumo(rows), us = usuariosAgr(rows).sort((a, b) => b.n - a.n);
    const wb = new ExcelJS.Workbook();
    wb.creator = "Painel Do Valle"; wb.created = new Date();
    const FMT = {int:"#,##0", brl:'"R$" #,##0.00', pct:"0.0%", dec:"#,##0.0"};
    const FONTE = "Arial";
    const cab = row => { row.height = 30; row.eachCell(c => {
      c.font = {name:FONTE, bold:true, color:{argb:"FFFFFFFF"}, size:10};
      c.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF131813"}};
      c.alignment = {horizontal:"center", vertical:"middle", wrapText:true};
      c.border = {bottom:{style:"medium", color:{argb:"FF4F9D2D"}}};
    }); };
    const titulo = (ws, txt, sub, ncol) => {
      ws.mergeCells(1, 1, 1, Math.max(ncol, 2)); ws.getCell(1, 1).value = txt;
      ws.getCell(1, 1).font = {name:FONTE, bold:true, size:15, color:{argb:"FF131813"}};
      ws.mergeCells(2, 1, 2, Math.max(ncol, 2)); ws.getCell(2, 1).value = sub;
      ws.getCell(2, 1).font = {name:FONTE, size:9, italic:true, color:{argb:"FF667360"}};
      ws.getCell(2, 1).alignment = {wrapText:true, vertical:"top"}; ws.getRow(2).height = 38;
    };
    const sub = descricaoFiltros() + `\nGerado em ${new Date().toLocaleString("pt-BR")}`;
    const pctF = v => v == null ? null : v / 100;

    /* --- Resumo --- */
    let ws = wb.addWorksheet("Resumo", {views:[{showGridLines:false}]});
    titulo(ws, "Comercial · Cotações — Resumo", sub, 6);
    [44, 20, 16, 18, 14, 20].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    cab(ws.addRow(["Indicador", "Valor"]));
    kpisLista(R).forEach(k => {
      const row = ws.addRow([k[0], k[2] === "pct" ? pctF(k[1]) : k[1]]);
      row.getCell(2).numFmt = FMT[k[2]]; row.getCell(2).alignment = {horizontal:"right"};
      row.eachCell(c => { c.font = {name:FONTE, size:10, bold:c.col === 2}; c.border = {bottom:{style:"hair", color:{argb:"FFC9D2C4"}}}; });
    });
    const grupoTab = (titulo_, linhas) => {
      if(!linhas.length) return;
      ws.addRow([]);
      const h = ws.addRow([titulo_, "Cotações", "Frete cotado", "Convertidas", "Conversão (qtd)", "Frete emitido"]); cab(h);
      linhas.forEach(l => {
        const row = ws.addRow([l.nome, l.a.n, l.a.frete, l.a.conv, pctF(taxaQtd(l.a)), l.a.fEmit]);
        row.getCell(2).numFmt = FMT.int; row.getCell(3).numFmt = FMT.brl; row.getCell(4).numFmt = FMT.int; row.getCell(5).numFmt = FMT.pct; row.getCell(6).numFmt = FMT.brl;
        row.eachCell(c => { c.font = {name:FONTE, size:10}; c.border = {bottom:{style:"hair", color:{argb:"FFC9D2C4"}}}; });
      });
    };
    grupoTab("Equipe", EQUIPES.map(e => ({nome:EQ_LONGO[e], a:resumo(rows.filter(x => equipeDe(x.us) === e))})).filter(l => l.a.n));
    grupoTab("Sistema", SIS.map(v => ({nome:`${v} — ${SIS_NOME[v]}`, a:resumo(rows.filter(x => sisDe(x) === v))})).filter(l => l.a.n));
    grupoTab("Situação", agrupar(rows, x => x.st || "(sem situação)").sort((a, b) => ordemSit(a.k) - ordemSit(b.k) || b.n - a.n).map(a => ({nome:a.k, a})));

    /* --- Por usuário --- */
    ws = wb.addWorksheet("Por usuário", {views:[{state:"frozen", xSplit:2, ySplit:4}]});
    const cabU = ["#", "Usuário", "Equipe", "Cotações", "Dias com cotação", "Cotações por dia", "Frete cotado", "Ticket médio", "Convertidas", "Conversão % (qtd)", "Conversão % (valor)", "Frete convertido (proposta)", "Frete emitido (CTRC)", "COTADO", "COT FIXO", "Em aberto (R$)", "Outras", "Tempo p/ converter (dias)"];
    titulo(ws, "Produtividade e conversão por usuário", sub, cabU.length);
    ws.addRow([]);
    cab(ws.addRow(cabU));
    const fmtU = [null, null, null, FMT.int, FMT.int, FMT.dec, FMT.brl, FMT.brl, FMT.int, FMT.pct, FMT.pct, FMT.brl, FMT.brl, FMT.int, FMT.int, FMT.brl, FMT.int, FMT.dec];
    const linhaU = (i, nome, eq, a) => [i, nome, eq, a.n, a.dias.size, porDiaAtivo(a), a.frete, ticket(a), a.conv, pctF(taxaQtd(a)), pctF(taxaVal(a)), a.fConv, a.fEmit, a.cotado, a.fixo, a.fAberta, a.outra, tempoConv(a)];
    us.forEach((u, i) => { const row = ws.addRow(linhaU(i + 1, u.us, EQ_NOME[u.eq], u)); row.eachCell((c, n) => { c.font = {name:FONTE, size:10}; if(fmtU[n - 1]) c.numFmt = fmtU[n - 1]; c.border = {bottom:{style:"hair", color:{argb:"FFC9D2C4"}}}; }); });
    const tot = ws.addRow(linhaU("", "TOTAL", "", R));
    tot.eachCell((c, n) => { c.font = {name:FONTE, size:10, bold:true, color:{argb:"FFFFFFFF"}}; c.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF2D6A17"}}; if(fmtU[n - 1]) c.numFmt = fmtU[n - 1]; });
    [5, 16, 10, 11, 11, 11, 15, 14, 12, 13, 13, 17, 17, 10, 10, 15, 9, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const ult = 4 + us.length;
    if(us.length > 1){
      ws.addConditionalFormatting({ref:`D5:D${ult}`, rules:[{type:"colorScale", cfvo:[{type:"min"}, {type:"max"}], color:[{argb:"FFFFFFFF"}, {argb:"FF8FB7E0"}]}]});
      ws.addConditionalFormatting({ref:`J5:J${ult}`, rules:[{type:"colorScale", cfvo:[{type:"min"}, {type:"max"}], color:[{argb:"FFFFFFFF"}, {argb:"FF8FD16A"}]}]});
    }
    ws.autoFilter = {from:{row:4, column:1}, to:{row:4, column:cabU.length}};

    /* --- Por dia --- */
    const M = matrizDia(rows);
    if(M.dias.length){
      ws = wb.addWorksheet("Cotações por dia", {views:[{state:"frozen", xSplit:1, ySplit:4}]});
      const nc = M.dias.length + 5;
      titulo(ws, "Cotações feitas por dia — por usuário", sub, nc);
      ws.addRow([]);
      cab(ws.addRow(["Usuário"].concat(M.dias.map(d => fDia(d) + "\n" + dowDe(d)), ["Total", "Dias com cotação", "Média/dia", "Melhor dia (qtd)", "Melhor dia"])));
      M.us.forEach(u => {
        const row = ws.addRow([u.us].concat(u.vals.map(v => v || null), [u.tot, u.at, u.media, u.best || null, u.bd ? fData(u.bd) : ""]));
        row.eachCell((c, n) => { c.font = {name:FONTE, size:10, bold:n === 1 || n === M.dias.length + 2}; if(n > 1 && n <= M.dias.length + 1) c.alignment = {horizontal:"center"}; c.border = {bottom:{style:"hair", color:{argb:"FFC9D2C4"}}}; });
        row.getCell(M.dias.length + 4).numFmt = FMT.dec;
      });
      const tdia = M.dias.map((d, i) => M.us.reduce((a, u) => a + u.vals[i], 0));
      const t2 = ws.addRow(["TOTAL DO DIA"].concat(tdia, [tdia.reduce((a, b) => a + b, 0), M.dias.length, tdia.reduce((a, b) => a + b, 0) / M.dias.length, "", ""]));
      t2.eachCell((c, n) => { c.font = {name:FONTE, size:10, bold:true, color:{argb:"FFFFFFFF"}}; c.fill = {type:"pattern", pattern:"solid", fgColor:{argb:"FF2D6A17"}}; if(n > 1 && n <= M.dias.length + 1) c.alignment = {horizontal:"center"}; });
      t2.getCell(M.dias.length + 4).numFmt = FMT.dec;
      ws.getColumn(1).width = 16;
      for(let i = 0; i < M.dias.length; i++) ws.getColumn(i + 2).width = 7.5;
      [10, 12, 11, 12, 12].forEach((w, i) => { ws.getColumn(M.dias.length + 2 + i).width = w; });
      const colL = n => { let t = ""; while(n > 0){ const m = (n - 1) % 26; t = String.fromCharCode(65 + m) + t; n = Math.floor((n - 1) / 26); } return t; };
      if(M.us.length){ ws.addConditionalFormatting({ref:`B5:${colL(M.dias.length + 1)}${4 + M.us.length}`, rules:[{type:"colorScale", cfvo:[{type:"min"}, {type:"max"}], color:[{argb:"FFE8F4E1"}, {argb:"FF3B8A1F"}]}]}); }
    }

    /* --- Maiores cotações --- */
    ws = wb.addWorksheet("Maiores cotações", {views:[{state:"frozen", ySplit:4}]});
    const cabM = ["#", "Cotação", "Sistema", "Data", "Usuário", "Pagador", "Origem", "Destino", "Proposta atual", "Situação", "Leitura", "CTRC"];
    titulo(ws, "As 30 maiores cotações", sub, cabM.length);
    ws.addRow([]); cab(ws.addRow(cabM));
    rows.slice().sort((a, b) => b.pa - a.pa).slice(0, 30).forEach((x, i) => {
      const row = ws.addRow([i + 1, x.id, sisDe(x), fData(x.dt), x.us, x.pg, x.or, x.de, x.pa, x.st, LEITURA_ROT[classe(x.st)], x.ct]);
      row.getCell(9).numFmt = FMT.brl;
      row.eachCell(c => { c.font = {name:FONTE, size:10}; c.border = {bottom:{style:"hair", color:{argb:"FFC9D2C4"}}}; });
      const cor = {conv:"FFE9F5E3", aberta:"FFE4EFF9", outra:"FFECEEEA"}[classe(x.st)];
      row.getCell(10).fill = {type:"pattern", pattern:"solid", fgColor:{argb:cor}};
    });
    [5, 11, 9, 11, 13, 38, 24, 24, 16, 12, 15, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    /* --- Detalhe --- */
    ws = wb.addWorksheet("Detalhe", {views:[{state:"frozen", ySplit:4}]});
    const cabD = ["Sistema", "Cotação", "Data", "Hora", "Usuário", "Equipe", "Unidade", "Pagador", "Origem", "Destino", "Tipo frete", "Valor NF", "Peso", "Proposta inicial", "Proposta atual", "Situação", "Leitura", "CTRC", "Emissão CTRC", "Frete CTRC"];
    titulo(ws, "Cotações — detalhe", sub, cabD.length);
    ws.addRow([]); cab(ws.addRow(cabD));
    rows.slice().sort((a, b) => (b.dt + b.hr).localeCompare(a.dt + a.hr)).forEach(x => {
      const row = ws.addRow([sisDe(x), +x.id || x.id, fData(x.dt), x.hr, x.us, EQ_NOME[equipeDe(x.us)], x.un, x.pg, x.or, x.de, x.tf || "", x.nf, x.ps, x.pi, x.pa, x.st, LEITURA_ROT[classe(x.st)], x.ct, fData(x.em), x.fc]);
      [12, 14, 15, 20].forEach(c => { row.getCell(c).numFmt = FMT.brl; }); row.getCell(13).numFmt = FMT.dec;
    });
    [9, 10, 11, 7, 12, 10, 8, 36, 24, 24, 9, 14, 10, 14, 14, 11, 15, 14, 12, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    ws.autoFilter = {from:{row:4, column:1}, to:{row:4, column:cabD.length}};

    const buf = await wb.xlsx.writeBuffer();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    a.download = nomeArquivo("Comercial_Cotacoes", "xlsx");
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  function exportarPdf(){
    const J = window.jspdf && window.jspdf.jsPDF;
    if(!J){ alert("A biblioteca de PDF (jsPDF) não carregou. Confira a internet e recarregue a página."); return; }
    const rows = filtradas();
    if(!rows.length){ alert("Não há cotações nos filtros atuais."); return; }
    const doc = new J({orientation:"landscape", unit:"mm", format:"a4"});
    if(typeof doc.autoTable !== "function"){ alert("A biblioteca de tabelas do PDF (autoTable) não carregou. Recarregue a página."); return; }
    const W = 297, H = 210, M = 10;
    const R = resumo(rows), us = usuariosAgr(rows).sort((a, b) => b.n - a.n);
    const verde = [79, 157, 45], grafite = [19, 24, 19];
    const txt = semNbsp;
    // cabeçalho
    doc.setFillColor.apply(doc, grafite); doc.rect(0, 0, W, 22, "F");
    doc.setFillColor.apply(doc, verde); doc.rect(0, 0, 3, 22, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text("Comercial - Cotações", M + 2, 11);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(185, 199, 178);
    doc.text(txt(`Rede Do Valle / Real Vale  ·  gerado em ${new Date().toLocaleString("pt-BR")}`), M + 2, 17.5);
    doc.setTextColor(60); doc.setFontSize(7.5);
    const filt = doc.splitTextToSize(txt(descricaoFiltros()), W - 2 * M);
    doc.text(filt, M, 28);
    let y = 28 + filt.length * 3.4 + 2;
    // cartões de KPI
    const cards = [
      ["COTAÇÕES", int(R.n), "por dia: " + dec1(porDiaAtivo(R))], ["FRETE COTADO", brl(R.frete), "ticket médio " + (ticket(R) == null ? "-" : brl(ticket(R)))],
      ["CONVERTIDAS (CTRC EMI)", int(R.conv), brl(R.fConv) + " em proposta"], ["CONVERSÃO", fPct(taxaQtd(R)), "em valor: " + fPct(taxaVal(R))],
      ["FRETE EMITIDO (CTRC)", brl(R.fEmit), int(R.conv) + " CTRCs"], ["EM ABERTO", brl(R.fAberta), int(R.aberta) + " cotações (COTADO " + int(R.cotado) + " / COT FIXO " + int(R.fixo) + ")"],
      ["TEMPO P/ CONVERTER", tempoConv(R) == null ? "-" : dec1(tempoConv(R)) + " dias", "cotação até emissão"], ["OUTRAS SITUAÇÕES", int(R.outra), brl(R.fOutra) + (F.base ? " (na base)" : " (fora da taxa)")]
    ];
    const cw = (W - 2 * M - 3 * 4) / 4, ch = 19;
    cards.forEach((c, i) => {
      const x = M + (i % 4) * (cw + 4), yy = y + Math.floor(i / 4) * (ch + 3);
      doc.setFillColor(244, 247, 241); doc.roundedRect(x, yy, cw, ch, 1.5, 1.5, "F");
      doc.setFillColor.apply(doc, i === 3 ? verde : (i === 5 ? [47, 120, 184] : verde)); doc.rect(x, yy, 1.6, ch, "F");
      doc.setTextColor(102, 115, 96); doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.text(txt(c[0]), x + 4, yy + 5);
      doc.setTextColor(27, 35, 25); doc.setFontSize(13); doc.text(txt(c[1]), x + 4, yy + 12);
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(102, 115, 96); doc.text(doc.splitTextToSize(txt(c[2]), cw - 6).slice(0, 1), x + 4, yy + 16.5);
    });
    y += 2 * (ch + 3) + 2;

    const estiloCab = {fillColor:grafite, textColor:255, fontStyle:"bold", halign:"center", valign:"middle", fontSize:7};
    const secao = (titulo_, yy) => { doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(19, 24, 19); doc.text(txt(titulo_), M, yy); };
    const novoY = () => doc.lastAutoTable.finalY + 8;
    // começa a seção na mesma página se couber; senão abre uma página nova. Devolve o Y do título.
    const abrirSecao = alt => { const yy = doc.lastAutoTable.finalY + 10; if(yy + alt > H - 14){ doc.addPage(); return 14; } return yy; };

    // por usuário
    secao("Produtividade e conversão por usuário", y + 1);
    const linhaU = (i, nome, eq, a) => [i, nome, eq, int(a.n), dec1(porDiaAtivo(a)), brl(a.frete), a.n ? brl(a.frete / a.n) : "-", int(a.conv), fPct(taxaQtd(a)), brl(a.fEmit), brl(a.fAberta), tempoConv(a) == null ? "-" : dec1(tempoConv(a))];
    const corpoU = us.map((u, i) => linhaU(i + 1, u.us, EQ_NOME[u.eq], u).map(txt));
    corpoU.push(linhaU("", "TOTAL", "", R).map(txt));
    doc.autoTable({
      startY: y + 3, margin:{left:M, right:M},
      head:[["#", "Usuário", "Equipe", "Cotações", "Por dia", "Frete cotado", "Ticket médio", "Convertidas", "Conversão", "Frete emitido", "Em aberto (R$)", "Dias p/ conv."]],
      body:corpoU, theme:"grid",
      styles:{fontSize:7, cellPadding:1.3, lineColor:[221, 227, 217], lineWidth:.15, textColor:[27, 35, 25]},
      headStyles:estiloCab,
      columnStyles:{0:{halign:"center", cellWidth:8}, 1:{fontStyle:"bold"}, 3:{halign:"right"}, 4:{halign:"right"}, 5:{halign:"right"}, 6:{halign:"right"}, 7:{halign:"right"}, 8:{halign:"right", fontStyle:"bold", textColor:[42, 122, 26]}, 9:{halign:"right", textColor:[42, 122, 26]}, 10:{halign:"right"}, 11:{halign:"right"}},
      alternateRowStyles:{fillColor:[244, 247, 241]},
      didParseCell: d => { if(d.section === "body" && d.row.index === corpoU.length - 1){ d.cell.styles.fillColor = [45, 106, 23]; d.cell.styles.textColor = 255; d.cell.styles.fontStyle = "bold"; } }
    });

    // por dia
    const Md = matrizDia(rows);
    if(Md.dias.length){
      const yD = abrirSecao((Md.us.length + 2) * 6 + 14);
      let dias = Md.dias, ate = "";
      if(dias.length > 28){ dias = dias.slice(-28); ate = " (últimos 28 dias; o Excel traz todos)"; }
      const off = Md.dias.length - dias.length;
      secao("Cotações feitas por dia - por usuário" + ate, yD);
      const maxc = Math.max.apply(null, Md.us.map(u => Math.max.apply(null, u.vals.slice(off))).concat([1]));
      const corpoD = Md.us.map(u => [u.us].concat(u.vals.slice(off).map(v => v || ""), [int(u.tot), dec1(u.media)]).map(txt));
      const tdia = dias.map((d, i) => Md.us.reduce((a, u) => a + u.vals[off + i], 0));
      corpoD.push(["TOTAL"].concat(tdia.map(v => v || ""), [int(tdia.reduce((a, b) => a + b, 0)), ""]));
      const fs = dias.length > 22 ? 5.8 : 6.8;
      doc.autoTable({
        startY: yD + 3, margin:{left:M, right:M},
        head:[["Usuário"].concat(dias.map(d => fDia(d) + "\n" + dowDe(d)), ["Total", "Média"])],
        body:corpoD, theme:"grid",
        styles:{fontSize:fs, cellPadding:1, halign:"center", lineColor:[221, 227, 217], lineWidth:.12, textColor:[27, 35, 25]},
        headStyles:Object.assign({}, estiloCab, {fontSize:fs - .6, cellPadding:.8}),
        columnStyles:{0:{halign:"left", fontStyle:"bold", cellWidth:22}},
        didParseCell: d => {
          if(d.section === "body" && d.row.index === corpoD.length - 1){ d.cell.styles.fillColor = [45, 106, 23]; d.cell.styles.textColor = 255; d.cell.styles.fontStyle = "bold"; return; }
          if(d.section === "body" && d.column.index > 0 && d.column.index <= dias.length){
            const v = +d.cell.raw; if(v){ const a = .15 + .85 * v / maxc; d.cell.styles.fillColor = [Math.round(255 - (255 - 59) * a), Math.round(255 - (255 - 138) * a), Math.round(255 - (255 - 31) * a)]; if(a > .55) d.cell.styles.textColor = 255; d.cell.styles.fontStyle = "bold"; }
          }
          if(d.section === "head" && d.column.index > 0 && d.column.index <= dias.length){ const w = dowDe(dias[d.column.index - 1]); if(w === "Sáb" || w === "Dom") d.cell.styles.fillColor = [74, 87, 74]; }
        }
      });
    }

    // 15 maiores cotações CONVERTIDAS (somente as que têm CTRC emitido)
    const top = rows.filter(x => classe(x.st) === "conv").sort((a, b) => b.pa - a.pa).slice(0, 15);
    if(top.length){
      const yT = abrirSecao(top.length * 6 + 20);
      secao("As 15 maiores cotações convertidas (CTRC emitido)", yT);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(102, 115, 96);
      doc.text(txt(`Somente cotações com CTRC emitido: ${brl(top.reduce((a, x) => a + x.pa, 0))} em proposta e ${brl(top.reduce((a, x) => a + (x.fc > 0 ? x.fc : x.pa), 0))} de frete emitido.`), M, yT + 4.5);
      const corpoT = top.map((x, i) => [i + 1, x.id, fData(x.dt), x.us, x.pg, x.or + " -> " + x.de, brl(x.pa), "CONVERTIDA", x.ct || "-", x.em ? fData(x.em) : "-", brl(x.fc > 0 ? x.fc : x.pa)].map(txt));
      doc.autoTable({
        startY: yT + 7, margin:{left:M, right:M},
        head:[["#", "Cotação", "Data", "Usuário", "Pagador", "Origem -> Destino", "Proposta atual", "Leitura", "CTRC", "Emissão", "Frete emitido"]],
        body:corpoT, theme:"grid",
        styles:{fontSize:6.8, cellPadding:1.2, lineColor:[221, 227, 217], lineWidth:.15, textColor:[27, 35, 25]},
        headStyles:estiloCab, alternateRowStyles:{fillColor:[244, 247, 241]},
        columnStyles:{0:{halign:"center", cellWidth:7}, 6:{halign:"right", fontStyle:"bold"}, 7:{halign:"center", fontStyle:"bold", textColor:[42, 122, 26]}, 9:{halign:"center"}, 10:{halign:"right", fontStyle:"bold", textColor:[42, 122, 26]}}
      });
    }

    // tabela genérica de grupos (equipe, unidade, tipo de frete, cliente)
    const tabelaGrupo = (titulo_, nomeCol, lista, limite, extra) => {
      if(!lista.length) return;
      const alt = (Math.min(lista.length, limite || 99) + 3) * 6 + 12;
      const yy = abrirSecao(alt);
      secao(titulo_, yy);
      const L = lista.slice(0, limite || 99);
      const linha = (nome, a) => [nome, int(a.n), brl(a.frete), int(a.conv), fPct(taxaQtd(a)), fPct(taxaVal(a)), brl(a.fEmit), int(a.aberta), brl(a.fAberta)];
      const corpo = L.map(a => linha(a.k, a).map(txt));
      if(extra !== false) corpo.push(linha("TOTAL", R).map(txt));
      doc.autoTable({
        startY: yy + 3, margin:{left:M, right:M},
        head:[[nomeCol, "Cotações", "Frete cotado", "Convertidas", "Conv. (qtd)", "Conv. (valor)", "Frete emitido", "Não conv.", "Não conv. (R$)"]],
        body:corpo, theme:"grid",
        styles:{fontSize:7, cellPadding:1.3, lineColor:[221, 227, 217], lineWidth:.15, textColor:[27, 35, 25]},
        headStyles:estiloCab, alternateRowStyles:{fillColor:[244, 247, 241]},
        columnStyles:{0:{fontStyle:"bold"}, 1:{halign:"right"}, 2:{halign:"right"}, 3:{halign:"right"}, 4:{halign:"right", fontStyle:"bold", textColor:[42, 122, 26]}, 5:{halign:"right"}, 6:{halign:"right", textColor:[42, 122, 26]}, 7:{halign:"right"}, 8:{halign:"right"}},
        didParseCell: d => { if(extra !== false && d.section === "body" && d.row.index === corpo.length - 1){ d.cell.styles.fillColor = [45, 106, 23]; d.cell.styles.textColor = 255; d.cell.styles.fontStyle = "bold"; } }
      });
    };
    const porFrete = (a, b) => b.fEmit - a.fEmit || b.n - a.n;
    tabelaGrupo("Resultado por equipe", "Equipe", agrupar(rows, x => EQ_NOME[equipeDe(x.us)]).sort((a, b) => b.n - a.n));
    tabelaGrupo("Resultado por tipo de frete", "Tipo de frete", agrupar(rows, x => tfDe(x) === "—" ? "(não informado)" : tfDe(x)).sort((a, b) => b.n - a.n), 8);

    // funil e situação das cotações (mesmo quadro da tela), no final do relatório
    {
      const sit = agrupar(rows, x => x.st || "(sem situação)").sort((a, b) => ordemSit(a.k) - ordemSit(b.k) || b.n - a.n);
      const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
      const yF = abrirSecao(30 + (sit.length + 1) * 6 + 40);
      doc.setFillColor.apply(doc, grafite); doc.rect(M, yF - 4, W - 2 * M, 7, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(255); doc.text("FUNIL E SITUAÇÃO DAS COTAÇÕES", M + 3, yF + .8);
      // rosca
      const cx = M + 28, cy = yF + 33, r1 = 22, r2 = 14;
      const arco = (a0, a1, rr) => { const pts = [], n = Math.max(2, Math.ceil((a1 - a0) / .08)); for(let i = 0; i <= n; i++){ const a = a0 + (a1 - a0) * i / n; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); } return pts; };
      let ang = -Math.PI / 2;
      sit.forEach((x, i) => {
        if(!x.n) return;
        const fim = ang + (x.n / R.n) * 2 * Math.PI;
        const pts = arco(ang, Math.min(fim, ang + 2 * Math.PI - 1e-6), r1).concat(arco(ang, Math.min(fim, ang + 2 * Math.PI - 1e-6), r2).reverse());
        const rel = []; for(let k = 1; k < pts.length; k++) rel.push([pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]]);
        doc.setFillColor.apply(doc, hex(corSit(x.k, i))); doc.lines(rel, pts[0][0], pts[0][1], [1, 1], "F", true);
        ang = fim;
      });
      doc.setFillColor(255, 255, 255); doc.circle(cx, cy, r2 - .3, "F");
      doc.setTextColor(27, 35, 25); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(txt(fPct(taxaQtd(R))), cx, cy + 1, {align:"center"});
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(102, 115, 96); doc.text("CONVERSÃO", cx, cy + 5.5, {align:"center"});
      // barras do funil
      const bx = M + 62, bw = W - 2 * M - 62;
      const etapas = [
        ["Cotações feitas", R.n, R.frete, CINZA], ["Na base de conversão" + (F.base ? " (todas)" : " (sem outras)"), baseQtd(R), baseVal(R), AZUL], ["Convertidas (CTRC EMI)", R.conv, R.fConv, VERDE]
      ];
      etapas.forEach((e, i) => {
        const yb = yF + 5 + i * 10;
        doc.setFillColor(238, 241, 236); doc.roundedRect(bx, yb, bw, 8, 1, 1, "F");
        doc.setFillColor.apply(doc, hex(e[3])); doc.roundedRect(bx, yb, Math.max(bw * (R.n ? e[1] / R.n : 0), 4), 8, 1, 1, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); if(i === 0) doc.setTextColor(27, 35, 25); else doc.setTextColor(255); const t1 = txt(int(e[1]));
        doc.text(t1, bx + 2, yb + 5.2);
        doc.setFont("helvetica", "normal"); doc.text(txt(e[0]), bx + 2 + doc.getTextWidth(t1) + 1.5, yb + 5.2);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(27, 35, 25); doc.text(txt(brl(e[2])), bx + bw - 2, yb + 5.2, {align:"right"});
      });
      doc.autoTable({
        startY: yF + 37, margin:{left:bx, right:M}, tableWidth:bw,
        head:[["Situação", "Leitura", "Cotações", "% do total", "Frete (proposta)"]],
        body:sit.map(x => [x.k, LEITURA_ROT[classe(x.k)], int(x.n), fPct(pct(x.n, R.n)), brl(x.frete)].map(txt)), theme:"grid",
        styles:{fontSize:7.5, cellPadding:1.3, lineColor:[221, 227, 217], lineWidth:.15, textColor:[27, 35, 25]},
        headStyles:estiloCab, alternateRowStyles:{fillColor:[244, 247, 241]},
        columnStyles:{0:{fontStyle:"bold", cellPadding:{left:6, top:1.3, bottom:1.3, right:1.3}}, 2:{halign:"right"}, 3:{halign:"right"}, 4:{halign:"right"}},
        didParseCell: d => { if(d.section === "body" && d.column.index === 1){ const cl = classe(String(sit[d.row.index].k)); d.cell.styles.fontStyle = "bold"; d.cell.styles.textColor = cl === "conv" ? [42, 122, 26] : cl === "aberta" ? [47, 120, 184] : [102, 115, 96]; } },
        didDrawCell: d => { if(d.section === "body" && d.column.index === 0){ doc.setFillColor.apply(doc, hex(corSit(sit[d.row.index].k, d.row.index))); doc.rect(d.cell.x + 2, d.cell.y + d.cell.height / 2 - 1.2, 2.4, 2.4, "F"); } }
      });
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); doc.setTextColor(102, 115, 96);
      doc.text(txt("CTRC EMI = convertida. COTADO e COT FIXO = ainda não convertidas. As demais ficam à parte" + (F.base ? " (aqui incluídas na base)." : " e fora da taxa.")), bx, doc.lastAutoTable.finalY + 4.5);
    }

    // evolução diária (cotações do dia x convertidas), no final do relatório
    {
      let ds = seriesDia(rows), nota = "";
      if(ds.length > 31){ ds = ds.slice(-31); nota = " (últimos 31 dias)"; }
      if(ds.length){
        const hGraf = 46;
        let yE = doc.lastAutoTable.finalY + 10;
        if(yE + hGraf > H - 12){ doc.addPage(); yE = 16; }
        doc.setFillColor.apply(doc, grafite); doc.rect(M, yE - 4, W - 2 * M, 7, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(255); doc.text(txt("EVOLUÇÃO DIÁRIA" + nota.toUpperCase()), M + 3, yE + .8);
        const x0 = M + 12, x1 = W - M - 3, yTop = yE + 9, yBase = yE + hGraf - 13;
        const maxV = Math.max.apply(null, ds.map(d => d.n)), passo = (() => { const b = Math.pow(10, Math.floor(Math.log10(maxV || 1))); const f = maxV / b; return (f <= 2 ? .5 : f <= 5 ? 1 : 2) * b; })();
        const topV = Math.ceil(maxV / passo) * passo || 1;
        doc.setDrawColor(221, 227, 217); doc.setLineWidth(.15); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(102, 115, 96);
        for(let v = 0; v <= topV + 1e-9; v += passo){ const yy = yBase - (yBase - yTop) * v / topV; doc.line(x0, yy, x1, yy); doc.text(txt(int(Math.round(v))), x0 - 2, yy + 1, {align:"right"}); }
        const slot = (x1 - x0) / ds.length, bwid = Math.min(slot * .62, 9);
        const cada = ds.length > 24 ? 2 : 1;
        ds.forEach((d, i) => {
          const bx_ = x0 + slot * i + (slot - bwid) / 2, ht = (yBase - yTop) * d.n / topV, hc = (yBase - yTop) * d.conv / topV;
          doc.setFillColor.apply(doc, [184, 192, 179]); if(ht > 0) doc.rect(bx_, yBase - ht, bwid, ht, "F");
          doc.setFillColor.apply(doc, verde); if(hc > 0) doc.rect(bx_, yBase - hc, bwid, hc, "F");
          if(i % cada === 0){ doc.setFontSize(6.3); doc.setTextColor(102, 115, 96); doc.text(fDia(d.d), bx_ + bwid / 2, yBase + 4, {align:"center"}); }
          doc.setFontSize(5.8); doc.setTextColor(60); doc.text(String(d.n), bx_ + bwid / 2, yBase - ht - 1, {align:"center"});
        });
        doc.setDrawColor(150); doc.line(x0, yBase, x1, yBase);
        // legenda
        const yl = yBase + 9; doc.setFontSize(6.8); doc.setTextColor(102, 115, 96);
        doc.setFillColor(184, 192, 179); doc.rect(W / 2 - 55, yl - 2.2, 2.6, 2.6, "F"); doc.text("Cotações do dia", W / 2 - 51.5, yl);
        doc.setFillColor.apply(doc, verde); doc.rect(W / 2 - 25, yl - 2.2, 2.6, 2.6, "F"); doc.text(txt("Convertidas (CTRC EMI) - pela data da cotação"), W / 2 - 21.5, yl);
      }
    }

    // rodapé em todas as páginas
    const np = doc.getNumberOfPages();
    for(let i = 1; i <= np; i++){
      doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(130);
      doc.text("Painel Do Valle - Comercial · Cotações", M, H - 5);
      doc.text(`Página ${i} de ${np}`, W - M, H - 5, {align:"right"});
    }
    doc.save(nomeArquivo("Comercial_Cotacoes", "pdf"));
  }

  window.cotacoesComercialHTML = raizHTML;
  window.attachCotacoesComercial = function(){
    const raiz = document.getElementById("cqRoot");
    if(raiz) ligarGlobal(raiz);
    renderizar();
  };
  window.cotacoesComercialRefresh = function(){ D = carregar(); renderizar(); };
})();

/* =====================================================================
   ANÁLISE GERENCIAL — aba "Somente Tambasa" (v2.0)
   Aba INDEPENDENTE: guarda os próprios arquivos (IndexedDB "tambasa_analise_db") e não altera nenhuma outra tela.
   Leitura dos arquivos: analise-parsers.js (reconhece o tipo pelo conteúdo).

   BASES (cada caixa aceita vários arquivos; o tipo é identificado sozinho):
     1) Base de Entregas        CSV do SSW (140 colunas) -> só CT-es da Tambasa (2 CNPJs remetente): qtde vol., frete cobrado (FRETE VALOR), valor mercadoria e frete FOB origem
     2) Indenizações            relatório de indenizações (mesmo da aba Indenização; usa o mesmo leitor e a mesma regra de responsável)
     3) Performance (pagadora)  4 relatórios do SSW por pagador/grupo, "COMO PAGADOR":
                                  Performance de Entregas (resumo por destino) · CTRCs entregues no prazo ·
                                  CTRCs atrasados (resp. transportadora) · CTRCs atrasados (resp. cliente)

   PERFORMANCE = No prazo ÷ (Entregues − Atraso do cliente)  — mesma fórmula do SSW / Performance Geral.
   Com vários pagadores/unidades somam-se as contagens e a % é recalculada (nunca média de %).
   FRETE e VALOR DE MERCADORIA vêm das listas de CTRCs entregues (no prazo + atrasados). Os CTRCs ainda NÃO entregues
   só aparecem em quantidade (o SSW não manda a lista deles neste modelo).

   Toda a análise sai de construir(): tela, PDF e Excel desenham o mesmo modelo.
   ===================================================================== */
(function(){
  "use strict";

  const P = window.AGParsers;
  const DB_NOME = "tambasa_analise_db", DB_STORE = "arquivos", K_UI = "tambasa_analise_ui";
  const TIPOS_PERF = ["perf", "noprazo", "atr_t", "atr_c"];
  const NOME_TIPO = {perf:"Performance (resumo por destino)", noprazo:"CTRCs entregues no prazo", atr_t:"Atrasados · resp. transportadora",
                     atr_c:"Atrasados · resp. cliente", base:"Base de entregas", indeniz:"Indenizações"};
  const BASES = [
    {id:"perf", n:1, titulo:"Performance · Do Valle como pagadora", tipos:TIPOS_PERF,
     desc:"Os 4 relatórios do SSW por pagador (\"como pagador\"): Performance de Entregas, Entregues no prazo, Atrasados (transportadora) e Atrasados (cliente). Pode soltar todos juntos, de vários pagadores.",
     dica:"Arraste os relatórios de performance"},
    {id:"base", n:2, titulo:"Base de Entregas", tipos:["base"],
     desc:"CSV do SSW com ~140 colunas (mesmo modelo de Pacotes › Acompanhamento). Daqui saem, só dos CT-es da Tambasa (CNPJs 17.359.233/0001-88 e /0009-35): qtde de volumes, frete cobrado da Expresso, valor de mercadoria e frete FOB do CTRC de origem.",
     dica:"Arraste o CSV da base de entregas"},
    {id:"indeniz", n:3, titulo:"Indenizações", tipos:["indeniz"],
     desc:"Mesmo relatório da aba Indenização (arquivo que começa com RVA entra como Real Vale; os demais como Do Valle).",
     dica:"Arraste o relatório de indenizações"}
  ];
  const CNPJ_TAMBASA = ["17359233000188", "17359233000935"];   // matriz e filial da Tambasa (TEC E ARM MIGUEL BARTOLOMEU)
  const CLASSE_ROT = {matriz:"Matriz", filial:"Filial", valle:"Do Valle / Real Vale", g5:"Parceiras G5", outros:"A revisar"};

  /* ---------------- util ---------------- */
  const esc = s => (typeof escHtml === "function" ? escHtml(s == null ? "" : s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])));
  const f0 = n => Math.round(n).toLocaleString("pt-BR");
  const f1 = n => n.toLocaleString("pt-BR", {minimumFractionDigits:1, maximumFractionDigits:1});
  const f2 = n => n.toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
  const brl = n => "R$ " + f2(n);
  const pad = n => String(n).padStart(2, "0");
  const agoraBR = () => { const d = new Date(); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const kb = n => n >= 1048576 ? (n/1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(n/1024)) + " KB";
  const dBR = s => s ? s.slice(8) + "/" + s.slice(5, 7) + "/" + s.slice(2, 4) : "";
  const rotPer = p => p ? dBR(p.ini) + " a " + dBR(p.fim) : "";
  const chavePer = p => p ? p.ini + "|" + p.fim : "";
  const jget = (k, d) => { try{ const r = LS.getItem(k); return r ? JSON.parse(r) : d; }catch(x){ return d; } };
  const jset = (k, v) => { try{ LS.setItem(k, JSON.stringify(v)); }catch(x){} };
  const soma = (l, f) => l.reduce((s, x) => s + (f(x) || 0), 0);
  const plural = (n, a, b) => n === 1 ? a : b;

  // Performance do SSW: No prazo ÷ (Entregues − Atraso cliente); 2 casas e exibida em 1 casa.
  function calcPerf(c){
    const den = (c.ent || 0) - (c.ac || 0);
    if(!(den > 0)) return null;
    const r2 = Math.round((c.np / den) * 100 * 100) / 100;
    return Math.round(r2 * 10 + 1e-9) / 10;
  }

  /* ---------------- estado ---------------- */
  let ARQ = [];
  let UI = Object.assign({aba:"relatorio", per:"", pag:[], meta:98}, jget(K_UI, {}));
  let msg = null;
  const salvarUI = () => jset(K_UI, UI);

  /* ---------------- IndexedDB ---------------- */
  function abrirDB(){
    return new Promise((res, rej) => {
      if(!window.indexedDB){ rej(new Error("IndexedDB indisponível")); return; }
      const r = indexedDB.open(DB_NOME, 2);
      r.onupgradeneeded = () => { const db = r.result; if(db.objectStoreNames.contains(DB_STORE)) db.deleteObjectStore(DB_STORE); db.createObjectStore(DB_STORE, {keyPath:"id"}); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function dbTodos(){ const db = await abrirDB(); return new Promise((res, rej) => { const q = db.transaction(DB_STORE).objectStore(DB_STORE).getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); }
  async function dbGravar(o){ const db = await abrirDB(); return new Promise((res, rej) => { const t = db.transaction(DB_STORE, "readwrite"); t.objectStore(DB_STORE).put(o); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
  async function dbApagar(id){ const db = await abrirDB(); return new Promise((res, rej) => { const t = db.transaction(DB_STORE, "readwrite"); t.objectStore(DB_STORE).delete(id); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }

  /* ---------------- leitura / importação ---------------- */
  function decodificar(buf){
    try{ return new TextDecoder("utf-8", {fatal:true}).decode(buf); }catch(e){}
    try{ return new TextDecoder("windows-1252").decode(buf); }catch(e){ return new TextDecoder("latin1").decode(buf); }
  }
  // Monta o registro guardado (texto bruto + dados lidos). Indenização usa o leitor da aba Indenização.
  function montar(texto, nome, tam){
    const tipo = P.detectar(texto, nome);
    if(!tipo) throw new Error("formato não reconhecido");
    if(tipo === "indeniz"){
      if(!(window.__indenizacao && window.__indenizacao.parseIndenizacoes)) throw new Error("leitor de indenização indisponível");
      const origem = /^RVA/i.test(nome) ? "rva" : "val", r = window.__indenizacao.parseIndenizacoes(texto, origem);
      if(!r.ok) throw new Error(r.erro);
      return {id:"indeniz|" + nome, tipo, nome, tam, data:agoraBR(), texto, pv:P.PV, origem, linhas:r.linhas};
    }
    const r = P.ler(texto, nome);
    if(!r.linhas || (!r.linhas.length && tipo !== "perf")) throw new Error("nenhuma linha encontrada");
    const cnpj = r.grupo ? r.grupo.cnpj : "";
    return Object.assign({id:tipo + "|" + cnpj + "|" + chavePer(r.per) + (cnpj ? "" : "|" + nome), nome, tam, data:agoraBR(), texto}, r);
  }
  async function importar(boxId, files){
    const box = BASES.find(b => b.id === boxId), ok = [], falhas = [], rotas = [];
    for(const f of files){
      try{
        const texto = decodificar(await f.arrayBuffer()), reg = montar(texto, f.name, f.size);
        const antigo = ARQ.find(a => a.id === reg.id);
        await dbGravar(reg);
        ARQ = ARQ.filter(a => a.id !== reg.id).concat([reg]);
        ok.push(NOME_TIPO[reg.tipo] + (reg.grupo ? " · " + reg.grupo.nome : "") + (antigo ? " (substituiu)" : ""));
        if(box && box.tipos.indexOf(reg.tipo) < 0) rotas.push(f.name + " → " + NOME_TIPO[reg.tipo]);
      }catch(err){ falhas.push(f.name + ": " + (err.message || err)); }
    }
    const partes = [];
    if(ok.length) partes.push(ok.length + " " + plural(ok.length, "arquivo importado", "arquivos importados") + " (" + ok.join("; ") + ")");
    if(rotas.length) partes.push("Reconhecido pelo conteúdo e colocado no lugar certo: " + rotas.join("; "));
    if(falhas.length) partes.push("Não foi possível ler: " + falhas.join("; "));
    msg = {tipo: falhas.length ? (ok.length ? "aviso" : "erro") : "ok", txt:partes.join(" — ")};
    render();
  }
  // Se o leitor mudou de versão, releia os arquivos guardados.
  function atualizarVersao(lista){
    return Promise.all(lista.map(async a => {
      if(a.pv === P.PV) return a;
      try{ const n = montar(a.texto, a.nome, a.tam); n.id = a.id; n.data = a.data; await dbGravar(n); return n; }catch(e){ return a; }
    }));
  }

  /* =====================================================================
     MODELO DA ANÁLISE
     ===================================================================== */
  const recs = tipo => ARQ.filter(a => a.tipo === tipo);
  function periodosDisponiveis(){
    const m = new Map();
    ARQ.filter(a => TIPOS_PERF.indexOf(a.tipo) >= 0 && a.per).forEach(a => m.set(chavePer(a.per), a.per));
    return [...m.values()].sort((a, b) => (b.fim.localeCompare(a.fim)) || (a.ini.localeCompare(b.ini)));
  }
  function periodoAtual(){
    const ps = periodosDisponiveis(); if(!ps.length) return null;
    return ps.find(p => chavePer(p) === UI.per) || ps[0];
  }
  function pagadoresDisponiveis(){
    const m = new Map();
    ARQ.forEach(a => { if(a.grupo && a.grupo.cnpj && !m.has(a.grupo.cnpj)) m.set(a.grupo.cnpj, a.grupo.nome); });
    return [...m.entries()].map(([cnpj, nome]) => ({cnpj, nome})).sort((a, b) => a.nome.localeCompare(b.nome));
  }
  const nomeCurto = n => String(n || "").replace(/\s+(LTDA|LTD|S\.?A\.?|EIRELI|ME)\.?$/i, "").trim();
  const normNome = s => P.semAcento(s).replace(/[^A-Z0-9 ]/g, " ").replace(/\b(LTDA|LTD|SA|EIRELI|ME|E LOGISTICA)\b/g, " ").replace(/\s+/g, " ").trim();
  function mesmoPagadorNome(nomeRegistro, nomesSel){
    const a = normNome(nomeRegistro).slice(0, 10); if(!a) return false;
    return nomesSel.some(n => normNome(n).slice(0, 10) === a);
  }

  function construir(){
    const per = periodoAtual(), sel = new Set(UI.pag), pagsTodos = pagadoresDisponiveis();
    const emSel = a => !sel.size || (a.grupo && sel.has(a.grupo.cnpj));
    const daPer = a => !per || (a.per && chavePer(a.per) === chavePer(per));
    const rp = TIPOS_PERF.reduce((o, t) => { o[t] = ARQ.filter(a => a.tipo === t && emSel(a) && daPer(a)); return o; }, {});

    // ----- pagadores com performance -----
    const mapaPag = new Map();
    TIPOS_PERF.forEach(t => rp[t].forEach(a => {
      const k = a.grupo ? a.grupo.cnpj : a.id, p = mapaPag.get(k) || {cnpj:k, nome:a.grupo ? a.grupo.nome : a.nome};
      p[t] = a; mapaPag.set(k, p);
    }));
    const pags = [...mapaPag.values()];
    const entreguesDe = p => [].concat(p.noprazo ? p.noprazo.linhas : [], p.atr_t ? p.atr_t.linhas : [], p.atr_c ? p.atr_c.linhas : []);
    const temLista = p => !!(p.noprazo || p.atr_t || p.atr_c);

    // linhas de CTRC (entregues) com marcação de responsabilidade e pagador
    const ctrcs = [];
    pags.forEach(p => {
      if(p.noprazo) p.noprazo.linhas.forEach(r => ctrcs.push(Object.assign({}, r, {atrasado:false, resp:"", pagador:p.nome})));
      if(p.atr_t) p.atr_t.linhas.forEach(r => ctrcs.push(Object.assign({}, r, {atrasado:true, resp:"Transportadora", pagador:p.nome})));
      if(p.atr_c) p.atr_c.linhas.forEach(r => ctrcs.push(Object.assign({}, r, {atrasado:true, resp:"Cliente", pagador:p.nome})));
    });
    const atrasos = ctrcs.filter(r => r.atrasado);
    const multi = pags.length > 1;

    // ----- totais de performance (somando contagens) -----
    const comPerf = pags.filter(p => p.perf && p.perf.total);
    const T = {exp:0, ent:0, np:0, ac:0, at:0, nePrazo:0, neAtr:0};
    comPerf.forEach(p => Object.keys(T).forEach(k => T[k] += p.perf.total[k] || 0));
    const perfGeral = comPerf.length ? calcPerf(T) : null;
    const freteEnt = ctrcs.length ? soma(ctrcs, r => r.frete) : null, mercEnt = ctrcs.length ? soma(ctrcs, r => r.merc) : null;
    const mercAtr = (pags.some(p => p.atr_t || p.atr_c)) ? soma(atrasos, r => r.merc) : null;
    const freteAtr = (pags.some(p => p.atr_t || p.atr_c)) ? soma(atrasos, r => r.frete) : null;

    // ----- unidades -----
    const U = new Map();
    const un = k => { if(!U.has(k)) U.set(k, {un:k, exp:0, ent:0, np:0, ac:0, at:0, nePrazo:0, neAtr:0, ctrcs:0, frete:0, merc:0, atrQtd:0, mercAtr:0, temPerf:false, temLista:false}); return U.get(k); };
    comPerf.forEach(p => p.perf.linhas.forEach(l => { const u = un(l.un); u.temPerf = true; ["exp","ent","np","ac","at","nePrazo","neAtr"].forEach(k => u[k] += l[k] || 0); }));
    ctrcs.forEach(r => { const u = un(r.un || "?"); u.temLista = true; u.ctrcs++; u.frete += r.frete; u.merc += r.merc; if(r.atrasado){ u.atrQtd++; u.mercAtr += r.merc; } });
    const unids = [...U.values()].map(u => Object.assign(u, {perf:u.temPerf ? calcPerf(u) : null, fora:u.ac + u.at + u.neAtr, ne:u.nePrazo + u.neAtr, npExp:(u.temPerf && u.exp > 0) ? u.np / u.exp * 100 : null}));

    // ----- cidades (do resumo de performance) -----
    const C = new Map();
    comPerf.forEach(p => p.perf.linhas.forEach(l => {
      const k = l.un + "|" + l.cidade, c = C.get(k) || {cidade:l.cidade, un:l.un, exp:0, ent:0, np:0, ac:0, at:0, neAtr:0, nePrazo:0};
      ["exp","ent","np","ac","at","neAtr","nePrazo"].forEach(x => c[x] += l[x] || 0); C.set(k, c);
    }));
    const cidades = [...C.values()].map(c => Object.assign(c, {atrasos:c.ac + c.at, perf:calcPerf(c)})).filter(c => c.atrasos + c.neAtr > 0)
      .sort((a, b) => (b.atrasos + b.neAtr) - (a.atrasos + a.neAtr) || (a.perf == null ? 101 : a.perf) - (b.perf == null ? 101 : b.perf)).slice(0, 15);

    // ----- motivos -----
    const M = new Map();
    atrasos.forEach(r => {
      const k = (r.cod || "") + "|" + (r.ocor || ""), m = M.get(k) || {cod:r.cod || "—", motivo:r.ocor || "Sem ocorrência informada", resps:new Set(), qtd:0, frete:0, merc:0, dias:0};
      m.resps.add(r.resp); m.qtd++; m.frete += r.frete; m.merc += r.merc; m.dias += r.atr; M.set(k, m);
    });
    const motivos = [...M.values()].sort((a, b) => b.qtd - a.qtd || b.merc - a.merc)
      .map(m => Object.assign(m, {resp:m.resps.size > 1 ? "Ambas" : [...m.resps][0], pct:atrasos.length ? m.qtd / atrasos.length * 100 : 0, diasMed:m.qtd ? m.dias / m.qtd : 0}));

    // ----- clientes (remetentes) -----
    const R = new Map();
    ctrcs.forEach(r => {
      const k = r.rem || "(sem nome)", c = R.get(k) || {rem:k, ent:0, atr:0, frete:0, mercAtr:0, freteAtr:0};
      c.ent++; c.frete += r.frete; if(r.atrasado){ c.atr++; c.mercAtr += r.merc; c.freteAtr += r.frete; } R.set(k, c);
    });
    const clientes = [...R.values()].filter(c => c.atr > 0).map(c => Object.assign(c, {pct:c.atr / c.ent * 100}))
      .sort((a, b) => b.atr - a.atr || b.mercAtr - a.mercAtr).slice(0, 15);

    // ----- base de entregas (frete Do Valle × CTRC origem) -----
    const mb = new Map();
    recs("base").forEach(a => a.linhas.forEach(r => mb.set(r.ctrc, r)));
    let base = [...mb.values()].filter(r => CNPJ_TAMBASA.indexOf(r.remCnpj) >= 0);   // só CT-es cujo remetente é a Tambasa (os 2 CNPJs)
    base.sort((a, b) => (a.emis < b.emis ? 1 : a.emis > b.emis ? -1 : 0) || a.ctrc.localeCompare(b.ctrc));

    // ----- indenizações -----
    let ind = [];
    recs("indeniz").forEach(a => a.linhas.forEach(r => ind.push(r)));
    if(sel.size){ const nomes = pagsTodos.filter(p => sel.has(p.cnpj)).map(p => p.nome); ind = ind.filter(r => mesmoPagadorNome(r.pagador, nomes)); }
    const C2 = window.__indenizacao ? window.__indenizacao.classificar : null;
    ind = ind.map(r => Object.assign({}, r, C2 ? C2(r, null) : {classe:"outros", quem:r.resp}));
    const totInd = ind.length ? soma(ind, r => r.valor) : null;

    /* ===== KPIs ===== */
    const kpis = [];
    // BLOCO EGO — Expresso Goiás entregando mercadoria do Do Valle (relatórios "como pagador")
    if(comPerf.length){
      kpis.push({grupo:"ego", rotulo:"EGO · Performance", valor:perfGeral != null ? f1(perfGeral) + "%" : "—", nota:"meta " + (+UI.meta || 98) + "%", perf:perfGeral});
      kpis.push({grupo:"ego", rotulo:"EGO · CT-es expedidos", valor:f0(T.exp), nota:"pagador Do Valle"});
      kpis.push({grupo:"ego", rotulo:"EGO · Entregues no prazo", valor:f0(T.np), nota:"de " + f0(T.ent) + " entregues"});
      kpis.push({grupo:"ego", rotulo:"EGO · Atraso · culpa da transportadora", valor:f0(T.at), nota:"entregues com atraso"});
      kpis.push({grupo:"ego", rotulo:"EGO · Atraso · culpa do cliente", valor:f0(T.ac), nota:"entregues com atraso"});
      kpis.push({grupo:"ego", rotulo:"EGO · Não entregues", valor:f0(T.nePrazo + T.neAtr), nota:f0(T.neAtr) + " já atrasados"});
    }
    // BLOCO TAMBASA — CT-es que nós entregamos (remetente = 2 CNPJs da Tambasa)
    if(base.length){
      kpis.push({grupo:"tambasa", rotulo:"Tambasa · CT-es entregues", valor:f0(base.length), nota:""});
      kpis.push({grupo:"tambasa", rotulo:"Tambasa · Volumes", valor:f0(soma(base, r => r.vol)), nota:""});
      kpis.push({grupo:"tambasa", rotulo:"Tambasa · Frete cobrado (Expresso)", valor:brl(soma(base, r => r.freteValor)), nota:""});
      kpis.push({grupo:"tambasa", rotulo:"Tambasa · Valor mercadoria", valor:brl(soma(base, r => r.merc)), nota:""});
      kpis.push({grupo:"tambasa", rotulo:"Tambasa · Frete FOB origem", valor:brl(soma(base, r => r.fobOrig)), nota:"cobrado da Tambasa"});
    }

    /* ===== leitura automática ===== */
    const ins = [];
    if(perfGeral != null) ins.push(`EGO não performa com o Do Valle — performance de ${f1(perfGeral)}% (meta ${+UI.meta || 98}%): ${f0(T.np)} de ${f0(T.ent - T.ac)} entregas no prazo (já descontados ${f0(T.ac)} ${plural(T.ac, "atraso", "atrasos")} de responsabilidade do cliente).`);
    if(comPerf.length && (T.nePrazo + T.neAtr) > 0) ins.push(`${f0(T.nePrazo + T.neAtr)} CTRCs ainda não foram entregues — ${f0(T.neAtr)} já estão atrasados e ${f0(T.nePrazo)} ainda dentro do prazo.`);
    const uComPerf = unids.filter(u => u.temPerf && u.perf != null && (u.exp >= 10)).sort((a, b) => a.perf - b.perf);
    if(uComPerf.length){ const u = uComPerf[0]; ins.push(`Unidade com menor performance (critério SSW, só CTRCs entregues): ${u.un} (${f1(u.perf)}%, ${f0(u.exp)} expedidos, ${f0(u.fora)} atrasados).`); }
    const uNp = unids.filter(u => u.npExp != null && u.exp >= 10).sort((a, b) => a.npExp - b.npExp)[0];
    if(uNp && uNp.ne > 0) ins.push(`Menor aproveitamento sobre o expedido: ${uNp.un} — só ${f1(uNp.npExp)}% foi entregue no prazo e ${f0(uNp.ne)} CTRCs ainda não foram entregues.`);
    const maisFora = unids.filter(u => u.fora > 0).sort((a, b) => b.fora - a.fora)[0];
    if(maisFora && maisFora !== uComPerf[0]) ins.push(`Maior número de CTRCs fora do prazo: ${maisFora.un} (${f0(maisFora.fora)}).`);
    if(cidades.length) ins.push(`Cidade com mais ocorrências de atraso: ${cidades[0].cidade} / ${cidades[0].un} (${f0(cidades[0].atrasos + cidades[0].neAtr)}).`);
    if(motivos.length){ const m = motivos[0]; ins.push(`Principal motivo registrado nos atrasos: ${m.cod !== "—" ? m.cod + " – " : ""}${m.motivo} (${f0(m.qtd)} de ${f0(atrasos.length)}, ${f1(m.pct)}%).`); }
    if(atrasos.length && mercAtr != null) ins.push(`R$ ${f2(mercAtr)} em mercadoria foi entregue com atraso (${f0(atrasos.length)} CTRCs, média de ${f1(soma(atrasos, r => r.atr) / atrasos.length)} dia(s) de atraso).`);
    if(clientes.length) ins.push(`Remetente mais afetado: ${clientes[0].rem} (${f0(clientes[0].atr)} ${plural(clientes[0].atr, "atraso", "atrasos")}, ${brl(clientes[0].mercAtr)} em mercadoria).`);
    if(multi){ const pp = comPerf.map(p => ({n:p.nome, perf:calcPerf(p.perf.total)})).filter(x => x.perf != null).sort((a, b) => a.perf - b.perf); if(pp.length) ins.push(`Pagador mais afetado: ${nomeCurto(pp[0].n)} (${f1(pp[0].perf)}%).`); }
    if(base.length){ const fv = soma(base, r => r.freteValor), fo = soma(base, r => r.fobOrig); ins.push(`TAMBASA (entregas feitas por nós, relatório à parte da EGO): ${f0(base.length)} CT-es e ${f0(soma(base, r => r.vol))} volumes entregues; frete cobrado da Expresso de ${brl(fv)} contra ${brl(fo)} cobrados pela Expresso da Tambasa (frete FOB do CTRC de origem).`); }
    if(totInd != null){ const porClasse = {}; ind.forEach(r => porClasse[r.classe] = (porClasse[r.classe] || 0) + r.valor); const top = Object.keys(porClasse).sort((a, b) => porClasse[b] - porClasse[a])[0];
      ins.push(`Indenizações: ${brl(totInd)} em ${f0(ind.length)} ${plural(ind.length, "caso", "casos")}; maior parte com ${CLASSE_ROT[top] || top} (${brl(porClasse[top])}).`); }

    /* ===== seções ===== */
    const secoes = [];
    const meta = +UI.meta || 98;
    const perfCol = {k:"perf", t:"Performance", tipo:"pct", meta:true};

    // A) pagadores
    if(comPerf.length){
      const linhas = pags.map(p => {
        const t = p.perf && p.perf.total ? p.perf.total : null, e = temLista(p) ? entreguesDe(p) : null;
        const mercAt = (p.atr_t || p.atr_c) ? soma([].concat(p.atr_t ? p.atr_t.linhas : [], p.atr_c ? p.atr_c.linhas : []), r => r.merc) : null;
        const mercT = e ? soma(e, r => r.merc) : null;
        return {pagador:nomeCurto(p.nome), exp:t ? t.exp : null, ent:t ? t.ent : null, np:t ? t.np : null, ac:t ? t.ac : null, at:t ? t.at : null,
          ne:t ? t.nePrazo + t.neAtr : null, perf:t ? calcPerf(t) : null, frete:e ? soma(e, r => r.frete) : null, merc:mercT, mercAtr:mercAt,
          mercPct:(mercAt != null && mercT) ? mercAt / mercT * 100 : null};
      }).sort((a, b) => (a.perf == null ? 101 : a.perf) - (b.perf == null ? 101 : b.perf));
      const totalRow = multi ? {pagador:null, exp:T.exp, ent:T.ent, np:T.np, ac:T.ac, at:T.at, ne:T.nePrazo + T.neAtr, perf:perfGeral, frete:freteEnt, merc:mercEnt, mercAtr:mercAtr, mercPct:(mercAtr != null && mercEnt) ? mercAtr / mercEnt * 100 : null} : null;
      secoes.push({id:"pagadores", titulo:"EGO · Performance das entregas (pagador Do Valle)", descricao:"Pagadores ordenados do mais afetado (menor performance) para o menos afetado. Frete e valor de mercadoria consideram os CTRCs entregues.",
        colunas:[{k:"pagador", t:"Pagador", tipo:"txt", larg:30}, {k:"exp", t:"Expedidos", tipo:"int"}, {k:"ent", t:"Entregues", tipo:"int"}, {k:"np", t:"No prazo", tipo:"int"},
          {k:"ac", t:"Atraso cliente", tipo:"int"}, {k:"at", t:"Atraso transp.", tipo:"int"}, {k:"ne", t:"Não entregues", tipo:"int"}, perfCol,
          {k:"frete", t:"Frete", tipo:"brl"}, {k:"merc", t:"Valor mercadoria", tipo:"brl"}, {k:"mercAtr", t:"Merc. em atraso", tipo:"brl"}, {k:"mercPct", t:"% merc. atrasada", tipo:"pct"}],
        linhas, total:totalRow,
        grafico:multi ? {titulo:"Performance por pagador (%)", meta:true, itens:linhas.filter(l => l.perf != null).map(l => ({r:l.pagador, v:l.perf, txt:f1(l.perf) + "%"}))} : null});
    }

    // B) unidades
    if(unids.length){
      const linhas = unids.slice().sort((a, b) => (a.perf == null ? 101 : a.perf) - (b.perf == null ? 101 : b.perf) || b.fora - a.fora)
        .map(u => ({un:u.un, exp:u.temPerf ? u.exp : null, ent:u.temPerf ? u.ent : null, np:u.temPerf ? u.np : null, ac:u.temPerf ? u.ac : null, at:u.temPerf ? u.at : null,
          neAtr:u.temPerf ? u.neAtr : null, ne:u.temPerf ? u.ne : null, npExp:u.npExp, fora:u.temPerf || u.temLista ? u.fora : null, perf:u.perf, ctrcs:u.temLista ? u.ctrcs : null, frete:u.temLista ? u.frete : null, merc:u.temLista ? u.merc : null, mercAtr:u.temLista ? u.mercAtr : null}));
      secoes.push({id:"unidades", titulo:"EGO · Performance por unidade", descricao:"Unidade de destino (3 letras da praça), da menor para a maior performance. Performance = critério do SSW (só CTRCs entregues); \"No prazo s/ expedidos\" mostra o aproveitamento real sobre tudo que foi expedido. Frete e mercadoria vêm dos CTRCs entregues.",
        colunas:[{k:"un", t:"Unidade", tipo:"txt", larg:12}, {k:"exp", t:"Expedidos", tipo:"int"}, {k:"ent", t:"Entregues", tipo:"int"}, {k:"np", t:"No prazo", tipo:"int"}, {k:"ac", t:"Atraso cliente", tipo:"int"},
          {k:"at", t:"Atraso transp.", tipo:"int"}, {k:"ne", t:"Não entregues", tipo:"int"}, {k:"neAtr", t:"Não entreg. atrasados", tipo:"int"}, perfCol, {k:"npExp", t:"No prazo s/ expedidos", tipo:"pct"}, {k:"ctrcs", t:"CTRCs entregues", tipo:"int"},
          {k:"frete", t:"Frete", tipo:"brl"}, {k:"merc", t:"Valor mercadoria", tipo:"brl"}, {k:"mercAtr", t:"Merc. em atraso", tipo:"brl"}],
        linhas, total:{un:null, exp:comPerf.length ? T.exp : null, ent:comPerf.length ? T.ent : null, np:comPerf.length ? T.np : null, ac:comPerf.length ? T.ac : null, at:comPerf.length ? T.at : null,
          neAtr:comPerf.length ? T.neAtr : null, ne:comPerf.length ? T.nePrazo + T.neAtr : null, npExp:(comPerf.length && T.exp) ? T.np / T.exp * 100 : null, perf:perfGeral, ctrcs:ctrcs.length ? ctrcs.length : null, frete:freteEnt, merc:mercEnt, mercAtr},
        grafico:{titulo:"CTRCs atrasados por unidade — as 12 maiores (entregues com atraso + não entregues já atrasados)", itens:linhas.filter(l => l.fora > 0).sort((a, b) => b.fora - a.fora).slice(0, 12).map(l => ({r:l.un, v:l.fora, txt:f0(l.fora)}))}});
    }

    // C) cidades
    if(cidades.length) secoes.push({id:"cidades", titulo:"Cidades com mais atrasos", descricao:"As 15 cidades de destino com mais CTRCs entregues com atraso ou ainda não entregues e já atrasados.",
      colunas:[{k:"cidade", t:"Cidade", tipo:"txt", larg:28}, {k:"un", t:"Unidade", tipo:"txt", larg:10}, {k:"exp", t:"Expedidos", tipo:"int"}, {k:"np", t:"No prazo", tipo:"int"},
        {k:"atrasos", t:"Entregues c/ atraso", tipo:"int"}, {k:"neAtr", t:"Não entreg. atrasados", tipo:"int"}, perfCol],
      linhas:cidades, total:null});

    // D) motivos
    if(motivos.length) secoes.push({id:"motivos", titulo:"Atrasos por motivo (última ocorrência)", descricao:"Motivos registrados nos CTRCs entregues com atraso, com a responsabilidade indicada pelo SSW.",
      colunas:[{k:"cod", t:"Cód.", tipo:"txt", larg:8}, {k:"motivo", t:"Motivo", tipo:"txt", larg:48}, {k:"resp", t:"Responsabilidade", tipo:"txt", larg:18}, {k:"qtd", t:"CTRCs", tipo:"int"},
        {k:"pct", t:"% dos atrasos", tipo:"pct"}, {k:"diasMed", t:"Atraso médio (dias)", tipo:"dec"}, {k:"frete", t:"Frete", tipo:"brl"}, {k:"merc", t:"Valor mercadoria", tipo:"brl"}],
      linhas:motivos, total:{cod:null, motivo:null, resp:null, qtd:atrasos.length, pct:100, diasMed:atrasos.length ? soma(atrasos, r => r.atr) / atrasos.length : null, frete:freteAtr, merc:mercAtr},
      grafico:{titulo:"CTRCs atrasados por motivo — os 8 principais", itens:motivos.slice(0, 8).map(m => ({r:(m.cod !== "—" ? m.cod + " · " : "") + m.motivo.slice(0, 38), v:m.qtd, txt:f0(m.qtd)}))}});

    // E) clientes
    if(clientes.length) secoes.push({id:"clientes", titulo:"Remetentes mais afetados", descricao:"Os 15 remetentes com mais CTRCs entregues com atraso. O nome do remetente vem abreviado do SSW (14 letras).",
      colunas:[{k:"rem", t:"Remetente", tipo:"txt", larg:28}, {k:"ent", t:"CTRCs entregues", tipo:"int"}, {k:"atr", t:"Com atraso", tipo:"int"}, {k:"pct", t:"% com atraso", tipo:"pct"},
        {k:"freteAtr", t:"Frete atrasado", tipo:"brl"}, {k:"mercAtr", t:"Merc. em atraso", tipo:"brl"}],
      linhas:clientes, total:null});

    // F) CTRCs atrasados (detalhe)
    if(atrasos.length){
      const linhas = atrasos.slice().sort((a, b) => b.atr - a.atr || b.merc - a.merc).map(r => ({ctrc:r.ctrc, emis:dBR(r.emis), pagador:nomeCurto(r.pagador), rem:r.rem, dest:r.dest,
        local:r.cidade + " / " + r.un, nf:r.nf, frete:r.frete, merc:r.merc, prev:dBR(r.prev), real:dBR(r.real), atr:r.atr, ocor:(r.cod ? r.cod + " – " : "") + (r.ocor || "—"), resp:r.resp}));
      const cols = [{k:"ctrc", t:"CTRC", tipo:"txt", larg:14}, {k:"emis", t:"Emissão", tipo:"txt", larg:10}];
      if(multi) cols.push({k:"pagador", t:"Pagador", tipo:"txt", larg:22});
      cols.push({k:"rem", t:"Remetente", tipo:"txt", larg:18}, {k:"dest", t:"Destinatário", tipo:"txt", larg:18}, {k:"local", t:"Cidade / Unid.", tipo:"txt", larg:20}, {k:"nf", t:"NF", tipo:"txt", larg:10},
        {k:"frete", t:"Frete", tipo:"brl"}, {k:"merc", t:"Valor mercadoria", tipo:"brl"}, {k:"prev", t:"Previsão", tipo:"txt", larg:10}, {k:"real", t:"Entrega", tipo:"txt", larg:10},
        {k:"atr", t:"Dias", tipo:"int"}, {k:"ocor", t:"Ocorrência", tipo:"txt", larg:42}, {k:"resp", t:"Resp.", tipo:"txt", larg:15});
      secoes.push({id:"atrasados", titulo:"CTRCs entregues com atraso (detalhe)", descricao:"Todos os CTRCs entregues com atraso, do maior para o menor atraso. Responsabilidade conforme o relatório do SSW.",
        colunas:cols, linhas, total:{ctrc:null, frete:soma(linhas, r => r.frete), merc:soma(linhas, r => r.merc)}});
    }

    // G) TAMBASA — CT-es que nós entregamos (resumo curto: Matriz / Filial)
    if(base.length){
      const por = {};
      base.forEach(r => { const k = r.remCnpj === "17359233000188" ? "Matriz · 17.359.233/0001-88" : "Filial · 17.359.233/0009-35";
        const c = por[k] || (por[k] = {rem:k, ctes:0, vol:0, freteValor:0, merc:0, fobOrig:0}); c.ctes++; c.vol += r.vol; c.freteValor += r.freteValor; c.merc += r.merc; c.fobOrig += r.fobOrig; });
      const linhas = Object.values(por).sort((a, b) => b.ctes - a.ctes);
      const tt = k => soma(linhas, r => r[k]);
      secoes.push({id:"frete", titulo:"TAMBASA · CT-es que nós entregamos", descricao:"Relatório à parte da EGO. Só CT-es com remetente Tambasa (2 CNPJs). Frete cobrado = FRETE VALOR (o que cobramos da Expresso) · Frete FOB origem = FRETE FOB DO CTRC ORIGEM (o que a Expresso cobrou da Tambasa).",
        colunas:[{k:"rem", t:"Remetente Tambasa", tipo:"txt", larg:34}, {k:"ctes", t:"CT-es", tipo:"int"}, {k:"vol", t:"Volumes", tipo:"int"}, {k:"freteValor", t:"Frete cobrado (Expresso)", tipo:"brl"},
          {k:"merc", t:"Valor mercadoria", tipo:"brl"}, {k:"fobOrig", t:"Frete FOB origem", tipo:"brl"}],
        linhas, total:{rem:null, ctes:tt("ctes"), vol:tt("vol"), freteValor:tt("freteValor"), merc:tt("merc"), fobOrig:tt("fobOrig")}});
    }

    // H) indenizações
    if(ind.length){
      const g = {}; ind.forEach(r => { const c = g[r.classe] || (g[r.classe] = {classe:CLASSE_ROT[r.classe] || r.classe, qtd:0, valor:0, frete:0, merc:0}); c.qtd++; c.valor += r.valor; c.frete += r.frete; c.merc += r.merc; });
      const lc = Object.values(g).sort((a, b) => b.valor - a.valor).map(c => Object.assign(c, {pct:totInd ? c.valor / totInd * 100 : 0}));
      secoes.push({id:"ind-resp", titulo:"Indenizações por responsável", descricao:"Quem pagou a indenização (mesma regra da aba Indenização).",
        colunas:[{k:"classe", t:"Responsável", tipo:"txt", larg:28}, {k:"qtd", t:"Casos", tipo:"int"}, {k:"valor", t:"Valor indenizado", tipo:"brl"}, {k:"pct", t:"% do total", tipo:"pct"}, {k:"merc", t:"Valor mercadoria", tipo:"brl"}],
        linhas:lc, total:{classe:null, qtd:ind.length, valor:totInd, pct:100, merc:soma(ind, r => r.merc)},
        grafico:{titulo:"Valor indenizado por responsável (R$)", itens:lc.map(c => ({r:c.classe, v:c.valor, txt:brl(c.valor)}))}});
      const dl = ind.slice().sort((a, b) => b.valor - a.valor).map(r => ({ctrc:r.ctrc, indeniz:dBR(r.indeniz), pagador:r.pagador, rem:r.remetente, motivo:r.motivo, frete:r.frete, merc:r.merc, valor:r.valor,
        quem:(CLASSE_ROT[r.classe] || r.classe) + (r.quem ? " · " + r.quem : "")}));
      secoes.push({id:"ind-det", titulo:"Indenizações (detalhe)", descricao:"Cada indenização, da maior para a menor.",
        colunas:[{k:"ctrc", t:"CTRC", tipo:"txt", larg:14}, {k:"indeniz", t:"Data", tipo:"txt", larg:10}, {k:"pagador", t:"Pagador", tipo:"txt", larg:26}, {k:"rem", t:"Remetente", tipo:"txt", larg:26},
          {k:"motivo", t:"Motivo", tipo:"txt", larg:30}, {k:"frete", t:"Frete", tipo:"brl"}, {k:"merc", t:"Valor mercadoria", tipo:"brl"}, {k:"valor", t:"Valor indenizado", tipo:"brl"}, {k:"quem", t:"Quem pagou", tipo:"txt", larg:24}],
        linhas:dl, total:{ctrc:null, frete:soma(dl, r => r.frete), merc:soma(dl, r => r.merc), valor:totInd}});
    }

    // I) conferência dos arquivos
    const conf = [], cf = (pag, ver, esp, ach, ok) => conf.push({pagador:nomeCurto(pag), ver, esp, ach, sit:ok === null ? "Arquivo não importado" : ok ? "OK" : "Divergente"});
    const fmtMoeda = n => n == null ? "—" : brl(n);
    pags.forEach(p => {
      const t = p.perf && p.perf.total;
      if(t){ const sUn = soma(p.perf.linhas, l => l.exp); cf(p.nome, "Soma das unidades × TOTAL CLIENTE (expedidos)", f0(t.exp), f0(sUn), sUn === t.exp); }
      [["noprazo", "np", "CTRCs entregues no prazo"], ["atr_t", "at", "Atrasados · transportadora"], ["atr_c", "ac", "Atrasados · cliente"]].forEach(([tp, campo, rot]) => {
        const a = p[tp];
        if(!a){ cf(p.nome, rot + " (quantidade)", t ? f0(t[campo]) : "—", "—", t && t[campo] === 0 ? true : null); return; }
        if(t) cf(p.nome, rot + " (quantidade)", f0(t[campo]), f0(a.linhas.length), a.linhas.length === t[campo]);
        if(a.totRel){
          cf(p.nome, rot + " · frete (total do relatório)", fmtMoeda(a.totRel.frete), fmtMoeda(soma(a.linhas, r => r.frete)), a.totRel.frete != null && Math.abs(a.totRel.frete - soma(a.linhas, r => r.frete)) < 0.015);
          cf(p.nome, rot + " · valor de mercadoria (total do relatório)", fmtMoeda(a.totRel.merc), fmtMoeda(soma(a.linhas, r => r.merc)), Math.abs(a.totRel.merc - soma(a.linhas, r => r.merc)) < 0.015);
        }
      });
      if(!p.perf) cf(p.nome, "Performance de Entregas (resumo por destino)", "—", "—", null);
    });
    if(conf.length) secoes.push({id:"conferencia", titulo:"Conferência dos arquivos", descricao:"Compara o que foi lido nas listas com os totais impressos pelo próprio SSW, para garantir que os números batem.",
      colunas:[{k:"pagador", t:"Pagador", tipo:"txt", larg:26}, {k:"ver", t:"Verificação", tipo:"txt", larg:52}, {k:"esp", t:"Relatório", tipo:"txt", larg:18}, {k:"ach", t:"Importado", tipo:"txt", larg:18}, {k:"sit", t:"Situação", tipo:"txt", larg:22, status:true}],
      linhas:conf, total:null});

    // J) arquivos
    secoes.push({id:"arquivos", titulo:"Arquivos importados", descricao:"Arquivos que alimentam este relatório.",
      colunas:[{k:"tipo", t:"Tipo", tipo:"txt", larg:34}, {k:"pagador", t:"Pagador", tipo:"txt", larg:30}, {k:"periodo", t:"Período", tipo:"txt", larg:18}, {k:"nome", t:"Arquivo", tipo:"txt", larg:40}, {k:"linhas", t:"Linhas", tipo:"int"}, {k:"data", t:"Importado em", tipo:"txt", larg:18}],
      linhas:ARQ.slice().sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nome.localeCompare(b.nome)).map(a => ({tipo:NOME_TIPO[a.tipo], pagador:a.grupo ? nomeCurto(a.grupo.nome) : "—", periodo:rotPer(a.per) || "—", nome:a.nome, linhas:a.linhas ? a.linhas.length : 0, data:a.data})),
      total:null, vazio:"Nenhum arquivo importado ainda."});

    const filtro = [per ? "Período " + rotPer(per) : "", sel.size ? "Pagador: " + pagsTodos.filter(p => sel.has(p.cnpj)).map(p => nomeCurto(p.nome)).join(", ") : (pagsTodos.length ? "Todos os pagadores" : "")].filter(Boolean).join(" · ");
    const secT = secoes.find(s => s.id === "frete");
    const secE = comPerf.length ? {id:"ego", grupo:"ego", titulo:"EGO · por unidade", descricao:"",
      colunas:[{k:"un", t:"Unidade", tipo:"txt", larg:12}, {k:"exp", t:"CT-es expedidos", tipo:"int"}, {k:"ent", t:"Entregues", tipo:"int"}, {k:"np", t:"No prazo", tipo:"int"},
        {k:"at", t:"Atraso · culpa transportadora", tipo:"int"}, {k:"ac", t:"Atraso · culpa cliente", tipo:"int"}, {k:"ne", t:"Não entregues", tipo:"int"}, perfCol],
      linhas:unids.filter(u => u.temPerf).sort((a, b) => b.exp - a.exp).map(u => ({un:u.un, exp:u.exp, ent:u.ent, np:u.np, at:u.at, ac:u.ac, ne:u.ne, perf:u.perf})),
      total:{un:null, exp:T.exp, ent:T.ent, np:T.np, at:T.at, ac:T.ac, ne:T.nePrazo + T.neAtr, perf:perfGeral}} : null;
    if(secT){ secT.grupo = "tambasa"; secT.titulo = "TAMBASA · Matriz e Filial"; secT.descricao = ""; }
    const secoesL = [secE, secT].filter(Boolean);
    const blocos = [];
    if(secE) blocos.push({titulo:"EGO — Expresso Goiás entregando para o Do Valle (pagador Do Valle)", kpis:kpis.filter(k => k.grupo === "ego"), secao:secE});
    if(secT) blocos.push({titulo:"TAMBASA — entregas feitas por nós", kpis:kpis.filter(k => k.grupo === "tambasa"), secao:secT});
    return {titulo:"Análise Gerencial", subtitulo:"Tambasa · Rede Do Valle", filtro, meta, kpis, insights:[], secoes:secoesL, blocos, vazio:!blocos.length};
  }

  /* ---------------- formatação ---------------- */
  function fmt(tipo, v){
    if(v == null || v === "") return "—";
    if(tipo === "brl") return brl(+v);
    if(tipo === "int") return f0(+v);
    if(tipo === "dec") return f1(+v);
    if(tipo === "pct") return f1(+v) + "%";
    return String(v);
  }
  const corPerf = (v, meta) => v == null ? "" : v >= meta ? "ok" : v >= meta - 3 ? "mid" : "bad";

  /* ---------------- tela ---------------- */
  function html(){
    return `<h2 class="section-title">Análise Gerencial</h2>
      <p class="section-desc">Importe as bases, confira o relatório e exporte em PDF ou Excel. Os arquivos ficam guardados neste navegador até você excluir.</p>
      <div id="agRoot"></div>`;
  }
  function graficoHTML(g, meta){
    if(!g || !g.itens.length) return "";
    const max = g.meta ? 100 : Math.max.apply(null, g.itens.map(i => i.v)) || 1;
    return `<div class="ag-chart"><div class="ag-chart-t">${esc(g.titulo)}</div>${g.itens.map(i =>
      `<div class="ag-bar-row"><span class="ag-bar-l" title="${esc(i.r)}">${esc(i.r)}</span><div class="ag-bar-tr"><i class="${g.meta ? "c-" + corPerf(i.v, meta) : ""}" style="width:${Math.max(1.5, i.v / max * 100)}%"></i></div><b>${esc(i.txt)}</b></div>`).join("")}</div>`;
  }
  function tabelaHTML(s, meta){
    if(!s.linhas.length) return `<div class="ag-vazio">${esc(s.vazio || "Sem dados.")}</div>`;
    const alin = c => c.tipo === "txt" ? "" : "r", LIM = 300, vis = s.linhas.slice(0, LIM);
    const cel = (c, v) => {
      let cls = alin(c);
      if(c.meta && v != null) cls += " p-" + corPerf(v, meta);
      if(c.status) cls += v === "OK" ? " p-ok" : v === "Divergente" ? " p-bad" : " p-mid";
      return `<td class="${cls}">${esc(fmt(c.tipo, v))}</td>`;
    };
    return `<div class="ag-scroll"><table class="ag-tab"><thead><tr>${s.colunas.map(c => `<th class="${alin(c)}">${esc(c.t)}</th>`).join("")}</tr></thead><tbody>`
      + vis.map(l => `<tr>${s.colunas.map(c => cel(c, l[c.k])).join("")}</tr>`).join("")
      + (s.total ? `<tr class="ag-tot">${s.colunas.map((c, i) => (i === 0 && s.total[c.k] == null) ? `<td>TOTAL</td>` : cel(c, s.total[c.k])).join("")}</tr>` : "")
      + `</tbody></table></div>` + (s.linhas.length > LIM ? `<div class="ag-more">Mostrando ${LIM} de ${f0(s.linhas.length)} linhas — o PDF e o Excel trazem todas.</div>` : "");
  }
  function filtrosHTML(){
    const ps = periodosDisponiveis(), pg = pagadoresDisponiveis(), atual = periodoAtual(), sel = new Set(UI.pag);
    if(!ps.length && !pg.length) return "";
    return `<div class="ag-filtros">
      ${ps.length ? `<label>Período<select data-ag-per>${ps.map(p => `<option value="${chavePer(p)}" ${atual && chavePer(p) === chavePer(atual) ? "selected" : ""}>${rotPer(p)}</option>`).join("")}</select></label>` : ""}
      ${pg.length ? `<div class="ag-chips"><span>Pagador</span><button type="button" class="${!sel.size ? "on" : ""}" data-ag-pag="*">Todos</button>${pg.map(p => `<button type="button" class="${sel.has(p.cnpj) ? "on" : ""}" data-ag-pag="${esc(p.cnpj)}" title="${esc(p.nome)}">${esc(nomeCurto(p.nome))}</button>`).join("")}</div>` : ""}
      <label>Meta de performance (%)<input type="number" min="0" max="100" step="0.5" value="${esc(UI.meta)}" data-ag-meta></label>
    </div>`;
  }
  function importHTML(){
    return `<div class="ag-grid">${BASES.map(b => {
      const l = ARQ.filter(a => b.tipos.indexOf(a.tipo) >= 0).sort((x, y) => (x.grupo ? x.grupo.nome : "").localeCompare(y.grupo ? y.grupo.nome : "") || x.tipo.localeCompare(y.tipo));
      return `<div class="panel ag-card">
        <div class="ag-card-top"><span class="ag-num">${b.n}</span><div><div class="ag-card-t">${esc(b.titulo)}</div><div class="ag-card-d">${esc(b.desc)}</div></div></div>
        <label class="ag-drop" data-drop="${b.id}"><input type="file" multiple accept=".sswweb,.csv,.txt" data-file="${b.id}" hidden>
          <b>${esc(b.dica)}</b><span>ou clique para escolher · vários arquivos de uma vez</span></label>
        ${l.length ? `<div class="ag-files">${l.map(a => `<div class="ag-file"><div class="ag-file-i"><b title="${esc(a.nome)}">${esc(NOME_TIPO[a.tipo])}</b>
            <span>${a.grupo ? esc(nomeCurto(a.grupo.nome)) + " · " : ""}${a.per ? esc(rotPer(a.per)) + " · " : ""}${f0(a.linhas ? a.linhas.length : 0)} linhas</span>
            <em title="${esc(a.nome)}">${esc(a.nome)} · ${kb(a.tam)} · ${esc(a.data)}</em></div>
            <button type="button" class="btn btn-ghost btn-sm" data-del="${esc(a.id)}">Excluir</button></div>`).join("")}</div>` : `<div class="ag-vazio">Nenhum arquivo importado.</div>`}
      </div>`;
    }).join("")}</div>`;
  }
  function render(){
    const root = document.getElementById("agRoot"); if(!root) return;
    const M = construir();
    root.innerHTML = `
      ${msg ? `<div class="ag-msg ag-msg-${msg.tipo}">${esc(msg.txt)}</div>` : ""}
      <div class="ag-bar">
        <div class="pg-subtabs ag-tabs">
          <button type="button" class="pg-subtab-btn ${UI.aba === "relatorio" ? "active" : ""}" data-ag-aba="relatorio">Relatório</button>
          <button type="button" class="pg-subtab-btn ${UI.aba === "importar" ? "active" : ""}" data-ag-aba="importar">Importar bases</button>
        </div>
        <div class="ag-exp">
          <button type="button" class="btn btn-ghost" data-exp="pdf">Exportar PDF</button>
          <button type="button" class="btn btn-primary" data-exp="xlsx">Exportar Excel</button>
        </div>
      </div>
      ${UI.aba === "importar" ? importHTML() : `
        ${filtrosHTML()}
        ${M.vazio ? `<div class="ag-vazio ag-vazio-g"><b>Nenhum dado para analisar ainda.</b><br>Vá em <a href="#" data-ag-aba="importar">Importar bases</a> e solte os arquivos do SSW.</div>` : ""}
        ${M.blocos.map(b => `<div class="ag-bloco"><div class="ag-bloco-t">${esc(b.titulo)}</div>
          <div class="ag-kpis">${b.kpis.map(k => `<div class="ag-kpi ${k.perf != null ? "k-" + corPerf(k.perf, M.meta) : ""}"><span>${esc(k.rotulo.replace(/^(EGO|Tambasa) · /, ""))}</span><b>${esc(k.valor)}</b>${k.nota ? `<em>${esc(k.nota)}</em>` : ""}</div>`).join("")}</div>
          <div class="panel ag-sec" id="ag-s-${b.secao.id}">${tabelaHTML(b.secao, M.meta)}</div></div>`).join("")}`}`;
    msg = null;
  }
  function eventos(){
    const sec = document.getElementById("sec-analise-gerencial"); if(!sec) return;
    sec.addEventListener("click", ev => {
      const a = ev.target.closest("[data-ag-aba]");
      if(a){ ev.preventDefault(); UI.aba = a.dataset.agAba; salvarUI(); render(); return; }
      const pg = ev.target.closest("[data-ag-pag]");
      if(pg){ const c = pg.dataset.agPag; if(c === "*") UI.pag = []; else UI.pag = UI.pag.indexOf(c) >= 0 ? UI.pag.filter(x => x !== c) : UI.pag.concat([c]); salvarUI(); render(); return; }
      const d = ev.target.closest("[data-del]");
      if(d){ const id = d.dataset.del, r = ARQ.find(x => x.id === id);
        if(r && confirm("Excluir \"" + NOME_TIPO[r.tipo] + (r.grupo ? " · " + r.grupo.nome : "") + "\" (" + r.nome + ")?")) dbApagar(id).then(() => { ARQ = ARQ.filter(x => x.id !== id); render(); }); return; }
      const x = ev.target.closest("[data-exp]");
      if(x){ if(x.dataset.exp === "pdf") exportarPDF(); else exportarExcel(); }
    });
    sec.addEventListener("change", ev => {
      const i = ev.target.closest("[data-file]");
      if(i && i.files.length){ const t = i.dataset.file, fl = [...i.files]; i.value = ""; importar(t, fl); return; }
      const p = ev.target.closest("[data-ag-per]"); if(p){ UI.per = p.value; salvarUI(); render(); return; }
      const m = ev.target.closest("[data-ag-meta]"); if(m){ UI.meta = Math.min(100, Math.max(0, parseFloat(m.value) || 98)); salvarUI(); render(); }
    });
    sec.addEventListener("dragover", ev => { const z = ev.target.closest("[data-drop]"); if(z){ ev.preventDefault(); z.classList.add("on"); } });
    sec.addEventListener("dragleave", ev => { const z = ev.target.closest("[data-drop]"); if(z) z.classList.remove("on"); });
    sec.addEventListener("drop", ev => { const z = ev.target.closest("[data-drop]"); if(z){ ev.preventDefault(); z.classList.remove("on"); if(ev.dataTransfer.files.length) importar(z.dataset.drop, [...ev.dataTransfer.files]); } });
  }

  /* =====================================================================
     EXPORTAÇÃO — desenha o modelo de construir()
     ===================================================================== */
  const nomeArq = ext => "Analise_Gerencial_Tambasa_" + new Date().toISOString().slice(0, 10) + "." + ext;
  const RGB = {ok:[226, 241, 220], mid:[255, 243, 214], bad:[253, 226, 223]}, TXT = {ok:[45, 106, 23], mid:[150, 98, 6], bad:[185, 40, 33]};
  const HEX = {ok:"FFE2F1DC", mid:"FFFFF3D6", bad:"FFFDE2DF"}, HEXT = {ok:"FF2D6A17", mid:"FF966206", bad:"FFB92821"};

  async function exportarExcel(){
    if(typeof ExcelJS === "undefined"){ alert("Não consegui carregar a biblioteca de Excel (ExcelJS). Verifique a conexão e recarregue a página."); return; }
    try{
      const M = construir(), wb = new ExcelJS.Workbook();
      wb.creator = "Painel de Controle"; wb.created = new Date();
      const VERDE = "FF3B8A1F", GRAFITE = "FF161C16", CLARO = "FFF4F7F1", LINHA = "FFDDE3D9", borda = {style:"thin", color:{argb:LINHA}};
      const fill = a => ({type:"pattern", pattern:"solid", fgColor:{argb:a}});
      const faixa = (ws, ate, texto, tam, cor, alt) => {
        const r = ws.addRow([texto]); ws.mergeCells(r.number, 1, r.number, ate); r.height = alt;
        const c = r.getCell(1); c.font = {name:"Arial", size:tam, bold:true, color:{argb:"FFFFFFFF"}}; c.fill = fill(cor); c.alignment = {vertical:"middle", indent:1};
      };

      // ----- Resumo executivo -----
      const ws0 = wb.addWorksheet("Resumo", {views:[{showGridLines:false}]});
      ws0.columns = [{width:34}, {width:24}, {width:62}];
      faixa(ws0, 3, M.titulo.toUpperCase() + " · " + M.subtitulo, 16, GRAFITE, 34);
      faixa(ws0, 3, (M.filtro ? M.filtro + " · " : "") + "Gerado em " + agoraBR(), 10, VERDE, 20);
      ws0.addRow([]);
      const h = ws0.addRow(["Indicador", "Valor", "Observação"]);
      h.eachCell(c => { c.font = {name:"Arial", bold:true, color:{argb:"FFFFFFFF"}, size:10}; c.fill = fill(VERDE); c.alignment = {vertical:"middle", indent:1}; });
      M.kpis.forEach((k, i) => {
        const r = ws0.addRow([k.rotulo, k.valor, k.nota || ""]);
        r.eachCell(c => { c.font = {name:"Arial", size:10}; c.border = {bottom:borda}; c.alignment = {indent:1, vertical:"middle"}; if(i % 2) c.fill = fill(CLARO); });
        r.getCell(2).font = {name:"Arial", size:10, bold:true};
        if(k.perf != null){ const t = corPerf(k.perf, M.meta); r.getCell(2).fill = fill(HEX[t]); r.getCell(2).font = {name:"Arial", size:10, bold:true, color:{argb:HEXT[t]}}; }
      });
      if(M.insights.length){
        ws0.addRow([]);
        const t = ws0.addRow(["Leitura do período"]); t.getCell(1).font = {name:"Arial", bold:true, size:11, color:{argb:GRAFITE}};
        M.insights.forEach(x => { const r = ws0.addRow([x]); ws0.mergeCells(r.number, 1, r.number, 3); r.getCell(1).font = {name:"Arial", size:10}; r.getCell(1).alignment = {wrapText:true, vertical:"top", indent:1}; r.height = x.length > 120 ? 30 : 18; });
      }
      ws0.addRow([]);
      const ct = ws0.addRow(["Conteúdo do relatório"]); ct.getCell(1).font = {name:"Arial", bold:true, size:11, color:{argb:GRAFITE}};
      M.secoes.forEach(s => { const r = ws0.addRow([s.titulo, f0(s.linhas.length) + " linhas", s.descricao || ""]); r.eachCell(c => c.font = {name:"Arial", size:9}); });
      ws0.addRow([]);
      const lg = ws0.addRow(["Cores da performance: verde ≥ " + f1(M.meta) + "% · amarelo até 3 pontos abaixo da meta · vermelho abaixo disso."]); ws0.mergeCells(lg.number, 1, lg.number, 3);
      lg.getCell(1).font = {name:"Arial", italic:true, size:9, color:{argb:"FF667360"}};
      ws0.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};

      // ----- uma aba por seção -----
      const usados = new Set(["Resumo"]);
      M.secoes.forEach(s => {
        if(s.id === "arquivos" && !s.linhas.length) return;
        const ABAS = {pagadores:"Pagadores", unidades:"Unidades", cidades:"Cidades", motivos:"Motivos de atraso", clientes:"Remetentes", atrasados:"CTRCs atrasados",
          frete:"Frete Valle x Origem", "ind-resp":"Indenizações", "ind-det":"Indenizações detalhe", conferencia:"Conferência", arquivos:"Arquivos"};
        let nome = ABAS[s.id] || s.titulo.replace(/[\\\/\?\*\[\]:·×]/g, "").replace(/\s+/g, " ").trim().slice(0, 28) || s.id, n = 2;
        while(usados.has(nome)) nome = nome.slice(0, 25) + " " + n++;
        usados.add(nome);
        const ws = wb.addWorksheet(nome, {views:[{showGridLines:false}]});
        ws.columns = s.colunas.map(c => ({width: c.larg || (c.tipo === "brl" ? 18 : 14)}));
        faixa(ws, s.colunas.length, s.titulo, 14, GRAFITE, 30);
        faixa(ws, s.colunas.length, (s.descricao || "") + (M.filtro ? "  ·  " + M.filtro : ""), 9, VERDE, 18);
        ws.addRow([]);
        const cab = ws.addRow(s.colunas.map(c => c.t)), iCab = cab.number; cab.height = 30;
        cab.eachCell(c => { c.font = {name:"Arial", bold:true, size:10, color:{argb:"FFFFFFFF"}}; c.fill = fill(VERDE); c.alignment = {vertical:"middle", horizontal:"center", wrapText:true}; });
        if(!s.linhas.length){
          const r = ws.addRow([s.vazio || "Sem dados."]); ws.mergeCells(r.number, 1, r.number, s.colunas.length);
          r.getCell(1).font = {name:"Arial", italic:true, size:10, color:{argb:"FF667360"}}; r.getCell(1).alignment = {indent:1};
        }else{
          const linhas = s.linhas.concat(s.total ? [Object.assign({__t:1}, s.total)] : []);
          linhas.forEach((l, i) => {
            const r = ws.addRow(s.colunas.map((c, j) => (l.__t && j === 0 && l[c.k] == null) ? "TOTAL" : (l[c.k] == null ? "" : (c.tipo === "txt" ? String(l[c.k]) : +l[c.k]))));
            r.eachCell({includeEmpty:true}, (cel, j) => {
              const c = s.colunas[j - 1]; if(!c) return;
              cel.font = {name:"Arial", size:10, bold:!!l.__t}; cel.border = {bottom:borda};
              if(c.tipo === "brl") cel.numFmt = '"R$" #,##0.00'; else if(c.tipo === "int") cel.numFmt = "#,##0"; else if(c.tipo === "pct") cel.numFmt = '0.0"%"'; else if(c.tipo === "dec") cel.numFmt = "0.0";
              cel.alignment = {horizontal:c.tipo === "txt" ? "left" : "right", vertical:"middle", wrapText:c.tipo === "txt" && c.larg >= 30};
              if(l.__t) cel.fill = fill("FFE8F1E1"); else if(i % 2) cel.fill = fill(CLARO);
              const v = l[c.k];
              if(c.meta && v != null){ const t = corPerf(+v, M.meta); cel.fill = fill(HEX[t]); cel.font = {name:"Arial", size:10, bold:true, color:{argb:HEXT[t]}}; }
              if(c.status && v != null){ const t = v === "OK" ? "ok" : v === "Divergente" ? "bad" : "mid"; cel.fill = fill(HEX[t]); cel.font = {name:"Arial", size:10, bold:true, color:{argb:HEXT[t]}}; }
            });
          });
          ws.autoFilter = {from:{row:iCab, column:1}, to:{row:iCab, column:s.colunas.length}};
        }
        ws.views = [{state:"frozen", ySplit:iCab, showGridLines:false}];
        ws.pageSetup = {orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0};
      });

      const buf = await wb.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
      const a = document.createElement("a"); a.href = url; a.download = nomeArq("xlsx"); document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }catch(err){ console.error(err); alert("Não foi possível gerar o Excel: " + (err.message || err)); }
  }

  function exportarPDF(){
    if(!window.jspdf || !window.jspdf.jsPDF){ alert("Não consegui carregar a biblioteca de PDF (jsPDF). Verifique a conexão e recarregue a página."); return; }
    try{
      const M = construir(), doc = new window.jspdf.jsPDF({orientation:"landscape", unit:"mm", format:"a4"});
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), MG = 12, LARG = W - 2 * MG;
      const VERDE = [59, 138, 31], GRAF = [22, 28, 22], CLARO = [244, 247, 241], MUT = [102, 115, 96];
      const txtCor = c => doc.setTextColor(c[0], c[1], c[2]);

      // faixa do topo
      doc.setFillColor(...GRAF); doc.rect(0, 0, W, 26, "F");
      doc.setFillColor(...VERDE); doc.rect(0, 26, W, 2.2, "F");
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.text(M.titulo, MG, 14);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text(M.subtitulo + (M.filtro ? "  ·  " + M.filtro : ""), MG, 20.5);
      doc.setFontSize(9); doc.text("Gerado em " + agoraBR(), W - MG, 14, {align:"right"});

      let y = 35;
      // cartões de KPI (4 por linha)
      if(M.kpis.length){
        const por = 4, gap = 5, cw = (LARG - gap * (por - 1)) / por, ch = 21;
        M.kpis.forEach((k, i) => {
          const col = i % por, lin = Math.floor(i / por), x = MG + col * (cw + gap), yy = y + lin * (ch + 4);
          const t = k.perf != null ? corPerf(k.perf, M.meta) : null;
          doc.setFillColor(...(t ? RGB[t] : CLARO)); doc.setDrawColor(221, 227, 217); doc.roundedRect(x, yy, cw, ch, 2, 2, "FD");
          doc.setFillColor(...(t ? TXT[t] : VERDE)); doc.rect(x, yy, 1.6, ch, "F");
          txtCor(MUT); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text(String(k.rotulo).toUpperCase(), x + 5, yy + 6);
          txtCor(t ? TXT[t] : GRAF); doc.setFont("helvetica", "bold"); doc.setFontSize(k.valor.length > 14 ? 12.5 : 15); doc.text(String(k.valor), x + 5, yy + 13.5);
          txtCor(MUT); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.text(doc.splitTextToSize(String(k.nota || ""), cw - 8)[0] || "", x + 5, yy + 18.4);
        });
        y += Math.ceil(M.kpis.length / por) * (ch + 4) + 3;
      }
      // leitura do período
      if(M.insights.length){
        const linhas = []; M.insights.forEach(t => doc.splitTextToSize("•  " + t, LARG - 8).forEach((l, i) => linhas.push(i ? "    " + l : l)));
        const alt = 9 + linhas.length * 4.6;
        if(y + alt > H - 16){ doc.addPage(); y = 16; }
        doc.setFillColor(...CLARO); doc.setDrawColor(221, 227, 217); doc.roundedRect(MG, y, LARG, alt, 2, 2, "FD");
        txtCor(GRAF); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("Leitura do período", MG + 4, y + 6);
        doc.setFont("helvetica", "normal"); doc.setFontSize(9); linhas.forEach((l, i) => doc.text(l, MG + 4, y + 11.5 + i * 4.6));
        y += alt + 8;
      }
      if(M.vazio){ txtCor(MUT); doc.setFont("helvetica", "italic"); doc.setFontSize(11); doc.text("Nenhum dado importado ainda.", MG, y + 6); }

      // gráfico de barras
      const grafico = (g) => {
        const itens = g.itens; if(!itens.length) return;
        const rh = 5.2, alt = 8 + itens.length * rh;
        if(y + alt > H - 16){ doc.addPage(); y = 16; }
        txtCor(GRAF); doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.text(g.titulo, MG, y + 3);
        const max = g.meta ? 100 : Math.max.apply(null, itens.map(i => i.v)) || 1, x0 = MG + 62, bw = LARG - 62 - 30;
        itens.forEach((it, i) => {
          const yy = y + 8 + i * rh, t = g.meta ? corPerf(it.v, M.meta) : null;
          txtCor(GRAF); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text(doc.splitTextToSize(String(it.r), 58)[0], MG, yy + 2.6);
          doc.setFillColor(236, 238, 233); doc.rect(x0, yy, bw, 3.6, "F");
          doc.setFillColor(...(t ? TXT[t] : VERDE)); doc.rect(x0, yy, Math.max(0.8, it.v / max * bw), 3.6, "F");
          doc.setFont("helvetica", "bold"); doc.text(String(it.txt), x0 + bw + 3, yy + 2.8);
        });
        y += alt + 3;
      };

      // seções
      M.secoes.forEach(s => {
        if(s.id === "arquivos" && !s.linhas.length) return;
        if(y > H - 52){ doc.addPage(); y = 16; }
        doc.setFillColor(...GRAF); doc.rect(MG, y, LARG, 7, "F"); doc.setFillColor(...VERDE); doc.rect(MG, y, 1.8, 7, "F");
        doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text(s.titulo, MG + 5, y + 4.9);
        y += 10;
        if(s.descricao){ txtCor(MUT); doc.setFont("helvetica", "normal"); doc.setFontSize(8.2); const dl = doc.splitTextToSize(s.descricao, LARG); doc.text(dl, MG, y + 1.5); y += dl.length * 3.8 + 3; }
        if(s.grafico) grafico(s.grafico);
        const larga = s.colunas.length > 10;
        const corpo = s.linhas.map(l => s.colunas.map(c => fmt(c.tipo, l[c.k])));
        if(s.total && s.linhas.length) corpo.push(s.colunas.map((c, i) => (i === 0 && s.total[c.k] == null) ? "TOTAL" : fmt(c.tipo, s.total[c.k])));
        const estilosCol = {}; s.colunas.forEach((c, i) => { if(c.tipo !== "txt") estilosCol[i] = {halign:"right"}; });
        if(!corpo.length){
          doc.setFillColor(...CLARO); doc.roundedRect(MG, y, LARG, 10, 1.5, 1.5, "F"); txtCor(MUT); doc.setFont("helvetica", "italic"); doc.setFontSize(9); doc.text(s.vazio || "Sem dados.", MG + 4, y + 6.3);
          y += 17;
        }else{
          doc.autoTable({startY:y, head:[s.colunas.map(c => c.t)], body:corpo, margin:{left:MG, right:MG, top:14, bottom:16}, theme:"grid",
            styles:{font:"helvetica", fontSize:larga ? 6.6 : 8.2, cellPadding:larga ? 1.4 : 1.9, lineColor:[221, 227, 217], lineWidth:0.15, textColor:GRAF, overflow:"linebreak"},
            headStyles:{fillColor:VERDE, textColor:255, fontStyle:"bold", halign:"center", valign:"middle"},
            alternateRowStyles:{fillColor:CLARO}, columnStyles:estilosCol,
            didParseCell: d => {
              if(d.section !== "body") return;
              const c = s.colunas[d.column.index], l = s.linhas[d.row.index];
              if(s.total && d.row.index === corpo.length - 1){ d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = [232, 241, 225]; }
              if(l && c.meta && l[c.k] != null){ const t = corPerf(+l[c.k], M.meta); d.cell.styles.fillColor = RGB[t]; d.cell.styles.textColor = TXT[t]; d.cell.styles.fontStyle = "bold"; }
              if(l && c.status){ const t = l[c.k] === "OK" ? "ok" : l[c.k] === "Divergente" ? "bad" : "mid"; d.cell.styles.fillColor = RGB[t]; d.cell.styles.textColor = TXT[t]; d.cell.styles.fontStyle = "bold"; }
            }});
          y = doc.lastAutoTable.finalY + 10;
        }
      });

      // rodapé com paginação
      const tp = doc.internal.getNumberOfPages();
      for(let p = 1; p <= tp; p++){
        doc.setPage(p); doc.setDrawColor(221, 227, 217); doc.line(MG, H - 10, W - MG, H - 10);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); txtCor(MUT);
        doc.text(M.titulo + " · " + M.subtitulo, MG, H - 5.5); doc.text("Página " + p + " de " + tp, W - MG, H - 5.5, {align:"right"});
      }
      doc.save(nomeArq("pdf"));
    }catch(err){ console.error(err); alert("Não foi possível gerar o PDF: " + (err.message || err)); }
  }

  /* ---------------- ganchos usados pelo app.js ---------------- */
  window.analiseGerencialHTML = html;
  window.attachAnaliseGerencial = function(){
    eventos(); render();
    dbTodos().then(atualizarVersao).then(l => { ARQ = l; render(); })
      .catch(() => { msg = {tipo:"aviso", txt:"Este navegador não permite guardar arquivos grandes (IndexedDB). A importação não ficará salva."}; render(); });
  };
  window.analiseGerencialRefresh = function(){ render(); };
  window.__analiseGerencial = {construir, importar, montar, calcPerf, get ARQ(){ return ARQ; }, set ARQ(v){ ARQ = v; }, UI};
})();

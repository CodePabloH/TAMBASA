/* =====================================================================
   AUDITORIA + SAÚDE DOS DADOS  v1.0   (alimenta o Centro de comando)
   ---------------------------------------------------------------------
   Todos os usuários logados enviam (em silêncio) o que fazem:
     - entrou no painel, abriu uma tela
     - cliques em ações (publicar, apagar, limpar, exportar, finalizar...)
       e, nas críticas, se a pessoa confirmou ou cancelou
     - IMPORTAÇÕES: arquivo, tamanho, mensagem de resultado, linhas lidas
       e se deu certo, aviso ou erro
     - publicações para os usuários (sincronização)
   O administrador vê, no Centro de comando: saúde dos dados (última carga
   de cada fonte e atraso), atividade por usuário, alertas e a linha do
   tempo "quem fez o quê". Se o tempo real cair, atualiza sozinho a cada 20 s.
   Precisa da tabela painel_auditoria: rode supabase-auditoria.sql (separado).
   Nada aqui altera dados do painel; se algo falhar, o painel segue normal.
   ===================================================================== */
(function(){
  "use strict";
  if(window.AUDITORIA) return;
  const M = window.MONITOR;
  if(!M || !M.conexao) return;

  const TBL = "painel_auditoria", LIMK = "__aud_limite_h";
  const A = {
    fila: [], enviando: false, prox: 0, falhas: 0, erro: "", env: 0, tF: null,
    linhas: [], ids: new Set(), chaves: new Set(), usuarios: [], erroLeitura: "", carregou: false,
    cl: null, canal: null, rt: "—", ultPoll: 0, sessaoReg: false, limpou: false,
    filtro: "todos", usuario: "", limiteH: 26, confirm: null, arq: null, obs: null, tObs: null,
    ultTela: "", ultTelaT: 0, ultClique: "", ultCliqueT: 0, ultDesenho: 0, vistos: new Set(),
    rl: [], sup: 0, maxId: 0
  };
  try{ const v = Number(localStorage.getItem(LIMK)); if(v > 0) A.limiteH = v; }catch(e){}

  /* ---------- utilitários ---------- */
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const C = () => { try{ return M.conexao(); }catch(e){ return null; } };
  const ehAdmin = () => window.AUTH_PAPEL === "admin";
  const tmp = r => { const t = Date.parse(r.ocorreu_em || r.criado_em); return isNaN(t) ? Date.now() : t; };
  const nome = e => String(e || "—").split("@")[0];
  const dh = t => new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const hm = t => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const ha = t => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? "há " + s + " s" : s < 3600 ? "há " + Math.floor(s / 60) + " min" : s < 172800 ? "há " + Math.floor(s / 3600) + " h" : "há " + Math.floor(s / 86400) + " dias"; };
  const ativa = () => { const s = $("sec-monitor"); return !!(s && s.classList.contains("active")); };
  const ausente = e => /pgrst205|42p01|could not find the table|does not exist/.test(String((e && (e.message || e.code)) || e).toLowerCase());
  const tela = () => { try{ return typeof abaAtual !== "undefined" ? String(abaAtual || "") : ""; }catch(e){ return ""; } };
  const telaNome = id => { try{ const t = typeof tabInfoDe === "function" ? tabInfoDe(id) : null; return t ? t.label : (id || "—"); }catch(e){ return id || "—"; } };
  const versao = () => { try{ return (window.SYNC && window.SYNC.versaoLocal && window.SYNC.versaoLocal()) || ""; }catch(e){ return ""; } };
  const chave = r => tmp(r) + "|" + (r.sessao || "") + "|" + r.tipo + "|" + r.descricao;
  /* horas úteis entre dois instantes: sábado e domingo não contam como atraso */
  function horasUteis(de, ate){
    let h = 0;
    for(let t = Math.floor(de / 3600000) * 3600000; t < ate; t += 3600000){
      const d = new Date(t).getDay();
      if(d > 0 && d < 6) h += (Math.min(t + 3600000, ate) - Math.max(t, de)) / 3600000;
    }
    return h;
  }

  /* =====================================================================
     REGISTRO E ENVIO (todos os usuários)
     ===================================================================== */
  function registrar(tipo, desc, extra){
    try{
      const c = C(), x = extra || {};
      const ag = Date.now(); A.rl = A.rl.filter(t => ag - t < 60000);
      if(A.rl.length >= 60){ A.sup++; return; }          // no máx. 60 registros por minuto neste navegador (o excesso vira 1 aviso)
      A.rl.push(ag);
      const row = {
        ocorreu_em: new Date().toISOString(), email: (c && c.email) || String(window.AUTH_EMAIL || "").toLowerCase(),
        papel: window.AUTH_PAPEL || (c && c.papel) || "", sessao: (c && c.sessao) || M.sessao || "", tipo,
        tela: x.tela != null ? x.tela : tela(), descricao: String(desc || "").slice(0, 300), nivel: x.nivel || "info",
        detalhe: x.detalhe || null, versao: versao()
      };
      A.fila.push(row); if(A.fila.length > 200) A.fila.shift();
      if(ehAdmin()) adicionar(Object.assign({}, row), false);      // admin vê o próprio registro na hora
      agendar(1500);
    }catch(e){}
  }
  function agendar(ms){ if(A.tF && ms > 0) return; clearTimeout(A.tF); A.tF = setTimeout(enviar, ms); }

  async function enviar(){
    A.tF = null;
    const c = C();
    if(!c || !c.ativo || !c.cl || A.enviando || !A.fila.length) return;
    if(Date.now() < A.prox){ agendar(A.prox - Date.now()); return; }
    if(A.sup && A.rl.length < 60){ A.fila.push({ ocorreu_em: new Date().toISOString(), email: c.email, papel: c.papel, sessao: c.sessao, tipo: "acao", tela: tela(), descricao: A.sup + " registro(s) deste navegador foram descartados (excesso por minuto)", nivel: "aviso", detalhe: null, versao: versao() }); A.sup = 0; }
    const lote = A.fila.splice(0, 25);
    lote.forEach(r => { if(!r.email) r.email = c.email; if(!r.sessao) r.sessao = c.sessao; });
    A.enviando = true;
    try{
      const { error } = await c.cl.from(TBL).insert(lote);
      if(error) throw error;
      A.env += lote.length; A.falhas = 0; A.prox = 0; A.erro = "";
    }catch(e){
      A.falhas++;
      const m = String((e && e.message) || e);
      A.fila = lote.concat(A.fila).slice(0, 200);
      A.prox = Date.now() + (ausente(e) ? 300000 : Math.min(60000, 3000 * Math.pow(2, Math.min(A.falhas, 5))));
      if(A.erro !== m){
        A.erro = ausente(e) ? "Tabela painel_auditoria não existe: rode supabase-auditoria.sql no Supabase." : m;
        try{ M.log("monitor", "aviso", "Auditoria não conseguiu gravar: " + m.slice(0, 160)); }catch(x){}
      }
    }finally{
      A.enviando = false;
      if(A.fila.length) agendar(Math.max(1500, A.prox - Date.now()));
      redesenhar();
    }
  }
  /* aba fechando: manda o que sobrou (fetch keepalive) */
  window.addEventListener("pagehide", () => {
    try{
      const c = C();
      if(!c || !c.ativo || !c.token || !c.url || !A.fila.length || Date.now() < A.prox) return;
      const rows = A.fila.splice(0, 20).map(r => Object.assign({}, r, { email: r.email || c.email, sessao: r.sessao || c.sessao }));
      fetch(c.url + "/rest/v1/" + TBL, { method: "POST", keepalive: true,
        headers: { apikey: c.key, Authorization: "Bearer " + c.token, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(rows) }).catch(() => {});
    }catch(e){}
  });
  document.addEventListener("visibilitychange", () => { if(document.hidden && A.fila.length) agendar(0); });

  /* =====================================================================
     CAPTURA DO QUE A PESSOA FAZ
     ===================================================================== */
  /* confirm(): guarda se a pessoa confirmou ou cancelou */
  try{
    const c0 = window.confirm;
    window.confirm = function(m){ const r = c0.apply(this, arguments); A.confirm = { t: Date.now(), msg: String(m || ""), res: !!r }; return r; };
  }catch(e){}

  /* telas: envolve switchTab (uma vez, depois que o app.js carregou) */
  function envolverTab(){
    try{
      if(typeof window.switchTab !== "function" || window.switchTab.__aud) return;
      const o = window.switchTab;
      const w = function(id){
        try{
          const agora = Date.now();
          if(id && id !== "monitor" && (id !== A.ultTela || agora - A.ultTelaT > 600000)){
            A.ultTela = id; A.ultTelaT = agora;
            registrar("tela", "Abriu a tela " + telaNome(id), { tela: id });
          }
        }catch(e){}
        return o.apply(this, arguments);
      };
      w.__aud = true; window.switchTab = w;
    }catch(e){}
  }

  /* ações: cliques em botões com verbo de ação */
  const RE_ACAO = /(publicar|apagar|excluir|remover|limpar|redefinir|restaurar|substituir|importar|processar|exportar|baixar|gerar|finalizar|arquivar|ocultar|salvar|enviar|marcar|restaurar)/i;
  const RE_CRIT = /(apagar|excluir|remover|limpar|redefinir|restaurar|substituir)/i;
  document.addEventListener("click", ev => {
    try{
      const b = ev.target && ev.target.closest ? ev.target.closest("button,.btn,[role=button],a.btn,label.btn") : null;
      if(!b || b.closest("#tabsNav") || b.closest(".sidebar")) return;
      if(b.closest("#sec-monitor") && b.id !== "monApagarR") return;
      const txt = String(b.getAttribute("aria-label") || b.title || b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80);
      if(!txt || !RE_ACAO.test(txt)) return;
      const agora = Date.now();
      if(txt === A.ultClique && agora - A.ultCliqueT < 1500) return;
      A.ultClique = txt; A.ultCliqueT = agora;
      const crit = RE_CRIT.test(txt), t0 = agora, tl = tela();
      setTimeout(() => {
        const cf = A.confirm && A.confirm.t >= t0 - 50 && A.confirm.t <= t0 + 1500 ? A.confirm : null;
        const cancelou = cf && !cf.res;
        registrar(crit && !cancelou ? "critico" : "acao",
          (cancelou ? "Cancelou: " : "Clicou em ") + '"' + txt + '"' + (cf && cf.res ? " (confirmou)" : ""),
          { tela: tl, nivel: crit && !cancelou ? "aviso" : "info", detalhe: cf ? { pergunta: cf.msg.slice(0, 200), confirmou: cf.res } : null });
      }, 350);
    }catch(e){}
  }, true);

  /* importações: arquivo escolhido + mensagem de resultado que a tela mostra */
  const RE_ERRO = /n[aã]o (encontrei|consegui|foi poss[ií]vel|reconhe|identific)|falhou|falha |inv[aá]lid|selecione|nenhum(a)? (linha|registro|pacote)|erro ao|erro:|sem linhas/i;
  const RE_IGN = /(\d[\d.]*)\s*(linhas?\s+|registros?\s+)?(ignorad|rejeitad|descartad|duplicad|inv[aá]lid)/i;
  function pararObs(){ try{ if(A.obs) A.obs.disconnect(); }catch(e){} A.obs = null; clearTimeout(A.tObs); A.tObs = null; }
  function fecharImport(texto){
    const a = A.arq; if(!a) return;
    A.arq = null; pararObs();
    const kb = Math.max(1, Math.round(a.tamanho / 1024));
    let nivel = "ok", linhas = null, ign = null, res = String(texto || "").replace(/\s+/g, " ").trim().slice(0, 300);
    if(!texto){ nivel = a.enviou ? "aviso" : "info"; res = a.enviou ? "sem mensagem de resultado na tela" : "arquivo escolhido (sem confirmação de importação)"; }
    else{
      if(RE_ERRO.test(res)) nivel = "erro";
      const m = res.match(/(\d[\d.]*)\s*(linhas?|pacotes?|registros?|NFs?|notas?|documentos?|CT-?Es?|CTRCs?|entregas?|itens?|ocorr[eê]ncias?)/i);
      if(m) linhas = parseInt(m[1].replace(/\./g, ""), 10);
      const g = res.match(RE_IGN); if(g){ ign = parseInt(g[1].replace(/\./g, ""), 10); }
      if(nivel === "ok" && (linhas === 0 || (ign && ign > 0))) nivel = "aviso";
    }
    const tipo = !texto && !a.enviou ? "arquivo" : "importacao";
    registrar(tipo, (tipo === "arquivo" ? 'Escolheu o arquivo "' : 'Importou "') + a.nome + '" (' + kb + " KB) — " + (res || "sem retorno"),
      { tela: a.tela, nivel, detalhe: { arquivo: a.nome, tamanhoKB: kb, linhas, ignoradas: ign, resultado: res } });
  }
  function observar(){
    pararObs();
    try{
      const alvo = $("mainContent") || document.body;
      A.obs = new MutationObserver(muts => {
        if(!A.arq) return;
        for(const m of muts){
          const el = m.target && m.target.nodeType === 3 ? m.target.parentElement : m.target;
          const st = el && el.closest ? el.closest('[id*="status" i]') : null;
          if(!st || st.closest("#sec-monitor")) continue;
          const t = (st.textContent || "").trim();
          if(t.length >= 8){ fecharImport(t); return; }
        }
      });
      A.obs.observe(alvo, { childList: true, characterData: true, subtree: true });
      clearTimeout(A.tObs); A.tObs = setTimeout(() => fecharImport(""), 60000);
    }catch(e){}
  }
  document.addEventListener("change", ev => {
    try{
      const i = ev.target;
      if(!i || i.type !== "file" || !i.files || !i.files[0]) return;
      A.arq = { nome: i.files[0].name, tamanho: i.files[0].size, tela: tela(), input: i, enviou: false };
      observar();
    }catch(e){}
  }, true);
  document.addEventListener("submit", ev => {
    try{ if(A.arq && ev.target && ev.target.contains && ev.target.contains(A.arq.input)){ A.arq.enviou = true; observar(); } }catch(e){}
  }, true);

  /* abertura do painel: quanto demorou até ficar pronto, de onde veio a demora (rede, HTML, arquivos) e a qualidade da conexão.
     Serve para saber SE o site está lento e PARA QUEM, em vez de adivinhar. Não grava nada do conteúdo. */
  let medido = false;
  function medirAbertura(){
    try{
      if(medido) return; medido = true;
      const n = performance.getEntriesByType("navigation")[0]; if(!n) return;
      const pronto = Math.round(performance.now()), rs = performance.getEntriesByType("resource");
      const baixados = rs.filter(r => r.transferSize > 0), con = navigator.connection || {};
      const lentos = rs.filter(r => r.duration > 1500).sort((a, b) => b.duration - a.duration).slice(0, 3)
        .map(r => ({ u: r.name.split("?")[0].split("/").slice(-1)[0] || r.name.slice(0, 40), ms: Math.round(r.duration) }));
      const det = { prontoMs: pronto, htmlMs: Math.round(n.responseEnd - n.startTime), ttfbMs: Math.round(n.responseStart - n.requestStart),
        conexaoMs: Math.round(n.connectEnd - n.connectStart), reqs: rs.length, baixados: baixados.length,
        kb: Math.round(baixados.reduce((s, r) => s + r.transferSize, 0) / 1024), frio: baixados.length > rs.length / 2, recarga: n.type,
        lentos, rttMs: con.rtt || null, rede: con.effectiveType || "", economia: !!con.saveData };
      registrar("abertura", "Painel pronto em " + (pronto / 1000).toFixed(1).replace(".", ",") + " s" + (det.frio ? " (1ª vez / cache limpo)" : ""),
        { nivel: pronto > 8000 ? "aviso" : "info", detalhe: det });
    }catch(e){}
  }

  /* publicações para os usuários (vem do log da sincronização) */
  M.on(e => {
    try{
      if(!e || e.src !== "sync" || !ehAdmin()) return;
      const k = e.id + ":" + (e.n || 1);
      if(A.vistos.has(k)) return; A.vistos.add(k); if(A.vistos.size > 400) A.vistos.clear();
      if(/^Publicado:/.test(e.msg)) registrar("publicacao", e.msg, { nivel: "ok", detalhe: { itens: String(e.det || "").slice(0, 600) } });
      else if(/confirmou publicar com redu/i.test(e.msg)) registrar("critico", e.msg, { nivel: "aviso", detalhe: { itens: String(e.det || "").slice(0, 600) } });
    }catch(x){}
  });

  /* =====================================================================
     LEITURA (somente administrador) + TEMPO REAL + PLANO B (polling)
     ===================================================================== */
  function adicionar(r, vivo){
    if(!r) return;
    if(r.id != null){ if(A.ids.has(r.id)) return; }
    const k = chave(r);
    if(A.chaves.has(k)){ if(r.id != null){ const i = A.linhas.findIndex(x => x.id == null && chave(x) === k); if(i > -1){ A.linhas[i] = r; A.ids.add(r.id); } } return; }
    if(r.id != null){ A.ids.add(r.id); if(r.id > A.maxId) A.maxId = r.id; }
    A.chaves.add(k); A.linhas.push(r);
    if(A.linhas.length > 1500){ const x = A.linhas.splice(0, A.linhas.length - 1500); x.forEach(y => { A.chaves.delete(chave(y)); if(y.id != null) A.ids.delete(y.id); }); }
    if(vivo){ avisoAoVivo(r); redesenhar(); }
  }
  async function carregar(){
    const c = C();
    if(!c || !c.ativo || !c.cl || c.papel !== "admin") return;
    try{
      const desde = new Date(Date.now() - 7 * 86400000).toISOString();
      let q = c.cl.from(TBL).select("id,ocorreu_em,email,papel,sessao,tipo,tela,descricao,nivel,detalhe").gte("ocorreu_em", desde);
      if(A.maxId > 0) q = q.gt("id", A.maxId);          // depois da 1ª carga, busca só o que chegou depois
      const { data, error } = await q.order("id", { ascending: false }).limit(A.maxId > 0 ? 300 : 700);
      if(error) throw error;
      (data || []).forEach(r => { if(r.id > A.maxId) A.maxId = r.id; adicionar(r, false); });
      A.linhas.sort((a, b) => tmp(a) - tmp(b));
      A.erroLeitura = "";
    }catch(e){
      A.erroLeitura = ausente(e) ? "Tabela painel_auditoria não existe: rode supabase-auditoria.sql no Supabase." : String((e && e.message) || e);
    }
    A.ultPoll = Date.now(); A.carregou = true; redesenhar(true);
  }
  async function carregarPerfis(c){
    try{ const { data } = await c.cl.from("perfis").select("email,papel"); if(Array.isArray(data)) A.usuarios = data.map(p => ({ email: String(p.email || "").toLowerCase(), papel: p.papel })); }catch(e){}
  }
  async function limpar90(c){
    if(A.limpou) return; A.limpou = true;
    try{ await c.cl.from(TBL).delete().lt("ocorreu_em", new Date(Date.now() - 90 * 86400000).toISOString()); }catch(e){}
  }
  function iniciar(){
    try{
      const c = C();
      if(A.canal && (!c || !c.ativo || c.cl !== A.cl)){
        try{ A.cl.removeChannel(A.canal); }catch(e){}
        A.canal = null; A.rt = "—"; A.ids.clear(); A.chaves.clear(); A.linhas = []; A.carregou = false; A.maxId = 0; A.sessaoReg = false; A.limpou = false;
      }
      if(!c || !c.ativo || !c.cl || !c.email) return;
      if(!A.sessaoReg){
        A.sessaoReg = true;
        registrar("sessao", "Entrou no painel", { tela: tela(), detalhe: { navegador: (navigator.userAgent || "").slice(0, 120) } });
      }
      if(c.papel === "admin" && !A.canal){
        A.cl = c.cl;
        carregarPerfis(c); limpar90(c);
        A.canal = c.cl.channel("painel-auditoria-admin");
        A.canal.on("postgres_changes", { event: "INSERT", schema: "public", table: TBL }, p => { if(p && p.new) adicionar(p.new, true); })
          .subscribe(st => { A.rt = st; if(st === "SUBSCRIBED") carregar(); redesenhar(); });
        setTimeout(carregar, 1500);
      }
    }catch(e){}
  }
  /* plano B: se o tempo real cair, busca a cada 20 s; com ele ligado, confere a cada 2 min */
  setInterval(() => {
    try{
      iniciar();
      const c = C();
      if(!c || !c.ativo || c.papel !== "admin" || !A.canal) return;
      const idade = Date.now() - A.ultPoll;
      if((A.rt !== "SUBSCRIBED" && idade > 20000) || idade > 120000) carregar();
    }catch(e){}
  }, 5000);
  M.onStatus(() => { try{ iniciar(); }catch(e){} });

  /* =====================================================================
     ANÁLISE: saúde dos dados, usuários e alertas
     ===================================================================== */
  const rank = s => s === "err" ? 2 : s === "warn" ? 1 : 0;
  function fontes(){
    const m = new Map();
    A.linhas.forEach(r => {
      if(r.tipo !== "importacao") return;
      const k = r.tela || "(sem tela)";
      let o = m.get(k); if(!o){ o = { tela: k, nome: telaNome(k), ult: null, ultOk: null, n7: 0, erros7: 0 }; m.set(k, o); }
      const t = tmp(r); o.n7++; if(r.nivel === "erro") o.erros7++;
      if(!o.ult || t > tmp(o.ult)) o.ult = r;
      if(r.nivel !== "erro" && (!o.ultOk || t > tmp(o.ultOk))) o.ultOk = r;
    });
    const agora = Date.now();
    return Array.from(m.values()).map(o => {
      const ref = o.ultOk || o.ult, idade = horasUteis(tmp(ref), agora);
      let est = "ok", msg = "em dia";
      if(!o.ultOk){ est = "err"; msg = "nenhuma importação concluída (a última falhou)"; }
      else if(o.ult.nivel === "erro" && tmp(o.ult) > tmp(o.ultOk)){ est = "err"; msg = "a última tentativa falhou"; }
      else if(idade > A.limiteH){ est = "warn"; msg = "atrasada"; }
      else if(o.ult.nivel === "aviso"){ est = "warn"; msg = "importou com ressalva"; }
      return Object.assign(o, { idade, est, msg });
    }).sort((a, b) => rank(b.est) - rank(a.est) || b.idade - a.idade);
  }
  function usuarios(){
    const m = new Map(), hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const pega = e => { e = String(e || "").toLowerCase(); if(!e) return null; let o = m.get(e); if(!o){ o = { email: e, ult: 0, tela: "", hoje: 0, imp: 0, crit: 0, on: false, papel: "" }; m.set(e, o); } return o; };
    A.usuarios.forEach(u => { const o = pega(u.email); if(o) o.papel = u.papel; });
    A.linhas.forEach(r => {
      const o = pega(r.email); if(!o) return; const t = tmp(r);
      if(t > o.ult){ o.ult = t; if(r.tela) o.tela = r.tela; }
      if(!o.papel) o.papel = r.papel;
      if(t >= hoje.getTime()){ if(r.tipo === "importacao") o.imp++; if(r.tipo === "critico") o.crit++; if(r.tipo !== "sessao" && r.tipo !== "tela" && r.tipo !== "abertura") o.hoje++; }
    });
    try{ M.presenca().forEach(p => { const o = pega(p.email); if(o) o.on = true; }); }catch(e){}
    return Array.from(m.values()).sort((a, b) => (b.on - a.on) || (b.ult - a.ult));
  }
  function velocidade(){
    const m = new Map();
    A.linhas.forEach(r => {
      if(r.tipo !== "abertura" || !r.detalhe || !r.detalhe.prontoMs) return;
      const d = r.detalhe, e = String(r.email).toLowerCase();
      let o = m.get(e); if(!o){ o = { email: e, v: [], rtt: [], ult: null, lentos: new Map(), rede: "" }; m.set(e, o); }
      o.v.push(d.prontoMs); if(d.rttMs) o.rtt.push(d.rttMs); if(d.rede) o.rede = d.rede;
      if(!o.ult || tmp(r) > tmp(o.ult)) o.ult = r;
      (d.lentos || []).forEach(l => o.lentos.set(l.u, (o.lentos.get(l.u) || 0) + 1));
    });
    const md = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    return Array.from(m.values()).map(o => {
      const s = o.v.slice().sort((x, y) => x - y), top = Array.from(o.lentos.entries()).sort((x, y) => y[1] - x[1])[0];
      const med = md(o.v), est = med > 8000 ? "err" : med > 4000 ? "warn" : "ok";
      return Object.assign(o, { n: s.length, med, p95: s[Math.min(s.length - 1, Math.floor(s.length * .95))], rttMed: o.rtt.length ? md(o.rtt) : null, top: top ? top[0] : "", est });
    }).sort((a, b) => b.med - a.med);
  }
  function primeiro(){ return A.linhas.length ? tmp(A.linhas[0]) : Date.now(); }
  function alertas(){
    const out = { problemas: [], avisos: [], lista: [] };
    if(!ehAdmin()) return out;
    const agora = Date.now(), h0 = new Date(); h0.setHours(0, 0, 0, 0);
    if(A.erro) out.problemas.push("a auditoria não está gravando");
    fontes().forEach(f => {
      const quem = f.ult ? " · última por " + nome(f.ult.email) + " " + ha(tmp(f.ult)) : "";
      if(f.est === "err"){ out.problemas.push("dados: " + f.nome + " — " + f.msg); out.lista.push({ n: "err", t: "Dados · " + f.nome + ": " + f.msg + quem }); }
      else if(f.est === "warn"){ out.avisos.push("dados: " + f.nome + " " + f.msg); out.lista.push({ n: "warn", t: "Dados · " + f.nome + ": " + f.msg + " (" + Math.round(f.idade) + " h úteis sem carga)" + quem }); }
    });
    const eu = (C() && C().email) || "";
    velocidade().filter(v => v.est !== "ok" && v.n >= 2).forEach(v => {
      out.avisos.push("abertura lenta para " + nome(v.email));
      out.lista.push({ n: v.est, t: "Velocidade · " + nome(v.email) + ": abre em " + (v.med / 1000).toFixed(1).replace(".", ",") + " s (mediana de " + v.n + " aberturas)" + (v.rttMed ? " · latência da rede ~" + v.rttMed + " ms" : "") + (v.top ? " · arquivo mais lento: " + v.top : "") });
    });
    A.linhas.filter(r => tmp(r) >= h0.getTime() && r.tipo === "critico" && String(r.email).toLowerCase() !== eu).slice(-6).forEach(r => {
      out.avisos.push(nome(r.email) + " fez uma ação crítica hoje");
      out.lista.push({ n: "warn", t: hm(tmp(r)) + " · " + nome(r.email) + " — " + r.descricao + (r.tela ? " (" + telaNome(r.tela) + ")" : "") });
    });
    if(agora - primeiro() > A.limiteH * 3600000){
      usuarios().filter(u => u.email && u.papel !== "admin" && (!u.ult || horasUteis(u.ult, agora) > 72)).forEach(u => {
        out.avisos.push(nome(u.email) + " sem atividade há dias");
        out.lista.push({ n: "warn", t: nome(u.email) + " não aparece " + (u.ult ? ha(u.ult) : "nos últimos 7 dias") });
      });
    }
    return out;
  }

  /* =====================================================================
     TELA
     ===================================================================== */
  const ROT = { abertura: "Abertura", sessao: "Entrou", tela: "Tela", acao: "Ação", critico: "Crítico", importacao: "Importação", arquivo: "Arquivo", publicacao: "Publicação" };
  const CHIPS = [["todos", "Todos"], ["critico", "Críticos"], ["importacao", "Importações"], ["publicacao", "Publicações"], ["acao", "Ações"], ["tela", "Telas"], ["sessao", "Entradas"], ["abertura", "Abertura"]];
  const passa = r => {
    const f = A.filtro;
    if(f === "todos") return true;
    if(f === "critico") return r.tipo === "critico" || r.nivel === "erro";
    return r.tipo === f;
  };

  window.auditoriaHTML = () => `
    <div class="mon-grid aud-grid">
      <div class="panel"><div class="panel-header">Saúde dos dados <small class="mon-sub">última carga de cada fonte</small></div>
        <div class="mon-body">
          <div class="aud-lim">Considerar atrasada após
            <select id="audLim" class="small-input">${[12, 26, 50, 74].map(h => `<option value="${h}"${h === A.limiteH ? " selected" : ""}>${h} h úteis</option>`).join("")}</select>
            <small>(sábado e domingo não contam)</small></div>
          <div id="audFontes"></div>
        </div></div>
      <div class="panel"><div class="panel-header">Atividade dos usuários <small class="mon-sub">hoje e última vez</small></div><div class="mon-body" id="audUsers"></div></div>
      <div class="panel"><div class="panel-header">Velocidade de abertura <small class="mon-sub">por usuário · 7 dias</small></div><div class="mon-body" id="audVel"></div></div>
    </div>
    <div class="panel aud-feed"><div class="panel-header">Quem fez o quê <span class="mon-vivo" id="audVivo">ao vivo</span></div>
      <div class="mon-body">
        <div id="audAlertas"></div>
        <div class="mon-tools">
          <div class="mon-chips" id="audChips">${CHIPS.map(c => `<button type="button" class="mon-chip${c[0] === A.filtro ? " on" : ""}" data-aud-f="${c[0]}">${c[1]}</button>`).join("")}</div>
          <select class="small-input" id="audUser" title="Filtrar por usuário"><option value="">Todos os usuários</option></select>
          <button type="button" class="mon-btn" data-aud="atualizar">Atualizar</button>
        </div>
        <div class="mon-aviso-r" id="audAviso" hidden></div>
        <div class="mon-scroll aud-scroll" id="audLista"></div>
        <div class="mon-rodape" id="audRodape"></div>
      </div></div>`;

  const idade = f => f.ult ? ha(tmp(f.ultOk || f.ult)) : "—";
  function desenharFontes(){
    const w = $("audFontes"); if(!w) return;
    const l = fontes();
    w.innerHTML = l.length ? `<div class="mon-scroll"><table class="mon-tab"><tr><th>Fonte (tela)</th><th>Última carga</th><th>Por</th><th>Linhas</th><th>Situação</th></tr>${l.map(f => {
      const r = f.ultOk || f.ult, d = r.detalhe || {};
      return `<tr class="aud-f ${f.est}"><td><b>${esc(f.nome)}</b><br><small>${esc(d.arquivo || "")}</small></td><td>${idade(f)}<br><small>${esc(dh(tmp(r)))}</small></td><td>${esc(nome(r.email))}</td><td>${d.linhas != null ? esc(d.linhas) : "—"}</td><td><span class="aud-pill ${f.est}">${esc(f.msg)}</span>${f.erros7 ? `<br><small>${f.erros7} falha(s) em 7 dias</small>` : ""}</td></tr>`;
    }).join("")}</table></div>`
      : `<div class="empty">Ainda não há importações registradas. Elas aparecem aqui assim que alguém importar um arquivo.</div>`;
  }
  function desenharUsers(){
    const w = $("audUsers"); if(!w) return;
    const l = usuarios();
    w.innerHTML = l.length ? `<div class="mon-scroll"><table class="mon-tab"><tr><th>Usuário</th><th>Última atividade</th><th>Tela</th><th>Ações hoje</th><th>Import.</th></tr>${l.map(u => `<tr><td><span class="aud-dot ${u.on ? "on" : ""}"></span><b>${esc(nome(u.email))}</b><br><small>${esc(u.papel || "")}</small></td><td>${u.ult ? ha(u.ult) : "<small>sem registro</small>"}</td><td>${esc(u.tela ? telaNome(u.tela) : "—")}</td><td>${u.hoje}${u.crit ? ` <span class="aud-pill err">${u.crit} crít.</span>` : ""}</td><td>${u.imp}</td></tr>`).join("")}</table></div>` : `<div class="empty">Sem atividade registrada ainda.</div>`;
    const sel = $("audUser");
    if(sel){
      const ops = [""].concat(l.map(u => u.email)), atual = Array.from(sel.options).map(o => o.value);
      if(ops.join("|") !== atual.join("|")){ sel.innerHTML = ops.map(e => `<option value="${esc(e)}">${e ? esc(nome(e)) : "Todos os usuários"}</option>`).join(""); }
      sel.value = A.usuario;
    }
  }
  function desenharVel(){
    const w = $("audVel"); if(!w) return;
    const l = velocidade(), s = x => (x / 1000).toFixed(1).replace(".", ",") + " s";
    w.innerHTML = l.length ? `<div class="mon-scroll"><table class="mon-tab"><tr><th>Usuário</th><th>Típica</th><th>Pior (p95)</th><th>Última</th><th>Rede</th></tr>${l.map(v => `<tr class="aud-f ${v.est === "ok" ? "" : v.est}"><td><b>${esc(nome(v.email))}</b><br><small>${v.n} abertura(s)</small></td><td><span class="aud-pill ${v.est}">${s(v.med)}</span></td><td>${s(v.p95)}</td><td>${s(v.ult.detalhe.prontoMs)}<br><small>${esc(ha(tmp(v.ult)))}</small></td><td>${v.rttMed ? "~" + v.rttMed + " ms" : "—"}${v.rede ? "<br><small>" + esc(v.rede) + "</small>" : ""}${v.top ? "<br><small>lento: " + esc(v.top) + "</small>" : ""}</td></tr>`).join("")}</table></div><div class="mon-rodape">Tempo até o painel ficar pronto. Até 4 s é bom; acima de 8 s é lento. "Rede" é a latência que o navegador mede (quanto maior, mais cada ida ao servidor demora).</div>` : `<div class="empty">Aparece depois da próxima abertura do painel por cada usuário.</div>`;
  }
  function desenharAlertas(){
    const w = $("audAlertas"); if(!w) return;
    const a = alertas();
    w.innerHTML = a.lista.length ? `<div class="aud-alertas"><b>Pede atenção</b>${a.lista.map(x => `<div class="aud-al ${x.n}">${esc(x.t)}</div>`).join("")}</div>` : `<div class="aud-alertas ok"><b>Nada pendente</b><div class="aud-al ok">Dados em dia, nenhuma ação crítica recente e todos os usuários ativos.</div></div>`;
  }
  function desenharLista(){
    const w = $("audLista"); if(!w) return;
    const l = A.linhas.filter(r => passa(r) && (!A.usuario || String(r.email).toLowerCase() === A.usuario)).slice(-120).reverse();
    w.innerHTML = l.length ? `<table class="mon-tab"><tr><th>Quando</th><th>Quem</th><th>Tipo</th><th>Tela</th><th>O que fez</th></tr>${l.map(r => `<tr class="aud-r ${r.tipo === "critico" ? "crit" : r.nivel === "erro" ? "err" : r.nivel === "aviso" ? "warn" : ""}"><td>${esc(dh(tmp(r)))}</td><td>${esc(nome(r.email))}</td><td><span class="aud-t t-${esc(r.tipo)}">${esc(ROT[r.tipo] || r.tipo)}</span></td><td>${esc(r.tela ? telaNome(r.tela) : "—")}</td><td>${esc(r.descricao)}</td></tr>`).join("")}</table>` : `<div class="empty">${A.carregou ? "Nada registrado com esse filtro." : "Carregando…"}</div>`;
    const rp = $("audRodape");
    if(rp) rp.textContent = A.linhas.length + " registro(s) dos últimos 7 dias · mostrando os " + l.length + " mais recentes" + (A.fila.length ? " · " + A.fila.length + " na fila de envio" : "");
    const av = $("audAviso"), msg = A.erroLeitura || (A.erro ? "Gravação: " + A.erro : "");
    if(av){ av.hidden = !msg; av.textContent = msg; }
    const v = $("audVivo"); if(v){ const on = A.rt === "SUBSCRIBED"; v.className = "mon-vivo " + (on ? "on" : "off"); v.textContent = on ? "ao vivo" : "atualiza a cada 20 s"; }
  }
  function redesenhar(forcar){
    try{
      if(!ehAdmin() || !ativa() || !$("audLista")) return;
      const agora = Date.now(); if(!forcar && agora - A.ultDesenho < 1000) return; A.ultDesenho = agora;
      desenharFontes(); desenharUsers(); desenharVel(); desenharAlertas(); desenharLista();
    }catch(e){}
  }
  window.auditoriaDesenhar = () => redesenhar();
  setInterval(() => { if(ativa()) redesenhar(true); }, 15000);

  /* cartões no topo do Centro de comando (recebem a função card do monitor) */
  window.auditoriaCartoes = card => {
    try{
      if(!ehAdmin()) return "";
      const f = fontes(), ruins = f.filter(x => x.est !== "ok"), out = [];
      if(A.erroLeitura) out.push(card("err", "Auditoria", "Sem tabela", "rode supabase-auditoria.sql"));
      else if(!A.carregou) out.push(card("off", "Dados (importações)", "—", "carregando…"));
      else if(!f.length) out.push(card("off", "Dados (importações)", "Sem registro", "aguardando a 1ª importação"));
      else out.push(card(ruins.some(x => x.est === "err") ? "err" : ruins.length ? "warn" : "ok", "Dados (importações)", ruins.length ? ruins.length + " com problema" : "Em dia", f.length + " fonte(s) · limite " + A.limiteH + " h úteis"));
      const imp = A.linhas.filter(r => r.tipo === "importacao"), u = imp[imp.length - 1];
      out.push(u ? card(u.nivel === "erro" ? "err" : "ok", "Última importação", ha(tmp(u)).replace("há ", ""), nome(u.email) + " · " + telaNome(u.tela)) : card("off", "Última importação", "—", "nenhuma em 7 dias"));
      const h0 = new Date(); h0.setHours(0, 0, 0, 0);
      const hoje = A.linhas.filter(r => tmp(r) >= h0.getTime() && r.tipo !== "sessao" && r.tipo !== "tela" && r.tipo !== "abertura");
      const cr = hoje.filter(r => r.tipo === "critico").length;
      out.push(card(cr ? "warn" : "ok", "Ações hoje", String(hoje.length), cr ? cr + " crítica(s)" : "nenhuma crítica"));
      return out.join("");
    }catch(e){ return ""; }
  };
  window.auditoriaAlertas = () => { try{ return alertas(); }catch(e){ return { problemas: [], avisos: [], lista: [] }; } };
  window.auditoriaRelatorio = () => {
    try{
      if(!ehAdmin()) return "";
      const f = fontes().map(x => "  " + x.nome + ": " + x.msg + " — última carga " + (x.ult ? dh(tmp(x.ultOk || x.ult)) + " por " + nome((x.ultOk || x.ult).email) : "-")).join("\n");
      const l = A.linhas.slice(-80).reverse().map(r => "[" + dh(tmp(r)) + "] " + nome(r.email) + " · " + (ROT[r.tipo] || r.tipo) + " · " + (r.tela ? telaNome(r.tela) : "-") + " — " + r.descricao).join("\n");
      return "\n----- SAÚDE DOS DADOS -----\n" + (f || "  (sem importações registradas)") + "\n----- QUEM FEZ O QUÊ (últimos 80) -----\n" + l + "\n";
    }catch(e){ return ""; }
  };

  /* aviso na hora (só admin): ação crítica ou importação com erro de OUTRA pessoa */
  let tEl = null, tT = null;
  function avisoAoVivo(r){
    try{
      if(!ehAdmin() || r.sessao === M.sessao || String(r.email).toLowerCase() === ((C() && C().email) || "")) return;
      if(!(r.tipo === "critico" || (r.tipo === "importacao" && r.nivel === "erro"))) return;
      if(!tEl){
        tEl = document.createElement("div"); tEl.className = "mon-toast aud-toast"; tEl.setAttribute("role", "alert");
        tEl.addEventListener("click", () => { tEl.classList.remove("on"); if(typeof switchTab === "function") switchTab("monitor"); });
        document.body.appendChild(tEl);
      }
      tEl.innerHTML = `<b>${r.tipo === "critico" ? "Ação crítica" : "Importação com erro"}</b><span>${esc(nome(r.email))} · ${esc(telaNome(r.tela))}</span><em>${esc(String(r.descricao).slice(0, 140))}</em><small>clique para abrir o Monitor</small>`;
      tEl.classList.add("on"); clearTimeout(tT); tT = setTimeout(() => tEl.classList.remove("on"), 9000);
      let notif = false; try{ notif = !!JSON.parse(localStorage.getItem("__monitor_prefs_v1") || "{}").notif; }catch(e){}
      if(notif && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted"){
        const n = new Notification((r.tipo === "critico" ? "Ação crítica · " : "Importação com erro · ") + nome(r.email), { body: String(r.descricao).slice(0, 140), tag: "aud-evento" });
        n.onclick = () => { window.focus(); if(typeof switchTab === "function") switchTab("monitor"); n.close(); };
      }
    }catch(e){}
  }

  /* cliques da própria tela */
  document.addEventListener("click", ev => {
    const f = ev.target.closest && ev.target.closest("[data-aud-f]");
    if(f){ A.filtro = f.dataset.audF; document.querySelectorAll("#audChips [data-aud-f]").forEach(b => b.classList.toggle("on", b.dataset.audF === A.filtro)); redesenhar(true); return; }
    if(ev.target.closest && ev.target.closest('[data-aud="atualizar"]')){ carregar(); }
  });
  document.addEventListener("change", ev => {
    if(ev.target.id === "audUser"){ A.usuario = ev.target.value; redesenhar(true); }
    else if(ev.target.id === "audLim"){ A.limiteH = Number(ev.target.value) || 26; try{ localStorage.setItem(LIMK, String(A.limiteH)); }catch(e){} redesenhar(true); }
  });

  /* liga as telas depois que todos os arquivos do painel carregaram */
  try{ if(window.PAINEL_PRONTO) window.PAINEL_PRONTO.then(() => { envolverTab(); iniciar(); medirAbertura(); }); else setTimeout(envolverTab, 3000); }catch(e){ setTimeout(envolverTab, 3000); }

  window.AUDITORIA = { registrar, estado: () => ({ fila: A.fila.length, enviados: A.env, erro: A.erro, linhas: A.linhas.length, rt: A.rt }) };
})();

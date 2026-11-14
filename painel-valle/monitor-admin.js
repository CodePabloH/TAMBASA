/* =====================================================================
   MONITOR DO SISTEMA (somente administrador)  v1.2 — TEMPO REAL PARA TODOS OS USUÁRIOS
   ---------------------------------------------------------------------
   1) CAPTURA (sempre ligada, carrega ANTES de todos os outros arquivos):
      erros de JavaScript, promessas rejeitadas, arquivos que não carregaram,
      console.error / console.warn, TODAS as chamadas de rede (fetch): Supabase,
      CDNs (cdnjs/jsdelivr) e o próprio site, internet caiu/voltou, e os eventos
      da sincronização (sync-supabase.js chama MONITOR.log).
      Fica na memória e em sessionStorage (sobrevive a recarregar a página).
   2) TELA (aba "Monitor", só admin): cartões de situação ao vivo, sincronização
      (versão local x publicada, comparação de tamanhos), site/Cloudflare (status,
      cf-ray, cache, versão nova publicada, teste de todos os arquivos) e a lista
      de eventos em tempo real com filtro, busca, copiar e baixar.
   O que o navegador NÃO enxerga: logs internos do Supabase (Postgres/Auth) e do
   painel da Cloudflare (deploys, Workers). Esses ficam nos painéis deles; aqui
   aparece o que o painel OBSERVOU (status HTTP, mensagem de erro, latência).
   ===================================================================== */
(function(){
  "use strict";
  if(window.MONITOR) return;

  const MAX = 500, SK = "__monitor_log_v1";
  let ev = [], seq = 0;
  const subs = [];
  const stats = {};
  ["supabase", "site", "cdn", "rede"].forEach(k => { stats[k] = { n: 0, erros: 0, ms: 0, ult: null, cf: "", cache: "", server: "", sbid: "" }; });
  const net = { online: (typeof navigator !== "undefined" ? navigator.onLine : true) };
  const carregouEm = Date.now();

  try{
    const r = JSON.parse(sessionStorage.getItem(SK) || "[]");
    if(Array.isArray(r)){ ev = r.slice(-150); seq = ev.reduce((m, x) => Math.max(m, x.id || 0), 0); }
  }catch(e){}

  let tPers = null;
  function persistir(){
    if(tPers) return;
    tPers = setTimeout(() => { tPers = null; try{ sessionStorage.setItem(SK, JSON.stringify(ev.slice(-150))); }catch(e){} }, 1000);
  }
  function avisar(x){ subs.forEach(f => { try{ f(x); }catch(e){} }); }

  const str = a => { try{ if(a instanceof Error) return a.stack || a.message || String(a); if(typeof a === "string") return a; if(a && a.message) return String(a.message); return JSON.stringify(a); }catch(e){ return String(a); } };
  const limpa = u => { try{ const x = new URL(u, location.href); return x.host + x.pathname + (x.search ? x.search.slice(0, 80) : ""); }catch(e){ return String(u).slice(0, 120); } };

  function log(src, nivel, msg, det, opts){
    try{
      msg = String(msg == null ? "" : msg).slice(0, 400);
      det = det == null ? "" : String(det).slice(0, 2000);
      const u = ev[ev.length - 1];
      if(u && u.src === src && u.nivel === nivel && u.msg === msg){ u.n = (u.n || 1) + 1; u.t = Date.now(); if(det) u.det = det; }
      else{
        ev.push({ id: ++seq, t: Date.now(), src, nivel, msg, det, n: 1 });
        if(ev.length > MAX) ev.splice(0, ev.length - MAX);
      }
      persistir(); avisar(ev[ev.length - 1]);
      // vai também para o Supabase (o admin vê na hora): só erros e avisos; eventos internos do monitor ficam locais
      // (a menos que peçam com remoto:true). Nunca envia o que fala da própria tabela (evita laço infinito).
      if(((nivel === "erro" || nivel === "aviso") && src !== "monitor") || (opts && opts.remoto)){
        if((msg + " " + det).indexOf("monitor_eventos") < 0) enfileirar(src, nivel, msg, det);
      }
    }catch(e){}
  }

  /* =====================================================================
     ENVIO PARA O SUPABASE + TEMPO REAL
     - Cada navegador logado (admin ou leitor) envia seus erros/avisos em lote
       (~1 s depois), com limite de 40 por minuto e repetições agrupadas.
     - O admin recebe os eventos de TODOS os navegadores via Realtime.
     - Presença: canal privado "painel-presenca" mostra quem está online.
     ===================================================================== */
  const R = {
    cl: null, url: "", key: "", token: "", email: "", papel: "", ativo: false,
    sessao: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
    fila: new Map(), tFlush: null, enviando: false, janela: [], suprimidos: 0,
    env: 0, falhas: 0, erro: "", proxTentativa: 0, ultEnvio: 0,
    remotos: [], ids: new Set(), erroLeitura: "", online: [],
    rt: { ev: "—", pres: "—" }, chEv: null, chPres: null, tPres: null, authSub: null, limpou: false
  };
  const subsR = [], subsP = [], subsS = [];
  const chama = (lista, a, b) => lista.forEach(f => { try{ f(a, b); }catch(e){} });

  const rotaAtual = () => { try{ return typeof abaAtual !== "undefined" ? String(abaAtual || "") : ""; }catch(e){ return ""; } };
  const versaoSync = () => { try{ return (window.SYNC && window.SYNC.versaoLocal && window.SYNC.versaoLocal()) || ""; }catch(e){ return ""; } };
  function uaCurto(){
    const u = navigator.userAgent || "";
    const nav = /Edg\//.test(u) ? "Edge" : /OPR\//.test(u) ? "Opera" : /Firefox\//.test(u) ? "Firefox" : /Chrome\//.test(u) ? "Chrome" : /Safari\//.test(u) ? "Safari" : "Navegador";
    const so = /Windows/.test(u) ? "Windows" : /Android/.test(u) ? "Android" : /iPhone|iPad/.test(u) ? "iOS" : /Mac OS/.test(u) ? "macOS" : /Linux/.test(u) ? "Linux" : "";
    return nav + (so ? " · " + so : "");
  }

  function enfileirar(src, nivel, msg, det){
    const k = src + "|" + nivel + "|" + msg, x = R.fila.get(k);
    if(x){ x.n++; x.t = Date.now(); if(det) x.det = det; }
    else{
      if(R.fila.size >= 100) return;
      R.fila.set(k, { src, nivel, msg, det: det || "", n: 1, t: Date.now(), rota: rotaAtual() });
    }
    agendarEnvio(R.fila.size >= 20 ? 0 : 1000);
  }
  function agendarEnvio(ms){
    if(!R.ativo) return;
    if(R.tFlush && ms > 0) return;
    clearTimeout(R.tFlush); R.tFlush = setTimeout(enviar, ms);
  }
  function linha(v){
    return { ocorreu_em: new Date(v.t).toISOString(), email: R.email, papel: R.papel, sessao: R.sessao, src: v.src, nivel: v.nivel,
      msg: v.msg, det: String(v.det || "").slice(0, 3000), n: v.n, rota: v.rota || "", versao: versaoSync(), ua: uaCurto(), url: location.pathname };
  }
  const tabelaAusente = e => { const m = String((e && (e.message || e.code)) || e).toLowerCase(); return /pgrst205|42p01|could not find the table|does not exist/.test(m); };

  async function enviar(){
    R.tFlush = null;
    if(!R.ativo || !R.cl || R.enviando || !R.fila.size) return;
    const agora = Date.now();
    if(agora < R.proxTentativa){ agendarEnvio(R.proxTentativa - agora); return; }
    R.janela = R.janela.filter(t => agora - t < 60000);
    const livres = Math.max(0, 40 - R.janela.length);
    if(!livres){ R.suprimidos += R.fila.size; R.fila.clear(); return; }      // excesso de erros por minuto: descarta e avisa depois
    const itens = [];
    for(const par of R.fila){ if(itens.length >= Math.min(30, livres)) break; itens.push(par); }
    itens.forEach(([k]) => R.fila.delete(k));
    const rows = itens.map(([, v]) => linha(v)), sup = R.suprimidos;
    if(sup && rows.length < livres){ rows.push(linha({ src: "monitor", nivel: "aviso", msg: sup + " evento(s) deste navegador foram descartados (excesso de erros por minuto)", det: "", n: sup, t: Date.now() })); R.suprimidos = 0; }
    rows.forEach(() => R.janela.push(agora));
    R.enviando = true;
    try{
      const { error } = await R.cl.from("monitor_eventos").insert(rows);
      if(error) throw error;
      R.env += rows.length; R.falhas = 0; R.proxTentativa = 0; R.ultEnvio = Date.now();
      if(R.erro){ R.erro = ""; log("monitor", "ok", "Envio de eventos ao Supabase restabelecido"); }
    }catch(e){
      R.falhas++;
      const m = String((e && e.message) || e);
      itens.forEach(([k, v]) => { if(!R.fila.has(k) && R.fila.size < 100) R.fila.set(k, v); });
      if(rows.length > itens.length) R.suprimidos += sup;
      R.proxTentativa = Date.now() + (tabelaAusente(e) ? 300000 : Math.min(60000, 3000 * Math.pow(2, Math.min(R.falhas, 5))));
      if(R.erro !== m){ R.erro = m; log("monitor", "aviso", "Não consegui enviar eventos ao Supabase: " + m.slice(0, 160), tabelaAusente(e) ? "A tabela do monitor não existe: rode supabase-monitor.sql no SQL Editor." : m); }
    }finally{
      R.enviando = false;
      if(R.fila.size) agendarEnvio(Math.max(R.fila.size >= 20 ? 0 : 1000, R.proxTentativa - Date.now()));
      chama(subsS);
    }
  }
  /* aba fechando: manda o que sobrou com fetch keepalive (o supabase-js não garante esse envio) */
  function enviarFinal(){
    try{
      if(!R.ativo || !R.token || !R.url || !R.fila.size || Date.now() < R.proxTentativa) return;
      const rows = Array.from(R.fila.values()).slice(0, 15).map(linha); R.fila.clear();
      fetch(R.url + "/rest/v1/monitor_eventos", { method: "POST", keepalive: true,
        headers: { apikey: R.key, Authorization: "Bearer " + R.token, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(rows) }).catch(() => {});
    }catch(e){}
  }
  window.addEventListener("pagehide", enviarFinal);
  document.addEventListener("visibilitychange", () => { if(document.hidden) agendarEnvio(0); });

  /* ---------- presença (quem está online) ---------- */
  const metaPresenca = () => ({ email: R.email, papel: R.papel, sessao: R.sessao, desde: carregouEm, rota: rotaAtual(), versao: versaoSync(), ua: uaCurto(), visivel: !document.hidden, t: Date.now() });
  function lerPresenca(){
    try{
      const st = R.chPres ? R.chPres.presenceState() : {}, out = [];
      Object.keys(st).forEach(k => { const a = st[k]; if(a && a.length) out.push(a[a.length - 1]); });
      R.online = out;
    }catch(e){ R.online = []; }
    chama(subsP);
  }
  /* ---------- eventos remotos (só admin) ---------- */
  function addRemoto(r, vivo){
    if(!r || r.id == null || R.ids.has(r.id)) return;
    R.ids.add(r.id); R.remotos.push(r);
    if(R.remotos.length > 1000){ const x = R.remotos.splice(0, R.remotos.length - 1000); x.forEach(y => R.ids.delete(y.id)); }
    if(vivo) chama(subsR, r, true);
  }
  async function carregarRemotos(){
    try{
      const desde = new Date(Date.now() - 24 * 3600000).toISOString();
      const { data, error } = await R.cl.from("monitor_eventos").select("*").gte("ocorreu_em", desde).order("id", { ascending: false }).limit(300);
      if(error) throw error;
      (data || []).forEach(r => addRemoto(r, false));
      R.remotos.sort((a, b) => a.id - b.id);
      R.erroLeitura = ""; chama(subsR, null, false);
    }catch(e){
      const m = String((e && e.message) || e); R.erroLeitura = tabelaAusente(e) ? "Tabela monitor_eventos não existe: rode supabase-monitor.sql no Supabase." : m;
      log("monitor", "aviso", "Não consegui ler os erros dos usuários: " + m.slice(0, 160)); chama(subsR, null, false);
    }
  }
  async function limparAntigos(){
    if(R.limpou) return; R.limpou = true;
    try{ await R.cl.from("monitor_eventos").delete().lt("criado_em", new Date(Date.now() - 7 * 86400000).toISOString()); }catch(e){}
  }
  const stRT = qual => st => {
    if(!R.ativo) return;
    R.rt[qual] = st;
    if(st === "SUBSCRIBED"){
      if(qual === "pres"){ try{ R.chPres.track(metaPresenca()); }catch(e){} }
      else{ carregarRemotos(); limparAntigos(); }
    }else if(st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED"){
      log("monitor", "aviso", "Tempo real (" + (qual === "pres" ? "presença" : "eventos") + "): " + st);
    }
    chama(subsS);
  };

  function conectar(cl, papel, email){
    try{
      desconectar(true);
      R.cl = cl; R.url = cl.supabaseUrl || ""; R.key = cl.supabaseKey || "";
      R.papel = papel === "admin" ? "admin" : "leitor"; R.email = String(email || "").toLowerCase(); R.ativo = true;
      try{
        cl.auth.getSession().then(r => { R.token = (r && r.data && r.data.session && r.data.session.access_token) || ""; }).catch(() => {});
        const o = cl.auth.onAuthStateChange((_e, s) => { R.token = s ? s.access_token : ""; });
        R.authSub = o && o.data && o.data.subscription;
      }catch(e){}
      // presença: todos entram (canal privado, só quem está em "perfis")
      R.chPres = cl.channel("painel-presenca", { config: { private: true, presence: { key: R.sessao } } });
      R.chPres.on("presence", { event: "sync" }, lerPresenca).subscribe(stRT("pres"));
      R.tPres = setInterval(() => { try{ if(R.rt.pres === "SUBSCRIBED") R.chPres.track(metaPresenca()); }catch(e){} }, 15000);
      document.addEventListener("visibilitychange", rePresenca);
      // eventos de todos os usuários: só admin (a regra RLS do banco também só deixa o admin ler)
      if(R.papel === "admin"){
        R.chEv = cl.channel("monitor-eventos-admin");
        R.chEv.on("postgres_changes", { event: "INSERT", schema: "public", table: "monitor_eventos" }, p => { if(p && p.new) addRemoto(p.new, true); }).subscribe(stRT("ev"));
      }
      if(R.fila.size) agendarEnvio(500);
      log("monitor", "info", "Tempo real ligado (" + R.papel + ")");
    }catch(e){ log("monitor", "aviso", "Não consegui ligar o tempo real: " + String((e && e.message) || e).slice(0, 160)); }
    chama(subsS);
  }
  const rePresenca = () => { try{ if(R.rt.pres === "SUBSCRIBED") R.chPres.track(metaPresenca()); }catch(e){} };
  function desconectar(interno){
    try{ clearInterval(R.tPres); R.tPres = null; clearTimeout(R.tFlush); R.tFlush = null; }catch(e){}
    document.removeEventListener("visibilitychange", rePresenca);
    try{ if(R.authSub) R.authSub.unsubscribe(); }catch(e){}
    const cl = R.cl;
    R.ativo = false; R.cl = null; R.authSub = null; R.token = "";
    try{ if(cl && R.chEv) cl.removeChannel(R.chEv); }catch(e){}
    try{ if(cl && R.chPres) cl.removeChannel(R.chPres); }catch(e){}
    R.chEv = R.chPres = null; R.online = []; R.rt = { ev: "—", pres: "—" }; R.limpou = false;
    if(!interno){ R.remotos = []; R.ids.clear(); R.fila.clear(); R.erro = ""; R.erroLeitura = ""; }
    chama(subsS); chama(subsP);
  }

  /* ---------- console.error / console.warn ---------- */
  ["error", "warn"].forEach(nv => {
    const o = console[nv];
    console[nv] = function(){
      try{
        const m = [].slice.call(arguments).map(str).join(" ");
        log(/^\s*\[sync\]/i.test(m) ? "sync" : "console", nv === "error" ? "erro" : "aviso", m.split("\n")[0], m);
      }catch(e){}
      return o.apply(console, arguments);
    };
  });

  /* ---------- erros de script e arquivos que não carregaram ---------- */
  window.addEventListener("error", e => {
    try{
      const t = e.target;
      if(t && t !== window && t.tagName){
        const u = t.src || t.href || "";
        if(u) log(/cdnjs|jsdelivr|unpkg/.test(u) ? "cdn" : "site", "erro", "Falha ao carregar arquivo: " + limpa(u), t.tagName + " " + u);
        return;
      }
      log("js", "erro", e.message || "Erro de script", (e.filename ? e.filename + ":" + e.lineno + ":" + e.colno + "\n" : "") + ((e.error && e.error.stack) || ""));
    }catch(x){}
  }, true);
  window.addEventListener("unhandledrejection", e => {
    try{ const r = e.reason; log("js", "erro", "Promessa rejeitada: " + String((r && r.message) || str(r)).split("\n")[0], str(r)); }catch(x){}
  });
  window.addEventListener("online", () => { net.online = true; log("rede", "ok", "Internet voltou"); });
  window.addEventListener("offline", () => { net.online = false; log("rede", "erro", "Internet caiu (navegador offline)"); });

  /* ---------- toda chamada de rede (fetch) ---------- */
  function classe(u){
    try{
      const x = new URL(u, location.href), h = x.hostname;
      if(/supabase\.(co|in)$/.test(h)) return "supabase";
      if(/cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com/.test(h)) return "cdn";
      if(x.origin === location.origin) return "site";
      return "rede";
    }catch(e){ return "rede"; }
  }
  function anota(c, status, ms, h){
    const s = stats[c] || stats.rede;
    s.n++; if(!(status > 0 && status < 400)) s.erros++;
    s.ms += ms; s.ult = { status, ms, t: Date.now() };
    (s.lat = s.lat || []).push(ms); if(s.lat.length > 200) s.lat.shift();   // últimas chamadas reais (p95/máx no cartão)
    if(h){ try{ s.cf = h.get("cf-ray") || s.cf; s.cache = h.get("cf-cache-status") || s.cache; s.server = h.get("server") || s.server; s.sbid = h.get("sb-request-id") || s.sbid; }catch(e){} }
  }
  if(typeof window.fetch === "function"){
    const f0 = window.fetch.bind(window);
    window.fetch = function(input, init){
      let url = ""; try{ url = typeof input === "string" ? input : ((input && input.url) || String(input)); }catch(e){}
      const metodo = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      const c = classe(url), ini = performance.now();
      return f0(input, init).then(r => {
        try{
          const ms = Math.round(performance.now() - ini);
          anota(c, r.status, ms, r.headers);
          if(!r.ok && !/\/cdn-cgi\//.test(url)){
            const t = metodo + " " + limpa(url);
            r.clone().text().then(tx => log(c, "erro", "HTTP " + r.status + " " + t, (tx || "").slice(0, 500)), () => log(c, "erro", "HTTP " + r.status + " " + t));
          }else if(ms > 5000) log(c, "aviso", "Resposta lenta (" + ms + " ms): " + metodo + " " + limpa(url));
        }catch(e){}
        return r;
      }, err => {
        try{
          anota(c, 0, Math.round(performance.now() - ini));
          if(!(err && err.name === "AbortError")) log(c, "erro", "Falha de rede: " + metodo + " " + limpa(url), str(err));
        }catch(e){}
        throw err;
      });
    };
  }

  /* ---------- explicação em português ---------- */
  function dica(e){
    const m = (e.msg + " " + e.det).toLowerCase();
    if(/monitor_eventos|pgrst205|could not find the table/.test(m)) return "A tabela do monitor não existe no Supabase: rode o supabase-monitor.sql no SQL Editor.";
    if(/could not find the function|pgrst202|does not exist/.test(m)) return "Função/tabela do banco não encontrada: rode o supabase-sincronizacao.sql no SQL Editor do Supabase.";
    if(/row-level security|42501|permission denied|http 40[13]\b/.test(m)) return "Sem permissão no Supabase: a sessão expirou (saia e entre de novo) ou a regra de segurança (RLS) bloqueou.";
    if(/http 429|too many/.test(m)) return "Muitas requisições em pouco tempo (limite do Supabase/Cloudflare). Aguarde alguns minutos.";
    if(/http 413|payload|too large/.test(m)) return "Envio grande demais: o lote da publicação passou do limite.";
    if(/http 5\d\d\b|timeout|timed out/.test(m)) return "Servidor lento ou fora do ar (erro 5xx / Cloudflare 52x). Costuma voltar sozinho.";
    if(/http 404/.test(m)) return "Endereço não existe: arquivo não publicado no site ou tabela/função do Supabase não criada.";
    if(/failed to fetch|networkerror|load failed|falha de rede/.test(m)) return "Sem conexão com o servidor: internet caiu, bloqueio (antivírus/firewall/extensão) ou serviço fora do ar.";
    if(/falha ao carregar arquivo/.test(m)) return "Um arquivo do site não carregou: publicação incompleta na Cloudflare, cache antigo (Ctrl+F5) ou biblioteca externa bloqueada.";
    if(/quota|no space|sem espa/.test(m)) return "Sem espaço de armazenamento no navegador.";
    if(/publicação automática parada|vai reduzir|vai apagar/.test(m)) return "A trava de segurança impediu a publicação automática: confira os tamanhos em \"Comparar local × publicado\" e use \"Publicar para usuários\".";
    return "";
  }

  window.MONITOR = {
    log,
    eventos: () => ev,
    stats: () => stats,
    net: () => net,
    dica,
    carregouEm,
    on: f => { if(typeof f === "function") subs.push(f); },
    off: f => { const i = subs.indexOf(f); if(i > -1) subs.splice(i, 1); },
    /* tempo real / todos os usuários */
    conectar, desconectar, sessao: R.sessao,
    conexao: () => ({ cl: R.cl, url: R.url, key: R.key, token: R.token, email: R.email, papel: R.papel, sessao: R.sessao, ativo: R.ativo }),   // usado por auditoria.js
    apagarRemotos: async () => { if(!R.cl) throw new Error("Sem conexão"); const { error } = await R.cl.from("monitor_eventos").delete().gte("id", 0); if(error) throw error; R.remotos = []; R.ids.clear(); chama(subsR, null, false); },
    remotos: () => R.remotos,
    presenca: () => R.online,
    rt: () => ({ ev: R.rt.ev, pres: R.rt.pres, papel: R.papel, ativo: R.ativo, enviados: R.env, fila: R.fila.size, falhas: R.falhas, erro: R.erro, ultEnvio: R.ultEnvio, suprimidos: R.suprimidos, erroLeitura: R.erroLeitura }),
    onRemoto: f => { if(typeof f === "function") subsR.push(f); },
    onPresenca: f => { if(typeof f === "function") subsP.push(f); },
    onStatus: f => { if(typeof f === "function") subsS.push(f); },
    limpar: () => { ev = []; try{ sessionStorage.removeItem(SK); }catch(e){} avisar(null); }
  };
  log("monitor", "info", "Monitor iniciado");
})();

/* =====================================================================
   TELA DO MONITOR (aba só para admin)
   ===================================================================== */
(function(){
  "use strict";
  const M = window.MONITOR;
  if(!M) return;

  const S = {
    filtro: "todos", busca: "", pausado: false, aberto: new Set(),
    ping: null, site: null, trace: null, diag: null, diagCarregando: false, arquivos: null, testando: false,
    novaVersao: false, hashBase: null, storage: null, ultVerifSite: 0,
    filtroR: "todos", usuarioR: "", buscaR: "", abertoR: new Set(), pingOk: null,
    hist: { sb: [], site: [] }, novos: new Map(), naoVistos: 0, tituloBase: "",
    som: false, notif: false, tv: false
  };
  const PREFS = "__monitor_prefs_v1";
  try{ const o = JSON.parse(localStorage.getItem(PREFS) || "{}"); S.som = !!o.som; S.notif = !!o.notif && typeof Notification !== "undefined" && Notification.permission === "granted"; }catch(e){}
  const salvaPrefs = () => { try{ localStorage.setItem(PREFS, JSON.stringify({ som: S.som, notif: S.notif })); }catch(e){} };
  const pushHist = (k, ms) => { const a = S.hist[k]; a.push({ t: Date.now(), ms }); if(a.length > 90) a.shift(); };
  let tickT = null, rafT = null, ativoUI = false;

  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const limpa = u => { try{ const x = new URL(u, location.href); return x.host + x.pathname + (x.search ? x.search.slice(0, 80) : ""); }catch(e){ return String(u).slice(0, 120); } };
  const hms = t => new Date(t).toLocaleTimeString("pt-BR");
  const dh = t => new Date(t).toLocaleString("pt-BR");
  const mb = n => n === null || n === undefined ? "—" : (n / 1048576).toFixed(2).replace(".", ",") + " MB";
  const ehAdmin = () => window.AUTH_PAPEL === "admin";
  const $ = id => document.getElementById(id);
  const ativa = () => { const s = $("sec-monitor"); return !!(s && s.classList.contains("active")); };
  const ha = t => { if(!t) return "—"; const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? "há " + s + " s" : s < 3600 ? "há " + Math.floor(s / 60) + " min" : "há " + Math.floor(s / 3600) + " h"; };

  const tmp = x => { const t = Date.parse(x.ocorreu_em || x.criado_em); return isNaN(t) ? Date.now() : t; };
  /* ---------- erros "resolvidos": somem das contagens e listas (só neste navegador do admin); se o MESMO erro voltar depois, aparece de novo ---------- */
  const RESK = "__monitor_resolvidos_v1";
  try{ S.res = JSON.parse(localStorage.getItem(RESK) || "{}") || {}; }catch(e){ S.res = {}; }
  S.verRes = false;
  const chaveR = x => String(x.src || "") + "|" + String(x.msg || "");
  const salvaRes = () => { try{ const k = Object.keys(S.res); if(k.length > 300) k.sort((a, b) => S.res[a] - S.res[b]).slice(0, k.length - 300).forEach(x => delete S.res[x]); localStorage.setItem(RESK, JSON.stringify(S.res)); }catch(e){} };
  const eResolvido = x => { const t = S.res[chaveR(x)]; return !!(t && tmp(x) <= t); };
  const remotos = () => S.verRes ? M.remotos() : M.remotos().filter(x => !eResolvido(x));
  const nResolvidos = () => M.remotos().reduce((n, x) => n + (eResolvido(x) ? 1 : 0), 0);
  const hash = s => { let h = 2166136261 >>> 0; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return s.length + ":" + h.toString(36); };

  /* ---------- verificações ---------- */
  async function verificarSupabase(){
    if(!window.SYNC || !window.SYNC.ping){ S.ping = { ok: false, semConexao: true, motivo: window.AUTH_MODO === "demo" ? "Modo demonstração (sem Supabase)" : "Ainda sem login/conexão" }; return; }
    try{ S.ping = Object.assign({ t: Date.now() }, await window.SYNC.ping()); }catch(e){ S.ping = { ok: false, t: Date.now(), erro: String((e && e.message) || e) }; }
    if(!S.ping.semConexao) pushHist("sb", S.ping.ok ? S.ping.ms : null);
    // registra a virada (caiu / voltou) uma vez só, em vez de um evento a cada verificação
    if(!S.ping.semConexao){
      if(S.pingOk === true && !S.ping.ok) M.log("monitor", "erro", "Supabase parou de responder", S.ping.erro || "");
      else if(S.pingOk === false && S.ping.ok) M.log("monitor", "ok", "Supabase voltou a responder (" + S.ping.ms + " ms)");
      S.pingOk = !!S.ping.ok;
    }
  }
  async function verificarSite(){
    S.ultVerifSite = Date.now();
    if(location.protocol === "file:"){ S.site = { local: true, t: Date.now() }; return; }
    const r0 = { t: Date.now() };
    try{
      const ini = performance.now();
      const r = await fetch(location.pathname + "?_mon=" + Date.now(), { method: "HEAD", cache: "no-store" });
      r0.ms = Math.round(performance.now() - ini); r0.status = r.status; r0.ok = r.ok;
      ["server", "cf-ray", "cf-cache-status", "age", "last-modified", "etag", "cache-control"].forEach(h => { r0[h] = r.headers.get(h) || ""; });
    }catch(e){ r0.ok = false; r0.erro = String((e && e.message) || e); }
    S.site = r0; pushHist("site", r0.ok ? r0.ms : null);
    try{
      const tr = await fetch("/cdn-cgi/trace", { cache: "no-store" });
      if(tr.ok){ const tx = await tr.text(), o = {}; tx.split("\n").forEach(l => { const i = l.indexOf("="); if(i > 0) o[l.slice(0, i)] = l.slice(i + 1); }); S.trace = { ok: true, colo: o.colo, loc: o.loc, http: o.http, tls: o.tls, warp: o.warp }; }
      else S.trace = { ok: false, status: tr.status };
    }catch(e){ S.trace = { ok: false, erro: String((e && e.message) || e) }; }
    try{
      const tx = await (await fetch(location.pathname, { cache: "no-store" })).text(), h = hash(tx);
      if(S.hashBase === null) S.hashBase = h; else S.novaVersao = S.hashBase !== h;
    }catch(e){}
  }
  async function verificarStorage(){
    try{
      if(navigator.storage && navigator.storage.estimate){ const e = await navigator.storage.estimate(); S.storage = { uso: e.usage, cota: e.quota, persistente: navigator.storage.persisted ? await navigator.storage.persisted() : null }; }
    }catch(e){}
  }
  async function testarArquivos(){
    if(S.testando) return;
    if(location.protocol === "file:"){ S.arquivos = { local: true }; return desenhar(); }
    S.testando = true; S.arquivos = { itens: [], total: 0 }; desenhar();
    const urls = new Set();
    document.querySelectorAll("script[src]").forEach(s => urls.add(s.src));
    document.querySelectorAll('link[rel="stylesheet"][href]').forEach(l => urls.add(l.href));
    const lista = Array.from(urls); S.arquivos.total = lista.length;
    let i = 0;
    const worker = async () => {
      while(i < lista.length){
        const u = lista[i++], ini = performance.now();
        const it = { url: u, curto: limpa(u).replace(location.host, "") };
        try{ const r = await fetch(u, { method: "GET", cache: "no-store" }); it.status = r.status; it.ok = r.ok; it.ms = Math.round(performance.now() - ini); it.cf = r.headers.get("cf-cache-status") || ""; const b = await r.blob(); it.bytes = b.size; }
        catch(e){ it.ok = false; it.status = 0; it.erro = "bloqueado ou sem acesso"; it.ms = Math.round(performance.now() - ini); }
        S.arquivos.itens.push(it); agendar();
      }
    };
    await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
    S.testando = false;
    const ruins = S.arquivos.itens.filter(x => !x.ok).length;
    M.log("site", ruins ? "erro" : "ok", "Teste dos arquivos do site: " + (S.arquivos.itens.length - ruins) + " OK, " + ruins + " com problema");
    desenhar();
  }
  async function compararSync(){
    if(!window.SYNC || !window.SYNC.diagnostico) return;
    S.diagCarregando = true; S.diag = null; desenhar();
    try{ S.diag = await window.SYNC.diagnostico(); }catch(e){ S.diag = { erro: String((e && e.message) || e) }; }
    S.diagCarregando = false; desenhar();
  }

  /* ---------- HTML ---------- */
  window.monitorAdminHTML = () => `
    <div class="mon-head">
      <div>
        <h2 class="section-title">Centro de comando <span class="mon-tag">somente administrador</span></h2>
        <p class="section-desc">Tudo ao vivo: erros de <b>todos os usuários</b> (chegam na hora), quem está online, latência do Supabase e do site, sincronização e rede, além de <b>quem fez o quê</b>, da saúde dos dados importados e de alertas. A captura roda o tempo todo, mesmo com esta aba fechada.</p>
      </div>
      <div class="mon-relogio"><b id="monClock">--:--:--</b><small id="monAberto"></small></div>
    </div>
    <div class="mon-barra">
      <button type="button" class="mon-btn" id="monSom" title="Toca um aviso quando um usuário tem erro">🔕 Som desligado</button>
      <button type="button" class="mon-btn" id="monNotif" title="Notificação do navegador quando um usuário tem erro e esta aba não está à vista">🔕 Notificações</button>
      <button type="button" class="mon-btn mon-btn-tv" id="monTV" title="Tela cheia para deixar acompanhando (Esc sai)">▣ Modo TV</button>
      <span class="mon-sep"></span>
      <button type="button" class="mon-btn" id="monPausa">Pausar</button>
      <button type="button" class="mon-btn" id="monCopiar">Copiar relatório</button>
      <button type="button" class="mon-btn" id="monBaixar">Baixar .txt</button>
      <button type="button" class="mon-btn" id="monTeste" title="Registra um evento de teste (também enviado ao Supabase) para conferir a captura e o tempo real">Evento de teste</button>
    </div>
    <div id="monRestrito" class="panel" hidden><div class="empty">Acesso restrito ao administrador.</div></div>
    <div id="monCorpo">
      <div class="mon-resumo" id="monResumo"></div>
      <div class="mon-cards" id="monCards"></div>
      <div class="mon-main">
        <div class="panel mon-feed">
          <div class="panel-header">Erros de todos os usuários <span class="mon-vivo" id="monVivo">ao vivo</span></div>
          <div class="mon-body">
            <div class="mon-grafico" id="monGrafico"></div>
            <div class="mon-tools">
              <div class="mon-chips" id="monChipsR"></div>
              <select class="small-input" id="monUsuarioR" title="Filtrar por usuário"></select>
              <input type="search" class="small-input" id="monBuscaR" placeholder="Buscar nos erros dos usuários…" autocomplete="off">
              <button type="button" class="mon-btn" id="monResTodos" title="Tira das contagens tudo que está na lista agora (fica só neste navegador; se o mesmo erro voltar, aparece de novo)">Marcar tudo como resolvido</button>
              <button type="button" class="mon-btn" id="monVerRes">Mostrar resolvidos</button>
              <button type="button" class="mon-btn" id="monApagarR" title="Apaga do Supabase todos os eventos dos usuários">Apagar eventos</button>
            </div>
            <div class="mon-aviso-r" id="monAvisoR" hidden></div>
            <div class="mon-log" id="monLogR"></div>
            <div class="mon-rodape" id="monRodapeR"></div>
          </div>
        </div>
        <div class="mon-lado">
          <div class="panel"><div class="panel-header">Usuários <span class="mon-vivo" id="monVivoP">ao vivo</span></div><div class="mon-body" id="monOnline"></div></div>
          <div class="panel"><div class="panel-header">Onde estão os erros <small class="mon-sub">24 h · clique para filtrar</small></div><div class="mon-body" id="monOnde"></div></div>
        </div>
      </div>
      ${window.auditoriaHTML ? window.auditoriaHTML() : ""}
      <div class="mon-grid">
        <div class="panel"><div class="panel-header">Problemas mais frequentes <small class="mon-sub">24 h · clique para filtrar</small></div><div class="mon-body" id="monTop"></div></div>
        <div class="panel"><div class="panel-header">Latência ao vivo <small class="mon-sub">últimas verificações</small></div><div class="mon-body" id="monLat"></div></div>
      </div>
      <details class="panel mon-fold" open><summary class="panel-header">Sincronização · Supabase</summary><div class="mon-body" id="monSync"></div></details>
      <details class="panel mon-fold" open><summary class="panel-header">Site · Cloudflare</summary><div class="mon-body" id="monHost"></div></details>
      <details class="panel mon-fold">
        <summary class="panel-header">Eventos deste navegador</summary>
        <div class="mon-body">
          <div class="mon-tools">
            <div class="mon-chips" id="monChips"></div>
            <input type="search" class="small-input" id="monBusca" placeholder="Buscar no log…" autocomplete="off">
            <button type="button" class="mon-btn" id="monLimpar">Limpar</button>
          </div>
          <div class="mon-log" id="monLog"></div>
          <div class="mon-rodape" id="monRodape"></div>
        </div>
      </details>
      <details class="panel mon-fold"><summary class="panel-header">Ambiente deste navegador</summary><div class="mon-body" id="monAmb"></div></details>
    </div>`;

  const card = (cls, titulo, valor, sub, extra) => `<div class="mon-card ${cls}"><span class="mon-dot"></span><div class="mon-card-c"><small>${esc(titulo)}</small><b>${esc(valor)}</b><em>${esc(sub || "")}</em>${extra || ""}</div></div>`;
  /* mini gráfico de linha (ms); null = falha */
  function spark(arr, cor, w, h){
    w = w || 120; h = h || 26;
    const v = arr.map(x => x.ms); if(v.filter(x => x != null).length < 2) return `<svg class="mon-spark" viewBox="0 0 ${w} ${h}"></svg>`;
    const mx = Math.max(300, ...v.filter(x => x != null)), n = v.length, X = i => i / (n - 1) * (w - 2) + 1, Y = x => h - 2 - (x / mx) * (h - 4);
    let d = "", seg = false; const falhas = [];
    v.forEach((x, i) => { if(x == null){ seg = false; falhas.push(i); return; } d += (seg ? "L" : "M") + X(i).toFixed(1) + " " + Y(x).toFixed(1); seg = true; });
    const ult = v[n - 1];
    return `<svg class="mon-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="${cor}" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${falhas.map(i => `<rect x="${X(i) - 1}" y="0" width="2" height="${h}" fill="#ff6b61" opacity=".7"/>`).join("")}${ult != null ? `<circle cx="${X(n - 1)}" cy="${Y(ult)}" r="2.2" fill="${cor}"/>` : ""}</svg>`;
  }
  const kv = linhas => `<table class="mon-kv">${linhas.filter(Boolean).map(l => `<tr><th>${esc(l[0])}</th><td>${l[1]}</td></tr>`).join("")}</table>`;

  function estadoSync(){ try{ return window.SYNC && window.SYNC.estado ? window.SYNC.estado() : null; }catch(e){ return null; } }

  function agendaMon(){ try{ return window.SYNC && window.SYNC.agenda ? window.SYNC.agenda() : null; }catch(e){ return null; } }
  function proxTxt(ag){
    if(!ag || !ag.proximo) return "no próximo horário";
    const d = new Date(ag.proximo), hoje = new Date().toDateString() === d.toDateString();
    return (hoje ? "às " : "amanhã às ") + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function cartoes(){
    const out = [];
    out.push(M.net().online ? card("ok", "Internet", "Online", "navegador conectado") : card("err", "Internet", "OFFLINE", "sem conexão"));
    const p = S.ping, ss = M.stats().supabase;
    if(!p) out.push(card("off", "Supabase", "Verificando…", ""));
    else if(p.semConexao) out.push(card("off", "Supabase", "Sem conexão", p.motivo));
    else if(!p.ok) out.push(card("err", "Supabase", "ERRO", (p.erro || "falhou") + " · " + ha(p.t)));
    else{
      const lt = (ss.lat || []).slice().sort((a, b) => a - b), p95r = lt.length >= 5 ? lt[Math.min(lt.length - 1, Math.floor(lt.length * .95))] : null, mxr = lt.length ? lt[lt.length - 1] : null;
      const lento = p.ms > 2500 || (p95r != null && p95r > 3000);
      out.push(card(lento ? "warn" : "ok", "Supabase", p.ms + " ms", (lento ? "lento" : "respondendo") + " · " + ha(p.t) + (p95r != null ? " · chamadas reais: p95 " + p95r + " ms, máx " + mxr + " ms" : ""), spark(S.hist.sb, lento ? "#d49a12" : "#4f9d2d")));
    }
    const sy = estadoSync();
    if(!sy || !sy.ativo) out.push(card("off", "Sincronização", "Inativa", "faça login"));
    else if(sy.ocupado) out.push(card("warn", "Sincronização", "Publicando…", sy.papel));
    else if(sy.aviso) out.push(card("warn", "Sincronização", "Atenção", sy.aviso.slice(0, 70)));
    else if(sy.papel === "admin" && agendaMon() && agendaMon().modo === "agendado" && agendaMon().pendenteDesde) out.push(card("warn", "Sincronização", "Pendente", "publica " + proxTxt(agendaMon())));
    else if(sy.sujo) out.push(card("warn", "Sincronização", "Pendente", "alterações a publicar"));
    else out.push(card("ok", "Sincronização", sy.papel === "admin" ? "Em dia" : "Leitor", sy.ultimoOk || ""));
    const st = S.site, tr = S.trace;
    if(!st) out.push(card("off", "Site · Cloudflare", "Verificando…", ""));
    else if(st.local) out.push(card("off", "Site · Cloudflare", "Arquivo local", "aberto por file:// (sem hospedagem)"));
    else if(!st.ok) out.push(card("err", "Site · Cloudflare", st.status ? "HTTP " + st.status : "ERRO", st.erro || ""));
    else out.push(card(S.novaVersao ? "warn" : "ok", "Site · Cloudflare", S.novaVersao ? "Versão nova" : "HTTP " + st.status, S.novaVersao ? "publicada: use Ctrl+F5" : (st.ms + " ms" + (tr && tr.ok ? " · " + tr.colo : "")), spark(S.hist.site, "#2f78b8")));
    const agora = Date.now(), evs = M.eventos();
    const e1h = evs.filter(x => x.nivel === "erro" && agora - x.t < 3600000).reduce((n, x) => n + (x.n || 1), 0);
    const a1h = evs.filter(x => x.nivel === "aviso" && agora - x.t < 3600000).reduce((n, x) => n + (x.n || 1), 0);
    out.push(card(e1h ? "err" : a1h ? "warn" : "ok", "Erros neste navegador (1h)", String(e1h), a1h + " aviso(s)"));
    const rt = M.rt(), on = M.presenca(), rem = remotos();
    const rtOk = rt.ev === "SUBSCRIBED", rtTxt = rt.ev === "SUBSCRIBED" ? "Conectado" : (rt.ev === "—" ? "Aguardando" : "Reconectando…");
    out.push(card(rtOk ? "ok" : (rt.ev === "—" ? "off" : "warn"), "Tempo real", rtTxt, rt.erro ? "envio com falha: " + rt.erro.slice(0, 50) : ("enviados: " + rt.enviados + (rt.fila ? " · fila " + rt.fila : ""))));
    const adm = on.filter(x => x.papel === "admin").length;
    out.push(card(on.length ? "ok" : "off", "Usuários online", String(on.length), on.length ? adm + " admin · " + (on.length - adm) + " leitor(es)" : (rt.pres === "SUBSCRIBED" ? "ninguém além de você" : "presença indisponível")));
    const rAg = Date.now(), r1h = rem.filter(x => x.nivel === "erro" && rAg - tmp(x) < 3600000);
    const nr = r1h.reduce((n, x) => n + (x.n || 1), 0), us = new Set(r1h.map(x => String(x.email).toLowerCase())).size;
    out.push(card(nr ? "err" : "ok", "Erros de todos (1h)", String(nr), nr ? us + " usuário(s) afetado(s)" : "nenhum"));
    const sg = S.storage;
    if(sg && sg.cota){ const pc = sg.uso / sg.cota * 100; out.push(card(pc > 80 ? "err" : pc > 50 ? "warn" : "ok", "Armazenamento", mb(sg.uso), pc.toFixed(1).replace(".", ",") + "% da cota")); }
    else out.push(card("off", "Armazenamento", "—", ""));
    if(window.auditoriaCartoes) out.push(window.auditoriaCartoes(card));      // dados, última importação, ações do dia
    return out.join("");
  }

  function painelSync(){
    const sy = estadoSync(), p = S.ping, s = M.stats().supabase, ag = agendaMon();
    let h = "";
    if(!sy){ h += `<div class="empty">Sincronização ainda não iniciada (faça login).</div>`; }
    else{
      const alinhado = p && p.ok ? (p.versaoRemota ? (p.versaoRemota === sy.versaoLocal ? "sim" : "NÃO — este navegador difere do publicado") : "nada publicado ainda") : "—";
      h += kv([
        ["Papel", esc(sy.papel) + " · " + esc(sy.email || "")],
        ["Estado", sy.ocupado ? "Publicando…" : (sy.aviso ? `<span class="mon-t-warn">${esc(sy.aviso)}</span>` : (sy.sujo ? "Alterações pendentes" : "Em dia"))],
        ["Publicação automática", sy.papel === "admin" ? (ag && ag.modo === "agendado" ? "por horário" : (sy.autoAgendado ? "agendada" : "aguardando alterações")) : "— (só admin)"],
        ["Horário de publicação", sy.papel !== "admin" ? "— (só admin)" : (ag ? (ag.modo === "agendado" ? "<b>" + esc(ag.horarios.join(" · ")) + "</b>" : "na hora (após cada alteração)") : "—")],
        ["Próxima publicação", sy.papel !== "admin" || !ag ? "—" : (ag.modo !== "agendado" ? "—" : esc(proxTxt(ag)) + (ag.pendenteDesde ? ' · <span class="mon-t-warn">há alterações pendentes desde ' + esc(new Date(ag.pendenteDesde).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })) + "</span>" : " · nada pendente"))],
        ["Última publicação OK", esc(sy.ultimoOk || "—")],
        ["Versão deste navegador", esc(sy.versaoLocal || "—")],
        ["Versão publicada", p && p.ok ? esc(p.versaoRemota || "—") + (p.por ? " · por " + esc(p.por) : "") : "—"],
        ["Alinhado com o publicado", esc(alinhado)],
        ["Chamadas ao Supabase", s.n + " (" + s.erros + " com erro) · média " + (s.n ? Math.round(s.ms / s.n) : 0) + " ms" + (s.ult ? " · última HTTP " + s.ult.status + " " + ha(s.ult.t) : "")],
        ["Borda Cloudflare do Supabase", esc(s.cf || "não exposto pelo navegador") + (s.sbid ? " · req " + esc(s.sbid) : "")]
      ]);
    }
    h += `<div class="mon-acoes">
      <button type="button" class="btn btn-ghost btn-sm" data-mon="ping">Verificar agora</button>
      <button type="button" class="btn btn-ghost btn-sm" data-mon="diag" ${S.diagCarregando ? "disabled" : ""}>${S.diagCarregando ? "Comparando…" : "Comparar local × publicado"}</button>
      ${sy && sy.papel === "admin" ? `<button type="button" class="btn btn-ghost btn-sm" data-mon="agenda">Horário de publicação</button><button type="button" class="btn btn-ghost btn-sm" data-mon="pub">Publicar agora</button>` : ""}
    </div>`;
    const d = S.diag;
    if(d){
      if(d.erro) h += `<div class="mon-erro">Não consegui comparar: ${esc(d.erro)}</div>`;
      else{
        const rk = new Set(); (d.risco.apagar || []).forEach(x => rk.add(String(x).split(" ")[0])); (d.risco.reduzir || []).forEach(x => rk.add(String(x).split(":")[0]));
        h += `<div class="mon-diag-t">${d.risco.risco ? `<b class="mon-t-warn">A trava de segurança vai avisar (${d.risco.apagar.length} a apagar, ${d.risco.reduzir.length} a reduzir)</b>` : `<b class="mon-t-ok">Nenhuma redução relevante: a publicação não será travada.</b>`}</div>
        <div class="mon-scroll"><table class="mon-tab"><tr><th>Item</th><th>Neste navegador</th><th>Publicado</th><th>Diferença</th></tr>${
          d.linhas.sort((a, b) => (b.publicado || 0) - (a.publicado || 0)).map(l => {
            const dif = (l.local === null ? "só publicado" : l.publicado === null ? "novo" : ((l.local - l.publicado) / 1048576).toFixed(2).replace(".", ",") + " MB");
            const ruim = rk.has(l.chave) ? "mon-linha-ruim" : "";
            return `<tr class="${ruim}"><td>${esc(l.chave)}</td><td>${mb(l.local)}</td><td>${mb(l.publicado)}</td><td>${esc(dif)}</td></tr>`;
          }).join("")}</table></div>`;
      }
    }
    return h;
  }

  function painelHost(){
    const st = S.site, tr = S.trace;
    let h = "";
    if(!st) h += `<div class="empty">Verificando…</div>`;
    else if(st.local) h += `<div class="empty">O painel está aberto como arquivo local (file://). Verificações de hospedagem/Cloudflare só funcionam com o site publicado.</div>`;
    else h += kv([
      ["Endereço", esc(location.origin + location.pathname)],
      ["Resposta do site", st.ok ? `HTTP ${st.status} · ${st.ms} ms` : `<span class="mon-t-err">${esc(st.erro || "HTTP " + st.status)}</span>`],
      ["Servidor", esc(st.server || "—")],
      ["Cloudflare (cf-ray)", esc(st["cf-ray"] || "não detectado")],
      ["Cache da Cloudflare", esc(st["cf-cache-status"] || "—") + (st.age ? " · idade " + esc(st.age) + " s" : "")],
      ["Data-center / país", tr && tr.ok ? esc((tr.colo || "") + " / " + (tr.loc || "")) + " · HTTP " + esc(tr.http || "") + " · " + esc(tr.tls || "") : "indisponível (" + esc(tr ? (tr.status || tr.erro || "") : "") + ")"],
      ["Versão do site", S.novaVersao ? `<b class="mon-t-warn">Existe versão nova publicada — aperte Ctrl+F5 para carregar</b>` : "esta é a versão publicada"],
      ["Última verificação", ha(st.t)]
    ]);
    const a = S.arquivos;
    h += `<div class="mon-acoes">
      <button type="button" class="btn btn-ghost btn-sm" data-mon="site">Verificar agora</button>
      <button type="button" class="btn btn-ghost btn-sm" data-mon="arq" ${S.testando ? "disabled" : ""}>${S.testando ? "Testando…" : "Testar todos os arquivos do site"}</button>
    </div>`;
    if(a && a.local) h += `<div class="empty">Teste indisponível em arquivo local.</div>`;
    else if(a){
      const ruins = a.itens.filter(x => !x.ok), ok = a.itens.length - ruins.length;
      h += `<div class="mon-diag-t"><b class="${ruins.length ? "mon-t-err" : "mon-t-ok"}">${ok} de ${a.total} arquivos OK${ruins.length ? " · " + ruins.length + " COM PROBLEMA" : ""}</b>${S.testando ? " (testando…)" : ""}</div>`;
      if(ruins.length) h += `<div class="mon-scroll"><table class="mon-tab"><tr><th>Arquivo</th><th>Resultado</th></tr>${ruins.map(x => `<tr class="mon-linha-ruim"><td>${esc(x.curto)}</td><td>${x.status ? "HTTP " + x.status : esc(x.erro || "falhou")}</td></tr>`).join("")}</table></div>`;
    }
    return h;
  }

  function ambiente(){
    const sg = S.storage, ne = navigator.connection || {};
    return kv([
      ["Aberto desde", dh(M.carregouEm) + " (" + ha(M.carregouEm) + ")"],
      ["Usuário", esc((window.AUTH_USUARIO && window.AUTH_USUARIO.email) || "—") + " · " + esc(window.AUTH_PAPEL || "leitor")],
      ["Modo de login", esc(window.AUTH_MODO || "—")],
      ["Navegador", esc(navigator.userAgent)],
      ["Tela / janela", screen.width + "×" + screen.height + " / " + innerWidth + "×" + innerHeight],
      ["Conexão", esc((ne.effectiveType || "—") + (ne.downlink ? " · " + ne.downlink + " Mb/s" : "") + (ne.rtt ? " · rtt " + ne.rtt + " ms" : ""))],
      ["Armazenamento", sg && sg.cota ? mb(sg.uso) + " de " + mb(sg.cota) + (sg.persistente === null ? "" : (sg.persistente ? " · persistente" : " · pode ser limpo pelo navegador")) : "—"],
      ["Arquivos .js carregados", String(document.querySelectorAll("script[src]").length)],
      ["Memória do log", M.eventos().length + " eventos"],
      ["Envio de erros ao Supabase", (() => { const r = M.rt(); return r.ativo ? esc(r.enviados + " enviados · fila " + r.fila + (r.suprimidos ? " · " + r.suprimidos + " descartados" : "") + (r.erro ? " · FALHA: " + r.erro.slice(0, 80) : "") + (r.ultEnvio ? " · último " + ha(r.ultEnvio) : "")) : "desligado (sem login)"; })()],
      ["ID desta sessão", esc(M.sessao)]
    ]);
  }

  /* ---------- log ---------- */
  const GRUPOS = {
    todos: () => true,
    erros: e => e.nivel === "erro",
    avisos: e => e.nivel === "aviso",
    supabase: e => e.src === "supabase",
    sync: e => e.src === "sync",
    site: e => e.src === "js" || e.src === "site" || e.src === "console",
    rede: e => e.src === "cdn" || e.src === "rede"
  };
  const ROT = { todos: "Todos", erros: "Erros", avisos: "Avisos", supabase: "Supabase", sync: "Sincronização", site: "Site (JS)", rede: "Rede / CDN" };
  const ROTSRC = { supabase: "Supabase", sync: "Sync", js: "JS", site: "Site", console: "Console", cdn: "CDN", rede: "Rede", monitor: "Monitor" };

  function filtrados(){
    const g = GRUPOS[S.filtro] || GRUPOS.todos, q = S.busca.trim().toLowerCase();
    return M.eventos().filter(e => g(e) && (!q || (e.msg + " " + e.det + " " + e.src).toLowerCase().indexOf(q) > -1)).slice().reverse();
  }
  function desenharLog(){
    const wrap = $("monLog"); if(!wrap) return;
    const lista = filtrados(), top = wrap.scrollTop;
    wrap.innerHTML = lista.slice(0, 300).map(e => {
      const d = M.dica(e), aberto = S.aberto.has(e.id);
      return `<div class="mon-row n-${e.nivel}" data-id="${e.id}">
        <div class="mon-l1"><span class="mon-h">${hms(e.t)}</span><span class="mon-src s-${esc(e.src)}">${esc(ROTSRC[e.src] || e.src)}</span><span class="mon-msg">${esc(e.msg)}</span>${e.n > 1 ? `<b class="mon-n">×${e.n}</b>` : ""}</div>
        ${d ? `<div class="mon-dica">${esc(d)}</div>` : ""}
        ${aberto && e.det ? `<pre class="mon-det">${esc(e.det)}</pre>` : ""}
      </div>`;
    }).join("") || `<div class="empty">Nenhum evento neste filtro.</div>`;
    wrap.scrollTop = top;
    const rod = $("monRodape");
    if(rod) rod.textContent = lista.length + " evento(s)" + (lista.length > 300 ? " (mostrando os 300 mais recentes)" : "") + (S.pausado ? " · ATUALIZAÇÃO PAUSADA" : " · ao vivo");
    const ch = $("monChips");
    if(ch) ch.innerHTML = Object.keys(ROT).map(k => { const n = M.eventos().filter(GRUPOS[k]).length; return `<button type="button" class="mon-chip ${S.filtro === k ? "on" : ""} c-${k}" data-f="${k}">${ROT[k]} <i>${n}</i></button>`; }).join("");
  }

  /* ---------- erros de todos os usuários (ao vivo) ---------- */
  const GRUPOS_R = { todos: () => true, erros: e => e.nivel === "erro", avisos: e => e.nivel === "aviso" };
  const ROT_R = { todos: "Todos", erros: "Erros", avisos: "Avisos" };
  const nomeUsuario = e => String(e.email || "—").split("@")[0];
  function filtradosR(){
    const g = GRUPOS_R[S.filtroR] || GRUPOS_R.todos, q = S.buscaR.trim().toLowerCase();
    return remotos().filter(e => g(e) && (!S.usuarioR || String(e.email).toLowerCase() === S.usuarioR) &&
      (!q || (e.msg + " " + (e.det || "") + " " + e.src + " " + e.email + " " + (e.rota || "")).toLowerCase().indexOf(q) > -1)).slice().reverse();
  }
  function desenharLogR(){
    const wrap = $("monLogR"); if(!wrap) return;
    const lista = filtradosR(), top = wrap.scrollTop, rt = M.rt();
    const av = $("monAvisoR");
    if(av){ const m = rt.erroLeitura || (rt.ev !== "SUBSCRIBED" && rt.ev !== "—" ? "Tempo real desconectado (" + rt.ev + "): tentando reconectar. Os eventos perdidos são carregados ao reconectar." : ""); av.hidden = !m; av.textContent = m; }
    wrap.innerHTML = lista.slice(0, 300).map(e => {
      const d = M.dica(e), aberto = S.abertoR.has(e.id), eu = e.sessao === M.sessao;
      const det = [e.det || "", "", "Usuário: " + e.email + " (" + (e.papel || "?") + ")", "Navegador: " + (e.ua || "—"), "Tela: " + (e.rota || "—") + " · página " + (e.url || "—"), "Versão dos dados: " + (e.versao || "—"), "Sessão: " + (e.sessao || "—") + " · ocorreu " + dh(tmp(e)) + " · chegou " + dh(Date.parse(e.criado_em) || tmp(e))].join("\n");
      const novo = S.novos.has(e.id) && Date.now() - S.novos.get(e.id) < 4000;
      return `<div class="mon-row n-${esc(e.nivel)}${novo ? " mon-novo" : ""}" data-rid="${e.id}">
        <div class="mon-l1"><span class="mon-h">${hms(tmp(e))}</span><span class="mon-user" title="${esc(e.email)}">${esc(nomeUsuario(e))}${eu ? " (você)" : ""}</span><span class="mon-src s-${esc(e.src)}">${esc(ROTSRC[e.src] || e.src)}</span><span class="mon-msg">${esc(e.msg)}</span>${e.n > 1 ? `<b class="mon-n">×${e.n}</b>` : ""}${e.rota ? `<span class="mon-rota">${esc(e.rota)}</span>` : ""}</div>
        ${d ? `<div class="mon-dica">${esc(d)}</div>` : ""}
        ${aberto ? `<pre class="mon-det">${esc(det)}</pre>` : ""}
      </div>`;
    }).join("") || `<div class="empty">${rt.ev === "SUBSCRIBED" ? "Nenhum erro de usuário nas últimas 24 h. Quando acontecer, aparece aqui na hora." : "Aguardando conexão em tempo real…"}</div>`;
    wrap.scrollTop = top; grafico(); topProblemas(); ondeErros(); desenharOnline(); resumo();
    const rod = $("monRodapeR");
    if(rod) rod.textContent = lista.length + " evento(s) das últimas 24 h" + (lista.length > 300 ? " (mostrando os 300 mais recentes)" : "") + (S.pausado ? " · ATUALIZAÇÃO PAUSADA" : " · ao vivo") + " · guardados por 7 dias";
    const ch = $("monChipsR");
    if(ch) ch.innerHTML = Object.keys(ROT_R).map(k => { const n = remotos().filter(GRUPOS_R[k]).length; return `<button type="button" class="mon-chip ${S.filtroR === k ? "on" : ""} c-${k}" data-fr="${k}">${ROT_R[k]} <i>${n}</i></button>`; }).join("");
    const sel = $("monUsuarioR");
    if(sel){
      const us = Array.from(new Set(remotos().map(x => String(x.email).toLowerCase()))).sort();
      const html = `<option value="">Todos os usuários</option>` + us.map(u => `<option value="${esc(u)}"${S.usuarioR === u ? " selected" : ""}>${esc(u)}</option>`).join("");
      if(sel.dataset.h !== html){ sel.dataset.h = html; sel.innerHTML = html; }
    }
    const v = $("monVivo"); if(v){ const ok = rt.ev === "SUBSCRIBED"; v.textContent = ok ? "ao vivo" : (rt.ev === "—" ? "aguardando" : "reconectando"); v.className = "mon-vivo " + (ok ? "on" : "off"); }
  }
  const COR_AV = ["#4f9d2d", "#2f78b8", "#b57508", "#8e5fc7", "#cf3d35", "#1a9c8f", "#c4568a", "#6b7f2a"];
  const corAv = t => { let h = 0; for(let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0; return COR_AV[h % COR_AV.length]; };
  function usuarios(){
    const mp = new Map(), rt = M.rt(), agora = Date.now();
    M.presenca().forEach(u => { const k = String(u.email).toLowerCase(); mp.set(k, { email: k, on: u, erros: 0, avisos: 0, ult: 0, msg: "" }); });
    remotos().forEach(e => {
      const k = String(e.email).toLowerCase(), o = mp.get(k) || { email: k, on: null, erros: 0, avisos: 0, ult: 0, msg: "", papel: e.papel };
      if(e.nivel === "erro") o.erros += e.n || 1; else if(e.nivel === "aviso") o.avisos += e.n || 1;
      const t = tmp(e); if(t >= o.ult){ o.ult = t; o.msg = e.msg; } mp.set(k, o);
    });
    return Array.from(mp.values()).sort((a, b) => (!!b.on - !!a.on) || (b.erros - a.erros) || (b.ult - a.ult) || a.email.localeCompare(b.email));
  }
  function desenharOnline(){
    const w = $("monOnline"); if(!w) return;
    const l = usuarios(), rt = M.rt(), n = l.filter(x => x.on).length;
    w.innerHTML = l.length ? `<div class="mon-users">${l.map(u => {
      const nome = u.email.split("@")[0], on = u.on, pap = (on && on.papel) || u.papel || "";
      const st = on ? (on.visivel === false ? `<span class="mon-t-warn">segundo plano</span>` : `<span class="mon-t-ok">online</span>`) : `<span class="mon-off">offline</span>`;
      const det = on ? esc((on.rota || "—") + " · há " + ha(on.desde).replace("há ", "") + " · " + (on.ua || "")) : (u.ult ? "visto " + esc(ha(u.ult)) : "");
      return `<div class="mon-user-c ${on ? "on" : "off"} ${u.erros ? "tem-erro" : ""}" data-user="${esc(u.email)}" title="Clique para filtrar os erros deste usuário">
        <span class="mon-av" style="background:${corAv(u.email)}">${esc(nome.slice(0, 2).toUpperCase())}<i class="${on ? "on" : ""}"></i></span>
        <div class="mon-user-i"><b>${esc(nome)}${on && on.sessao === M.sessao ? " (você)" : ""}</b><small>${esc(u.email)}</small><span>${st}${pap ? " · " + esc(pap) : ""}</span><small>${det}</small></div>
        <div class="mon-user-e">${u.erros ? `<b class="e">${u.erros}</b><small>erro(s) · 24 h</small>` : (u.avisos ? `<b class="a">${u.avisos}</b><small>aviso(s) · 24 h</small>` : `<b class="o">0</b><small>erros</small>`)}</div>
      </div>`;
    }).join("")}</div>` : `<div class="empty">${rt.pres === "SUBSCRIBED" ? "Ninguém online." : (rt.pres === "—" ? "Aguardando conexão…" : "Presença indisponível (" + esc(rt.pres) + "). Rode o supabase-monitor.sql no Supabase.")}</div>`;
    const v = $("monVivoP"); if(v){ const ok = rt.pres === "SUBSCRIBED"; v.textContent = ok ? n + " online" : (rt.pres === "—" ? "aguardando" : "indisponível"); v.className = "mon-vivo " + (ok ? "on" : "off"); }
  }
  /* onde estão os erros: por tela e por origem */
  function ondeErros(){
    const w = $("monOnde"); if(!w) return;
    const por = (chave, nomeFn) => { const m = new Map(); remotos().forEach(e => { const k = chave(e); if(!k) return; const o = m.get(k) || { k, n: 0, err: 0 }; o.n += e.n || 1; if(e.nivel === "erro") o.err += e.n || 1; m.set(k, o); }); return Array.from(m.values()).sort((a, b) => b.n - a.n).slice(0, 6); };
    const bloco = (titulo, l, attr, nome) => { const mx = Math.max(1, ...l.map(x => x.n)); return `<div class="mon-bt">${titulo}</div>` + (l.length ? l.map(x => `<div class="mon-bar" data-busca="${esc(attr(x))}"><span class="mon-bar-n">${esc(nome(x))}</span><span class="mon-bar-t"><i style="width:${Math.max(4, x.n / mx * 100)}%" class="${x.err ? "e" : "a"}"></i></span><b>${x.n}</b></div>`).join("") : `<div class="mon-vazio">sem dados</div>`); };
    w.innerHTML = bloco("Por tela do painel", por(e => e.rota || "(sem tela)"), x => x.k === "(sem tela)" ? "" : x.k, x => x.k) + bloco("Por origem", por(e => e.src), x => x.k, x => ROTSRC[x.k] || x.k);
  }
  /* latência ao vivo */
  function latencia(){
    const w = $("monLat"); if(!w) return;
    const linha = (nome, arr, cor) => {
      const v = arr.map(x => x.ms).filter(x => x != null), falhas = arr.filter(x => x.ms == null).length;
      if(!v.length) return `<div class="mon-lat"><div class="mon-lat-t"><b>${nome}</b><span>aguardando…</span></div></div>`;
      const so = v.slice().sort((a, b) => a - b), med = Math.round(v.reduce((s2, x) => s2 + x, 0) / v.length), p95 = so[Math.min(so.length - 1, Math.floor(so.length * .95))], at = v[v.length - 1];
      return `<div class="mon-lat"><div class="mon-lat-t"><b>${nome}</b><span class="mon-lat-now" style="color:${at > 2500 ? "#d49a12" : cor}">${at} ms</span></div>${spark(arr, cor, 300, 46)}<div class="mon-lat-s"><span>mín <b>${so[0]}</b></span><span>média <b>${med}</b></span><span>p95 <b>${p95}</b></span><span>máx <b>${so[so.length - 1]}</b></span><span class="${falhas ? "bad" : ""}">falhas <b>${falhas}</b></span></div></div>`;
    };
    w.innerHTML = linha("Supabase", S.hist.sb, "#4f9d2d") + linha("Site (Cloudflare)", S.hist.site, "#2f78b8");
  }

  /* faixa de status geral */
  function resumo(){
    const w = $("monResumo"); if(!w) return;
    const rt = M.rt(), p = S.ping, agora = Date.now(), pb = [], av = [];
    if(!M.net().online) pb.push("sem internet neste computador");
    if(p && !p.semConexao && !p.ok) pb.push("Supabase não responde");
    if(S.site && !S.site.local && !S.site.ok) pb.push("site fora do ar");
    const r5 = remotos().filter(x => x.nivel === "erro" && agora - tmp(x) < 300000);
    if(r5.length) pb.push(r5.reduce((n, x) => n + (x.n || 1), 0) + " erro(s) de usuários nos últimos 5 min (" + new Set(r5.map(x => x.email)).size + " usuário(s))");
    if(rt.ev !== "SUBSCRIBED") av.push(rt.ev === "—" ? "tempo real aguardando conexão" : "tempo real reconectando");
    if(rt.erro) av.push("envio de erros com falha");
    if(S.novaVersao) av.push("há versão nova publicada (Ctrl+F5)");
    if(window.auditoriaAlertas){ const al = window.auditoriaAlertas(); al.problemas.forEach(x => pb.push(x)); al.avisos.slice(0, 3).forEach(x => av.push(x)); }
    if(p && p.ok && p.ms > 2500) av.push("Supabase lento");
    const cls = pb.length ? "err" : av.length ? "warn" : "ok";
    const tit = pb.length ? "Atenção: " + pb.join(" · ") : av.length ? "Funcionando, com observações: " + av.join(" · ") : "Tudo funcionando";
    const on = M.presenca().length;
    w.className = "mon-resumo " + cls;
    w.innerHTML = `<span class="mon-resumo-ic">${cls === "ok" ? "✓" : cls === "warn" ? "!" : "✕"}</span><div><b>${esc(tit)}</b><em>${on} usuário(s) online · atualizado às ${hms(agora)}</em></div>`;
  }
  /* gráfico: erros e avisos por 5 minutos nas últimas 2 horas */
  function grafico(){
    const w = $("monGrafico"); if(!w) return;
    const B = 24, passo = 300000, fim = Math.ceil(Date.now() / passo) * passo, ini = fim - B * passo, e = new Array(B).fill(0), a = new Array(B).fill(0);
    remotos().forEach(x => { const t = tmp(x); if(t < ini || t >= fim) return; const i = Math.floor((t - ini) / passo); (x.nivel === "erro" ? e : a)[i] += (x.n || 1); });
    const mx = Math.max(1, ...e.map((v, i) => v + a[i])), W = 100 / B;
    const barras = e.map((v, i) => {
      const he = v / mx * 44, ha2 = a[i] / mx * 44, x = i * W + .4;
      const hh = hms(ini + i * passo).slice(0, 5);
      return `<g><title>${hh} · ${v} erro(s), ${a[i]} aviso(s)</title><rect x="${x}" y="${48 - he - ha2}" width="${W - .8}" height="${ha2}" fill="#f0b429"/><rect x="${x}" y="${48 - he}" width="${W - .8}" height="${he}" fill="#c8372f"/><rect x="${x}" y="0" width="${W - .8}" height="48" fill="transparent"/></g>`;
    }).join("");
    const tot = e.reduce((s, v) => s + v, 0), ta = a.reduce((s, v) => s + v, 0);
    w.innerHTML = `<div class="mon-g-t"><span>Últimas 2 horas (a cada 5 min)</span><span><i class="r"></i>${tot} erro(s) <i class="y"></i>${ta} aviso(s)</span></div><svg viewBox="0 0 100 48" preserveAspectRatio="none" role="img" aria-label="Erros por intervalo de 5 minutos">${barras}<line x1="0" y1="47.8" x2="100" y2="47.8" stroke="#8fa08c" stroke-width=".4"/></svg><div class="mon-g-x"><span>-2 h</span><span>-1 h</span><span>agora</span></div>`;
  }
  /* problemas agrupados (mesma mensagem) */
  function topProblemas(){
    const w = $("monTop"); if(!w) return;
    const m = new Map();
    remotos().forEach(x => {
      const k = x.src + "|" + x.msg, o = m.get(k) || { src: x.src, msg: x.msg, nivel: x.nivel, n: 0, us: new Set(), ult: 0 };
      o.n += x.n || 1; o.us.add(String(x.email).toLowerCase()); o.ult = Math.max(o.ult, tmp(x)); if(x.nivel === "erro") o.nivel = "erro"; m.set(k, o);
    });
    const l = Array.from(m.values()).sort((a, b) => (b.nivel === "erro") - (a.nivel === "erro") || b.us.size - a.us.size || b.n - a.n).slice(0, 8);
    w.innerHTML = l.length ? `<div class="mon-scroll"><table class="mon-tab"><tr><th>Problema</th><th>Vezes</th><th>Usuários</th><th>Último</th><th></th></tr>${l.map(o => `<tr class="mon-top ${o.nivel === "erro" ? "e" : "a"}" data-busca="${esc(o.msg.slice(0, 60))}"><td><span class="mon-src s-${esc(o.src)}">${esc(ROTSRC[o.src] || o.src)}</span> ${esc(o.msg.slice(0, 110))}</td><td>${o.n}</td><td>${o.us.size}</td><td>${esc(ha(o.ult).replace("há ", ""))}</td><td><button type="button" class="mon-btn mon-res" data-res="${esc(o.src + "|" + o.msg)}" title="Marcar como resolvido: some das contagens (volta se acontecer de novo)">Resolver</button></td></tr>`).join("")}</table></div>` : `<div class="empty">Nenhum problema nas últimas 24 h${nResolvidos() ? " (" + nResolvidos() + " resolvido(s) oculto(s))" : ""}.</div>`;
  }

  function relatorio(){
    const sy = estadoSync(), s = M.stats();
    const cab = [
      "RELATÓRIO DO MONITOR — " + dh(Date.now()),
      "Endereço: " + location.href.split("?")[0],
      "Navegador: " + navigator.userAgent,
      "Usuário: " + ((window.AUTH_USUARIO && window.AUTH_USUARIO.email) || "-") + " (" + (window.AUTH_PAPEL || "leitor") + ")",
      "Online: " + (M.net().online ? "sim" : "NÃO"),
      "Sync: " + (sy ? JSON.stringify(sy) : "inativa"),
      "Supabase: " + s.supabase.n + " chamadas, " + s.supabase.erros + " erros" + (S.ping ? " · ping " + (S.ping.ok ? S.ping.ms + " ms" : "FALHOU " + (S.ping.erro || S.ping.motivo || "")) : ""),
      "Site: " + (S.site ? (S.site.local ? "arquivo local" : (S.site.ok ? "HTTP " + S.site["status"] + " cf-ray " + (S.site["cf-ray"] || "-") : "ERRO " + (S.site.erro || S.site.status))) : "-") + (S.novaVersao ? " · VERSÃO NOVA PUBLICADA" : ""),
      "-----"
    ].join("\n");
    const corpo = M.eventos().map(e => "[" + dh(e.t) + "] " + e.nivel.toUpperCase() + " " + e.src + (e.n > 1 ? " x" + e.n : "") + " — " + e.msg + (e.det && e.det !== e.msg ? "\n    " + e.det.replace(/\n/g, "\n    ") : "")).join("\n");
    const rem = remotos().map(e => "[" + dh(tmp(e)) + "] " + String(e.nivel).toUpperCase() + " " + e.src + (e.n > 1 ? " x" + e.n : "") + " — " + e.email + " (" + (e.rota || "-") + ") — " + e.msg + (e.det && e.det !== e.msg ? "\n    " + String(e.det).replace(/\n/g, "\n    ") : "")).join("\n");
    return cab + "\n" + corpo + (rem ? "\n----- ERROS DE TODOS OS USUÁRIOS (últimas 24 h) -----\n" + rem : "") + "\n" + (window.auditoriaRelatorio ? window.auditoriaRelatorio() : "");
  }
  async function copiar(txt){
    try{ await navigator.clipboard.writeText(txt); return true; }
    catch(e){ try{ const t = document.createElement("textarea"); t.value = txt; t.style.position = "fixed"; t.style.opacity = "0"; document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok; }catch(x){ return false; } }
  }

  /* ---------- desenho geral ---------- */
  function desenhar(){
    if(!$("monCards")) return;
    const adm = ehAdmin();
    $("monRestrito").hidden = adm; $("monCorpo").hidden = !adm;
    if(!adm) return;
    $("monCards").innerHTML = cartoes();
    $("monSync").innerHTML = painelSync();
    $("monHost").innerHTML = painelHost();
    $("monAmb").innerHTML = ambiente();
    if(!S.pausado){ desenharLog(); desenharLogR(); desenharOnline(); }
    resumo(); grafico(); topProblemas(); ondeErros(); latencia();
    if(window.auditoriaDesenhar) window.auditoriaDesenhar();
    botoes();
  }
  function agendar(){
    if(rafT || !ativoUI) return;
    rafT = requestAnimationFrame(() => { rafT = null; if(!ativa()) return; if(S.pausado){ const c = $("monCards"); if(c) c.innerHTML = cartoes(); return; } desenhar(); });
  }

  function badge(){
    const b = document.querySelector('#tabsNav [data-tab="monitor"]'); if(!b) return;
    const loc = M.eventos().filter(x => x.nivel === "erro" && Date.now() - x.t < 3600000).reduce((s, x) => s + (x.n || 1), 0);
    const rem = remotos().filter(x => x.nivel === "erro" && x.sessao !== M.sessao && Date.now() - tmp(x) < 3600000).reduce((s, x) => s + (x.n || 1), 0);   // o que é deste navegador já está em "loc"
    const n = loc + rem;
    let i = b.querySelector(".mon-badge");
    if(!n){ if(i) i.remove(); return; }
    if(!i){ i = document.createElement("b"); i.className = "mon-badge"; b.appendChild(i); }
    i.textContent = n > 99 ? "99+" : n;
  }
  window.monitorBadge = badge;

  async function rodada(completa){
    await Promise.all([verificarSupabase(), verificarStorage()]);
    if(completa || Date.now() - S.ultVerifSite > 20000) await verificarSite();
    if(ativa()) desenhar();
  }
  function tick(){
    if(!ativa() || !ehAdmin()){ clearInterval(tickT); tickT = null; ativoUI = false; return; }
    if(document.hidden) return;                                   // aba escondida: não redesenha nada
    tickN++;
    if(tickN % 5 === 0) rodada(false);                            // Supabase a cada 5 s (site a cada 20 s)
    const c = $("monCards"); if(c) c.innerHTML = cartoes();      // cartões a cada segundo (tempos "há X s"); os logs mudam quando chega evento
    relogio();
    if(!S.pausado){ desenharOnline(); resumo(); }                 // "conectado há…" e faixa de status
  }
  let tickN = 0;

  window.monitorAdminRefresh = function(){
    ativoUI = true; desenhar(); visto(); botoes(); relogio();
    if(!ehAdmin()) return;
    rodada(true);
    if(!tickT){ tickN = 0; tickT = setInterval(tick, 1000); }
  };

  /* ---------- alertas: som, notificação, título da aba ---------- */
  let ac = null, somUlt = 0;
  function bip(){
    if(!S.som || Date.now() - somUlt < 3000) return; somUlt = Date.now();
    try{
      ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if(ac.state === "suspended") ac.resume();
      [0, .2].forEach((d, i) => { const o = ac.createOscillator(), g = ac.createGain(); o.type = "sine"; o.frequency.value = i ? 660 : 880; o.connect(g); g.connect(ac.destination); const t = ac.currentTime + d; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.25, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .16); o.start(t); o.stop(t + .18); });
    }catch(e){}
  }
  function notificar(e){
    if(!S.notif || typeof Notification === "undefined" || Notification.permission !== "granted" || !document.hidden) return;
    try{ const n = new Notification("Erro de usuário · " + nomeUsuario(e), { body: String(e.msg).slice(0, 140) + (e.rota ? "\n(" + e.rota + ")" : ""), tag: "mon-erro" }); n.onclick = () => { window.focus(); if(typeof switchTab === "function") switchTab("monitor"); n.close(); }; }catch(x){}
  }
  function titulo(){
    if(!S.tituloBase) S.tituloBase = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = (S.naoVistos > 0 ? "(" + S.naoVistos + ") " : "") + S.tituloBase;
  }
  function visto(){ if(S.naoVistos){ S.naoVistos = 0; titulo(); } }
  function botoes(){
    const a = $("monSom"), b = $("monNotif"), c = $("monTV"), d = $("monVerRes");
    if(d){ d.textContent = S.verRes ? "Ocultar resolvidos" : "Mostrar resolvidos (" + nResolvidos() + ")"; d.classList.toggle("on", S.verRes); }
    if(a){ a.textContent = (S.som ? "🔔 Som ligado" : "🔕 Som desligado"); a.classList.toggle("on", S.som); }
    if(b){ const neg = typeof Notification !== "undefined" && Notification.permission === "denied"; b.textContent = (S.notif ? "🔔 Notificações ligadas" : "🔕 Notificações") + (neg ? " (bloqueadas no navegador)" : ""); b.classList.toggle("on", S.notif); }
    if(c){ c.textContent = S.tv ? "✕ Sair do modo TV" : "▣ Modo TV"; c.classList.toggle("on", S.tv); }
  }
  function modoTV(on){
    S.tv = on; const w = $("sec-monitor"); if(!w) return;
    w.classList.toggle("mon-tv", on); document.body.classList.toggle("mon-tv-on", on);
    try{ if(on && w.requestFullscreen) w.requestFullscreen().catch(() => {}); else if(!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); }catch(e){}
    botoes();
  }
  document.addEventListener("fullscreenchange", () => { if(!document.fullscreenElement && S.tv){ S.tv = false; const w = $("sec-monitor"); if(w) w.classList.remove("mon-tv"); document.body.classList.remove("mon-tv-on"); botoes(); } });
  document.addEventListener("keydown", e => { if(e.key === "Escape" && S.tv) modoTV(false); });
  function relogio(){
    const c = $("monClock"), a = $("monAberto"); if(!c) return;
    const d = new Date(); c.textContent = d.toLocaleTimeString("pt-BR");
    if(a) a.textContent = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" }) + " · página aberta " + ha(M.carregouEm).replace("há ", "há ");
  }

  /* aviso flutuante (em qualquer tela) quando um usuário tem erro: só admin, só erro novo ao vivo */
  let toastEl = null, toastT = null, toastN = 0, toastUlt = 0;
  function toast(e){
    if(!ehAdmin()) return;
    const agora = Date.now();
    if(!toastEl){
      toastEl = document.createElement("div"); toastEl.className = "mon-toast"; toastEl.setAttribute("role", "alert");
      toastEl.addEventListener("click", () => { toastEl.classList.remove("on"); if(typeof switchTab === "function") switchTab("monitor"); });
      document.body.appendChild(toastEl);
    }
    toastN = (toastEl.classList.contains("on") && agora - toastUlt < 8000) ? toastN + 1 : 1; toastUlt = agora;
    toastEl.innerHTML = `<b>Erro de usuário${toastN > 1 ? " (+" + (toastN - 1) + ")" : ""}</b><span>${esc(nomeUsuario(e))} · ${esc(e.rota || "—")}</span><em>${esc(String(e.msg).slice(0, 140))}</em><small>clique para abrir o Monitor</small>`;
    toastEl.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove("on"), 9000);
  }

  window.attachMonitorAdmin = function(){
    M.on(e => { badge(); if(ativa()) agendar(); });
    M.onRemoto((e, vivo) => {
      badge();
      if(vivo && e){ S.novos.set(e.id, Date.now()); setTimeout(() => { S.novos.delete(e.id); if(ativa() && !S.pausado) desenharLogR(); }, 4200); }
      if(vivo && e && e.nivel === "erro" && e.sessao !== M.sessao){
        toast(e); bip(); notificar(e);
        if(document.hidden || !ativa()){ S.naoVistos++; titulo(); }
      }
      if(ativa()) agendar();
    });
    document.addEventListener("visibilitychange", () => { if(!document.hidden && ativa()) visto(); });
    botoes();
    M.onPresenca(() => { if(ativa() && !S.pausado) desenharOnline(); });
    M.onStatus(() => { if(ativa()) agendar(); });
    // com a aba fechada o admin continua recebendo os erros (Realtime) e confere o Supabase a cada 30 s
    setInterval(() => { if(ehAdmin() && !ativa() && !document.hidden) verificarSupabase(); }, 30000);
    // linha de base da versão do site (para avisar quando sair uma versão nova)
    if(location.protocol !== "file:") setTimeout(() => { fetch(location.pathname).then(r => r.text()).then(t => { if(S.hashBase === null) S.hashBase = hash(t); }).catch(() => {}); }, 4000);
    const w = $("sec-monitor"); if(!w) return;
    w.addEventListener("click", ev => {
      const rs = ev.target.closest("[data-res]");
      if(rs){ S.res[rs.dataset.res] = Date.now(); salvaRes(); desenhar(); badge(); return; }
      if(ev.target.id === "monResTodos"){ const ag = Date.now(); M.remotos().forEach(x => { S.res[chaveR(x)] = ag; }); salvaRes(); desenhar(); badge(); return; }
      if(ev.target.id === "monVerRes"){ S.verRes = !S.verRes; desenhar(); badge(); return; }
      const b = ev.target.closest("[data-mon]");
      if(b){
        const a = b.dataset.mon;
        if(a === "ping") rodada(false);
        else if(a === "diag") compararSync();
        else if(a === "site") rodada(true);
        else if(a === "arq") testarArquivos();
        else if(a === "pub" && window.SYNC && window.SYNC.publicar) window.SYNC.publicar();
        else if(a === "agenda" && window.SYNC && window.SYNC.abrirAgenda) window.SYNC.abrirAgenda();
        return;
      }
      const c = ev.target.closest("[data-f]"); if(c){ S.filtro = c.dataset.f; desenharLog(); return; }
      const tp = ev.target.closest("[data-busca]"); if(tp){ S.buscaR = tp.dataset.busca; const bi = $("monBuscaR"); if(bi) bi.value = S.buscaR; desenharLogR(); const lg = $("monLogR"); if(lg) lg.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      if(ev.target.id === "monApagarR"){ if(confirm("Apagar do Supabase TODOS os eventos de erro dos usuários?")){ M.apagarRemotos().then(() => { S.abertoR.clear(); desenhar(); }).catch(e => alert("Não consegui apagar: " + ((e && e.message) || e))); } return; }
      const us = ev.target.closest("[data-user]"); if(us){ S.usuarioR = S.usuarioR === us.dataset.user ? "" : us.dataset.user; desenharLogR(); const lg = $("monLogR"); if(lg) lg.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      if(ev.target.closest("#monSom")){ S.som = !S.som; salvaPrefs(); botoes(); if(S.som){ somUlt = 0; bip(); } return; }
      if(ev.target.closest("#monTV")){ modoTV(!S.tv); return; }
      if(ev.target.closest("#monNotif")){
        if(S.notif){ S.notif = false; salvaPrefs(); botoes(); return; }
        if(typeof Notification === "undefined"){ alert("Este navegador não oferece notificações."); return; }
        Promise.resolve(Notification.permission === "granted" ? "granted" : Notification.requestPermission()).then(r => { S.notif = r === "granted"; salvaPrefs(); botoes(); });
        return;
      }
      const cr = ev.target.closest("[data-fr]"); if(cr){ S.filtroR = cr.dataset.fr; desenharLogR(); return; }
      const rr = ev.target.closest("[data-rid]"); if(rr){ const id = Number(rr.dataset.rid); if(S.abertoR.has(id)) S.abertoR.delete(id); else S.abertoR.add(id); desenharLogR(); return; }
      const r = ev.target.closest(".mon-row"); if(r){ const id = Number(r.dataset.id); if(S.aberto.has(id)) S.aberto.delete(id); else S.aberto.add(id); desenharLog(); return; }
      if(ev.target.id === "monPausa"){ S.pausado = !S.pausado; ev.target.textContent = S.pausado ? "Retomar" : "Pausar"; if(!S.pausado) desenhar(); else{ desenharLog(); desenharLogR(); } return; }
      if(ev.target.id === "monCopiar"){ copiar(relatorio()).then(ok => { ev.target.textContent = ok ? "Copiado!" : "Não consegui copiar"; setTimeout(() => { ev.target.textContent = "Copiar relatório"; }, 1800); }); return; }
      if(ev.target.id === "monBaixar"){ const bl = new Blob([relatorio()], { type: "text/plain;charset=utf-8" }), a = document.createElement("a"); a.href = URL.createObjectURL(bl); a.download = "monitor-" + new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-") + ".txt"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); return; }
      if(ev.target.id === "monTeste"){ M.log("monitor", "aviso", "Evento de teste (pode ignorar)", "Gerado pelo botão Evento de teste em " + dh(Date.now()), { remoto: true }); return; }
      if(ev.target.id === "monLimpar"){ if(confirm("Limpar o log de eventos desta sessão?")){ M.limpar(); S.aberto.clear(); desenhar(); } return; }
    });
    w.addEventListener("input", ev => { if(ev.target.id === "monBusca"){ S.busca = ev.target.value; desenharLog(); } else if(ev.target.id === "monBuscaR"){ S.buscaR = ev.target.value; desenharLogR(); } });
    w.addEventListener("change", ev => { if(ev.target.id === "monUsuarioR"){ S.usuarioR = ev.target.value; desenharLogR(); } });
    desenhar();
  };
})();

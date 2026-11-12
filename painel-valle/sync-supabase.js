/* =====================================================================
   SINCRONIZAÇÃO ADMIN -> USUÁRIOS  (v2.0 - arquivo refeito)
   ---------------------------------------------------------------------
   Admin  : ganha o botão "Publicar para usuários" (menu lateral). Depois da
            1ª publicação manual, tudo que ele importar/alterar vai sozinho
            ~4 s depois (publicação automática).
   Leitor : ao entrar, baixa os dados publicados e recarrega o painel. Com o
            painel aberto, a cada 30 s avisa "Atualizar agora".

   O QUE É PUBLICADO (tabela public.painel_dados no Supabase):
     v2:ls:<chave>   -> cada item do armazenamento do painel (LS / IndexedDB "painel_valle_kv")
     v2:idb:analise  -> banco "tambasa_analise_db"   (Análise gerencial)
     v2:idb:perf     -> banco "painel_valle_perf_teste" (Performance / CTRCs)
     v2:idb:film     -> banco "tambasa_filmagens"    (Receita / Filmagens)
     __meta          -> versão publicada (sempre gravada POR ÚLTIMO)
   NÃO são publicados: preferências de tela (tema, aba, filtros "_ui", mês
   selecionado), sessão do login (sb-...) e marcadores internos (__...).

   SEGURANÇA:
   - Só publica se houver algo neste navegador (nunca publica "vazio").
   - Trava: se a publicação APAGAR ou REDUZIR muito um item já publicado,
     a publicação automática PARA e a manual pede para digitar CONFIRMAR.
   - Antes de publicar guarda uma cópia (salvar_historico) para poder restaurar.
   - Linhas antigas da tabela (que não começam com "v2:") NUNCA são apagadas.
   - Só publica sozinho se este navegador está alinhado com a última versão
     publicada; senão use o botão (ele pede confirmação).
   ===================================================================== */
(function(){
  "use strict";

  const PREF = "v2:";
  const TAM_PARTE = 300000;         // caracteres por linha da tabela
  const LOTE_CHARS = 1500000;       // caracteres por envio ao Supabase
  const DEBOUNCE_MS = 4000;         // publicação automática: espera depois da última alteração
  const POLL_MS = 30000;            // leitor: confere versão nova a cada 30 s
  const K_VER = "__sync_versao_local";
  const K_HASH = "__sync_hashes";
  const K_REMOTO = "__sync_remoto";   // assinatura (data|partes|tamanho) de cada item já aplicado neste navegador: permite baixar só o que mudou
  const PARALELO = 6;                 // itens baixados ao mesmo tempo
  const K_AGENDA = "__sync_agenda";   // horário de publicação (só deste navegador, não é publicado)
  const K_PEND = "__sync_pend_desde"; // desde quando há alterações ainda não publicadas
  const TICK_MS = 20000;              // confere a agenda a cada 20 s

  /* bancos IndexedDB próprios (mesmos nomes/versões/stores dos módulos que os usam) */
  const BANCOS = [
    { id: "analise", nome: "tambasa_analise_db",     versao: 2, store: "arquivos", keyPath: "id" },
    { id: "perf",    nome: "painel_valle_perf_teste", versao: 1, store: "ctrcs",    keyPath: "k"  },
    { id: "film",    nome: "tambasa_filmagens",       versao: 1, store: "kv",       keyPath: null }
  ];
  const NOMES_BANCOS = new Set(BANCOS.map(b => b.nome));

  /* itens do LS que ficam só neste navegador */
  const EXCLUIR = [
    /^__/, /^sb-/, /^painel_auth_demo$/,
    /^painel_(dp_aba|nav_fechados|vo_tema|lugar|sidebar_collapsed)$/,
    /^bi-/, /_ui(_v\d+)?$/, /mes_sel$/, /^tambasa_exped_selecao_filiais$/
  ];
  const publicavel = k => !EXCLUIR.some(r => r.test(k));

  let cliente = null, papel = "leitor", email = "", ativo = false;
  let sujo = false, tAuto = null, tPoll = null, ocupado = false, aplicando = false;
  let aviso = "", ultimoOk = "";
  let ui = null;
  let tAgenda = null, tentadoT = 0;

  const LS0 = {};      // métodos originais do LS (para gravar sem acionar a publicação automática)
  const mlog = (nivel, msg, det) => { try{ if(window.MONITOR) window.MONITOR.log("sync", nivel, msg, det); }catch(e){} };   // alimenta a aba Monitor (admin)

  /* ---------------- agenda de publicação (admin) ---------------- */
  //AGENDA_INI
  function lerAgenda(){
    try{ const a = JSON.parse(lsGet(K_AGENDA) || "null"); if(a && (a.modo === "imediato" || a.modo === "agendado") && Array.isArray(a.horarios)) return a; }catch(e){}
    return { modo: "agendado", horarios: ["12:00", "15:00", "18:00"] };
  }
  function minutosValidos(a){
    return a.horarios.map(h => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(h).trim()); if(!m) return null; const H = +m[1], M = +m[2]; return (H > 23 || M > 59) ? null : H * 60 + M; })
      .filter(x => x !== null).sort((x, y) => x - y).filter((x, i, v) => i === 0 || x !== v[i - 1]);
  }
  const hhmm = min => String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0");
  function dataMin(base, min, dia){ const d = new Date(base); d.setDate(d.getDate() + dia); d.setHours(Math.floor(min / 60), min % 60, 0, 0); return d; }
  function ultimoHorario(agora){        // horário de publicação mais recente que já passou
    const mins = minutosValidos(lerAgenda()); let best = null;
    [0, -1].forEach(dia => mins.forEach(m => { const d = dataMin(agora, m, dia); if(d <= agora && (!best || d > best)) best = d; }));
    return best;
  }
  function proximoHorario(agora){       // próximo horário de publicação
    const mins = minutosValidos(lerAgenda()); let best = null;
    [0, 1].forEach(dia => mins.forEach(m => { const d = dataMin(agora, m, dia); if(d > agora && (!best || d < best)) best = d; }));
    return best;
  }
  //AGENDA_FIM

  /* ---------------- utilidades ---------------- */
  const agoraHM = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const fmtMB = n => (n / 1048576).toFixed(1).replace(".", ",") + " MB";
  const flush = () => (window.LS_FLUSH ? window.LS_FLUSH() : Promise.resolve());
  const lsGet = k => { try{ return window.LS.getItem(k); }catch(e){ return null; } };
  const lsSetQuieto = (k, v) => LS0.set(k, v);
  const versaoLocal = () => lsGet(K_VER) || "";

  function hash(s){
    let h = 2166136261 >>> 0;
    for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return s.length + ":" + h.toString(36);
  }
  /* tamanho em caracteres como o Postgres conta (um emoji = 1, não 2) */
  function tam(s){
    let n = s.length;
    for(let i = 0; i < s.length; i++){ const c = s.charCodeAt(i); if(c >= 0xD800 && c <= 0xDBFF) n--; }
    return n;
  }
  function dividir(texto){
    const out = [];
    let i = 0;
    if(!texto.length) return [""];
    while(i < texto.length){
      let fim = Math.min(i + TAM_PARTE, texto.length);
      if(fim < texto.length){                       // não corta no meio de um par substituto (emoji etc.)
        const c = texto.charCodeAt(fim - 1);
        if(c >= 0xD800 && c <= 0xDBFF) fim--;
      }
      out.push(texto.slice(i, fim));
      i = fim;
    }
    return out;
  }

  /* ---------------- IndexedDB próprios ---------------- */
  function abrirBanco(b){
    return new Promise((res, rej) => {
      if(!window.indexedDB){ rej(new Error("IndexedDB indisponível")); return; }
      const r = indexedDB.open(b.nome, b.versao);
      r.onupgradeneeded = () => {
        const db = r.result;
        if(b.id === "analise" && db.objectStoreNames.contains(b.store)) db.deleteObjectStore(b.store);
        if(!db.objectStoreNames.contains(b.store)) db.createObjectStore(b.store, b.keyPath ? { keyPath: b.keyPath } : undefined);
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error("Falha ao abrir " + b.nome));
      r.onblocked = () => rej(new Error(b.nome + " bloqueado por outra aba"));
    });
  }
  async function lerBanco(b){
    const db = await abrirBanco(b);
    try{
      return await new Promise((res, rej) => {
        const tx = db.transaction(b.store, "readonly"), os = tx.objectStore(b.store);
        if(b.keyPath){
          const q = os.getAll();
          q.onsuccess = () => res(q.result || []);
          q.onerror = () => rej(q.error);
        }else{
          const o = {}, cur = os.openCursor();
          cur.onsuccess = () => { const c = cur.result; if(c){ o[c.key] = c.value; c.continue(); } else res(o); };
          cur.onerror = () => rej(cur.error);
        }
      });
    }finally{ db.close(); }
  }
  async function gravarBanco(b, dados){
    const db = await abrirBanco(b);
    try{
      await new Promise((res, rej) => {
        const tx = db.transaction(b.store, "readwrite"), os = tx.objectStore(b.store);
        os.clear();
        if(b.keyPath) (dados || []).forEach(r => os.put(r));
        else Object.keys(dados || {}).forEach(k => os.put(dados[k], k));
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error("Gravação abortada em " + b.nome));
      });
    }finally{ db.close(); }
  }

  /* ---------------- Supabase ---------------- */
  async function lerMeta(){
    const { data, error } = await cliente.from("painel_dados").select("valor").eq("chave", "__meta").eq("parte", 0).maybeSingle();
    if(error) throw new Error("Não consegui ler a versão publicada: " + error.message);
    if(!data) return null;
    try{ const m = JSON.parse(data.valor); return m && m.versao ? m : null; }catch(e){ return null; }
  }
  async function lerResumo(){
    const mapa = new Map();
    // v2 (supabase-sync-rapido.sql): traz também a data da última alteração de cada item
    let r = await cliente.rpc("resumo_painel_v2");
    if(!r.error && Array.isArray(r.data)){
      r.data.forEach(x => mapa.set(x.chave, { partes: Number(x.partes), tamanho: Number(x.tamanho), atualizado: x.atualizado || null }));
      return mapa;
    }
    r = await cliente.rpc("resumo_painel");
    if(!r.error && Array.isArray(r.data)){
      r.data.forEach(x => mapa.set(x.chave, { partes: Number(x.partes), tamanho: Number(x.tamanho), atualizado: null }));
      return mapa;
    }
    // plano B (funções não instaladas): conta as partes direto da tabela
    let de = 0;
    for(;;){
      const q = await cliente.from("painel_dados").select("chave,parte,atualizado_em").neq("chave", "__meta").order("chave").order("parte").range(de, de + 999);
      if(q.error) throw new Error("Não consegui listar os dados publicados: " + q.error.message);
      (q.data || []).forEach(x => {
        const m = mapa.get(x.chave) || { partes: 0, tamanho: null, atualizado: null };
        m.partes++; if(x.atualizado_em && (!m.atualizado || x.atualizado_em > m.atualizado)) m.atualizado = x.atualizado_em;
        mapa.set(x.chave, m);
      });
      if(!q.data || q.data.length < 1000) break;
      de += 1000;
    }
    return mapa;
  }

  /* ---------------- coleta do que será publicado ---------------- */
  async function coletar(){
    const itens = new Map();
    const LS = window.LS;
    for(let i = 0; i < LS.length; i++){
      const k = LS.key(i);
      if(k === null || !publicavel(k)) continue;
      const v = LS.getItem(k);
      if(typeof v === "string") itens.set(PREF + "ls:" + k, v);
    }
    for(const b of BANCOS){
      let dados = null;
      try{ dados = await lerBanco(b); }catch(e){ console.warn("[sync] não consegui ler " + b.nome, e); }
      if(dados !== null) itens.set(PREF + "idb:" + b.id, JSON.stringify(dados));
    }
    return itens;
  }

  /* ---------------- PUBLICAR (admin) ---------------- */
  function analisarRisco(itens, resumo){
    const apagar = [], reduzir = [];
    resumo.forEach((r, k) => {
      if(k.indexOf(PREF) !== 0) return;
      const loc = itens.get(k);
      if(loc === undefined){ if(r.tamanho === null || r.tamanho > 2000) apagar.push(k.slice(PREF.length) + (r.tamanho ? " (" + fmtMB(r.tamanho) + ")" : "")); return; }
      if(r.tamanho > 200000 && tam(loc) < r.tamanho * 0.7) reduzir.push(k.slice(PREF.length) + ": " + fmtMB(r.tamanho) + " → " + fmtMB(tam(loc)));
    });
    return { apagar, reduzir, risco: apagar.length + reduzir.length > 0 };
  }

  async function publicar(manual){
    if(!ativo || papel !== "admin" || !cliente) return;
    if(ocupado) return;
    ocupado = true; sujo = false; clearTimeout(tAuto); tAuto = null;
    mlog("info", "Publicação " + (manual ? "manual" : "automática") + " iniciada");
    try{
      setStatus("Conferindo os dados…");
      const itens = await coletar();
      // "vazio" = nenhum item do painel e todos os bancos sem registro (um banco recém-criado conta como vazio)
      let temDados = false;
      itens.forEach((v, k) => { if(k.indexOf(PREF + "ls:") === 0 || (v !== "[]" && v !== "{}")) temDados = true; });
      if(!temDados){
        const m = "Este navegador está sem dados — nada foi publicado (para não apagar o que já está publicado).";
        mlog("aviso", m);
        if(manual) alert(m); aviso = m; return;
      }
      const [metaRem, resumo] = await Promise.all([lerMeta(), lerResumo()]);
      const alinhado = !metaRem || metaRem.versao === versaoLocal();

      if(!alinhado && !manual){
        aviso = "Publicação automática pausada: outro computador publicou depois. Use “Publicar para usuários”.";
        mlog("aviso", aviso, "Versão publicada: " + (metaRem && metaRem.versao) + " por " + (metaRem && metaRem.por) + " · versão deste navegador: " + versaoLocal());
        return;
      }
      if(!alinhado && manual){
        const ok = confirm("Atenção: existe uma versão publicada que NÃO veio deste computador" + (metaRem && metaRem.por ? " (por " + metaRem.por + ")" : "") + ".\n\nPublicar agora vai SUBSTITUIR essa versão pelos dados deste navegador.\n\nContinuar?");
        if(!ok){ aviso = "Publicação cancelada."; mlog("aviso", "Publicação cancelada: existe versão publicada de outro computador"); return; }
      }

      const risco = analisarRisco(itens, resumo);
      if(risco.risco){
        const detR = (risco.apagar.length ? "APAGAR: " + risco.apagar.join("; ") + ". " : "") + (risco.reduzir.length ? "REDUZIR: " + risco.reduzir.join("; ") : "");
        if(!manual){
          aviso = "Publicação automática PARADA: a alteração apaga ou reduz dados já publicados. Confira e use “Publicar para usuários”.";
          mlog("aviso", "Publicação automática PARADA pela trava de segurança", detR);
          return;
        }
        const txt = (risco.apagar.length ? "Vai APAGAR dos usuários:\n - " + risco.apagar.join("\n - ") + "\n\n" : "") +
                    (risco.reduzir.length ? "Vai REDUZIR muito:\n - " + risco.reduzir.join("\n - ") + "\n\n" : "") +
                    "Se isso não é o que você queria, cancele (uma cópia da versão atual é guardada de qualquer forma).\n\nDigite CONFIRMAR para publicar:";
        const resp = prompt(txt);
        if(!resp || resp.trim().toUpperCase() !== "CONFIRMAR"){ aviso = "Publicação cancelada."; mlog("aviso", "Publicação cancelada no aviso de redução", detR); return; }
        mlog("aviso", "Administrador confirmou publicar com redução", detR);
      }

      // o que mudou desde a última publicação deste navegador
      const hashes = {}; itens.forEach((v, k) => { hashes[k] = hash(v); });
      let salvos = {};
      if(alinhado && metaRem){ try{ salvos = JSON.parse(lsGet(K_HASH) || "{}") || {}; }catch(e){ salvos = {}; } }
      const mudados = [];
      itens.forEach((v, k) => {
        const rem = resumo.get(k);
        if(!rem || salvos[k] !== hashes[k] || (rem.tamanho !== null && rem.tamanho !== tam(v))) mudados.push(k);
      });
      const remover = [];
      resumo.forEach((r, k) => { if(k.indexOf(PREF) === 0 && !itens.has(k)) remover.push(k); });

      if(!mudados.length && !remover.length && metaRem && metaRem.versao === versaoLocal()){
        lsSetQuieto(K_PEND, ""); ultimoOk = "Em dia — " + agoraHM(); aviso = ""; mlog("info", "Nada a publicar: já está em dia"); return;
      }

      // cópia de segurança da versão que está publicada agora
      setStatus("Guardando cópia de segurança…");
      try{
        const h = await cliente.rpc("salvar_historico", { forcar: !!manual });
        if(h.error) throw h.error;
      }catch(e){
        console.warn("[sync] histórico:", e);
        if(manual && !confirm("Não consegui guardar a cópia de segurança (histórico).\n\nPublicar mesmo assim?")){ aviso = "Publicação cancelada."; return; }
      }

      // envio
      let lote = [], chars = 0, feitos = 0;
      const descarga = async () => {
        if(!lote.length) return;
        const { error } = await cliente.from("painel_dados").upsert(lote, { onConflict: "chave,parte" });
        if(error) throw new Error(error.message);
        lote = []; chars = 0;
      };
      for(const k of mudados){
        const partes = dividir(itens.get(k));
        const agora = new Date().toISOString();
        for(let p = 0; p < partes.length; p++){
          lote.push({ chave: k, parte: p, valor: partes[p], atualizado_em: agora });
          chars += partes[p].length;
          if(chars >= LOTE_CHARS) await descarga();
        }
        await descarga();
        const rem = resumo.get(k);
        if(rem && rem.partes > partes.length){
          const d = await cliente.from("painel_dados").delete().eq("chave", k).gt("parte", partes.length - 1);
          if(d.error) throw new Error(d.error.message);
        }
        feitos++; setStatus("Publicando " + feitos + "/" + mudados.length + "…");
      }
      for(const k of remover){
        const d = await cliente.from("painel_dados").delete().eq("chave", k);
        if(d.error) throw new Error(d.error.message);
      }

      // versão nova: sempre por último (é ela que avisa os leitores)
      const versao = new Date().toISOString();
      const meta = { versao, por: email, linhas: 0, chaves: itens.size, formato: "v2" };
      itens.forEach(v => { meta.linhas += Math.max(1, Math.ceil(v.length / TAM_PARTE)); });
      const m = await cliente.from("painel_dados").upsert([{ chave: "__meta", parte: 0, valor: JSON.stringify(meta), atualizado_em: versao }], { onConflict: "chave,parte" });
      if(m.error) throw new Error(m.error.message);

      lsSetQuieto(K_VER, versao);
      lsSetQuieto(K_HASH, JSON.stringify(hashes));
      lsSetQuieto(K_PEND, sujo ? new Date().toISOString() : "");   // mexeu durante a publicação: continua pendente
      await flush();
      ultimoOk = "Publicado às " + agoraHM(); aviso = "";
      mlog("ok", "Publicado: " + mudados.length + " item(ns) enviado(s), " + remover.length + " removido(s)", mudados.join(", "));
      if(manual) setStatus(ultimoOk + " (" + mudados.length + " item(ns) enviados)");
    }catch(err){
      console.error("[sync] erro ao publicar:", err);
      aviso = "Erro ao publicar: " + (err && err.message ? err.message : err);
      if(manual) alert(aviso);
    }finally{
      ocupado = false;
      if(sujo) agendarAuto();
      setStatus();
    }
  }

  function agendarAuto(){
    if(!ativo || papel !== "admin") return;
    if(lerAgenda().modo === "agendado") return;      // modo agendado: quem publica é a agenda (verificarAgenda)
    clearTimeout(tAuto);
    tAuto = setTimeout(() => publicar(false), DEBOUNCE_MS);
  }
  const pendDesde = () => lsGet(K_PEND) || "";
  function verificarAgenda(){
    if(!ativo || papel !== "admin" || !cliente) return;
    setStatus();
    if(ocupado || lerAgenda().modo !== "agendado") return;
    const desde = pendDesde(); if(!desde) return;
    const T = ultimoHorario(new Date()); if(!T) return;
    if(new Date(desde) >= T) return;                 // alteração feita depois do último horário: espera o próximo
    if(tentadoT === T.getTime()) return;             // já tentou neste horário (não repete a cada 20 s)
    tentadoT = T.getTime();
    const hh = hhmm(T.getHours() * 60 + T.getMinutes());
    mlog("info", "Horário de publicação (" + hh + "): publicando as alterações pendentes");
    publicar(false).then(() => {
      if(aviso) mostrarToast("Publicação das " + hh + " NÃO concluída: " + aviso);
      else mostrarToast("Publicação das " + hh + " concluída. " + (ultimoOk || ""));
    });
  }
  function marcarSujo(){
    if(!ativo || papel !== "admin" || aplicando) return;
    sujo = true;
    if(!pendDesde()) lsSetQuieto(K_PEND, new Date().toISOString());
    if(!ocupado) agendarAuto();
    setStatus();
  }

  /* ---------------- BAIXAR (leitor ou admin pedindo manualmente) ---------------- */
  async function baixarChave(k, partes, tamanho){
    const acum = [];
    const GRUPO = 6;
    for(let de = 0; de < partes; de += GRUPO){
      const { data, error } = await cliente.from("painel_dados").select("parte,valor").eq("chave", k).gte("parte", de).lt("parte", de + GRUPO).order("parte");
      if(error) throw new Error(error.message);
      (data || []).forEach(x => { acum[x.parte] = x.valor; });
    }
    for(let p = 0; p < partes; p++) if(typeof acum[p] !== "string") throw new Error("Faltou a parte " + (p + 1) + " de " + k);
    const texto = acum.join("");
    if(tamanho !== null && tamanho !== undefined && !isNaN(tamanho) && tam(texto) !== tamanho) throw new Error("Tamanho diferente do publicado em " + k);
    return texto;
  }

  const assinatura = r => (r.atualizado || "") + "|" + r.partes + "|" + r.tamanho;

  /* Executa tarefas em paralelo (no máximo "n" por vez); falha se qualquer uma falhar. */
  async function emParalelo(lista, n, fn){
    let i = 0, erro = null;
    const trabalhador = async () => {
      while(!erro && i < lista.length){
        const k = lista[i++];
        try{ await fn(k); }catch(e){ erro = e; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(n, lista.length) }, trabalhador));
    if(erro) throw erro;
  }

  /* tudo = true: baixa todos os itens (botão "Baixar dados publicados para este computador").
     tudo = false: baixa só o que mudou desde a última atualização deste navegador. */
  async function baixarEAplicar(progresso, tudo, adiar){
    for(let tentativa = 0; tentativa < 3; tentativa++){
      const meta = await lerMeta();
      if(!meta) return { ok: false, motivo: "semDados" };
      const resumo = await lerResumo();
      const chaves = [...resumo.keys()].filter(k => k.indexOf(PREF) === 0);
      if(!chaves.length) return { ok: false, motivo: "formatoAntigo" };

      let mapaLocal = {};
      if(!tudo){ try{ mapaLocal = JSON.parse(lsGet(K_REMOTO) || "{}") || {}; }catch(e){ mapaLocal = {}; } }
      const precisa = chaves.filter(k => {
        const r = resumo.get(k);
        if(tudo || !r.atualizado) return true;                       // sem data (SQL antigo): baixa tudo, como antes
        if(mapaLocal[k] !== assinatura(r)) return true;               // mudou desde a última vez
        if(k.indexOf(PREF + "ls:") === 0){                            // item do painel: confere se o que está aqui ainda é o publicado
          const v = lsGet(k.slice((PREF + "ls:").length));
          if(v === null || (r.tamanho !== null && tam(v) !== r.tamanho)) return true;
        }
        return false;
      });

      const itens = new Map();
      let n = 0;
      if(progresso) progresso(0, precisa.length);
      await emParalelo(precisa, PARALELO, async k => {
        const r = resumo.get(k);
        itens.set(k, await baixarChave(k, r.partes, r.tamanho));
        n++; if(progresso) progresso(n, precisa.length);
      });
      const depois = await lerMeta();
      if(depois && depois.versao !== meta.versao) continue;     // publicaram no meio do download: refaz

      const aplicarAgora = async () => {
      aplicando = true;
      try{
        const ls = new Map(), idb = {};
        itens.forEach((v, k) => {
          if(k.indexOf(PREF + "ls:") === 0) ls.set(k.slice((PREF + "ls:").length), v);
          else if(k.indexOf(PREF + "idb:") === 0) idb[k.slice((PREF + "idb:").length)] = v;
        });
        for(const b of BANCOS){
          if(typeof idb[b.id] !== "string") continue;
          await gravarBanco(b, JSON.parse(idb[b.id]));
        }
        // itens do painel que não existem mais na versão publicada saem daqui
        const publicadosLs = new Set(chaves.filter(k => k.indexOf(PREF + "ls:") === 0).map(k => k.slice((PREF + "ls:").length)));
        const locais = [];
        for(let i = 0; i < window.LS.length; i++){ const k = window.LS.key(i); if(k !== null && publicavel(k)) locais.push(k); }
        locais.forEach(k => { if(!publicadosLs.has(k)) LS0.rem(k); });
        ls.forEach((v, k) => { if(lsGet(k) !== v) LS0.set(k, v); });
        const novoMapa = {}; chaves.forEach(k => { novoMapa[k] = assinatura(resumo.get(k)); });
        lsSetQuieto(K_REMOTO, JSON.stringify(novoMapa));
        lsSetQuieto(K_VER, meta.versao);
        lsSetQuieto(K_HASH, "{}");
        await flush();
      }finally{ aplicando = false; }
      };
      // adiar = true: os dados já estão baixados na memória; quem chamou decide o momento de gravar (e recarregar)
      if(adiar) return { ok: true, versao: meta.versao, itens: chaves.length, baixados: precisa.length, aplicar: aplicarAgora };
      await aplicarAgora();
      return { ok: true, versao: meta.versao, itens: chaves.length, baixados: precisa.length };
    }
    throw new Error("Os dados mudaram várias vezes durante o download. Tente de novo.");
  }

  function telaAtualizando(txt){
    let d = document.getElementById("syncCobertura");
    if(!d){
      d = document.createElement("div");
      d.id = "syncCobertura";
      d.style.cssText = "position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:rgba(8,12,8,.88);color:#fff;font:600 16px system-ui,sans-serif;text-align:center;padding:24px";
      document.body.appendChild(d);
    }
    d.textContent = txt;
    return d;
  }

  /* ---------- ATUALIZAÇÃO EM SILÊNCIO (leitor) ----------
     Sem tela de "Atualizando os dados publicados (n/t)" e sem pedir para o leitor clicar:
     1) baixa só o que mudou, em segundo plano (o painel continua usável);
     2) guarda na memória e só GRAVA + recarrega num momento seguro: aba escondida, ou leitor parado
        (entrada: 4 s sem mexer · durante o uso: 20 s sem mexer). Assim ninguém perde o que estava vendo;
     3) enquanto espera, aparece só um aviso pequeno com "Atualizar agora". */
  const IMG_MASCOTE = "data:image/webp;base64,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";   // boneco Do Valle (meio corpo, fundo transparente) do recadinho
  let preparado = null, baixandoSilencioso = false, dispensada = "";   // dispensada = versão cujo recadinho o leitor fechou ("Depois")

  /* Recadinho embaixo (compacto, para não tapar a tela): caminhão + "Há dados novos publicados" + [Atualizar] [Depois].
     Os dados já estão baixados; só atualiza quando o leitor clicar em "Atualizar" (gravar + recarregar leva 1–2 s). */
  function mostrarBannerPronto(){
    if(document.getElementById("syncBanner")) return;
    const b = document.createElement("div"); b.id = "syncBanner"; b.className = "pronto"; b.setAttribute("role", "status");
    b.innerHTML = '<img class="syncMasc" alt="" src="' + IMG_MASCOTE + '">'
      + '<div class="syncBal"><div class="syncMsg"><b>Oi! Chegaram dados novos 👋</b><span>Quer atualizar agora?</span></div>'
      + '<div class="syncBt"><button type="button" class="ok">Atualizar</button><button type="button" class="dep">Depois</button></div></div>';
    b.querySelector(".ok").addEventListener("click", () => aplicarPreparado());
    b.querySelector(".dep").addEventListener("click", () => { if(preparado) dispensada = preparado.versao; fecharBanner(); });
    document.body.appendChild(b);
  }
  async function aplicarPreparado(){
    const p = preparado; if(!p) return;
    preparado = null;
    const b = document.getElementById("syncBanner");
    if(b) b.classList.add("vai");                                  // caminhão parte enquanto grava os dados
    if(b){ const m = b.querySelector(".syncMsg"); if(m) m.innerHTML = "<b>Atualizando…</b>"; const bt = b.querySelector(".syncBt"); if(bt) bt.remove(); }
    try{
      await p.aplicar();
      mlog("ok", "Dados publicados aplicados (" + p.baixados + " de " + p.itens + " itens baixados)");
      setTimeout(() => location.reload(), 150);            // dados já estão locais: recarrega sem tela de carregamento
    }catch(err){
      console.error("[sync] erro ao aplicar:", err);
      fecharBanner();
      aviso = "Não consegui aplicar os dados publicados: " + (err && err.message ? err.message : err);
      setStatus();
    }
  }
  function esperarMomento(){
    if(preparado && preparado.versao !== dispensada) mostrarBannerPronto();   // se o leitor fechou o aviso desta versão, não insiste
  }
  async function atualizarEmSilencio(origem){
    if(baixandoSilencioso) return;
    baixandoSilencioso = true;
    try{
      const meta = await lerMeta();
      if(!meta){ aviso = "Ainda não há dados publicados pelo administrador."; setStatus(); return; }
      if(meta.versao === versaoLocal()){ aviso = ""; ultimoOk = "Dados em dia"; fecharBanner(); setStatus(); return; }
      if(preparado && preparado.versao === meta.versao){ return; }          // já baixado, só esperando o momento
      mlog("info", "Versão nova publicada detectada" + (meta.por ? " (por " + meta.por + ")" : ""), meta.versao);
      const r = await baixarEAplicar(null, false, true);
      if(!r.ok){
        aviso = r.motivo === "formatoAntigo"
          ? "Os dados publicados estão no formato antigo. Peça ao administrador para clicar em “Publicar para usuários”."
          : "Ainda não há dados publicados pelo administrador.";
        setStatus(); return;
      }
      if(!r.baixados){                                                       // nada mudou nos dados: só anota a versão
        await r.aplicar(); aviso = ""; ultimoOk = "Dados em dia"; setStatus(); return;
      }
      preparado = r;
      esperarMomento(origem);
    }catch(err){
      console.error("[sync] erro ao baixar em silêncio:", err);
      aviso = "Não consegui baixar os dados publicados: " + (err && err.message ? err.message : err);
      setStatus();                                                           // sem pop-up: tenta de novo no próximo ciclo
    }finally{ baixandoSilencioso = false; }
  }
  document.addEventListener("visibilitychange", () => { if(!document.hidden && ativo && papel === "leitor") atualizarEmSilencio("poll"); });

  async function sincronizarLeitor(modoAuto){
    try{
      const meta = await lerMeta();
      if(!meta){ aviso = "Ainda não há dados publicados pelo administrador."; setStatus(); return; }
      if(meta.versao === versaoLocal()){ aviso = ""; ultimoOk = "Dados em dia"; fecharBanner(); setStatus(); return; }
      mlog("info", "Versão nova publicada detectada" + (meta.por ? " (por " + meta.por + ")" : ""), meta.versao);
      if(modoAuto === "aviso"){ mostrarBanner(meta); return; }
      const r = await baixarEAplicar((n, t) => { if(t > 0) telaAtualizando("Atualizando os dados publicados… (" + n + "/" + t + ")"); }, false);
      if(!r.ok){
        const c = document.getElementById("syncCobertura"); if(c) c.remove();
        aviso = r.motivo === "formatoAntigo"
          ? "Os dados publicados estão no formato antigo. Peça ao administrador para clicar em “Publicar para usuários”."
          : "Ainda não há dados publicados pelo administrador.";
        mostrarToast(aviso); setStatus(); return;
      }
      mlog("ok", "Dados publicados aplicados (" + r.baixados + " de " + r.itens + " itens baixados)");
      if(!r.baixados){ aviso = ""; ultimoOk = "Dados em dia"; setStatus(); return; }   // nada mudou nos dados: não precisa recarregar
      telaAtualizando("Dados atualizados. Recarregando…");
      setTimeout(() => location.reload(), 300);
    }catch(err){
      console.error("[sync] erro ao baixar:", err);
      const c = document.getElementById("syncCobertura"); if(c) c.remove();
      aviso = "Não consegui baixar os dados publicados: " + (err && err.message ? err.message : err);
      mostrarToast(aviso); setStatus();
    }
  }

  /* ---------------- interface ---------------- */
  const css = `
  #syncBox{margin-top:10px}
  #syncBox button{display:block;width:100%;margin-top:6px;padding:7px 10px;border:1px solid rgba(255,255,255,.25);background:transparent;color:inherit;border-radius:8px;font-size:12px;cursor:pointer;text-align:center}
  #syncBox button:hover{background:rgba(255,255,255,.1)}
  #syncBox #syncPub{background:#2e7d32;border-color:#2e7d32;color:#fff;font-weight:700}
  #syncBox #syncPub:hover{background:#388e3c}
  #syncBox button[disabled]{opacity:.6;cursor:wait}
  #syncSt{margin-top:6px;font-size:11px;line-height:1.35;opacity:.85;word-break:break-word}
  #syncSt.al{color:#ffcf7a;opacity:1}
  #syncBanner,#syncToast{position:fixed;right:18px;bottom:18px;z-index:99990;max-width:340px;background:#13200f;color:#fff;border:1px solid #2e7d32;border-radius:12px;padding:12px 14px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 12px 34px rgba(0,0,0,.45)}
  #syncBanner button{margin-top:8px;padding:7px 12px;border:0;border-radius:8px;background:#6fcf4a;color:#0b120b;font-weight:700;cursor:pointer}
  #syncBanner.pronto{left:50%;right:auto;bottom:0;transform:translateX(-50%);width:max-content;max-width:min(96vw,560px);display:flex;align-items:flex-end;padding:0;border:0;border-radius:0;background:none;box-shadow:none;color:#fff;animation:syncSobe .5s cubic-bezier(.2,.8,.25,1) both}
  #syncBanner .syncMasc{height:104px;width:auto;flex:none;display:block;margin-bottom:-2px;transform-origin:50% 100%;animation:syncAcena 3.2s ease-in-out .6s infinite;filter:drop-shadow(0 2px 4px rgba(0,0,0,.25));pointer-events:none}
  #syncBanner .syncBal{position:relative;margin:0 0 16px 8px;display:flex;align-items:center;gap:14px;padding:11px 12px 11px 16px;border-radius:14px;background:linear-gradient(135deg,#0f2616,#14301c);box-shadow:0 10px 28px rgba(8,24,12,.3)}
  #syncBanner .syncBal:before{content:"";position:absolute;left:-6px;bottom:24px;width:12px;height:12px;background:#0f2616;transform:rotate(45deg);border-radius:2px}
  #syncBanner .syncMsg{display:flex;flex-direction:column;gap:1px;min-width:0;line-height:1.25}
  #syncBanner .syncMsg b{font-size:13.5px;font-weight:700}
  #syncBanner .syncMsg span{font-size:12px;color:rgba(255,255,255,.68)}
  #syncBanner .syncBt{display:flex;gap:4px;margin-left:auto;flex:none}
  #syncBanner.pronto button{margin-top:0;padding:7px 14px;white-space:nowrap;border-radius:9px;font-size:12.5px;border:0;cursor:pointer}
  #syncBanner.pronto button.ok{background:#6fcf4a;color:#0b1a0b;font-weight:700}
  #syncBanner.pronto button.ok:hover{background:#85dd62}
  #syncBanner.pronto button.dep{background:transparent;color:rgba(255,255,255,.72);font-weight:600}
  #syncBanner.pronto button.dep:hover{background:rgba(255,255,255,.09);color:#fff}
  #syncBanner.vai .syncMasc{animation:syncSai .4s ease-in both}
  @keyframes syncSobe{from{opacity:0;transform:translate(-50%,40px)}to{opacity:1;transform:translate(-50%,0)}}
  @keyframes syncAcena{0%,55%,100%{transform:rotate(0)}12%{transform:rotate(-5deg)}26%{transform:rotate(4deg)}40%{transform:rotate(-3deg)}}
  @keyframes syncSai{to{transform:translateY(60px);opacity:0}}
  @media (prefers-reduced-motion:reduce){#syncBanner.pronto,#syncBanner .syncMasc{animation:none!important}}
  @media (max-width:520px){#syncBanner .syncMasc{height:80px}#syncBanner .syncBal{margin:0 0 12px 6px;gap:10px;padding:9px 10px 9px 12px}#syncBanner .syncMsg b{font-size:12.5px}#syncBanner.pronto button{padding:7px 11px}}
  #syncHistOv{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:none;align-items:center;justify-content:center;padding:16px}
  #syncHistOv.on{display:flex}
  #syncHistBox{background:#fff;color:#1f2933;border-radius:12px;max-width:560px;width:100%;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.35);max-height:90vh;overflow:auto;font:13px/1.45 system-ui,sans-serif}
  #syncHistBox h3{margin:0 0 6px;font-size:17px}
  #syncHistBox table{width:100%;border-collapse:collapse;margin-top:10px}
  #syncHistBox td,#syncHistBox th{padding:6px 8px;border-bottom:1px solid #e4e7eb;text-align:left;font-size:12.5px}
  #syncHistBox button{padding:6px 10px;border-radius:8px;border:1px solid #2e7d32;background:#2e7d32;color:#fff;font-size:12px;cursor:pointer}
  #syncHistBox button.sec{background:#fff;color:#2e7d32}
  #syncHistBox .linha{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  #syncAgOv{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:none;align-items:center;justify-content:center;padding:16px}
  #syncAgOv.on{display:flex}
  #syncAgBox{background:#fff;color:#1f2933;border-radius:12px;max-width:480px;width:100%;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.35);font:13px/1.45 system-ui,sans-serif}
  #syncAgBox h3{margin:0 0 6px;font-size:17px}
  #syncAgBox label{display:block;margin-top:10px;cursor:pointer}
  #syncAgBox input[type=text]{width:100%;box-sizing:border-box;margin-top:6px;padding:8px 10px;border:1px solid #c5ccd3;border-radius:8px;font-size:14px}
  #syncAgBox .dica{margin-top:10px;font-size:12px;color:#5b6773}
  #syncAgBox button{padding:7px 12px;border-radius:8px;border:1px solid #2e7d32;background:#2e7d32;color:#fff;font-size:12.5px;cursor:pointer}
  #syncAgBox button.sec{background:#fff;color:#2e7d32}
  #syncAgBox .linha{display:flex;gap:8px;margin-top:14px;justify-content:flex-end}`;

  function criarUI(){
    if(ui) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const box = document.createElement("div");
    box.id = "syncBox"; box.style.display = "none";
    box.innerHTML = '<button type="button" id="syncPub">Publicar para usuários</button><button type="button" id="syncAg">Horário de publicação</button><button type="button" id="syncHist">Histórico / restaurar</button><div id="syncSt"></div>';
    const rodape = document.querySelector(".sidebar-footer");
    (rodape || document.body).appendChild(box);
    box.querySelector("#syncPub").addEventListener("click", () => publicar(true));
    box.querySelector("#syncHist").addEventListener("click", abrirHistorico);
    box.querySelector("#syncAg").addEventListener("click", abrirAgenda);
    ui = { box, st: box.querySelector("#syncSt"), pub: box.querySelector("#syncPub"), ag: box.querySelector("#syncAg") };
  }
  function setStatus(txt){
    if(!ui) return;
    ui.pub.disabled = ocupado;
    if(ui.ag){ const a = lerAgenda(); ui.ag.textContent = a.modo === "agendado" ? "Horário de publicação: " + (minutosValidos(a).map(hhmm).join(", ") || "—") : "Horário de publicação: na hora"; }
    let t = txt;
    if(!t){
      if(ocupado) t = "Publicando…";
      else if(aviso) t = aviso;
      else if(lerAgenda().modo === "agendado" && pendDesde()){
        const T = ultimoHorario(new Date());
        if(T && new Date(pendDesde()) < T) t = "Horário de publicação chegou — publicando em instantes…";
        else{ const pr = proximoHorario(new Date()); t = "Alterações guardadas — serão publicadas " + (pr ? (pr.toDateString() === new Date().toDateString() ? "às " : "amanhã às ") + hhmm(pr.getHours() * 60 + pr.getMinutes()) : "no próximo horário") + ". Para enviar já, use “Publicar para usuários”."; }
      }
      else if(sujo) t = "Alterações não publicadas — publicando em instantes…";
      else t = ultimoOk || "";
    }
    ui.st.textContent = t;
    ui.st.classList.toggle("al", !!aviso && !ocupado);
  }
  function mostrarToast(txt){
    let t = document.getElementById("syncToast");
    if(!t){ t = document.createElement("div"); t.id = "syncToast"; document.body.appendChild(t); }
    t.textContent = txt;
    clearTimeout(t._t); t._t = setTimeout(() => t.remove(), 12000);
  }
  function mostrarBanner(meta){
    let b = document.getElementById("syncBanner");
    if(!b){
      b = document.createElement("div"); b.id = "syncBanner";
      b.innerHTML = '<div>Há uma versão nova dos dados publicada.</div><button type="button">Atualizar agora</button>';
      b.querySelector("button").addEventListener("click", () => { fecharBanner(); sincronizarLeitor("auto"); });
      document.body.appendChild(b);
    }
  }
  function fecharBanner(){ const b = document.getElementById("syncBanner"); if(b) b.remove(); }

  function abrirAgenda(){
    let ov = document.getElementById("syncAgOv");
    if(!ov){
      ov = document.createElement("div"); ov.id = "syncAgOv";
      ov.innerHTML = '<div id="syncAgBox" role="dialog" aria-modal="true"><h3>Horário de publicação</h3>'
        + '<div>Quando o que você importa ou altera passa a aparecer para os usuários.</div>'
        + '<label><input type="radio" name="syncAgModo" value="agendado"> Só nos horários abaixo (tudo de uma vez)</label>'
        + '<input type="text" id="syncAgH" placeholder="Ex.: 12:00, 18:00" autocomplete="off">'
        + '<label><input type="radio" name="syncAgModo" value="imediato"> Logo depois de cada alteração (cerca de 4 segundos)</label>'
        + '<div class="dica">O navegador do administrador precisa estar aberto no horário. Se estiver fechado, publica ao abrir depois do horário. O botão “Publicar para usuários” sempre envia na hora.</div>'
        + '<div class="linha"><button type="button" class="sec" id="syncAgCancel">Cancelar</button><button type="button" id="syncAgSalvar">Salvar</button></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener("click", e => { if(e.target === ov) ov.classList.remove("on"); });
      ov.querySelector("#syncAgCancel").addEventListener("click", () => ov.classList.remove("on"));
      ov.querySelector("#syncAgSalvar").addEventListener("click", async () => {
        const modo = (ov.querySelector('input[name="syncAgModo"]:checked') || {}).value || "agendado";
        const horarios = ov.querySelector("#syncAgH").value.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
        const a = { modo, horarios };
        if(modo === "agendado" && !minutosValidos(a).length){ alert("Informe pelo menos um horário válido, como 12:00 (pode separar vários por vírgula)."); return; }
        if(horarios.length && minutosValidos(a).length !== new Set(horarios.map(h => h.replace(/^0/, ""))).size && modo === "agendado"){ alert("Há um horário inválido. Use o formato 12:00."); return; }
        lsSetQuieto(K_AGENDA, JSON.stringify({ modo, horarios: minutosValidos(a).map(hhmm) }));
        await flush();
        tentadoT = 0; clearTimeout(tAuto); tAuto = null;
        mlog("info", "Horário de publicação alterado: " + (modo === "agendado" ? minutosValidos(a).map(hhmm).join(", ") : "na hora"));
        ov.classList.remove("on");
        if(modo === "imediato" && pendDesde()) { sujo = true; agendarAuto(); }
        setStatus(); verificarAgenda();
      });
    }
    const a = lerAgenda();
    ov.querySelectorAll('input[name="syncAgModo"]').forEach(r => { r.checked = r.value === a.modo; });
    ov.querySelector("#syncAgH").value = minutosValidos(a).map(hhmm).join(", ");
    ov.classList.add("on");
  }

  async function abrirHistorico(){
    let ov = document.getElementById("syncHistOv");
    if(!ov){
      ov = document.createElement("div"); ov.id = "syncHistOv";
      ov.innerHTML = '<div id="syncHistBox" role="dialog" aria-modal="true"><h3>Histórico de publicações</h3><div id="syncHistCorpo">Carregando…</div><div class="linha"><button type="button" class="sec" id="syncBaixar">Baixar dados publicados para este computador</button><button type="button" class="sec" id="syncHistFechar" style="margin-left:auto">Fechar</button></div></div>';
      document.body.appendChild(ov);
      ov.addEventListener("click", e => { if(e.target === ov) ov.classList.remove("on"); });
      ov.querySelector("#syncHistFechar").addEventListener("click", () => ov.classList.remove("on"));
      ov.querySelector("#syncBaixar").addEventListener("click", async () => {
        if(!confirm("Isso SUBSTITUI os dados deste navegador pelos dados publicados.\n\nSe este computador tem dados que ainda não foram publicados, faça antes um “Backup dos dados”.\n\nContinuar?")) return;
        try{
          ov.classList.remove("on"); telaAtualizando("Baixando os dados publicados…");
          const r = await baixarEAplicar((n, t) => telaAtualizando("Baixando os dados publicados… (" + n + "/" + t + ")"), true);
          if(!r.ok){ document.getElementById("syncCobertura").remove(); alert("Não há dados no formato novo publicados ainda."); return; }
          telaAtualizando("Pronto. Recarregando…"); setTimeout(() => location.reload(), 300);
        }catch(e){ const c = document.getElementById("syncCobertura"); if(c) c.remove(); alert("Erro: " + (e && e.message ? e.message : e)); }
      });
    }
    ov.classList.add("on");
    const corpo = ov.querySelector("#syncHistCorpo");
    corpo.textContent = "Carregando…";
    try{
      const { data, error } = await cliente.rpc("listar_historico");
      if(error) throw new Error(error.message);
      if(!data || !data.length){ corpo.textContent = "Ainda não há cópias guardadas."; return; }
      const linhas = data.map(h => "<tr><td>" + new Date(h.criado_em).toLocaleString("pt-BR") + "</td><td>" + (h.por || "") + "</td><td>" + fmtMB(Number(h.tamanho)) + "</td><td><button type=\"button\" data-v=\"" + h.versao + "\">Restaurar</button></td></tr>").join("");
      corpo.innerHTML = "<div>Antes de cada publicação é guardada uma cópia. “Restaurar” devolve aos usuários essa cópia (a versão de agora também é guardada).</div><table><tr><th>Quando</th><th>Por</th><th>Tamanho</th><th></th></tr>" + linhas + "</table>";
      corpo.querySelectorAll("button[data-v]").forEach(b => b.addEventListener("click", async () => {
        if(!confirm("Restaurar a cópia de " + b.closest("tr").firstChild.textContent + "?\n\nOs usuários passam a ver essa versão.")) return;
        b.disabled = true;
        const r = await cliente.rpc("restaurar_historico", { p_versao: Number(b.dataset.v) });
        if(r.error){ alert("Erro ao restaurar: " + r.error.message); b.disabled = false; return; }
        alert("Versão restaurada para os usuários.\n\nEste computador ficou diferente da versão publicada: a publicação automática fica pausada. Use “Baixar dados publicados para este computador” se quiser ficar igual.");
        ov.classList.remove("on"); aviso = "Uma versão antiga foi restaurada. Publicação automática pausada."; setStatus();
      }));
    }catch(e){ corpo.textContent = "Não consegui carregar o histórico: " + (e && e.message ? e.message : e); }
  }

  /* ---------------- ganchos (chamados pelo auth-login.js) ---------------- */
  window.SYNC_APOS_LOGIN = async function(cl, pap, em){
    if(!cl) return;
    cliente = cl; papel = pap === "admin" ? "admin" : "leitor"; email = String(em || "").toLowerCase();
    try{ if(window.MONITOR && window.MONITOR.conectar) window.MONITOR.conectar(cl, papel, email); }catch(e){}   // monitor em tempo real: envia os erros deste navegador (e, no admin, recebe os de todos)
    ativo = true; sujo = false; aviso = "";
    mlog("info", "Sincronização iniciada (" + papel + ")");
    criarUI();
    clearInterval(tPoll); tPoll = null; clearInterval(tAgenda); tAgenda = null; tentadoT = 0;
    if(papel === "admin"){
      ui.box.style.display = "block";
      try{
        const meta = await lerMeta();
        if(!meta) ultimoOk = "Nada publicado ainda. Clique em Publicar.";
        else if(meta.versao === versaoLocal()) ultimoOk = "Em dia com os usuários.";
        else aviso = "Este computador não está alinhado com a versão publicada. Publique pelo botão (pede confirmação) ou baixe os dados em Histórico.";
      }catch(e){ aviso = "Não consegui conferir a versão publicada: " + (e && e.message ? e.message : e); }
      setStatus();
      tAgenda = setInterval(verificarAgenda, TICK_MS);
      setTimeout(verificarAgenda, 3000);
    }else{
      ui.box.style.display = "none";
      // quem já tem dados neste navegador entra direto e atualiza em segundo plano; só o 1º acesso (sem nada local) espera o download
      if(versaoLocal()) atualizarEmSilencio("entrada"); else await sincronizarLeitor("auto");
      tPoll = setInterval(() => { if(ativo && papel === "leitor") atualizarEmSilencio("poll"); }, POLL_MS);
    }
  };
  window.SYNC_APOS_SAIDA = function(){
    mlog("info", "Sincronização encerrada (saiu da conta)");
    try{ if(window.MONITOR && window.MONITOR.desconectar) window.MONITOR.desconectar(); }catch(e){}
    ativo = false; papel = "leitor"; sujo = false;
    clearTimeout(tAuto); clearInterval(tPoll); clearInterval(tAgenda); tAuto = tPoll = tAgenda = null;
    if(ui) ui.box.style.display = "none";
    fecharBanner();
  };
  /* ---------- para a aba Monitor (admin) ---------- */
  async function ping(){
    if(!cliente) return { ok: false, semConexao: true, motivo: "Ainda sem login/conexão" };
    const t0 = performance.now();
    try{ const m = await lerMeta(); return { ok: true, ms: Math.round(performance.now() - t0), versaoRemota: m && m.versao || null, por: m && m.por || "" }; }
    catch(e){ return { ok: false, ms: Math.round(performance.now() - t0), erro: String((e && e.message) || e) }; }
  }
  async function diagnostico(){
    if(!cliente) throw new Error("Sem login/conexão com o Supabase.");
    const [itens, resumo, meta] = await Promise.all([coletar(), lerResumo(), lerMeta()]);
    const chaves = new Set(itens.keys()); resumo.forEach((r, k) => { if(k.indexOf(PREF) === 0) chaves.add(k); });
    const linhas = [];
    chaves.forEach(k => { const loc = itens.get(k), rem = resumo.get(k); linhas.push({ chave: k.slice(PREF.length), local: loc === undefined ? null : tam(loc), publicado: rem ? rem.tamanho : null, partes: rem ? rem.partes : null }); });
    return { linhas, risco: analisarRisco(itens, resumo), metaRemota: meta, versaoLocal: versaoLocal() };
  }
  const estado = () => ({ ativo, papel, email, ocupado, sujo, aviso, ultimoOk, versaoLocal: versaoLocal(), autoAgendado: !!tAuto });
  /* horário de publicação (para a aba Monitor) */
  function agendaInfo(){
    const a = lerAgenda(), pr = proximoHorario(new Date());
    return { modo: a.modo, horarios: minutosValidos(a).map(hhmm), proximo: pr ? pr.getTime() : null, pendenteDesde: pendDesde() || null };
  }
  window.SYNC = { publicar: () => publicar(true), versaoLocal, estado, ping, diagnostico, agenda: agendaInfo, abrirAgenda };

  /* ---------------- detecção de alterações (para a publicação automática) ---------------- */
  (function ganchos(){
    const LS = window.LS;
    if(LS){
      LS0.set = LS.setItem.bind(LS); LS0.rem = LS.removeItem.bind(LS); LS0.clear = LS.clear.bind(LS);
      LS.setItem = function(k, v){
        const k2 = String(k), pub = publicavel(k2), antes = pub ? LS.getItem(k2) : null;
        LS0.set(k, v);
        if(pub && antes !== String(v)) marcarSujo();
      };
      LS.removeItem = function(k){
        const k2 = String(k), tinha = publicavel(k2) && LS.getItem(k2) !== null;
        LS0.rem(k);
        if(tinha) marcarSujo();
      };
      LS.clear = function(){ LS0.clear(); marcarSujo(); };
    }
    if(window.IDBObjectStore){
      ["put", "add", "delete", "clear"].forEach(m => {
        const orig = IDBObjectStore.prototype[m];
        if(typeof orig !== "function") return;
        IDBObjectStore.prototype[m] = function(){
          try{ if(NOMES_BANCOS.has(this.transaction.db.name)) marcarSujo(); }catch(e){}
          return orig.apply(this, arguments);
        };
      });
    }
  })();
})();

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

  const LS0 = {};      // métodos originais do LS (para gravar sem acionar a publicação automática)
  const mlog = (nivel, msg, det) => { try{ if(window.MONITOR) window.MONITOR.log("sync", nivel, msg, det); }catch(e){} };   // alimenta a aba Monitor (admin)

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
        ultimoOk = "Em dia — " + agoraHM(); aviso = ""; mlog("info", "Nada a publicar: já está em dia"); return;
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
    clearTimeout(tAuto);
    tAuto = setTimeout(() => publicar(false), DEBOUNCE_MS);
  }
  function marcarSujo(){
    if(!ativo || papel !== "admin" || aplicando) return;
    sujo = true;
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
  async function baixarEAplicar(progresso, tudo){
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
  #syncHistOv{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:99999;display:none;align-items:center;justify-content:center;padding:16px}
  #syncHistOv.on{display:flex}
  #syncHistBox{background:#fff;color:#1f2933;border-radius:12px;max-width:560px;width:100%;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.35);max-height:90vh;overflow:auto;font:13px/1.45 system-ui,sans-serif}
  #syncHistBox h3{margin:0 0 6px;font-size:17px}
  #syncHistBox table{width:100%;border-collapse:collapse;margin-top:10px}
  #syncHistBox td,#syncHistBox th{padding:6px 8px;border-bottom:1px solid #e4e7eb;text-align:left;font-size:12.5px}
  #syncHistBox button{padding:6px 10px;border-radius:8px;border:1px solid #2e7d32;background:#2e7d32;color:#fff;font-size:12px;cursor:pointer}
  #syncHistBox button.sec{background:#fff;color:#2e7d32}
  #syncHistBox .linha{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}`;

  function criarUI(){
    if(ui) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const box = document.createElement("div");
    box.id = "syncBox"; box.style.display = "none";
    box.innerHTML = '<button type="button" id="syncPub">Publicar para usuários</button><button type="button" id="syncHist">Histórico / restaurar</button><div id="syncSt"></div>';
    const rodape = document.querySelector(".sidebar-footer");
    (rodape || document.body).appendChild(box);
    box.querySelector("#syncPub").addEventListener("click", () => publicar(true));
    box.querySelector("#syncHist").addEventListener("click", abrirHistorico);
    ui = { box, st: box.querySelector("#syncSt"), pub: box.querySelector("#syncPub") };
  }
  function setStatus(txt){
    if(!ui) return;
    ui.pub.disabled = ocupado;
    let t = txt;
    if(!t){
      if(ocupado) t = "Publicando…";
      else if(aviso) t = aviso;
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
    clearInterval(tPoll); tPoll = null;
    if(papel === "admin"){
      ui.box.style.display = "block";
      try{
        const meta = await lerMeta();
        if(!meta) ultimoOk = "Nada publicado ainda. Clique em Publicar.";
        else if(meta.versao === versaoLocal()) ultimoOk = "Em dia com os usuários.";
        else aviso = "Este computador não está alinhado com a versão publicada. Publique pelo botão (pede confirmação) ou baixe os dados em Histórico.";
      }catch(e){ aviso = "Não consegui conferir a versão publicada: " + (e && e.message ? e.message : e); }
      setStatus();
    }else{
      ui.box.style.display = "none";
      await sincronizarLeitor("auto");
      tPoll = setInterval(() => { if(ativo && papel === "leitor" && !document.hidden) sincronizarLeitor("aviso"); }, POLL_MS);
    }
  };
  window.SYNC_APOS_SAIDA = function(){
    mlog("info", "Sincronização encerrada (saiu da conta)");
    try{ if(window.MONITOR && window.MONITOR.desconectar) window.MONITOR.desconectar(); }catch(e){}
    ativo = false; papel = "leitor"; sujo = false;
    clearTimeout(tAuto); clearInterval(tPoll); tAuto = tPoll = null;
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
  window.SYNC = { publicar: () => publicar(true), versaoLocal, estado, ping, diagnostico };

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

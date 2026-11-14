/* =====================================================================
   ARMAZENAMENTO EM INDEXEDDB (substitui o localStorage de ~5 MB)
   ---------------------------------------------------------------------
   - Expõe window.LS com a mesma API do localStorage (getItem, setItem,
     removeItem, key, length, clear), então o resto do código não muda.
   - Na abertura, carrega tudo do IndexedDB para a memória (window.LS_READY).
     Leitura é instantânea; a gravação vai para o IndexedDB em segundo plano.
   - Migração automática: o que já estava no localStorage é copiado para o
     IndexedDB e só é apagado do localStorage depois de confirmado.
   - Se o IndexedDB não estiver disponível, cai para o localStorage normal.
   - Backup: LS_BACKUP.exportar() / LS_BACKUP.importar(arquivo).
   ===================================================================== */
(function(){
  "use strict";

  const DB_NOME = "painel_valle_kv";
  const STORE = "kv";
  const MARCA_MIGRACAO = "__migrado_do_localstorage_v1";

  const cache = new Map();          // chave -> string
  const pendentes = new Map();      // chave -> string | null (null = remover)
  let db = null;
  let usandoFallback = false;
  let timer = null;
  let erroGravacao = null;

  function lsNativo(){ try{ return window.localStorage; }catch(e){ return null; } }

  function abrirDB(){
    return new Promise((resolve, reject) => {
      if(!window.indexedDB){ reject(new Error("IndexedDB indisponível")); return; }
      let req;
      try{ req = indexedDB.open(DB_NOME, 1); }catch(e){ reject(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        if(!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("Falha ao abrir IndexedDB"));
      req.onblocked = () => reject(new Error("IndexedDB bloqueado por outra aba"));
    });
  }

  function lerTudo(d){
    return new Promise((resolve, reject) => {
      const out = new Map();
      const tx = d.transaction(STORE, "readonly");
      const os = tx.objectStore(STORE);
      const cur = os.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if(c){ out.set(c.key, c.value); c.continue(); }
      };
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Leitura abortada"));
    });
  }

  function gravarLote(lote){
    return new Promise((resolve, reject) => {
      if(!db){ resolve(); return; }
      const tx = db.transaction(STORE, "readwrite");
      const os = tx.objectStore(STORE);
      lote.forEach((v, k) => { if(v === null) os.delete(k); else os.put(v, k); });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Gravação abortada"));
    });
  }

  function descarregar(){
    clearTimeout(timer); timer = null;
    if(!pendentes.size || !db) return Promise.resolve();
    const lote = new Map(pendentes);
    pendentes.clear();
    return gravarLote(lote).then(() => { erroGravacao = null; }).catch(err => {
      // devolve para a fila para tentar de novo e avisa uma única vez
      lote.forEach((v, k) => { if(!pendentes.has(k)) pendentes.set(k, v); });
      if(!erroGravacao){
        erroGravacao = err;
        console.error("[LS] falha ao gravar no IndexedDB:", err);
        try{ alert("Não foi possível salvar os dados no navegador (" + ((err && err.name) || "erro") + "). Faça um backup pelo botão \"Backup dos dados\" assim que possível."); }catch(_){}
      }
    });
  }

  function agendar(){
    if(timer) return;
    timer = setTimeout(descarregar, 40);
  }

  // não perder gravação se a aba for fechada logo depois de salvar
  window.addEventListener("pagehide", descarregar);
  document.addEventListener("visibilitychange", () => { if(document.visibilityState === "hidden") descarregar(); });

  /* ---------- API compatível com localStorage ---------- */
  const LS = {
    getItem(k){
      k = String(k);
      if(usandoFallback){ const n = lsNativo(); return n ? n.getItem(k) : null; }
      return cache.has(k) ? cache.get(k) : null;
    },
    setItem(k, v){
      k = String(k); v = String(v);
      if(usandoFallback){ const n = lsNativo(); if(n) n.setItem(k, v); return; }
      cache.set(k, v);
      pendentes.set(k, v);
      agendar();
    },
    removeItem(k){
      k = String(k);
      if(usandoFallback){ const n = lsNativo(); if(n) n.removeItem(k); return; }
      cache.delete(k);
      pendentes.set(k, null);
      agendar();
    },
    key(i){
      if(usandoFallback){ const n = lsNativo(); return n ? n.key(i) : null; }
      let n = 0;
      for(const k of cache.keys()){ if(n++ === i) return k; }
      return null;
    },
    get length(){
      if(usandoFallback){ const n = lsNativo(); return n ? n.length : 0; }
      return cache.size;
    },
    clear(){
      if(usandoFallback){ const n = lsNativo(); if(n) n.clear(); return; }
      cache.forEach((_, k) => pendentes.set(k, null));
      cache.clear();
      agendar();
    }
  };
  window.LS = LS;
  window.LS_FLUSH = descarregar;

  /* ---------- migração do localStorage antigo ---------- */
  async function migrar(){
    const n = lsNativo();
    if(!n || cache.has(MARCA_MIGRACAO)) return;
    const lote = new Map();
    for(let i = 0; i < n.length; i++){
      const k = n.key(i);
      if(k === null) continue;
      // se o IndexedDB já tem a chave, ele manda (é mais novo); senão copia do localStorage
      if(!cache.has(k)){
        const v = n.getItem(k);
        if(v !== null){ lote.set(k, v); cache.set(k, v); }
      }
    }
    lote.set(MARCA_MIGRACAO, new Date().toISOString());
    cache.set(MARCA_MIGRACAO, new Date().toISOString());
    await gravarLote(lote);               // só segue se gravou com sucesso
    // confirma lendo de volta antes de apagar o original
    const conferido = await lerTudo(db);
    let ok = true;
    lote.forEach((v, k) => { if(conferido.get(k) !== v) ok = false; });
    if(ok){
      const chaves = [];
      for(let i = 0; i < n.length; i++) chaves.push(n.key(i));
      chaves.forEach(k => { try{ n.removeItem(k); }catch(_){} });
      console.info("[LS] " + (lote.size - 1) + " chaves migradas do localStorage para o IndexedDB.");
    }else{
      console.warn("[LS] conferência da migração falhou; localStorage mantido como está.");
    }
  }

  window.LS_READY = (async function(){
    try{
      db = await abrirDB();
      const dados = await lerTudo(db);
      dados.forEach((v, k) => cache.set(k, v));
      await migrar();
      // pede ao navegador para não apagar estes dados sozinho em caso de pouco espaço
      try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist(); }catch(_){}
    }catch(err){
      console.warn("[LS] IndexedDB indisponível, usando localStorage:", err);
      usandoFallback = true;
      db = null;
    }
    window.LS_MODO = usandoFallback ? "localStorage" : "IndexedDB";
  })();

  /* ---------- backup (exportar / importar) ---------- */
  function nomeArquivo(){
    const d = new Date(), p = x => String(x).padStart(2, "0");
    return "backup-painel-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + ".json";
  }

  function todosOsDados(){
    const o = {};
    if(usandoFallback){
      const n = lsNativo();
      for(let i = 0; n && i < n.length; i++){ const k = n.key(i); o[k] = n.getItem(k); }
    }else{
      cache.forEach((v, k) => { if(k !== MARCA_MIGRACAO) o[k] = v; });
    }
    return o;
  }

  function tamanhoLegivel(bytes){
    if(bytes > 1048576) return (bytes / 1048576).toFixed(1) + " MB";
    return Math.round(bytes / 1024) + " KB";
  }

  window.LS_BACKUP = {
    resumo(){
      const o = todosOsDados();
      let total = 0;
      const lista = Object.keys(o).map(k => { const t = k.length + (o[k] || "").length; total += t; return [k, t]; }).sort((a, b) => b[1] - a[1]);
      return { chaves: lista.length, total, totalTxt: tamanhoLegivel(total), maiores: lista.slice(0, 6).map(x => x[0] + " (" + tamanhoLegivel(x[1]) + ")"), modo: window.LS_MODO };
    },
    exportar(){
      const pacote = { tipo: "backup-painel-valle", versao: 1, geradoEm: new Date().toISOString(), dados: todosOsDados() };
      const blob = new Blob([JSON.stringify(pacote)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = nomeArquivo();
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    },
    /* modo "mesclar" (padrão): o backup sobrescreve só as chaves que ele contém.
       modo "substituir": apaga tudo e deixa exatamente o que está no backup. */
    async importar(arquivo, modo){
      const texto = await arquivo.text();
      let pacote;
      try{ pacote = JSON.parse(texto); }catch(e){ throw new Error("O arquivo não é um backup válido (JSON inválido)."); }
      if(!pacote || pacote.tipo !== "backup-painel-valle" || !pacote.dados || typeof pacote.dados !== "object")
        throw new Error("Este arquivo não é um backup do painel.");
      const chaves = Object.keys(pacote.dados);
      if(modo === "substituir") LS.clear();
      chaves.forEach(k => { if(typeof pacote.dados[k] === "string") LS.setItem(k, pacote.dados[k]); });
      await descarregar();
      return chaves.length;
    }
  };
})();

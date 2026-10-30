/* =====================================================================
   SINCRONIZAÇÃO ADMIN -> USUÁRIOS (via Supabase, tabela "painel_dados")
   ---------------------------------------------------------------------
   - O ADMIN importa os dados normalmente no painel e clica em
     "Publicar para usuários" (menu lateral). Tudo o que está salvo no
     navegador dele é enviado ao Supabase.
   - Os LEITORES, ao entrar (e a cada poucos minutos), conferem se há uma
     versão nova. Se houver, baixam e aplicam (a página recarrega uma vez).
   - Só o admin consegue gravar: a regra está no banco (RLS), não só na tela.
   - Chamado pelo auth-login.js:  SYNC_APOS_LOGIN(cliente, papel, email)
                                  SYNC_APOS_SAIDA()
   ===================================================================== */
(function(){
  "use strict";

  const TABELA = "painel_dados";
  const META = "__meta";                 // linha com a versão publicada (gravada por último)
  const CHAVE_VERSAO = "__sync_versao";  // versão aplicada neste navegador (guardada em LS, não é publicada)
  const TAM_PARTE = 500000;              // caracteres por linha (valores grandes são divididos)
  const TAM_LOTE = 3000000;              // caracteres por requisição de envio
  const POR_PAGINA = 10;                 // linhas por página ao baixar
  const INTERVALO_CHECAGEM = 3 * 60 * 1000;

  /* o que NÃO é publicado: controle interno e preferências de tela de cada pessoa */
  const IGNORAR = [/^__/, /^painel_auth/, /^painel_vo_tema$/, /^painel_nav_fechados$/, /^painel_dp_aba$/, /^sync_/];
  const sincroniza = k => !IGNORAR.some(rx => rx.test(k));

  /* Alguns módulos guardam dados grandes em bancos IndexedDB próprios (fora do LS):
     Performance (CTRCs), Receita/Filmagens e Análise gerencial. Também são publicados. */
  const PREFIXO_IDB = "idb:";
  const BANCOS = [
    { nome: "painel_valle_perf_teste", versao: 1, stores: { ctrcs: { keyPath: "k" } } },
    { nome: "tambasa_filmagens",       versao: 1, stores: { kv: {} } },
    { nome: "tambasa_analise_db",      versao: 2, stores: { arquivos: { keyPath: "id" } } }
  ];
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const txP = tx => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = tx.onabort = () => rej(tx.error || new Error("falha no banco local")); });
  function abrirBanco(b){
    return new Promise((res, rej) => {
      if(typeof indexedDB === "undefined") return rej(new Error("sem IndexedDB"));
      const q = indexedDB.open(b.nome, b.versao);
      q.onupgradeneeded = () => { const d = q.result; Object.keys(b.stores).forEach(n => { if(!d.objectStoreNames.contains(n)) d.createObjectStore(n, b.stores[n].keyPath ? { keyPath: b.stores[n].keyPath } : undefined); }); };
      q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
      q.onblocked = () => rej(new Error("banco local bloqueado por outra aba"));
    });
  }
  async function lerBanco(b){
    const db = await abrirBanco(b);
    try{
      const out = {};
      for(const n of Object.keys(b.stores)){
        const os = db.transaction(n, "readonly").objectStore(n);
        if(b.stores[n].keyPath) out[n] = await reqP(os.getAll());
        else{
          const chaves = await reqP(os.getAllKeys()), valores = await reqP(os.getAll());
          out[n] = chaves.map((k, i) => [k, valores[i]]);
        }
      }
      return out;
    } finally { db.close(); }
  }
  async function gravarBanco(b, conteudo){
    const db = await abrirBanco(b);
    try{
      for(const n of Object.keys(b.stores)){
        const tx = db.transaction(n, "readwrite"), os = tx.objectStore(n);
        os.clear();
        (conteudo[n] || []).forEach(x => { if(b.stores[n].keyPath) os.put(x); else os.put(x[1], x[0]); });
        await txP(tx);
      }
    } finally { db.close(); }
  }
  async function coletarBancos(){
    const o = {};
    for(const b of BANCOS){
      try{ o[PREFIXO_IDB + b.nome] = JSON.stringify(await lerBanco(b)); }
      catch(e){ console.warn("[sync] não li o banco", b.nome, e); }
    }
    return o;
  }

  let cliente = null, papel = "leitor", email = "", timer = null, ocupado = false;

  const $ = id => document.getElementById(id);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const agoraTxt = iso => { try{ return new Date(iso).toLocaleString("pt-BR"); }catch(e){ return iso || ""; } };

  /* ---------- leitura/gravação local ---------- */
  function coletarLocal(){
    const o = {};
    for(let i = 0; i < LS.length; i++){
      const k = LS.key(i);
      if(k === null || !sincroniza(k)) continue;
      const v = LS.getItem(k);
      if(typeof v === "string") o[k] = v;
    }
    return o;
  }
  function dividir(valor){
    if(valor.length <= TAM_PARTE) return [valor];
    const p = [];
    for(let i = 0; i < valor.length; i += TAM_PARTE) p.push(valor.slice(i, i + TAM_PARTE));
    return p;
  }
  function erroLegivel(error){
    const m = String((error && (error.message || error.details)) || error || "");
    if(/row-level security|permission denied|42501/i.test(m)) return "Sem permissão para gravar. Confirme que seu e-mail está como admin na tabela \"perfis\" e que o SQL de sincronização foi executado.";
    if(/does not exist|42P01|schema cache/i.test(m)) return "A tabela \"painel_dados\" ainda não existe no Supabase. Execute o arquivo supabase-sincronizacao.sql no SQL Editor.";
    return m || "erro desconhecido";
  }
  async function ok(promessa){
    const r = await promessa;
    if(r && r.error) throw new Error(erroLegivel(r.error));
    return r ? r.data : null;
  }

  /* ---------- ADMIN: publicar ---------- */
  let fila = Promise.resolve();       // publicações uma de cada vez (manual e automática não se atropelam)
  function publicar(aoProgresso){ const r = fila.then(() => publicarAgora(aoProgresso)); fila = r.catch(() => {}); return r; }
  async function publicarAgora(aoProgresso){
    if(papel !== "admin") throw new Error("Só o administrador pode publicar.");
    const prog = t => { if(aoProgresso) aoProgresso(t); };
    if(window.LS_FLUSH) await window.LS_FLUSH();

    prog("Lendo os dados deste navegador…");
    const dados = Object.assign(coletarLocal(), await coletarBancos());
    const chaves = Object.keys(dados);
    const temAlgo = chaves.some(k => !k.startsWith(PREFIXO_IDB)) || chaves.some(k => k.startsWith(PREFIXO_IDB) && /\[\s*[^\]\s]/.test(dados[k]));
    if(!temAlgo) throw new Error("Não há dados salvos neste navegador para publicar.");

    // monta as linhas
    const linhas = [];
    const partesPorChave = {};
    chaves.forEach(k => {
      const partes = dividir(dados[k]);
      partesPorChave[k] = partes.length;
      partes.forEach((v, i) => linhas.push({ chave: k, parte: i, valor: v }));
    });

    // 1) envia em lotes
    let lote = [], tam = 0, enviadas = 0;
    const descarrega = async () => {
      if(!lote.length) return;
      await ok(cliente.from(TABELA).upsert(lote, { onConflict: "chave,parte" }));
      enviadas += lote.length; lote = []; tam = 0;
      prog("Enviando… " + enviadas + " de " + linhas.length);
    };
    for(const l of linhas){
      if(lote.length && tam + l.valor.length > TAM_LOTE) await descarrega();
      lote.push(l); tam += l.valor.length;
    }
    await descarrega();

    // 2) remove do servidor o que não existe mais aqui (espelho do admin)
    prog("Limpando itens antigos…");
    const remotas = [];
    for(let a = 0; ; a += 1000){
      const d = await ok(cliente.from(TABELA).select("chave,parte").order("chave").order("parte").range(a, a + 999));
      remotas.push(...d);
      if(d.length < 1000) break;
    }
    const chavesRemotas = [...new Set(remotas.map(r => r.chave))].filter(k => k !== META);
    for(const k of chavesRemotas){
      if(!(k in partesPorChave)) await ok(cliente.from(TABELA).delete().eq("chave", k));
      else if(remotas.some(r => r.chave === k && r.parte >= partesPorChave[k]))
        await ok(cliente.from(TABELA).delete().eq("chave", k).gte("parte", partesPorChave[k]));
    }

    // 3) por último, grava a versão (é ela que avisa os leitores)
    const versao = new Date().toISOString();
    const meta = { versao, por: email, linhas: linhas.length, chaves: chaves.length };
    await ok(cliente.from(TABELA).upsert([{ chave: META, parte: 0, valor: JSON.stringify(meta) }], { onConflict: "chave,parte" }));
    LS.setItem(CHAVE_VERSAO, versao);       // o próprio admin não precisa baixar o que acabou de publicar
    if(window.LS_FLUSH) await window.LS_FLUSH();
    return meta;
  }

  /* ---------- LEITOR: baixar ---------- */
  async function lerMeta(){
    const d = await ok(cliente.from(TABELA).select("valor").eq("chave", META).eq("parte", 0).maybeSingle());
    if(!d) return null;
    try{ return JSON.parse(d.valor); }catch(e){ return null; }
  }
  async function baixarTudo(meta){
    const linhas = [];
    for(let a = 0; ; a += POR_PAGINA){
      const d = await ok(cliente.from(TABELA).select("chave,parte,valor").neq("chave", META).order("chave").order("parte").range(a, a + POR_PAGINA - 1));
      linhas.push(...d);
      if(d.length < POR_PAGINA) break;
    }
    if(linhas.length !== meta.linhas) throw new Error("incompleto");
    const partes = {};
    linhas.forEach(l => { (partes[l.chave] = partes[l.chave] || [])[l.parte] = l.valor; });
    const dados = {};
    Object.keys(partes).forEach(k => {
      if(partes[k].some(p => typeof p !== "string")) throw new Error("incompleto");
      dados[k] = partes[k].join("");
    });
    return dados;
  }
  /* devolve "atual" | "aplicado" | "vazio" */
  async function atualizar(){
    if(ocupado) return "atual";
    ocupado = true;
    try{
      let meta = await lerMeta();
      if(!meta) return "vazio";
      if(LS.getItem(CHAVE_VERSAO) === meta.versao) return "atual";

      let dados = null;
      for(let t = 0; t < 3 && !dados; t++){        // se o admin publicar no meio do download, tenta de novo
        try{
          const d = await baixarTudo(meta);
          const meta2 = await lerMeta();
          if(meta2 && meta2.versao === meta.versao) dados = d; else meta = meta2 || meta;
        }catch(e){ if(e.message !== "incompleto") throw e; await sleep(1500); meta = (await lerMeta()) || meta; }
      }
      if(!dados) throw new Error("Os dados estavam sendo atualizados. Tente de novo em instantes.");

      // aplica: remove o que o admin removeu, grava o resto (preferências de tela ficam como estão)
      const locais = coletarLocal();
      Object.keys(locais).forEach(k => { if(!(k in dados)) LS.removeItem(k); });
      Object.keys(dados).forEach(k => { if(!k.startsWith(PREFIXO_IDB) && sincroniza(k)) LS.setItem(k, dados[k]); });
      for(const b of BANCOS){
        const v = dados[PREFIXO_IDB + b.nome];
        if(typeof v === "string") await gravarBanco(b, JSON.parse(v));
      }
      LS.setItem(CHAVE_VERSAO, meta.versao);
      if(window.LS_FLUSH) await window.LS_FLUSH();
      return "aplicado";
    } finally { ocupado = false; }
  }


  /* ---------- PUBLICAÇÃO AUTOMÁTICA (admin) ----------
     Qualquer importação/alteração do admin é enviada sozinha ~12 s depois da última mudança.
     Trava de segurança: só publica sozinho se este navegador está alinhado com a última versão
     publicada (evita um navegador vazio/antigo apagar o que os usuários veem). Se não estiver,
     use o botão "Publicar para usuários" uma vez para alinhar. */
  const ATRASO_AUTO = (typeof window !== "undefined" && window.SYNC_ATRASO_AUTO) || 12000;
  let sujo = false, timerAuto = null, publicando = false, alinhadoOk = false;
  const bancosNomes = BANCOS.map(b => b.nome);
  const info = t => { const el = $("syInfo"); if(el) el.textContent = t; };
  function marcarSujo(){
    if(papel !== "admin") return;
    sujo = true;
    if(!alinhadoOk){ info("Alterações só neste navegador. Clique em \"Publicar\" para enviar."); return; }
    info("Alterações pendentes… publicando já.");
    clearTimeout(timerAuto); timerAuto = setTimeout(rodarAuto, ATRASO_AUTO);
  }
  async function rodarAuto(){
    if(!sujo || papel !== "admin" || !alinhadoOk) return;
    if(publicando){ timerAuto = setTimeout(rodarAuto, ATRASO_AUTO); return; }
    publicando = true; sujo = false;
    try{
      const m = await publicar(t => info(t));
      info("Publicado automaticamente às " + new Date(m.versao).toLocaleTimeString("pt-BR") + ".");
    }catch(err){ sujo = true; info("Falha ao publicar sozinho: " + (err.message || err)); console.warn("[sync]", err); }
    publicando = false;
    if(sujo && !/^Falha/.test(($("syInfo") || {}).textContent || "")) timerAuto = setTimeout(rodarAuto, ATRASO_AUTO);
  }
  let ganchos = false;
  function instalarGanchos(){
    if(ganchos) return; ganchos = true;
    ["setItem", "removeItem", "clear"].forEach(m => {
      if(typeof LS[m] !== "function") return;
      const orig = LS[m].bind(LS);
      LS[m] = function(k){ const r = orig.apply(null, arguments); if(m === "clear" || sincroniza(String(k))) marcarSujo(); return r; };
    });
    if(typeof IDBObjectStore !== "undefined"){
      ["put", "add", "delete", "clear"].forEach(m => {
        const orig = IDBObjectStore.prototype[m];
        IDBObjectStore.prototype[m] = function(){
          try{ if(bancosNomes.includes(this.transaction.db.name)) marcarSujo(); }catch(e){}
          return orig.apply(this, arguments);
        };
      });
    }
  }
  async function verAlinhamento(){
    try{
      const m = await lerMeta();
      alinhadoOk = !m || LS.getItem(CHAVE_VERSAO) === m.versao;
      if(!alinhadoOk) info("Este navegador não está alinhado com o publicado. Clique em \"Publicar\" para enviar o que você tem aqui.");
    }catch(e){ alinhadoOk = false; }
  }


  /* ---------- diagnóstico: no Console (F12) digite  await SYNC.diagnosticar()  ---------- */
  async function diagnosticar(){
    const r = [];
    const passo = async (nome, fn) => { try{ r.push(nome + ": " + await fn()); }catch(e){ r.push(nome + ": ERRO -> " + (e && e.message || e)); } };
    await passo("Papel no painel", async () => papel + " (" + email + ")");
    await passo("Sessão do Supabase", async () => { const d = await cliente.auth.getUser(); return d.data && d.data.user ? d.data.user.email : "sem sessão"; });
    await passo("Linha em perfis", async () => { const d = await ok(cliente.from("perfis").select("email,papel").eq("email", email.toLowerCase()).maybeSingle()); return d ? JSON.stringify(d) : "NÃO ENCONTRADA (o e-mail precisa estar na tabela perfis)"; });
    await passo("eh_admin() no banco", async () => { const d = await cliente.rpc("eh_admin"); if(d.error) throw new Error(d.error.message); return String(d.data); });
    await passo("Tabela painel_dados", async () => { const d = await ok(cliente.from(TABELA).select("chave,parte").range(0, 999)); return d.length + " linha(s) visíveis"; });
    await passo("Versão publicada", async () => { const m = await lerMeta(); return m ? JSON.stringify(m) : "nada publicado"; });
    await passo("Versão aplicada aqui", async () => LS.getItem(CHAVE_VERSAO) || "nenhuma");
    await passo("Publicação automática", async () => alinhadoOk ? "ligada" : "desligada (clique em Publicar uma vez)");
    const txt = r.join("\n"); console.log(txt); return txt;
  }

  /* ---------- interface ---------- */
  const css = `
  #syBtn{display:block;width:100%;margin-top:10px;padding:8px 10px;border:1px solid #6fcf4a;background:rgba(111,207,74,.15);color:inherit;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;text-align:center}
  #syBtn:hover{background:rgba(111,207,74,.3)} #syBtn[disabled]{opacity:.6;cursor:wait}
  #syInfo{margin-top:6px;font-size:11px;opacity:.75;text-align:center;line-height:1.35}
  #syBanner{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:99998;background:#1f2933;color:#fff;padding:12px 16px;border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.4);display:none;align-items:center;gap:12px;font-size:13.5px;max-width:92vw}
  #syBanner.on{display:flex} #syBanner button{padding:7px 12px;border-radius:8px;border:0;background:#6fcf4a;color:#0b120b;font-weight:700;cursor:pointer}
  #syBanner button.x{background:transparent;color:#cbd2d9;font-weight:400}`;
  let estiloOk = false;
  function estilo(){ if(estiloOk) return; estiloOk = true; const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s); }

  function botaoAdmin(){
    estilo();
    if($("syBtn")) return;
    const rodape = document.querySelector(".sidebar-footer") || document.body;
    const b = document.createElement("button");
    b.type = "button"; b.id = "syBtn"; b.textContent = "Publicar para usuários";
    b.title = "Envia os dados importados neste navegador para todos os usuários verem";
    const info = document.createElement("div"); info.id = "syInfo";
    rodape.appendChild(b); rodape.appendChild(info);
    (async () => {
      await verAlinhamento();
      if(alinhadoOk){ try{ const m = await lerMeta(); info.textContent = m ? "Publicação automática ligada. Última: " + agoraTxt(m.versao) : "Publicação automática ligada. Nada publicado ainda."; }catch(e){} }
    })();
    b.addEventListener("click", async () => {
      if(!confirm("Publicar os dados deste navegador para todos os usuários?\n\nIsso SUBSTITUI o que eles veem hoje pelo que está salvo aqui.")) return;
      b.disabled = true;
      try{
        const m = await publicar(t => { b.textContent = t; });
        alinhadoOk = true; sujo = false;
        info.textContent = "Publicado agora. Daqui em diante as importações vão sozinhas.";
        alert("Pronto! Os usuários verão estes dados na próxima vez que entrarem (ou em poucos minutos, se já estiverem com o painel aberto).");
      }catch(err){ alert("Não foi possível publicar: " + (err.message || err)); }
      b.disabled = false; b.textContent = "Publicar para usuários";
    });
  }
  function banner(){
    estilo();
    let el = $("syBanner");
    if(!el){
      el = document.createElement("div"); el.id = "syBanner";
      el.innerHTML = '<span>Há dados novos publicados.</span><button type="button" id="syAtu">Atualizar agora</button><button type="button" class="x" id="syFim">Depois</button>';
      document.body.appendChild(el);
      $("syAtu").addEventListener("click", () => { location.reload(); });
      $("syFim").addEventListener("click", () => el.classList.remove("on"));
    }
    el.classList.add("on");
  }

  /* ---------- ciclo de vida ---------- */
  async function checarLeitor(inicial){
    try{
      const r = await atualizar();
      if(r === "aplicado"){
        if(inicial) location.reload();       // os módulos leem os dados na abertura: recarrega uma vez
        else banner();
      }
    }catch(err){ console.warn("[sync] não foi possível atualizar:", err); }
  }

  window.SYNC_APOS_LOGIN = async function(c, p, e){
    cliente = c; papel = p === "admin" ? "admin" : "leitor"; email = e || "";
    clearInterval(timer); timer = null;
    if(papel === "admin"){ instalarGanchos(); botaoAdmin(); return; }
    await checarLeitor(true);
    timer = setInterval(() => checarLeitor(false), INTERVALO_CHECAGEM);
  };
  window.SYNC_APOS_SAIDA = function(){
    clearInterval(timer); timer = null; papel = "leitor"; clearTimeout(timerAuto); sujo = false; alinhadoOk = false;
    ["syBtn", "syInfo", "syBanner"].forEach(id => { const el = $(id); if(el) el.remove(); });
  };

  // exposto para testes e para uso manual no console
  window.SYNC = { publicar, atualizar, coletarLocal, coletarBancos, sincroniza, diagnosticar };
})();

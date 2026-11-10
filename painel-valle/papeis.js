/* PAPEIS (admin / leitor / sac) v3 — QUEM NAO E ADMIN NAO VE NADA DE IMPORTACAO.
   O papel vem do Supabase (tabela "perfis"), carregado pelo auth-login.js.
   Sem papel definido = leitor (fail-closed): a importacao so aparece depois que o admin e confirmado.
   Camadas (todas valem so para quem nao e admin):
     1) papeis.css  - esconde, desde o primeiro quadro, os blocos de importacao conhecidos (sem "piscar");
     2) este arquivo - varredura geral: campos de arquivo (com o bloco inteiro), caixas de "colar texto",
        botoes/abas (Importar, Importacao e controle, Processar, Limpar..., Apagar...), titulos e avisos
        que mandam "importar";
     3) travas de evento - mesmo que algo escape, escolher/soltar arquivo ou enviar formulario de importacao nao faz nada.
   ATENCAO: isto controla a TELA. A protecao real dos dados e o RLS do Supabase (so admin grava). */
(function(){
  "use strict";
  document.body.classList.add("papel-leitor");           // padrao: leitor (admin remove a classe)
  const ehAdmin = () => window.AUTH_PAPEL === "admin";

  const st = document.createElement("style");
  st.textContent = "body.papel-leitor .pp-oculto{display:none!important}"
    + "body:not(.papel-leitor) .pp-so-leitor{display:none!important}";
  document.head.appendChild(st);

  const txt = el => (el.textContent || "").replace(/\s+/g, " ").trim();
  const txtVis = el => (el.innerText || "").replace(/\s+/g, " ").trim();
  const marca = el => { if(el && el !== document.body && !el.classList.contains("pp-oculto")) el.classList.add("pp-oculto"); };
  const foraLogin = el => !el.closest("#loginTela");

  /* titulos de painel/cartao que anunciam importacao */
  const RX_TITULO = /^\s*(\d+\s*[·.\-)]\s*)?(importar|importa[çc][ãa]o|enviar arquivos?|nova importa)/i;
  /* painel cujo cabecalho fala de importacao/arquivo: o painel inteiro e de importacao */
  const RX_CAB_IMPORT = /importa|enviar|arquivo|processar|colar|planilha|relat[óo]rio|mapa de entrega|pdf/i;
  /* botoes, abas e links de acao de importacao */
  const RX_ACAO = new RegExp("^\\s*(\\d+\\s*[·.\\-)]\\s*)?(importar|importa[çc][ãa]o|processar|ou colar|colar\\b|escolher arquivo|carregar arquivo|ou carregar|enviar arquivo|inserir (modelo|exemplo)|ir para importar|apagar\\b|redefinir|"
    + "limpar\\s+(tudo|todos|todas|dados|base|relat[óo]rios?|planilha|arquivos?|ocorr|importa|cota|pacotes?|/|val\\b|rva\\b))", "i");
  /* textos que instruem a importar (avisos, descricoes, "vazio") */
  const RX_MENCAO = /\b(importe|importar|importa[çc][ãa]o|reimport\w*|cole (aqui|na|o texto)|colar o texto|solte|arraste|processar|escolha o arquivo|use a aba|\.sswweb|upload)\b/i;

  /* bloco que deve sumir junto com um campo de arquivo */
  const BLOCOS = ".receita-import-slot, .ind-upload, .cu-slot, .ag-drop, .pt-card, .atr-imp-box, .cq-impbox, .cs-imp, .vo-imp, .bf-file, form, label, .field";
  function blocoDoArquivo(i){
    const p = i.closest(".panel");
    if(p){
      const h = p.querySelector(":scope > .panel-header");
      if(h && RX_CAB_IMPORT.test(txt(h))) return p;           // painel de importacao: some inteiro
    }
    return i.closest(BLOCOS) || i;
  }

  const SEL_TEXTOS = ".empty,.ag-vazio,.cq-vazio,.fr-mes-bar-vazio,.section-desc,.footer-note,.ap-hint,.cq-hint,.pt-aviso-import,.cu-aviso,.dr-vinculo,.vo-note,.sf-nota,.sf-start p,.ag-msg";
  const SEL_VAZIO = ".empty,.ag-vazio,.cq-vazio,.fr-mes-bar-vazio";

  function varrer(){
    if(ehAdmin()) return;                                   // admin ve tudo (as marcas ficam sem efeito)
    // 1) paineis/cartoes cujo titulo anuncia importacao
    document.querySelectorAll(".panel > .panel-header, .vo-card > h3, .sf-sec-h, details > summary").forEach(h => {
      if(!foraLogin(h)) return;
      if(RX_TITULO.test(txt(h))) marca(h.parentElement);
    });
    // 2) campos de arquivo (com o bloco inteiro)
    document.querySelectorAll('input[type="file"]').forEach(i => {
      if(!foraLogin(i)) return;
      marca(blocoDoArquivo(i));
    });
    // 3) caixas de "colar texto"
    document.querySelectorAll("textarea").forEach(t => {
      if(!foraLogin(t)) return;
      const ph = t.getAttribute("placeholder") || "";
      if(/cole|colar|importa/i.test(ph) || /texto|colar|import/i.test(t.id) || t.classList.contains("atr-textarea")){
        const p = t.parentElement;
        marca(p && p !== document.body && !p.matches(".panel, .vo-card, section, main") ? p : t);
      }
    });
    // 4) botoes, abas e links de acao
    document.querySelectorAll("button, a, label, summary, [role=tab], .pill, .link-btn").forEach(b => {
      if(!foraLogin(b)) return;
      if(RX_ACAO.test(txt(b))) marca(b);
    });
    // 5) avisos que mandam importar: "vazio" ganha texto neutro; o resto some
    document.querySelectorAll(SEL_TEXTOS).forEach(el => {
      if(!foraLogin(el) || el.classList.contains("pp-oculto") || el.classList.contains("pp-so-leitor")) return;
      if(!RX_MENCAO.test(txt(el))) return;
      marca(el);
      if(el.matches(SEL_VAZIO) && !(el.nextElementSibling && el.nextElementSibling.classList.contains("pp-so-leitor"))){
        const n = document.createElement("div");
        n.className = "empty pp-so-leitor";
        n.textContent = "Sem dados disponíveis para esta tela.";
        el.insertAdjacentElement("afterend", n);
      }
    });
    // 6) painel/cartao que ficou so com o titulo (todo o conteudo era de importacao) some tambem
    document.querySelectorAll(".panel, .vo-card").forEach(p => {
      if(p.classList.contains("pp-oculto") || !p.offsetParent || !p.querySelector(".pp-oculto")) return;
      const h = p.querySelector(":scope > .panel-header, :scope > h3, :scope > header");
      if(txtVis(p).length <= (h ? txtVis(h).length : 0) + 3) marca(p);
    });
  }

  let ag = false;
  const agenda = () => { if(ag) return; ag = true; requestAnimationFrame(() => { ag = false; varrer(); }); };
  new MutationObserver(agenda).observe(document.body, {childList:true, subtree:true});
  document.addEventListener("click", () => setTimeout(agenda, 60), true);   // trocas de aba/sub-aba
  agenda();

  /* ---------- travas de evento (segunda barreira) ----------
     Se algum campo escapar da varredura, escolher/soltar arquivo ou enviar o formulario nao faz nada para quem nao e admin. */
  const bloqueia = e => { e.preventDefault(); e.stopImmediatePropagation(); };
  const ehArquivo = t => t && t.tagName === "INPUT" && t.type === "file" && foraLogin(t);
  document.addEventListener("click", e => { if(!ehAdmin() && ehArquivo(e.target)) bloqueia(e); }, true);
  document.addEventListener("change", e => {
    if(ehAdmin() || !ehArquivo(e.target)) return;
    e.stopImmediatePropagation(); try{ e.target.value = ""; }catch(_){}
  }, true);
  ["dragenter", "dragover", "drop"].forEach(ev => document.addEventListener(ev, e => {
    if(ehAdmin()) return;
    const tp = e.dataTransfer && e.dataTransfer.types;
    if(tp && Array.prototype.indexOf.call(tp, "Files") > -1) bloqueia(e);   // soltar arquivo na pagina: nada acontece
  }, true));
  document.addEventListener("submit", e => {
    if(ehAdmin()) return;
    const f = e.target;
    if(f && f.querySelector && foraLogin(f) && f.querySelector('input[type="file"]')) bloqueia(e);
  }, true);

  /* ---------- papel "sac" (departamento SAC) ----------
     Só vê: Rede Do Valle > Dashboard Rede, Performance Teste, Ocorrências e SacFlow. Todo o resto fica com cadeado.
     Como o leitor, não importa nada (só vê). ATENÇÃO: é o bloqueio da TELA; a proteção real dos dados é o RLS do Supabase. */
  const SAC_LIBERADAS = new Set(["dashboard-rede", "performance-teste", "ocorrencias", "sacflow"]);
  const sacAtivo = () => window.AUTH_PAPEL === "sac";
  window.ehSac = sacAtivo;
  /* ---------- perfil "só Tambasa" (por e-mail; no Supabase fica como 'leitor') ----------
     Só vê a área Tambasa (Performance, Trocas, Boletos, Controle de Entregas, Entregas Previstas, Pacotes). O resto fica com cadeado. */
  const EMAILS_SO_TAMBASA = new Set(["tambasa@transdovalle.com.br"]);
  const TAMBASA_LIBERADAS = new Set(["performance", "trocas", "boletos", "entregas", "previstas", "pacotes"]);
  const soTambasa = () => !ehAdmin() && EMAILS_SO_TAMBASA.has(String(window.AUTH_EMAIL || "").toLowerCase());
  window.ehSoTambasa = soTambasa;
  window.abaBloqueada = id => (sacAtivo() && !SAC_LIBERADAS.has(id)) || (soTambasa() && !TAMBASA_LIBERADAS.has(id));      // id de aba (ex.: "trocas", "@vo")
  window.areaBloqueada = area => (sacAtivo() && area !== "valle") || (soTambasa() && area !== "tambasa");          // "operacao", "valle" e "vo" (Visão da Operação)
  window.ICONE_CADEADO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  st.textContent += "body.papel-sac #btnAbrirVO,body.papel-tambasa #btnAbrirVO{opacity:.6;cursor:not-allowed}"
    + "#btnAbrirVO .vo-cadeado{display:none;width:14px;height:14px;margin-left:6px;vertical-align:-2px}body.papel-sac #btnAbrirVO .vo-cadeado,body.papel-tambasa #btnAbrirVO .vo-cadeado{display:inline-block}"
    + "#tabsNav button.nav-lock{opacity:.55;cursor:not-allowed}#tabsNav button.nav-lock:hover{background:transparent}"
    + "#tabsNav .nav-cadeado{margin-left:auto;display:inline-flex;width:16px;height:16px;opacity:1;flex-shrink:0}#tabsNav .nav-cadeado svg{width:100%;height:100%}"
    + "#areaHub .ah-lock{position:relative;cursor:not-allowed;overflow:hidden}"
    + "#areaHub .ah-lock:hover{transform:none!important}"
    + "#areaHub .ah-trava{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(6,10,6,.72);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);border-radius:inherit;color:#fff;text-align:center;pointer-events:none}"
    + "#areaHub .ah-trava .ah-cad{width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.55);box-shadow:0 6px 22px rgba(0,0,0,.45)}"
    + "#areaHub .ah-trava .ah-cad svg{width:28px;height:28px}"
    + "#areaHub .ah-trava b{font-size:12.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase}"
    + "#areaHub .ah-hero.ah-lock .ah-trava{flex-direction:row;gap:14px}"
    + "#areaHub .ah-hero.ah-lock .ah-trava .ah-cad{width:50px;height:50px}";
  (function(){ const b = document.getElementById("btnAbrirVO"); if(b && !b.querySelector(".vo-cadeado")){ const i = document.createElement("span"); i.className = "vo-cadeado"; i.innerHTML = window.ICONE_CADEADO; b.appendChild(i); } })();

  /* ---------- perfis enxutos (supervisao@gmail.com e sac@transdovalle.com.br) ----------
     Na Visão operacional ficam SÓ: Dashboard, Visão da Operação, Comparação por Unidade, Visão operacional por unidade (só supervisao@) e Fechamento-RECEITA.
     Somem (não ficam nem com cadeado): Análise Gerencial, Comparação SacFlow e Acompanhamento de SAC.
     Vale pelo e-mail (window.AUTH_EMAIL, definido no login); admin nunca é afetado. É só a TELA; a proteção real é o RLS do Supabase. */
  const EMAILS_ENXUTOS = new Set(["supervisao@gmail.com", "sac@transdovalle.com.br"]);
  const OCULTAS_ENXUTO = new Set(["analise-gerencial", "sacflow-comparacao", "@sacs", "dashboard"]);   // "dashboard" = antigo (só aparecia no Acompanhamento de SAC)
  const enxuto = () => !ehAdmin() && EMAILS_ENXUTOS.has(String(window.AUTH_EMAIL || "").toLowerCase());
  window.ehEnxuto = enxuto;
  /* "Visão operacional por unidade" (id detalhe-filial): só admin e supervisao@gmail.com. Some (sem cadeado) para os demais. */
  const SO_SUPERVISAO = new Set(["detalhe-filial"]);
  const EMAIL_SUPERVISAO = "supervisao@gmail.com";
  const ehSupervisao = () => String(window.AUTH_EMAIL || "").toLowerCase() === EMAIL_SUPERVISAO;
  window.abaOculta = id => {
    if(SO_SUPERVISAO.has(id)) return !(ehAdmin() || ehSupervisao());
    return enxuto() && OCULTAS_ENXUTO.has(id);
  };

  window.definirPapel = function(papel){
    window.AUTH_PAPEL = papel === "admin" ? "admin" : (papel === "sac" ? "sac" : "leitor");
    document.body.classList.toggle("papel-leitor", window.AUTH_PAPEL !== "admin");
    document.body.classList.toggle("papel-sac", sacAtivo());
    document.body.classList.toggle("papel-tambasa", soTambasa());
    varrer();
    try{
      if(sacAtivo()){
        // se estiver numa tela bloqueada (ou na Visão da Operação), leva para a primeira liberada
        if(typeof fecharVisaoOperacao === "function" || window.fecharVisaoOperacao){ try{ window.fecharVisaoOperacao && window.fecharVisaoOperacao(); }catch(e){} }
        if(typeof switchTab === "function" && typeof abaAtual !== "undefined" && window.abaBloqueada(abaAtual)){ areaAtual = "valle"; switchTab("dashboard-rede"); }
      }
      if(soTambasa()){
        // só Tambasa: se estiver em outra área/tela (ou na Visão da Operação), leva para a Tambasa
        try{ window.fecharVisaoOperacao && window.fecharVisaoOperacao(); }catch(e){}
        if(typeof switchTab === "function" && typeof abaAtual !== "undefined" && window.abaBloqueada(abaAtual)){ areaAtual = "tambasa"; switchTab("performance"); }
      }
      if(enxuto() && typeof switchTab === "function" && typeof abaAtual !== "undefined" && window.abaOculta(abaAtual)){ areaAtual = "operacao"; switchTab("dashboard-rede"); }
      const hub = document.getElementById("areaHub");
      if(hub && hub.classList.contains("on") && window.mostrarHubAreas) window.mostrarHubAreas();   // redesenha a escolha de área com os cadeados
    }catch(e){ console.warn("[papeis]", e); }
    try{ if(window.acompPacotesRefresh) window.acompPacotesRefresh(); }catch(e){}   // Acompanhamento de Pacotes: perfil tambasa@ vê as próprias alterações locais
    try{ if(window.performanceTesteRefresh) window.performanceTesteRefresh(); }catch(e){}   // recoloca/retira as colunas Responsável e 012 conforme o papel
    try{ if(typeof renderNav === "function" && typeof areaAtual !== "undefined" && areaAtual) renderNav(); }catch(e){}   // mostra/esconde a aba Monitor (só admin) e os cadeados
    try{ if(window.monitorAdminRefresh && document.getElementById("sec-monitor") && document.getElementById("sec-monitor").classList.contains("active")) window.monitorAdminRefresh(); }catch(e){}
  };

  /* Abertura sem "piscar": se este navegador já tem sessão salva e o servidor já confirmou admin antes,
     o painel abre direto como admin (só a TELA; o servidor continua confirmando em segundo plano e corrige se mudou). */
  (function(){
    try{
      const c = JSON.parse(localStorage.getItem("painel_papel_cache") || "null");
      if(!c || (c.papel !== "admin" && c.papel !== "sac") || !c.email) return;
      for(let i = 0; i < localStorage.length; i++){
        const k = localStorage.key(i);
        if(!/^sb-.+-auth-token$/.test(k)) continue;
        const o = JSON.parse(localStorage.getItem(k) || "null");
        if(o && o.user && String(o.user.email || "").toLowerCase() === c.email){ window.AUTH_EMAIL = c.email; window.definirPapel(c.papel); return; }
      }
    }catch(e){}
  })();
})();

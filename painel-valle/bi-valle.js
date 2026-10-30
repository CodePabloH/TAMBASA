/* BI · DO VALLE — comportamento de interface (sem regra de negócio).
   Painéis de IMPORTAÇÃO e de CADASTRO MANUAL ("Importar…", "Nova…") ficam recolhidos
   por padrão: a tela abre direto nos indicadores, e o formulário é um clique no título.
   A escolha de cada painel é lembrada neste navegador. */
(function(){
  const RX = /^\s*(\d+\s*[·.\-]\s*)?(importar|importação|nova\b|novo\b|nova solicitação)/i;
  const KEY = "painel_bi_paineis_abertos";
  let abertos = {};
  try{ abertos = JSON.parse(LS.getItem(KEY) || "{}") || {}; }catch(e){}
  const salvar = () => { try{ LS.setItem(KEY, JSON.stringify(abertos)); }catch(e){} };

  function chave(panel){
    const sec = panel.closest(".section");
    const h = panel.querySelector(":scope > .panel-header");
    return (sec ? sec.id : "x") + "|" + (h ? h.textContent.trim().replace(/\s+/g," ").slice(0,80) : "");
  }
  function rotulo(panel){
    return panel.classList.contains("bi-collapsed") ? "Abrir" : "Fechar";
  }
  function pintaChev(panel){
    const c = panel.querySelector(":scope > .panel-header > .bi-chev");
    if(c) c.innerHTML = rotulo(panel) + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  }

  function decorar(root){
    (root || document).querySelectorAll(".panel > .panel-header").forEach(h => {
      const panel = h.parentElement;
      if(panel.dataset.biDeco) return;
      const titulo = h.textContent.replace(/\s+/g," ").trim();
      if(!RX.test(titulo)) return;
      // já tem botão próprio no cabeçalho (ex.: "Mostrar / ocultar"): não mexe
      if(h.querySelector("button, a, input, select")) return;
      panel.dataset.biDeco = "1";
      panel.classList.add("bi-collapsible");
      if(!abertos[chave(panel)]) panel.classList.add("bi-collapsed");
      const c = document.createElement("span"); c.className = "bi-chev"; h.appendChild(c);
      h.setAttribute("role","button"); h.tabIndex = 0;
      pintaChev(panel);
    });
  }

  function alternar(h){
    const panel = h.parentElement;
    panel.classList.toggle("bi-collapsed");
    abertos[chave(panel)] = !panel.classList.contains("bi-collapsed");
    salvar(); pintaChev(panel);
  }
  document.addEventListener("click", e => {
    const h = e.target.closest(".panel.bi-collapsible > .panel-header");
    if(h) alternar(h);
  });
  document.addEventListener("keydown", e => {
    if(e.key !== "Enter" && e.key !== " ") return;
    const h = e.target.closest && e.target.closest(".panel.bi-collapsible > .panel-header");
    if(h && e.target === h){ e.preventDefault(); alternar(h); }
  });

  let agendado = false;
  function agenda(){ if(agendado) return; agendado = true; requestAnimationFrame(() => { agendado = false; decorar(); }); }
  document.addEventListener("DOMContentLoaded", () => {
    decorar();
    const main = document.getElementById("mainContent");
    if(main) new MutationObserver(agenda).observe(main, {childList:true, subtree:true});
  });
})();

/* =====================================================================
   INDENIZAÇÃO — quanto foi pago de indenização e quem pagou.
   Fonte: relatório de indenizações do SSW (CSV ";" / .sswweb) — VAL (Rede Do
   Valle) e RVA (Real Vale). Importação própria, independente das outras abas.

   Três sub-abas:
     • Dashboard         — só o resumo (total, Do Valle/Real Vale, Matriz, Filiais). Exporta o resumo.
     • Detalhado         — Do Valle/Real Vale por unidade e casos a revisar. Exporta o detalhado.
     • Casos Específicos — cada indenização, linha a linha. Exporta o detalhe.

   REGRA DE RESPONSABILIDADE (uma indenização cai em UMA classe, nesta ordem):
     1) Debitado à Transportadora do Valle ou à Real Vale (FORNEC DEBITADO) -> "VALLE"
        (quem pagou foi a transportadora do grupo)
     2) UNID RESP = MTZ                                                -> "MATRIZ"
        (o nome em NOME FORNEC DEBITADO diz quem da matriz foi debitado)
     3) UNID RESP = UNID DESTINO                                       -> "FILIAL" (a do destino)
     4) qualquer outro caso (RESP diferente do destino e não é MTZ)    -> "OUTROS" (revisar)
   REGRAS FIXAS (valem antes do "revisar"):
     • Debitado a parceira do G5 (AL2 All Cargo, EGO Expresso Goiás, etc.)  -> "G5" (a parceira pagou)
     • Responsável é sigla de parceira (redespacho)                          -> "G5"
     • AOBS ASSESSORIA… / ANSELMO / YURI PEREIRA / ATILAESTE (FUNCOES_MATRIZ) -> "MATRIZ" (mesmo com resp. ROT, STZ…)
     • Pessoa (funcionário CLT) debitada + responsável é uma filial          -> "FILIAL" responsável
   DEFINIÇÃO MANUAL: nos casos a revisar o usuário escolhe quem pagou; fica salvo e o caso
   vai para o lugar certo (Matriz, Filial, Do Valle/Real Vale ou parceira G5).
   Total pago = Do Valle/Real Vale + MATRIZ + FILIAIS (+ a revisar), somando VALINDENIZ.
   ===================================================================== */
(function(){
  "use strict";

  const STORE_KEY = "tambasa_indenizacao";
  const CNPJ_VALLE_RAIZ = "01329621";               // 01.329.621/0001-86
  const RE_NOME_VALLE = /TRANSPORTADORA DO VALL?E\b/;
  const CNPJ_REAL_VALE_RAIZ = "19609408";           // Real Vale Transportes Ltda (RVA)
  const RE_NOME_REAL_VALE = /REAL VALE TRANSPORTES?/;

  const CLASSES = {
    matriz: {label:"Matriz"},
    filial: {label:"Filial"},
    valle:  {label:"Do Valle / Real Vale"},
    g5:     {label:"Parceiras G5"},
    outros: {label:"Outros (revisar)"}
  };

  // Siglas que NÃO são do Valle (empresas parceiras) — aparecem como "SIGLA - Nome".
  const NOMES_UNID = {
    AL2:"All Cargo", EGO:"Expresso Goiás", CMG:"CW3 (CMG)", CW3:"CW3", IVC:"Invicta", NWF:"NWF", RIT:"Rápido Ipora",
    SPR:"Sousa Pires", TLC:"LC Encomendas", TNG:"Delps (Transnorte Goiano)", TOP:"Top Luz", USE:"USE Transportes",
    ALF:"Alfa Transportes", EPD:"EP Distribuidora", EP:"EP Distribuidora", FAV:"A Favorita Transportes"
  };
  function rotuloUnid(sigla){
    const n = NOMES_UNID[String(sigla || "").toUpperCase()];
    return n && n.toUpperCase() !== String(sigla).toUpperCase() ? sigla + " - " + n : String(sigla || "");
  }
  // Função das pessoas da Matriz (quando o relatório não traz a especialidade).
  const FUNCOES_MATRIZ = [["ANSELMO", "Supervisor"], ["YURI PEREIRA", "Conferente"], ["ATILAESTE", "Encarregado"]];
  function funcaoMatriz(nome, atual){
    const n = norm(nome);
    const f = FUNCOES_MATRIZ.find(([k]) => n.includes(k));
    return f ? f[1] : atual;
  }

  /* ---------------- regras fixas ---------------- */
  // Parceiras do grupo G5 identificadas pelo NOME debitado (além do padrão "SIGLA - Nome").
  const PARCEIRAS_NOME = [["AL2", /\bALL CARGO\b/], ["EGO", /EXPRESSO GOIAS/]];
  // Pessoas da Matriz: onde quer que o relatório ponha o responsável (ROT, STZ…), quem pagou foi a MATRIZ.
  const RE_AOBS = /AOBS ASSESSORIA/;
  function pessoaMatriz(r){
    const n = norm(r.debNome);
    if(RE_AOBS.test(n)) return "Anselmo";
    const f = FUNCOES_MATRIZ.find(([k]) => n.includes(k));
    return f ? f[0] : "";
  }
  const RE_EMPRESA = /\b(LTDA|EIRELI|EPP|MEI|S\/A|SA|ME)\b|TRANSP|LOGIST|ASSESSORIA|COMERCIO|SERVICO|DISTRIBUIDORA|\bCIA\b/;
  const RE_ESP_PESSOA = /CLT|FUNCION|MOTORISTA|AJUDANTE|CONFERENTE|ENCARREGADO|SUPERVISOR|GERENTE|ASSISTENTE|AUXILIAR/;
  const ehParceira = sigla => !!NOMES_UNID[String(sigla || "").toUpperCase()];
  function parceiraDebitada(r){
    const nome = norm(r.debNome);
    for(const [sigla, re] of PARCEIRAS_NOME) if(re.test(nome)) return sigla;
    const m = nome.match(/^([A-Z0-9]{2,4}) - /);
    return m && ehParceira(m[1]) ? m[1] : "";
  }
  // Nome mostrado nas tabelas: o Anselmo vem como empresa (AOBS ASSESSORIA…), mas é uma pessoa da Matriz.
  function nomeExibicao(r){
    return pessoaMatriz(r) === "Anselmo" ? "ANSELMO" : (r.debNome || "");
  }
  function debitadoEhPessoa(r){
    return RE_ESP_PESSOA.test(norm(r.debEsp)) || !RE_EMPRESA.test(norm(r.debNome));
  }

  /* ---------------- definição manual (casos a revisar) ---------------- */
  const MANUAL_KEY = "tambasa_indenizacao_manual";
  const chaveCaso = r => [r.origem, r.ctrc, r.num].join("|");
  function carregarManual(){
    try{ const o = JSON.parse(localStorage.getItem(MANUAL_KEY) || "null"); if(o && typeof o === "object") return o; }catch(e){ /* ignora */ }
    return {};
  }
  function gravarManual(m){
    try{ localStorage.setItem(MANUAL_KEY, JSON.stringify(m)); return true; }
    catch(e){ alert("Não consegui salvar a definição no navegador (espaço cheio?)."); return false; }
  }
  // "matriz" | "filial:URU" | "valle:Valle" | "valle:Real Vale" | "g5:AL2"  <->  {classe, quem, emp}
  function manualDeValor(v){
    const [k, q] = String(v || "").split(":");
    if(k === "matriz") return {classe:"matriz", quem:"MTZ"};
    if(k === "filial" && q) return {classe:"filial", quem:q};
    if(k === "valle" && q) return {classe:"valle", quem:q, emp:q};
    if(k === "g5" && q) return {classe:"g5", quem:q};
    return null;
  }
  function valorDeManual(m){
    if(!m) return "";
    return m.classe === "matriz" ? "matriz" : m.classe + ":" + m.quem;
  }

  const estado = {
    sub: "dashboard",          // "dashboard" | "detalhado" | "casos"
    origem: "todos",           // "todos" | "val" | "rva"
    de: "", ate: "",           // período pela data da indenização (INDENIZ), ISO
    casos: {classe:"todos", destino:"todos", busca:""},
    msg: ""
  };

  /* ---------------- util ---------------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const brl = v => (Number(v) || 0).toLocaleString("pt-BR", {style:"currency", currency:"BRL"});
  const int = v => (Number(v) || 0).toLocaleString("pt-BR");
  const pct = v => ((Number(v) || 0) * 100).toLocaleString("pt-BR", {minimumFractionDigits:1, maximumFractionDigits:1}) + "%";
  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;

  function lerNumeroBR(s){
    const t = String(s == null ? "" : s).trim().replace(/[R$\s]/g, "");
    if(!t) return 0;
    const n = Number(t.replace(/\./g, "").replace(",", "."));
    return isFinite(n) ? n : 0;
  }
  function dataISO(s){
    const m = String(s || "").trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
  }
  function dataBR(iso){
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  }
  // Só dígitos. Se vier em notação científica ("1,32962E+12", como o Excel mostra) não dá
  // para confiar nos dígitos — devolve "" e a identificação do Valle cai para o NOME.
  function soDigitos(s){
    const t = String(s == null ? "" : s).trim();
    if(/E\+?\d+$/i.test(t)) return "";
    return t.replace(/\D/g, "");
  }

  /* ---------------- armazenamento ---------------- */
  function carregar(){
    try{
      const o = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if(o && o.val && o.rva) return o;
    }catch(e){ /* ignora */ }
    return {val:{atualizadoEm:"", linhas:[]}, rva:{atualizadoEm:"", linhas:[]}};
  }
  function gravar(d){
    try{ localStorage.setItem(STORE_KEY, JSON.stringify(d)); return true; }
    catch(e){ alert("Não consegui salvar os dados de Indenização no navegador (espaço cheio?)."); return false; }
  }

  /* ---------------- leitura do CSV ---------------- */
  function dividirLinhaCsv(linha){
    const out = []; let cur = "", aspas = false;
    for(let i = 0; i < linha.length; i++){
      const c = linha[i];
      if(aspas){
        if(c === '"'){ if(linha[i+1] === '"'){ cur += '"'; i++; } else aspas = false; }
        else cur += c;
      } else if(c === '"') aspas = true;
      else if(c === ";"){ out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  function parseIndenizacoes(texto, origem){
    const linhas = String(texto || "").replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim() !== "");
    if(!linhas.length) return {ok:false, linhas:[], erro:"Arquivo vazio."};
    const cab = dividirLinhaCsv(linhas[0]).map(norm);
    const idx = nome => cab.indexOf(nome);
    const col = {
      ctrc:idx("CTRC"), tipo:idx("TIPO DO DOCUMENTO"), nf:idx("NOTA FISCAL"), emiss:idx("EMISS"),
      indeniz:idx("INDENIZ"), prev:idx("PREVPGTO"),
      pagador:idx("NOME PAGADOR"), remetente:idx("NOME REMETENTE"), benef:idx("NOME BENEFICIARIO"),
      motivo:idx("MOTIVO"), frete:idx("VALFRETE"), merc:idx("VALMERCAD"), valor:idx("VALINDENIZ"),
      num:idx("NUM INDENIZACAO"), cpag:idx("CPAG"),
      debCnpj:idx("FORNEC DEBITADO"), debNome:idx("NOME FORNEC DEBITADO"), debEsp:idx("ESPECIALIDADE FORNEC DEBITADO"),
      evento:idx("EVENTO"), resp:idx("UNID RESP"), destino:idx("UNID DESTINO")
    };
    const faltando = ["ctrc","valor","resp","destino","debNome"].filter(k => col[k] < 0);
    if(faltando.length) return {ok:false, linhas:[], erro:"Não achei as colunas esperadas (" + faltando.join(", ") + "). Confira se é o relatório de indenização."};

    const out = [];
    for(let i = 1; i < linhas.length; i++){
      const c = dividirLinhaCsv(linhas[i]);
      const ctrc = (c[col.ctrc] || "").trim();
      if(!ctrc) continue;
      const txt = k => (col[k] >= 0 && c[col[k]] != null) ? String(c[col[k]]).trim() : "";
      out.push({
        origem,
        ctrc, tipo:txt("tipo"), nf:txt("nf"),
        emiss:dataISO(txt("emiss")), indeniz:dataISO(txt("indeniz")), prev:dataISO(txt("prev")),
        pagador:txt("pagador"), remetente:txt("remetente"), benef:txt("benef"),
        motivo:txt("motivo"),
        frete:lerNumeroBR(txt("frete")), merc:lerNumeroBR(txt("merc")), valor:lerNumeroBR(txt("valor")),
        num:txt("num"), cpag:txt("cpag"),
        debCnpj:soDigitos(txt("debCnpj")), debNome:txt("debNome"), debEsp:txt("debEsp"),
        evento:txt("evento"), resp:norm(txt("resp")), destino:norm(txt("destino"))
      });
    }
    return {ok:true, linhas:out};
  }

  /* ---------------- regra de responsabilidade ---------------- */
  // Transportadora do próprio grupo que recebe o débito: Transportadora do Valle (VAL)
  // ou Real Vale Transportes (RVA). Devolve o nome curto da empresa ou "".
  function empresaDebitada(r){
    const cnpj = String(r.debCnpj || "").padStart(14, "0");
    const nome = norm(r.debNome);
    if(cnpj.startsWith(CNPJ_VALLE_RAIZ) || RE_NOME_VALLE.test(nome)) return "Valle";
    if(cnpj.startsWith(CNPJ_REAL_VALE_RAIZ) || RE_NOME_REAL_VALE.test(nome)) return "Real Vale";
    return "";
  }
  function classificar(r, manual){
    const man = manual && manual[chaveCaso(r)];
    if(man && man.classe) return {classe:man.classe, quem:man.quem, emp:man.emp, manual:true};
    const emp = empresaDebitada(r);
    if(emp) return {classe:"valle", quem:emp, emp};
    const parc = parceiraDebitada(r);
    if(parc) return {classe:"g5", quem:parc, obs:"Debitado à parceira " + rotuloUnid(parc) + " (G5)"};
    const pm = pessoaMatriz(r);
    if(pm){
      return {classe:"matriz", quem:"MTZ", obs: r.resp && r.resp !== "MTZ" ? "Pessoa da Matriz (" + pm.toLowerCase().replace(/(^| )\w/g, c => c.toUpperCase()) + ") — responsável no relatório: " + r.resp : ""};
    }
    if(r.resp === "MTZ") return {classe:"matriz", quem:"MTZ"};
    if(r.resp && ehParceira(r.resp)) return {classe:"g5", quem:r.resp, obs:"Redespacho — responsável é a parceira " + rotuloUnid(r.resp)};
    if(r.resp && debitadoEhPessoa(r)) return {classe:"filial", quem:r.resp, obs: r.resp !== r.destino ? "Funcionário da filial responsável (" + r.resp + ")" : ""};
    if(r.resp && r.resp === r.destino) return {classe:"filial", quem:r.destino};
    return {classe:"outros", quem:r.resp || "?"};
  }

  /* ---------------- dados filtrados ---------------- */
  function linhasBase(){
    const d = carregar();
    let todas = [];
    if(estado.origem !== "rva") todas = todas.concat(d.val.linhas);
    if(estado.origem !== "val") todas = todas.concat(d.rva.linhas);
    const manual = carregarManual();
    return todas.filter(r => {
      if(estado.de && (!r.indeniz || r.indeniz < estado.de)) return false;
      if(estado.ate && (!r.indeniz || r.indeniz > estado.ate)) return false;
      return true;
    }).map(r => Object.assign({}, r, classificar(r, manual), {debEsp:funcaoMatriz(r.debNome, r.debEsp), nomeExib:nomeExibicao(r)}));
  }

  function somar(lista){
    const t = {qtd:0, merc:0, frete:0, valor:0};
    lista.forEach(r => { t.qtd++; t.merc += r.merc; t.frete += r.frete; t.valor += r.valor; });
    return t;
  }

  function resumo(lista){
    const porClasse = {matriz:[], filial:[], valle:[], g5:[], outros:[]};
    lista.forEach(r => porClasse[r.classe].push(r));
    const pago = somar(porClasse.matriz.concat(porClasse.filial));
    const agrupar = (arr, chave) => {
      const m = new Map();
      arr.forEach(r => { const k = chave(r); if(!m.has(k)) m.set(k, []); m.get(k).push(r); });
      return Array.from(m, ([k, v]) => Object.assign({chave:k}, somar(v))).sort((a, b) => b.valor - a.valor);
    };
    return {
      total: somar(lista),
      pago,
      matriz: somar(porClasse.matriz),
      filiais: somar(porClasse.filial),
      valle: somar(porClasse.valle),
      g5: somar(porClasse.g5),
      g5PorParceiro: agrupar(porClasse.g5, r => r.quem),
      outros: somar(porClasse.outros),
      porFilial: agrupar(porClasse.filial, r => r.quem),
      matrizPorDebitado: (() => {
        const m = new Map();
        porClasse.matriz.forEach(r => {
          const k = (r.nomeExib || r.debNome || "(sem nome)") + "||" + (r.debEsp || "");
          if(!m.has(k)) m.set(k, []);
          m.get(k).push(r);
        });
        return Array.from(m, ([k, v]) => {
          const [nome, esp] = k.split("||");
          return Object.assign({nome, esp}, somar(v));
        }).sort((a, b) => b.valor - a.valor);
      })(),
      outrosPorResp: agrupar(porClasse.outros, r => r.quem),
      valleLista: porClasse.valle,
      valleDestino: agrupar(porClasse.valle, r => r.destino),
      valleEmpresa: agrupar(porClasse.valle, r => r.emp),
      beneficiarios: (() => {
        const m = new Map();
        lista.forEach(r => { const k = norm(r.benef) || "(SEM BENEFICIÁRIO)"; if(!m.has(k)) m.set(k, []); m.get(k).push(r); });
        return Array.from(m, ([k, v]) => Object.assign({chave:k}, somar(v))).sort((a, b) => b.valor - a.valor || b.qtd - a.qtd);
      })()
    };
  }

  /* ================= TELA ================= */
  function indenizacaoHTML(){
    return `
    <h2 class="section-title">Indenização</h2>
    <div class="pg-subtabs" id="indSubtabsNav">
      <button type="button" class="pg-subtab-btn ${estado.sub==='dashboard'?'active':''}" data-indsub="dashboard">Dashboard</button>
      <button type="button" class="pg-subtab-btn ${estado.sub==='detalhado'?'active':''}" data-indsub="detalhado">Detalhado</button>
      <button type="button" class="pg-subtab-btn ${estado.sub==='casos'?'active':''}" data-indsub="casos">Casos Específicos</button>
    </div>
    <div class="pg-subview ${estado.sub==='dashboard'?'active':''}" id="indView-dashboard"><div id="indDashWrap"></div></div>
    <div class="pg-subview ${estado.sub==='detalhado'?'active':''}" id="indView-detalhado"><div id="indDetWrap"></div></div>
    <div class="pg-subview ${estado.sub==='casos'?'active':''}" id="indView-casos"><div id="indCasosWrap"></div></div>`;
  }

  function barraTopoHTML(d){
    const slot = (o, nome) => {
      const q = d[o].linhas.length;
      const quando = q && d[o].atualizadoEm ? new Date(d[o].atualizadoEm).toLocaleDateString("pt-BR") : "";
      return `<label class="ind-upload ${q ? "ok" : ""}" title="Importar relatório de indenização (CSV) da ${nome}">
        <input type="file" id="indImp_${o}" accept=".csv,.sswweb,.txt">
        <span class="ind-upload-tit">${q ? "↻" : "⭱"} ${o.toUpperCase()}</span>
        <span class="ind-upload-sub">${q ? `${int(q)} casos · ${quando}` : "importar arquivo"}</span>
      </label>`;
    };
    return `
    <div class="ind-top">
      <div class="ind-filtros">
        <label>Sistema
          <select id="indFOrigem">
            <option value="todos" ${estado.origem==='todos'?'selected':''}>VAL + RVA</option>
            <option value="val" ${estado.origem==='val'?'selected':''}>Só VAL</option>
            <option value="rva" ${estado.origem==='rva'?'selected':''}>Só RVA</option>
          </select>
        </label>
        <label>Indenizado de <input type="date" id="indFDe" value="${esc(estado.de)}"></label>
        <label>até <input type="date" id="indFAte" value="${esc(estado.ate)}"></label>
        ${(estado.de || estado.ate || estado.origem !== "todos") ? '<button type="button" class="link-btn" id="indFLimpar">Limpar filtros</button>' : ""}
      </div>
      <div class="ind-import">
        ${slot("val", "Rede Do Valle")}
        ${slot("rva", "Real Vale")}
      </div>
    </div>
    ${estado.msg ? `<div class="ind-msg">${esc(estado.msg)}</div>` : ""}`;
  }

  /* ---- listas (mesmas para a tela e para o Excel) ---- */
  const dif = t => t.valor - t.frete;
  const razao = t => t.frete > 0 ? t.valor / t.frete : null;
  const linhasMatriz = s => s.matrizPorDebitado.map(m => ({nome:m.nome, esp:m.esp, t:m, go:"matriz|todos"}));
  const linhasFiliais = s => s.porFilial.map(f => ({nome:rotuloUnid(f.chave), t:f, go:"todos|" + f.chave}));
  const linhasValleEmp = s => s.valleEmpresa.map(e => ({nome:e.chave === "Valle" ? "Do Valle" : "Real Vale", t:e, go:"valle|todos"}));
  const linhasValleDest = s => s.valleDestino.map(u => ({nome:rotuloUnid(u.chave), t:u, go:"valle|" + u.chave}));
  const linhasG5 = s => s.g5PorParceiro.map(g => ({nome:rotuloUnid(g.chave), t:g, go:"g5|todos"}));
  const linhasOutros = s => s.outrosPorResp.map(o => ({nome:"Responsável: " + rotuloUnid(o.chave), t:o, go:"outros|todos"}));

  // Saldo = Frete − Indenização: verde (+) recebemos mais frete · vermelho (−) pagamos mais indenização
  const saldo = t => r2(t.frete - t.valor);
  function celDifHTML(t){
    const d = saldo(t);
    if(d === 0) return `<td class="n m">${brl(0)}</td><td class="n">Igual</td>`;
    return `<td class="n m dif ${d > 0 ? "mais" : "menos"}">${d > 0 ? "+" : "−"} ${brl(Math.abs(d))}</td><td class="n sit ${d > 0 ? "mais" : "menos"}">${d > 0 ? "Frete maior" : "Indenização maior"}</td>`;
  }
  const celPctHTML = t => { const q = razao(t); return `<td class="n">${q == null ? "—" : q > 10 ? "&gt;1000%" : pct(q)}</td>`; };

  // Tabela padrão: Casos · Mercadoria · Frete · Indenização · diferença · %
  function tabelaHTML(o){
    if(!o.linhas.length) return `<div class="ind-vazio-mini">${esc(o.vazio || "Nenhum caso nesse filtro.")}</div>`;
    const tr = l => `<tr ${l.go ? `data-ind-go="${esc(l.go)}" title="Ver os casos"` : ""}>
        <td class="ind-rk-nome">${esc(l.nome)}</td>
        ${o.funcao ? `<td>${esc(l.esp || "—")}</td>` : ""}
        <td class="n">${int(l.t.qtd)}</td>
        <td class="n m">${brl(l.t.merc)}</td>
        <td class="n m">${brl(l.t.frete)}</td>
        <td class="n m forte">${brl(l.t.valor)}</td>
        ${celDifHTML(l.t)}${celPctHTML(l.t)}
      </tr>`;
    return `<div class="table-wrap"><table class="ind-tbl ind-res">
      <thead><tr><th>${esc(o.cab)}</th>${o.funcao ? "<th>Função</th>" : ""}<th class="n">Casos</th><th class="n">Mercadoria</th><th class="n">Frete</th><th class="n">Indenização</th><th class="n">Frete − Indenização</th><th class="n">Situação</th><th class="n">Indeniz. ÷ Frete</th></tr></thead>
      <tbody>${o.linhas.map(tr).join("")}</tbody>
      <tfoot><tr><td ${o.funcao ? 'colspan="2"' : ""}>${esc(o.totalTxt)}</td><td class="n">${int(o.total.qtd)}</td><td class="n m">${brl(o.total.merc)}</td><td class="n m">${brl(o.total.frete)}</td><td class="n m">${brl(o.total.valor)}</td>${celDifHTML(o.total)}${celPctHTML(o.total)}</tr></tfoot>
    </table></div>`;
  }
  const LEGENDA_DIF = `<div class="ind-leg"><span><b class="mais">+ verde</b> frete maior que a indenização (recebemos mais do que pagamos)</span><span><b class="menos">− vermelho</b> indenização maior que o frete</span></div>`;

  /* ---- Dashboard (resumo enxuto) ---- */
  function dashboardHTML(){
    const d = carregar();
    const lista = linhasBase();
    const topo = barraTopoHTML(d);
    if(!lista.length){
      const tem = d.val.linhas.length + d.rva.linhas.length > 0;
      return topo + `<div class="ind-vazio"><strong>${tem ? "Nenhuma indenização nesse filtro." : "Nenhum relatório importado ainda."}</strong><span>${tem ? "Ajuste o sistema ou o período acima." : "Use os botões VAL / RVA acima para importar o CSV de indenização do SSW."}</span></div>`;
    }
    const s = resumo(lista);
    const P = v => s.total.valor ? v / s.total.valor : 0;
        const card = (cls, rot, t, extra) => `<div class="ind-hero-card ${cls}">
        <div class="ind-k-label">${rot}</div>
        <div class="ind-k-med">${brl(t.valor)}</div>
        <div class="ind-k-sub">${int(t.qtd)} caso(s) · ${pct(P(t.valor))} do total</div>${extra || ""}
      </div>`;

    return topo + `
    <div class="ind-hero">
      <div class="ind-hero-main">
        <div class="ind-k-label">Total pago de indenização</div>
        <div class="ind-k-big">${brl(s.total.valor)}</div>
        <div class="ind-k-sub">${int(s.total.qtd)} indenizações · ${esc(textoPeriodo())}</div>
        <div class="ind-split">
          <i class="val" style="width:${P(s.valle.valor) * 100}%"></i><i class="g5" style="width:${P(s.g5.valor) * 100}%"></i><i class="mtz" style="width:${P(s.matriz.valor) * 100}%"></i><i class="fil" style="width:${P(s.filiais.valor) * 100}%"></i><i class="out" style="width:${P(s.outros.valor) * 100}%"></i>
        </div>
        <div class="ind-split-leg"><span><b class="val"></b>Do Valle / Real Vale</span><span><b class="g5"></b>Parceiras G5</span><span><b class="mtz"></b>Matriz</span><span><b class="fil"></b>Filiais</span></div>
      </div>
      ${card("valle", "Pago pelo Do Valle / Real Vale", s.valle)}
      ${card("g5", "Pago pelas parceiras G5", s.g5, `<div class="ind-k-sub2"><span>${int(s.g5PorParceiro.length)} parceira(s)</span></div>`)}
      ${card("mtz", "Pago pela Matriz", s.matriz)}
      ${card("fil", "Pago pelas Filiais", s.filiais, `<div class="ind-k-sub2"><span>${int(s.porFilial.length)} filial(is)</span></div>`)}
    </div>
    ${s.outros.qtd ? `<div class="ind-nota">Inclui <b>${brl(s.outros.valor)}</b> de ${int(s.outros.qtd)} caso(s) a revisar (responsável diferente do destino). Defina quem pagou em <b>Casos Específicos → Revisar</b>. <button type="button" class="link-btn" data-ind-go="outros|todos">Ver casos</button></div>` : ""}

    <div class="panel ind-panel">
      <div class="panel-header">Matriz — quem pagou</div>
      ${tabelaHTML({cab:"Nome", funcao:true, linhas:linhasMatriz(s), totalTxt:"Total Matriz", total:s.matriz, vazio:"Nenhum caso da Matriz nesse filtro."})}
    </div>

    <div class="panel ind-panel">
      <div class="panel-header">Filiais — quanto cada uma pagou <span class="ind-hint">clique numa filial para ver os casos</span></div>
      ${tabelaHTML({cab:"Filial", linhas:linhasFiliais(s), totalTxt:"Total Filiais", total:s.filiais, vazio:"Nenhum caso de filial nesse filtro."})}
      ${s.porFilial.length ? LEGENDA_DIF : ""}
    </div>

    <div class="panel ind-panel">
      <div class="panel-header">Beneficiários que mais receberam indenização <span class="ind-hint">top 10 por valor</span></div>
      <div class="table-wrap"><table class="ind-tbl ind-res">
        <thead><tr><th>#</th><th>Beneficiário</th><th class="n">Casos</th><th class="n">Indenização</th><th class="n">% do total</th></tr></thead>
        <tbody>${s.beneficiarios.slice(0, 10).map((m, i) => `<tr><td>${i + 1}</td><td class="ind-rk-nome">${esc(m.chave)}</td><td class="n">${int(m.qtd)}</td><td class="n m forte">${brl(m.valor)}</td><td class="n">${pct(P(m.valor))}</td></tr>`).join("")}</tbody>
      </table></div>
    </div>

    <div class="ind-actions">
      <button type="button" class="btn btn-primary" id="indExportDash">Exportar Dashboard (Excel)</button>
      <button type="button" class="link-btn danger" id="indLimpar">Limpar dados importados</button>
    </div>`;
  }

  /* ---- Detalhado (o que não cabe no resumo) ---- */
  function detalhadoHTML(){
    const d = carregar();
    const lista = linhasBase();
    const topo = barraTopoHTML(d);
    if(!lista.length) return topo + `<div class="ind-vazio"><strong>Nada para detalhar.</strong><span>Importe o relatório ou ajuste o sistema/período acima.</span></div>`;
    const s = resumo(lista);
    return topo + `
    <div class="panel ind-panel">
      <div class="panel-header">Do Valle / Real Vale — por unidade de destino <span class="ind-hint">clique para ver os casos</span></div>
      ${tabelaHTML({cab:"Unidade de destino", cabCor:COR_VALLE, linhas:linhasValleDest(s), totalTxt:"Total Do Valle / Real Vale", total:s.valle, vazio:"Nenhum caso debitado ao Do Valle / Real Vale."})}
      ${s.valleDestino.length ? LEGENDA_DIF : ""}
    </div>
    ${s.g5.qtd ? `<div class="panel ind-panel">
      <div class="panel-header">Parceiras G5 — por parceira <span class="ind-hint">clique para ver os casos</span></div>
      ${tabelaHTML({cab:"Parceira", linhas:linhasG5(s), totalTxt:"Total Parceiras G5", total:s.g5})}
    </div>` : ""}
    ${s.outros.qtd ? `<div class="panel ind-panel">
      <div class="panel-header">Outros — a revisar <span class="ind-hint">responsável diferente do destino e da Matriz</span></div>
      ${tabelaHTML({cab:"Responsável", linhas:linhasOutros(s), totalTxt:"Total a revisar", total:s.outros})}
    </div>` : ""}
    <div class="ind-actions">
      <button type="button" class="btn btn-primary" id="indExportDet">Exportar Detalhado (Excel)</button>
    </div>`;
  }

  /* ---- Casos Específicos ---- */
  function casosFiltrados(){
    const f = estado.casos, b = norm(f.busca);
    return linhasBase().filter(r => {
      if(f.classe !== "todos" && r.classe !== f.classe) return false;
      if(f.destino !== "todos" && r.destino !== f.destino) return false;
      if(b && !norm([r.ctrc, r.nf, r.pagador, r.remetente, r.benef, r.motivo, r.debNome, r.debEsp, r.num, r.cpag].join(" ")).includes(b)) return false;
      return true;
    }).sort((a, c) => (c.indeniz || "").localeCompare(a.indeniz || "") || c.valor - a.valor);
  }

  function casosHTML(){
    const d = carregar();
    const topo = barraTopoHTML(d);
    const base = linhasBase();
    if(!base.length){
      return topo + `<div class="ind-vazio"><strong>Nenhum caso para mostrar.</strong><span>Importe o relatório ou ajuste o sistema/período acima.</span></div>`;
    }
    const cont = {todos:base.length, matriz:0, filial:0, valle:0, g5:0, outros:0};
    base.forEach(r => cont[r.classe]++);
    const destinos = Array.from(new Set(base.map(r => r.destino).filter(Boolean))).sort();
    const lista = casosFiltrados();
    const t = somar(lista);
    const unidades = Array.from(new Set(base.flatMap(r => [r.resp, r.destino]).filter(x => x && x !== "MTZ" && !ehParceira(x)))).sort();
    const parceiras = Object.keys(NOMES_UNID).filter(k => k !== "EP").sort();
    const opcoes = atual => {
      const o = (v, txt) => `<option value="${esc(v)}" ${atual === v ? "selected" : ""}>${esc(txt)}</option>`;
      return `<option value="">${atual ? "↩ Voltar ao automático" : "Definir quem pagou…"}</option>`
        + o("matriz", "Matriz")
        + `<optgroup label="Filial">${unidades.map(u => o("filial:" + u, "Filial " + u)).join("")}</optgroup>`
        + `<optgroup label="Do Valle / Real Vale">${o("valle:Valle", "Do Valle")}${o("valle:Real Vale", "Real Vale")}</optgroup>`
        + `<optgroup label="Parceiras G5">${parceiras.map(p => o("g5:" + p, rotuloUnid(p))).join("")}</optgroup>`;
    };
    const badge = r => `<span class="ind-badge ${r.classe}">${esc(rotuloQuem(r))}</span>`
      + (r.manual ? `<small class="ind-man">✎ definido por você</small>` : "")
      + (r.obs ? `<small class="ind-obs">${esc(r.obs)}</small>` : "");
    const editor = r => (r.classe === "outros" || r.manual)
      ? `<select class="ind-def" data-ind-def="${esc(chaveCaso(r))}" title="Definir quem pagou este caso">${opcoes(r.manual ? valorDeManual(r) : "")}</select>` : "";
    const chip = (k, nome) => `<button type="button" class="ind-seg ${estado.casos.classe === k ? "active" : ""}" data-ind-classe="${k}">${nome} <em>${cont[k]}</em></button>`;
    return topo + `
    <div class="ind-toolbar">
      <div class="ind-segs">${chip("todos", "Todos")}${chip("matriz", "Matriz")}${chip("filial", "Filiais")}${chip("valle", "Do Valle / Real Vale")}${chip("g5", "Parceiras G5")}${chip("outros", "Revisar")}</div>
      <div class="ind-filtros">
        <label>Unid. destino
          <select id="indCDestino"><option value="todos">Todas</option>${destinos.map(x => `<option value="${esc(x)}" ${estado.casos.destino===x?'selected':''}>${esc(x)}</option>`).join("")}</select>
        </label>
        <label>Buscar <input type="text" id="indCBusca" placeholder="CTRC, NF, cliente, debitado, motivo…" value="${esc(estado.casos.busca)}"></label>
        ${(estado.casos.destino !== "todos" || estado.casos.busca || estado.casos.classe !== "todos") ? '<button type="button" class="link-btn" id="indCLimpar">Limpar</button>' : ""}
      </div>
    </div>
    <div class="panel ind-panel">
      <div class="panel-header">${int(t.qtd)} indenização(ões) · <span class="ind-hl">${brl(t.valor)}</span> <span class="ind-hint">Excel traz todas as colunas do relatório</span></div>
      <div class="table-wrap"><table class="ind-tbl ind-casos">
        <thead><tr><th>Quem pagou</th><th>CTRC</th><th>NF</th><th>Indenizado</th><th>Destino</th><th>Cliente (pagador)</th><th>Motivo</th><th>Debitado</th><th class="n">Frete</th><th class="n">Mercadoria</th><th class="n">Indenização</th></tr></thead>
        <tbody>
          ${lista.map(r => `<tr class="${r.classe}">
            <td>${badge(r)}${editor(r)}</td>
            <td class="mono">${esc(r.ctrc)}<small>${esc(r.origem.toUpperCase())} · ${esc(r.tipo)}</small></td>
            <td class="mono">${esc(r.nf)}</td>
            <td>${dataBR(r.indeniz)}</td>
            <td><strong>${esc(rotuloUnid(r.destino))}</strong><small>resp. ${esc(r.resp)}</small></td>
            <td class="txt" title="${esc(r.pagador)}">${esc(r.pagador)}</td>
            <td class="txt" title="${esc(r.motivo)}">${esc(r.motivo)}</td>
            <td class="txt" title="${esc(r.debNome)}">${esc(r.debNome)}<small>${esc(r.debEsp)}</small></td>
            <td class="n m">${brl(r.frete)}</td><td class="n m">${brl(r.merc)}</td><td class="n m forte">${brl(r.valor)}</td>
          </tr>`).join("") || `<tr><td colspan="11" class="ind-vazio-mini">Nenhum caso com esses filtros.</td></tr>`}
        </tbody>
        <tfoot><tr><td colspan="8">Total (${int(t.qtd)})</td><td class="n m">${brl(t.frete)}</td><td class="n m">${brl(t.merc)}</td><td class="n m">${brl(t.valor)}</td></tr></tfoot>
      </table></div>
    </div>
    <div class="ind-actions">
      <button type="button" class="btn btn-primary" id="indExportCasos">Exportar Casos Específicos (Excel)</button>
    </div>`;
  }

  function rotuloQuem(r, excel){
    if(r.classe === "matriz") return "Matriz";
    if(r.classe === "filial") return "Filial " + r.quem;
    if(r.classe === "valle"){ const n = r.emp === "Valle" ? "Do Valle" : r.emp; return excel ? "Debitado ao " + n : n; }
    if(r.classe === "g5") return "G5 · " + rotuloUnid(r.quem);
    return "Revisar · " + r.quem;
  }

  function textoPeriodo(){
    const sist = estado.origem === "todos" ? "VAL + RVA" : estado.origem.toUpperCase();
    const per = (estado.de || estado.ate)
      ? "indenizados " + [estado.de ? "de " + dataBR(estado.de) : "", estado.ate ? "até " + dataBR(estado.ate) : ""].filter(Boolean).join(" ")
      : "todo o período importado";
    return sist + " · " + per;
  }

  /* ================= EXCEL ================= */
  const XL = {NAVY:"FF0F1C47", NAVY2:"FF152253", BLUE:"FF2C4BB0", GOLD:"FFC99A2E", GOLDL:"FFF4E3B0", GRAY:"FFF2F3F7",
              LINE:"FFDDE1EE", TEXT:"FF1C2333", MUTED:"FF6B7286", AMBL:"FFFFF4E0", GREEN:"FF1E7D3C", RED:"FFB3261E", WHITE:"FFFFFFFF"};
  const FMT_BRL = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const fonte = (o) => Object.assign({name:"Calibri", size:11, color:{argb:XL.TEXT}}, o || {});
  const fill = argb => ({type:"pattern", pattern:"solid", fgColor:{argb}});
  const borda = (argb, estilo) => ({style:estilo || "thin", color:{argb:argb || XL.LINE}});

  function paraDate(iso){
    const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }
  async function baixarWorkbook(wb, nome){
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
    const a = document.createElement("a"); a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function novoWorkbook(){
    if(typeof ExcelJS === "undefined"){ alert("Não consegui carregar a biblioteca de Excel (ExcelJS). Verifique a internet e recarregue a página."); return null; }
    const wb = new ExcelJS.Workbook(); wb.creator = "Painel"; wb.created = new Date(); return wb;
  }
  function faixaTitulo(ws, linha, de, ate, texto, o){
    ws.mergeCells(linha, de, linha, ate);
    const c = ws.getCell(linha, de);
    c.value = texto; c.font = fonte({size:o.size, bold:o.bold, color:{argb:o.cor}});
    c.fill = fill(o.fundo); c.alignment = {vertical:"middle", horizontal:"left", indent:1};
    for(let k = de; k <= ate; k++) ws.getCell(linha, k).fill = fill(o.fundo);
    ws.getRow(linha).height = o.altura;
  }

  // ===== Excel para IMPRESSÃO: preto no branco, tabelas simples =====
  // A margem | B nome | C função | D casos | E mercadoria | F frete | G indenização | H saldo | I situação | J %
  const COLS_XL = [2, 38, 20, 9, 18, 16, 18, 22, 18, 14];
  const LAST = 10;
  const FMT_DIF = '"+ R$" #,##0.00;"− R$" #,##0.00;"R$" 0.00';
  const PRETO = "FF000000", CINZA = "FFE6E6E6", CINZA2 = "FF8C8C8C";
  const COR_VALLE = "FFC6E8D0", COR_MTZ = "FFF4E3B0", COR_FIL = "FFD3DDF7";   // só nos cabeçalhos, para diferenciar
  const colL = k => String.fromCharCode(64 + k);
  const ftx = o => fonte(Object.assign({color:{argb:PRETO}}, o || {}));
  const bd = (estilo, cor) => ({style:estilo, color:{argb:cor || PRETO}});

  // Saldo = Frete − Indenização: verde (+) recebemos mais frete · vermelho (−) pagamos mais indenização
  function corSaldo(ws, L, t){
    const d = r2(t.frete - t.valor);
    if(d === 0) return;
    [8, 9].forEach(k => { ws.getCell(L, k).font = ftx({bold:true, color:{argb:d > 0 ? "FF00802B" : "FFD00000"}}); });
  }
  function novaPlanilha(wb, nome, umaFolha){
    const ws = wb.addWorksheet(nome, {views:[{showGridLines:false}], pageSetup:{orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, paperSize:9, blackAndWhite:true, horizontalCentered:true, margins:{left:0.4, right:0.4, top:0.25, bottom:0.35, header:0.1, footer:0.15}}});
    COLS_XL.forEach((w, i) => ws.getColumn(i + 1).width = w);
    ws.getRow(1).height = 3;   // sem folga em cima: o título sobe para o topo da página
    return ws;
  }
  // Quebra de página SÓ entre tabelas (nunca no meio de uma): "inicios" = 1ª linha de cada bloco,
  // "fim" = última linha usada. Calcula quantas linhas cabem numa folha A4 paisagem na escala de impressão.
  function paginarXL(ws, inicios, fim, cols){
    const largPt = (cols || COLS_XL).reduce((a, w) => a + (w * 7 + 5) * 0.75, 0);
    const escala = Math.min(1, (841.9 - 0.8 * 72) / largPt);
    const cabePt = ((595.3 - 0.6 * 72) / escala) * 0.93;           // 7% de folga
    const alt = (a, b) => { let h = 0; for(let i = a; i <= b; i++) h += ws.getRow(i).height || 15; return h; };
    let pagIni = 1;
    inicios.forEach((ini, k) => {
      const blocoFim = (k + 1 < inicios.length ? inicios[k + 1] : fim + 1) - 1;
      if(ini > pagIni && alt(pagIni, blocoFim) > cabePt){ ws.getRow(ini - 1).addPageBreak(); pagIni = ini; }
    });
  }
  function bannerXL(ws, titulo){
    ws.mergeCells(2, 2, 2, LAST);
    const t = ws.getCell(2, 2); t.value = titulo; t.font = ftx({size:16, bold:true}); t.alignment = {vertical:"middle"};
    ws.getRow(2).height = 28;
    ws.mergeCells(3, 2, 3, LAST);
    const s = ws.getCell(3, 2); s.value = textoPeriodo() + "   ·   gerado em " + new Date().toLocaleString("pt-BR"); s.font = ftx({size:10, color:{argb:"FF444444"}});
    for(let k = 2; k <= LAST; k++) ws.getCell(3, k).border = {bottom:bd("medium")};
    ws.getRow(4).height = 10;
  }
  function notaXL(ws, L, texto){
    ws.mergeCells(L, 2, L, LAST);
    const c = ws.getCell(L, 2); c.value = texto; c.font = ftx({size:9, italic:true, color:{argb:"FF444444"}}); c.alignment = {wrapText:true, vertical:"top"};
  }
  function tituloXL(ws, L, texto){
    ws.mergeCells(L, 2, L, LAST);
    const c = ws.getCell(L, 2); c.value = texto; c.font = ftx({size:12, bold:true}); c.alignment = {vertical:"middle"};
    for(let k = 2; k <= LAST; k++) ws.getCell(L, k).border = {bottom:bd("thin")};
    ws.getRow(L).height = 22;
  }
  function cabXL(ws, L, itens, cor){
    cor = cor || CINZA;
    itens.forEach(([k, txt, al]) => {
      const c = ws.getCell(L, k); c.value = txt; c.font = ftx({size:10, bold:true}); c.fill = fill(cor);
      c.alignment = {vertical:"middle", horizontal:al || "left", wrapText:true};
    });
    for(let k = 2; k <= LAST; k++){ const c = ws.getCell(L, k); c.fill = fill(cor); c.border = {top:bd("thin"), bottom:bd("thin")}; }
    ws.getRow(L).height = 26;
  }
  function totalXL(ws, L){
    for(let k = 2; k <= LAST; k++){ const c = ws.getCell(L, k); c.fill = fill(CINZA); c.font = ftx({bold:true}); c.border = {top:bd("medium"), bottom:bd("medium")}; }
    ws.getRow(L).height = 23;
  }

  // Tabela padrão: Casos · Mercadoria · Frete · Indenização · diferença · %
  function tabelaXL(ws, L, o){
    tituloXL(ws, L, o.titulo); L++;
    if(!o.linhas.length){
      ws.getCell(L, 2).value = o.vazio || "Nenhum caso no filtro."; ws.getCell(L, 2).font = ftx({italic:true});
      return L + 2;
    }
    if(!o.funcao) ws.mergeCells(L, 2, L, 3);
    cabXL(ws, L, [[2, o.cab], ...(o.funcao ? [[3, "Função"]] : []), [4, "Casos", "right"], [5, "Mercadoria", "right"], [6, "Frete", "right"], [7, "Indenização", "right"], [8, "Frete − Indenização", "right"], [9, "Situação", "right"], [10, "Indeniz. ÷ Frete", "right"]], o.cabCor);
    L++;
    const ini = L;
    const formulas = (l, r) => {
      const d = r2(r.frete - r.valor);
      const f = ws.getCell(l, 8); f.value = {formula:`F${l}-G${l}`, result:d}; f.numFmt = FMT_DIF;
      const sit = ws.getCell(l, 9); sit.value = {formula:`IF(F${l}=G${l},"Igual",IF(F${l}>G${l},"Frete maior","Indenização maior"))`, result:d === 0 ? "Igual" : d > 0 ? "Frete maior" : "Indenização maior"};
      const p = ws.getCell(l, 10); p.value = {formula:`IF(F${l}=0,"",IF(G${l}/F${l}>10,">1000%",G${l}/F${l}))`, result:r.frete > 0 ? (r.valor / r.frete > 10 ? ">1000%" : r.valor / r.frete) : ""}; p.numFmt = "0.0%";
    };
    o.linhas.forEach(ln => {
      if(!o.funcao) ws.mergeCells(L, 2, L, 3);
      const t = ln.t;
      ws.getCell(L, 2).value = ln.nome; if(o.funcao) ws.getCell(L, 3).value = ln.esp || "—";
      ws.getCell(L, 4).value = t.qtd; ws.getCell(L, 5).value = r2(t.merc); ws.getCell(L, 6).value = r2(t.frete); ws.getCell(L, 7).value = r2(t.valor);
      formulas(L, t);
      for(let k = 2; k <= LAST; k++){
        const c = ws.getCell(L, k); c.border = {bottom:bd("hair", CINZA2)}; c.font = ftx({bold:k === 7});
        c.alignment = k <= 3 ? {vertical:"middle", indent:0} : {vertical:"middle", horizontal:"right"};
      }
      [5, 6, 7].forEach(k => ws.getCell(L, k).numFmt = FMT_BRL);
      corSaldo(ws, L, t);
      ws.getRow(L).height = 20; L++;
    });
    const fim = L - 1;
    if(!o.funcao) ws.mergeCells(L, 2, L, 3);
    ws.getCell(L, 2).value = o.totalTxt;
    [4, 5, 6, 7].forEach(k => { const c = ws.getCell(L, k); c.value = {formula:`SUM(${colL(k)}${ini}:${colL(k)}${fim})`, result:r2(o.total[["", "", "", "qtd", "merc", "frete", "valor"][k - 1]])}; if(k > 4) c.numFmt = FMT_BRL; });
    formulas(L, o.total);
    totalXL(ws, L);
    for(let k = 4; k <= LAST; k++) ws.getCell(L, k).alignment = {vertical:"middle", horizontal:"right"};
    corSaldo(ws, L, o.total);
    ws.getCell(L, 2).alignment = {vertical:"middle"};
    return L + 2;
  }

  // Beneficiários que mais receberam (top 10 por valor)
  function beneficiariosXL(ws, L, s){
    tituloXL(ws, L, "BENEFICIÁRIOS QUE MAIS RECEBERAM INDENIZAÇÃO — top 10 por valor"); L++;
    ws.mergeCells(L, 2, L, 3);
    cabXL(ws, L, [[2, "Beneficiário"], [4, "Casos", "right"], [5, "Indenização", "right"], [6, "% do total", "right"]]);
    L++;
    s.beneficiarios.slice(0, 10).forEach((m, i) => {
      ws.mergeCells(L, 2, L, 3);
      ws.getCell(L, 2).value = (i + 1) + ". " + m.chave; ws.getCell(L, 4).value = m.qtd;
      ws.getCell(L, 5).value = r2(m.valor); ws.getCell(L, 6).value = s.total.valor ? m.valor / s.total.valor : 0;
      for(let k = 2; k <= 6; k++){ const c = ws.getCell(L, k); c.border = {bottom:bd("hair", CINZA2)}; c.font = ftx({bold:k === 5}); if(k > 3) c.alignment = {vertical:"middle", horizontal:"right"}; }
      ws.getCell(L, 5).numFmt = FMT_BRL; ws.getCell(L, 6).numFmt = "0.0%";
      ws.getRow(L).height = 20; L++;
    });
    for(let k = 2; k <= 6; k++) ws.getCell(L - 1, k).border = {bottom:bd("medium")};
    return L + 1;
  }

  // ===== Abas de casos (Matriz e uma por filial): quem pagou, cada caso e o motivo =====
  const COLS_CASOS = [2, 11, 14, 12, 34, 24, 24, 14, 16, 16, 18];   // A margem | B Data · C CTRC · D NF · E Motivo · F Cliente · G Benef. · H Frete · I Merc. · J Indeniz. · K Saldo
  const LASTC = 11;
  // linhas necessárias para um texto numa coluna de "larg" caracteres (fonte 9)
  const nLinhas = (txt, larg) => Math.max(1, Math.ceil(String(txt || "").length / (larg * 1.05)));
  function abaCasosXL(wb, nomeAba, titulo, casos, cor){
    let nome = String(nomeAba).replace(/[\[\]:*?\/\\]/g, " ").trim().slice(0, 31) || "Aba";
    let n = nome, i = 2; while(wb.getWorksheet(n)) n = nome.slice(0, 28) + " " + (i++);

    const grupos = new Map();
    casos.forEach(r => {
      const nm = r.nomeExib || r.debNome || "(sem nome)";
      const k = norm(nm);
      if(!grupos.has(k)) grupos.set(k, {nome:nm, esp:r.debEsp, lista:[]});
      grupos.get(k).lista.push(r);
    });
    const gs = Array.from(grupos.values()).map(g => Object.assign(g, {t:somar(g.lista)})).sort((a, b) => b.t.valor - a.t.valor);
    const ws = wb.addWorksheet(n, {views:[{showGridLines:false}], pageSetup:{orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, paperSize:9, blackAndWhite:true, horizontalCentered:true, margins:{left:0.4, right:0.4, top:0.3, bottom:0.35, header:0.1, footer:0.15}}});
    COLS_CASOS.forEach((w, k) => ws.getColumn(k + 1).width = w);
    ws.getRow(1).height = 3;

    const T = somar(casos);
    ws.mergeCells(2, 2, 2, LASTC);
    const t = ws.getCell(2, 2); t.value = titulo; t.font = ftx({size:16, bold:true}); t.alignment = {vertical:"middle"}; ws.getRow(2).height = 28;
    ws.mergeCells(3, 2, 3, LASTC);
    const sb = ws.getCell(3, 2);
    sb.value = `${textoPeriodo()}   ·   ${casos.length} caso(s)   ·   gerado em ${new Date().toLocaleString("pt-BR")}`;
    sb.font = ftx({size:10, color:{argb:"FF444444"}});
    for(let k = 2; k <= LASTC; k++) ws.getCell(3, k).border = {bottom:bd("medium")};

    const corSaldoCel = (cel, frete, valor, tam) => { const d = r2(frete - valor); cel.font = ftx({size:tam || 9, bold:true, color:{argb:d > 0 ? "FF00802B" : d < 0 ? "FFD00000" : PRETO}}); };
    const FMT_SALDO = FMT_DIF;
    let L = 5;
    const blocos = [];

    // ---- 1) RESUMO: uma linha por pessoa (visão geral antes do detalhe) ----
    if(gs.length > 1){
      blocos.push(L);
      ws.mergeCells(L, 2, L, LASTC);
      const rt = ws.getCell(L, 2); rt.value = "RESUMO — quanto cada um pagou"; rt.font = ftx({size:12, bold:true});
      for(let k = 2; k <= LASTC; k++) ws.getCell(L, k).border = {bottom:bd("thin")};
      ws.getRow(L).height = 22; L++;
      ws.mergeCells(L, 2, L, 5);
      [[2, "Nome"], [6, "Função"], [8, "Casos", "right"], [9, "Mercadoria", "right"], [10, "Indenização", "right"], [11, "Frete − Indenização", "right"]].forEach(([k, txt, al]) => {
        const x = ws.getCell(L, k); x.value = txt; x.alignment = {vertical:"middle", horizontal:al || "left", wrapText:true};
      });
      for(let k = 2; k <= LASTC; k++){ const x = ws.getCell(L, k); x.font = ftx({size:9, bold:true}); x.fill = fill(CINZA); x.border = {top:bd("thin"), bottom:bd("thin")}; }
      ws.getRow(L).height = 20; L++;
      gs.forEach(g => {
        ws.mergeCells(L, 2, L, 5);
        ws.getCell(L, 2).value = g.nome; ws.getCell(L, 6).value = g.esp || "—";
        ws.getCell(L, 8).value = g.lista.length; ws.getCell(L, 9).value = r2(g.t.merc); ws.getCell(L, 10).value = r2(g.t.valor);
        const sc = ws.getCell(L, 11); sc.value = r2(g.t.frete - g.t.valor);   // coluna H do resumo é "Casos", então o saldo vai como valor
        for(let k = 2; k <= LASTC; k++){ const x = ws.getCell(L, k); x.font = ftx({size:10, bold:k === 10}); x.border = {bottom:bd("hair", CINZA2)}; x.alignment = {vertical:"middle", horizontal:k >= 8 ? "right" : "left"}; }
        [9, 10].forEach(k => ws.getCell(L, k).numFmt = FMT_BRL);
        sc.numFmt = FMT_SALDO; corSaldoCel(sc, g.t.frete, g.t.valor, 10);
        ws.getRow(L).height = 19; L++;
      });
      ws.mergeCells(L, 2, L, 5);
      ws.getCell(L, 2).value = "TOTAL";
      ws.getCell(L, 8).value = casos.length; ws.getCell(L, 9).value = r2(T.merc); ws.getCell(L, 10).value = r2(T.valor); ws.getCell(L, 11).value = r2(T.frete - T.valor);
      for(let k = 2; k <= LASTC; k++){ const x = ws.getCell(L, k); x.font = ftx({size:10, bold:true}); x.fill = fill(CINZA); x.border = {top:bd("medium"), bottom:bd("medium")}; x.alignment = {vertical:"middle", horizontal:k >= 8 ? "right" : "left"}; }
      [9, 10].forEach(k => ws.getCell(L, k).numFmt = FMT_BRL);
      ws.getCell(L, 11).numFmt = FMT_SALDO; corSaldoCel(ws.getCell(L, 11), T.frete, T.valor, 10);
      ws.getRow(L).height = 21; L += 2;
    }

    // ---- 2) um bloco por pessoa: faixa escura com o nome, depois os casos ----
    gs.forEach(g => {
      blocos.push(L);
      ws.mergeCells(L, 2, L, 7);
      const c = ws.getCell(L, 2);
      c.value = g.nome + (g.esp ? "   ·   " + g.esp : "");
      ws.mergeCells(L, 8, L, LASTC);
      const d = ws.getCell(L, 8);
      d.value = `${g.lista.length} caso(s)   ·   ${brl(g.t.valor)}`;
      for(let k = 2; k <= LASTC; k++){ const x = ws.getCell(L, k); x.fill = fill("FF222222"); x.font = ftx({size:11, bold:true, color:{argb:XL.WHITE}}); }
      c.alignment = {vertical:"middle", indent:1}; d.alignment = {vertical:"middle", horizontal:"right", indent:1};
      ws.getRow(L).height = 24; L++;
      [[2, "Indenizado"], [3, "CTRC"], [4, "NF"], [5, "Motivo"], [6, "Cliente (pagador)"], [7, "Beneficiário"], [8, "Frete", "right"], [9, "Mercadoria", "right"], [10, "Indenização", "right"], [11, "Frete − Indenização", "right"]].forEach(([k, txt, al]) => {
        const x = ws.getCell(L, k); x.value = txt; x.alignment = {vertical:"middle", horizontal:al || "left", wrapText:true};
      });
      for(let k = 2; k <= LASTC; k++){ const x = ws.getCell(L, k); x.font = ftx({size:9, bold:true}); x.fill = fill(CINZA); x.border = {bottom:bd("thin")}; }
      ws.getRow(L).height = 20; L++;
      const ini = L;
      g.lista.slice().sort((a, b) => (b.indeniz || "").localeCompare(a.indeniz || "") || b.valor - a.valor).forEach((r, idx) => {
        const vals = [paraDate(r.indeniz), r.ctrc, r.nf, r.motivo, r.pagador, r.benef, r2(r.frete), r2(r.merc), r2(r.valor)];
        vals.forEach((v, k) => {
          const x = ws.getCell(L, k + 2); x.value = (v === "" || v === null) ? null : v;
          x.font = ftx({size:9, bold:k === 8 || k === 3}); x.border = {bottom:bd("hair", CINZA2)};
          x.alignment = {vertical:"middle", horizontal:k >= 6 ? "right" : "left", wrapText:k >= 3 && k <= 5};
          if(k === 0) x.numFmt = "dd/mm/yyyy";
          if(k >= 6) x.numFmt = FMT_BRL;
        });
        const sc = ws.getCell(L, 11); sc.value = {formula:`H${L}-J${L}`, result:r2(r.frete - r.valor)}; sc.numFmt = FMT_SALDO;
        sc.alignment = {vertical:"middle", horizontal:"right"}; sc.border = {bottom:bd("hair", CINZA2)};
        corSaldoCel(sc, r.frete, r.valor);
        ws.getRow(L).height = Math.max(nLinhas(r.motivo, COLS_CASOS[4]), nLinhas(r.pagador, COLS_CASOS[5]), nLinhas(r.benef, COLS_CASOS[6])) * 12 + 6;
        L++;
      });
      const fim = L - 1;
      // subtotal da pessoa
      ws.mergeCells(L, 2, L, 7);
      ws.getCell(L, 2).value = "Total — " + g.nome;
      [[8, "frete"], [9, "merc"], [10, "valor"]].forEach(([k, f]) => { const x = ws.getCell(L, k); x.value = {formula:`SUM(${colL(k)}${ini}:${colL(k)}${fim})`, result:r2(g.t[f])}; x.numFmt = FMT_BRL; });
      const sc = ws.getCell(L, 11); sc.value = {formula:`H${L}-J${L}`, result:r2(g.t.frete - g.t.valor)}; sc.numFmt = FMT_SALDO;
      for(let k = 2; k <= LASTC; k++){ const x = ws.getCell(L, k); x.font = ftx({size:10, bold:true}); x.border = {top:bd("thin"), bottom:bd("medium")}; x.alignment = {horizontal:k >= 8 ? "right" : "left", vertical:"middle"}; }
      corSaldoCel(sc, g.t.frete, g.t.valor, 10);
      ws.getRow(L).height = 21; L += 2;
    });
    blocos.push(L);
    ws.mergeCells(L, 2, L, LASTC);
    const nt = ws.getCell(L, 2); nt.value = "Frete − Indenização: verde (+) recebemos mais frete do que pagamos de indenização · vermelho (−) pagamos mais indenização do que recebemos de frete."; nt.font = ftx({size:8, italic:true, color:{argb:"FF444444"}});
    paginarXL(ws, blocos, L, COLS_CASOS);
    return ws;
  }

  async function exportarDashboard(){
    const lista = linhasBase();
    if(!lista.length){ alert("Não há indenizações para exportar."); return; }
    const wb = novoWorkbook(); if(!wb) return;
    const s = resumo(lista);
    const ws = novaPlanilha(wb, "Dashboard", true);   // Dashboard sempre numa folha só
    bannerXL(ws, "INDENIZAÇÕES PAGAS");
    const pc = v => s.total.valor ? " — " + pct(v / s.total.valor) + " do total" : "";
    const linhas = [
      {nome:"Do Valle / Real Vale" + pc(s.valle.valor), t:s.valle},
      {nome:"Matriz" + pc(s.matriz.valor), t:s.matriz},
      {nome:"Filiais" + pc(s.filiais.valor), t:s.filiais}
    ];
    if(s.g5.qtd) linhas.splice(1, 0, {nome:"Parceiras G5" + pc(s.g5.valor), t:s.g5});
    if(s.outros.qtd) linhas.push({nome:"Outros (a revisar)" + pc(s.outros.valor), t:s.outros});
    let L = 5;
    const blocos = [5];
    L = tabelaXL(ws, L, {titulo:"RESUMO — quem pagou", cab:"Pagador", cabCor:COR_VALLE, linhas, totalTxt:"TOTAL PAGO DE INDENIZAÇÃO", total:s.total});
    blocos.push(L);
    L = tabelaXL(ws, L, {titulo:"MATRIZ — quem pagou", cab:"Nome", funcao:true, cabCor:COR_MTZ, linhas:linhasMatriz(s), totalTxt:"TOTAL MATRIZ", total:s.matriz, vazio:"Nenhum caso da Matriz no filtro."});
    blocos.push(L);
    L = tabelaXL(ws, L, {titulo:"FILIAIS — quanto cada uma pagou", cab:"Filial", cabCor:COR_FIL, linhas:linhasFiliais(s), totalTxt:"TOTAL FILIAIS", total:s.filiais, vazio:"Nenhum caso de filial no filtro."});
    blocos.push(L);
    L = beneficiariosXL(ws, L, s);
    blocos.push(L);
    notaXL(ws, L, "Frete − Indenização. Verde (+): recebemos mais frete do que pagamos de indenização. Vermelho (−): pagamos mais indenização do que recebemos de frete. Indeniz. ÷ Frete = quanto a indenização representa do frete."); L++;
    notaXL(ws, L, "Do Valle / Real Vale e Parceiras G5 = debitado à transportadora do grupo / parceira. Matriz = responsável MTZ (Anselmo é sempre Matriz). Filial = responsável igual ao destino, ou filial do funcionário debitado.");
    paginarXL(ws, blocos, L);
    // planilha só do Do Valle / Real Vale
    const wv = novaPlanilha(wb, "Do Valle - Real Vale");
    bannerXL(wv, "INDENIZAÇÕES — DO VALLE / REAL VALE");
    let V = 5;
    V = tabelaXL(wv, V, {titulo:"TOTAL — debitado à transportadora do grupo", cab:"Pagador", cabCor:COR_VALLE, linhas:[{nome:"Do Valle / Real Vale", t:s.valle}], totalTxt:"TOTAL DO VALLE / REAL VALE", total:s.valle, vazio:"Nenhum caso debitado ao Do Valle / Real Vale."});
    V = tabelaXL(wv, V, {titulo:"POR UNIDADE DE DESTINO", cab:"Unidade de destino", cabCor:COR_VALLE, linhas:linhasValleDest(s), totalTxt:"TOTAL DO VALLE / REAL VALE", total:s.valle});
    notaXL(wv, V, "Frete − Indenização. Verde (+): recebemos mais frete do que pagamos de indenização. Vermelho (−): pagamos mais indenização do que recebemos de frete. Indeniz. ÷ Frete = quanto a indenização representa do frete.");
    // Matriz: cada pessoa, o que pagou e o motivo
    const casosMtz = lista.filter(r => r.classe === "matriz");
    if(casosMtz.length) abaCasosXL(wb, "Matriz - Casos", "MATRIZ — quem pagou e o motivo", casosMtz, COR_MTZ);
    // uma aba por filial: quem pagou na filial e o motivo
    s.porFilial.forEach(f => {
      const casosF = lista.filter(r => r.classe === "filial" && r.quem === f.chave);
      abaCasosXL(wb, "Filial " + f.chave, "FILIAL " + rotuloUnid(f.chave) + " — quem pagou e o motivo", casosF, COR_FIL);
    });
    await baixarWorkbook(wb, `Indenizacao_Dashboard_${window.dataParaArquivo()}.xlsx`);
  }

  async function exportarDetalhado(){
    const lista = linhasBase();
    if(!lista.length){ alert("Não há indenizações para exportar."); return; }
    const wb = novoWorkbook(); if(!wb) return;
    const s = resumo(lista);
    const ws = novaPlanilha(wb, "Detalhado");
    bannerXL(ws, "INDENIZAÇÕES — DETALHADO");
    let L = 5;
    L = tabelaXL(ws, L, {titulo:"DO VALLE / REAL VALE — por unidade de destino", cab:"Unidade de destino", cabCor:COR_VALLE, linhas:linhasValleDest(s), totalTxt:"TOTAL DO VALLE / REAL VALE", total:s.valle, vazio:"Nenhum caso debitado ao Do Valle / Real Vale."});
    if(s.g5.qtd) L = tabelaXL(ws, L, {titulo:"PARCEIRAS G5 — por parceira", cab:"Parceira", linhas:linhasG5(s), totalTxt:"TOTAL PARCEIRAS G5", total:s.g5});
    if(s.outros.qtd) L = tabelaXL(ws, L, {titulo:"OUTROS — a revisar (responsável diferente do destino e da Matriz)", cab:"Responsável", linhas:linhasOutros(s), totalTxt:"TOTAL A REVISAR", total:s.outros});
    notaXL(ws, L, "Frete − Indenização. Verde (+): recebemos mais frete do que pagamos de indenização. Vermelho (−): pagamos mais indenização do que recebemos de frete. Indeniz. ÷ Frete = quanto a indenização representa do frete.");
    await baixarWorkbook(wb, `Indenizacao_Detalhado_${window.dataParaArquivo()}.xlsx`);
  }

  async function exportarCasos(){
    const lista = casosFiltrados();
    if(!lista.length){ alert("Não há casos para exportar com esses filtros."); return; }
    const wb = novoWorkbook(); if(!wb) return;
    const f = estado.casos;
    const filtros = [f.classe !== "todos" ? CLASSES[f.classe].label : "", f.destino !== "todos" ? "destino " + f.destino : "", f.busca ? `busca "${f.busca}"` : ""].filter(Boolean).join(" · ");
    const ws = wb.addWorksheet("Casos Específicos", {views:[{showGridLines:false}], pageSetup:{orientation:"landscape", fitToPage:true, fitToWidth:1, fitToHeight:0, paperSize:9}});
    const cols = [
      ["Sistema", 9, r => r.origem.toUpperCase()],
      ["Quem pagou", 22, r => rotuloQuem(r, true)],
      ["Observação", 34, r => [r.manual ? "Definido manualmente" : "", r.obs].filter(Boolean).join(" · ")],
      ["CTRC", 15, r => r.ctrc],
      ["Tipo do documento", 15, r => r.tipo],
      ["Nota fiscal", 13, r => r.nf],
      ["Emissão", 12, r => paraDate(r.emiss), "dd/mm/yyyy"],
      ["Indenizado em", 13, r => paraDate(r.indeniz), "dd/mm/yyyy"],
      ["Prev. pagamento", 13, r => paraDate(r.prev), "dd/mm/yyyy"],
      ["Unid. responsável", 12, r => r.resp],
      ["Unid. destino", 12, r => r.destino],
      ["Pagador", 34, r => r.pagador],
      ["Remetente", 34, r => r.remetente],
      ["Beneficiário", 34, r => r.benef],
      ["Motivo", 44, r => r.motivo],
      ["Valor frete", 15, r => r2(r.frete), FMT_BRL],
      ["Valor mercadoria", 17, r => r2(r.merc), FMT_BRL],
      ["Valor indenização", 18, r => r2(r.valor), FMT_BRL],
      ["Nº indenização", 14, r => r.num],
      ["CPAG", 13, r => r.cpag],
      ["Debitado (nome)", 36, r => r.debNome],
      ["Especialidade do debitado", 24, r => r.debEsp],
      ["Evento", 9, r => r.evento]
    ];
    cols.forEach((c, i) => ws.getColumn(i + 1).width = c[1]);
    const N = cols.length;
    faixaTitulo(ws, 1, 1, N, "INDENIZAÇÕES — CASOS ESPECÍFICOS", {size:16, bold:true, cor:XL.WHITE, fundo:XL.NAVY, altura:32});
    faixaTitulo(ws, 2, 1, N, textoPeriodo() + (filtros ? " · " + filtros : "") + "   ·   " + lista.length + " caso(s)   ·   gerado em " + new Date().toLocaleString("pt-BR"), {size:10, bold:false, cor:XL.GOLDL, fundo:XL.NAVY, altura:20});
    const H = 4;
    ws.getRow(H).height = 32;
    cols.forEach((c, i) => {
      const cel = ws.getCell(H, i + 1); cel.value = c[0];
      cel.font = fonte({size:10, bold:true, color:{argb:XL.WHITE}}); cel.fill = fill(XL.NAVY2);
      cel.alignment = {vertical:"middle", horizontal: c[3] === FMT_BRL ? "right" : "left", wrapText:true, indent: c[3] === FMT_BRL ? 0 : 1};
      cel.border = {bottom:borda(XL.GOLD, "medium")};
    });
    const cor = {matriz:XL.GOLDL, valle:XL.GRAY, g5:"FFE3F1FA", outros:XL.AMBL};
    lista.forEach((r, i) => {
      const rowN = H + 1 + i; const row = ws.getRow(rowN); row.height = 20;
      cols.forEach((c, j) => {
        const cel = row.getCell(j + 1); const v = c[2](r);
        cel.value = (v === "" || v === null) ? null : v;
        if(c[3]) cel.numFmt = c[3];
        cel.font = fonte({size:10, bold: j === 1 || j === 17});
        cel.fill = fill(cor[r.classe] || (i % 2 ? XL.GRAY : XL.WHITE));
        cel.border = {bottom:borda()};
        cel.alignment = {vertical:"middle", horizontal: c[3] === FMT_BRL ? "right" : (c[3] ? "center" : "left"), indent: (c[3] ? 0 : 1)};
      });
    });
    const ult = H + lista.length, T = ult + 1;
    ws.getRow(T).height = 24;
    for(let j = 1; j <= N; j++){ const c = ws.getCell(T, j); c.fill = fill(XL.NAVY); c.font = fonte({bold:true, color:{argb:XL.WHITE}}); c.border = {top:borda(XL.GOLD, "medium")}; }
    ws.getCell(T, 1).value = "TOTAL (respeita o filtro da planilha)"; ws.getCell(T, 1).alignment = {vertical:"middle", indent:1};
    const t = somar(lista);
    [[16, t.frete], [17, t.merc], [18, t.valor]].forEach(([k, v]) => {
      const L2 = String.fromCharCode(64 + k);
      const c = ws.getCell(T, k); c.value = {formula:`SUBTOTAL(109,${L2}${H + 1}:${L2}${ult})`, result:r2(v)}; c.numFmt = FMT_BRL; c.alignment = {vertical:"middle", horizontal:"right"};
    });
    ws.autoFilter = {from:{row:H, column:1}, to:{row:ult, column:N}};
    ws.views = [{state:"frozen", xSplit:3, ySplit:H, showGridLines:false}];
    ws.pageSetup.printTitlesRow = `${H}:${H}`;
    ["Matriz = UNID RESP MTZ · Filial = UNID RESP igual à UNID DESTINO · Debitado ao Valle / Real Vale e parceiras G5 ficam fora do total pago · Anselmo é sempre Matriz · Funcionário (CLT) vai para a filial responsável · Revisar = a definir (responsável diferente do destino e de MTZ)."].forEach((tx, k) => {
      ws.mergeCells(T + 2 + k, 1, T + 2 + k, N);
      const c = ws.getCell(T + 2 + k, 1); c.value = tx; c.font = fonte({size:9, italic:true, color:{argb:XL.MUTED}}); c.alignment = {indent:1};
    });
    await baixarWorkbook(wb, `Indenizacao_Casos_${window.dataParaArquivo()}.xlsx`);
  }

  /* ================= IMPORTAÇÃO ================= */
  async function lerArquivo(file){
    const buf = await file.arrayBuffer();
    try{ return new TextDecoder("utf-8", {fatal:true}).decode(buf); }
    catch(e){ return new TextDecoder("windows-1252").decode(buf); }
  }
  function ligarImportacao(){
    ["val", "rva"].forEach(origem => {
      const input = document.getElementById("indImp_" + origem);
      if(!input) return;
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if(!file) return;
        try{
          const p = parseIndenizacoes(await lerArquivo(file), origem);
          if(!p.ok){ estado.msg = origem.toUpperCase() + ": " + p.erro; renderIndenizacao(); return; }
          if(!p.linhas.length){ estado.msg = origem.toUpperCase() + ": nenhuma indenização encontrada no arquivo."; renderIndenizacao(); return; }
          const dados = carregar();
          const mapa = new Map(dados[origem].linhas.map(r => [r.ctrc + "|" + r.num, r]));
          let novos = 0, atualizados = 0;
          p.linhas.forEach(r => { const k = r.ctrc + "|" + r.num; if(mapa.has(k)) atualizados++; else novos++; mapa.set(k, r); });
          dados[origem] = {atualizadoEm:new Date().toISOString(), linhas:Array.from(mapa.values())};
          if(!gravar(dados)) return;
          estado.msg = `${origem.toUpperCase()} importado: ${int(novos)} novo(s), ${int(atualizados)} atualizado(s) — ${int(dados[origem].linhas.length)} no total.`;
          renderIndenizacao();
        }catch(err){
          console.error("Erro ao importar Indenização:", err);
          estado.msg = "Não foi possível ler esse arquivo (" + (err.message || err) + ").";
          renderIndenizacao();
        }
      });
    });
  }

  /* ================= RENDER / EVENTOS ================= */
  function irParaCasos(destino, classe){
    estado.sub = "casos";
    estado.casos = {classe:classe || "todos", destino:destino || "todos", busca:""};
    renderIndenizacao();
  }
  function renderIndenizacao(){
    const dash = document.getElementById("indDashWrap"), det = document.getElementById("indDetWrap"), casos = document.getElementById("indCasosWrap");
    if(!dash || !det || !casos) return;
    dash.innerHTML = dashboardHTML();
    det.innerHTML = detalhadoHTML();
    casos.innerHTML = casosHTML();
    estado.msg = "";
    document.getElementById("indView-dashboard").classList.toggle("active", estado.sub === "dashboard");
    document.getElementById("indView-detalhado").classList.toggle("active", estado.sub === "detalhado");
    document.getElementById("indView-casos").classList.toggle("active", estado.sub === "casos");
    document.querySelectorAll("#indSubtabsNav [data-indsub]").forEach(b => b.classList.toggle("active", b.dataset.indsub === estado.sub));

    ligarImportacao();
    const on = (sel, ev, fn) => document.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn));
    on("#indFOrigem", "change", e => { estado.origem = e.target.value; renderIndenizacao(); });
    on("#indFDe", "change", e => { estado.de = e.target.value; renderIndenizacao(); });
    on("#indFAte", "change", e => { estado.ate = e.target.value; renderIndenizacao(); });
    on("#indFLimpar", "click", () => { estado.origem = "todos"; estado.de = ""; estado.ate = ""; renderIndenizacao(); });
    on("#indExportDash", "click", exportarDashboard);
    on("#indExportDet", "click", exportarDetalhado);
    on("#indExportCasos", "click", exportarCasos);
    on("#indLimpar", "click", () => {
      if(!confirm("Isso apaga TODAS as indenizações importadas (VAL e RVA). As definições manuais de quem pagou continuam salvas. Deseja continuar?")) return;
      try{ localStorage.removeItem(STORE_KEY); }catch(e){}
      renderIndenizacao();
    });
    on("#indCDestino", "change", e => { estado.casos.destino = e.target.value; renderIndenizacao(); });
    on("#indCasosWrap [data-ind-def]", "change", e => {
      const chave = e.target.dataset.indDef, m = carregarManual(), novo = manualDeValor(e.target.value);
      if(novo) m[chave] = novo; else delete m[chave];
      if(gravarManual(m)) renderIndenizacao();
    });
    on("#indCLimpar", "click", () => { estado.casos = {classe:"todos", destino:"todos", busca:""}; renderIndenizacao(); });
    on("#indCasosWrap [data-ind-classe]", "click", e => { estado.casos.classe = e.currentTarget.dataset.indClasse; renderIndenizacao(); });
    // linhas/botões clicáveis do Dashboard e do Detalhado: "classe|destino"
    on("#indDashWrap [data-ind-go], #indDetWrap [data-ind-go]", "click", e => {
      const [classe, destino] = e.currentTarget.dataset.indGo.split("|");
      irParaCasos(destino, classe);
    });
    const busca = document.getElementById("indCBusca");
    if(busca){
      let t;
      busca.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => {
          estado.casos.busca = busca.value;
          renderIndenizacao();
          const nb = document.getElementById("indCBusca");
          if(nb){ nb.focus(); nb.setSelectionRange(nb.value.length, nb.value.length); }
        }, 350);
      });
    }
  }

  window.indenizacaoHTML = indenizacaoHTML;
  window.attachIndenizacaoEvents = function(){
    const nav = document.getElementById("indSubtabsNav");
    if(nav) nav.querySelectorAll("[data-indsub]").forEach(btn => btn.addEventListener("click", () => { estado.sub = btn.dataset.indsub; renderIndenizacao(); }));
    renderIndenizacao();
  };
  window.__indenizacao = {parseIndenizacoes, classificar, resumo};
})();

/* =====================================================================
   ANÁLISE GERENCIAL — LEITORES DOS ARQUIVOS (SSW)   (analise-parsers.js v1.0)
   Funciona no navegador (window.AGParsers) e no Node (module.exports) — assim dá para testar com os arquivos reais.
   Tipos reconhecidos automaticamente pelo CONTEÚDO (não pelo nome do arquivo):
     perf     = "PERFORMANCE DE ENTREGAS" (resumo por destino, "COMO PAGADOR")
     noprazo  = "RELACAO DOS CTRCS ENTREGUES NO PRAZO"
     atr_t    = "RELACAO DOS CTRCS ATRASADOS" · RESPONSABILIDADE DA TRANSPORTADORA
     atr_c    = "RELACAO DOS CTRCS ATRASADOS" · RESPONSABILIDADE DO CLIENTE
     base     = CSV com ~140 colunas (CTRC/SUBCON ... VLR FRETE CTRC ORIGEM) = base de entregas
     indeniz  = relatório de indenizações (coluna VALINDENIZ) — lido pelo leitor da aba Indenização
   ===================================================================== */
(function(root){
  "use strict";
  const PV = 2; // versão do leitor (se mudar, os arquivos guardados são relidos)

  const num = s => { s = String(s == null ? "" : s).replace(/\u00a0/g, " ").trim(); if(!s) return 0;
    if(s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", "."); const n = parseFloat(s); return isFinite(n) ? n : 0; };
  // inteiro com ponto de milhar ("2.238" -> 2238); com vírgula decimal cai no num() normal
  const numI = s => { s = String(s == null ? "" : s).trim(); return s.indexOf(",") >= 0 ? num(s) : (parseInt(s.replace(/\./g, ""), 10) || 0); };
  const iso = (d, m, a) => { a = +a; if(a < 100) a += 2000; return a + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0"); };
  const dataBR = s => { const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{2,4})/); return m ? iso(m[1], m[2], m[3]) : ""; };
  const soDig = s => String(s || "").replace(/\D/g, "");
  const semAcento = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const unid = praca => { const u = String(praca || "").trim().toUpperCase().slice(0, 3); return u; };

  function linhasDe(t){ return String(t).replace(/^\uFEFF/, "").split(/\r?\n/); }

  function periodo(L){
    for(const l of L.slice(0, 15)){
      const m = l.match(/PERIODO(?: EMISSAO)?:\s*(\d{2})\/(\d{2})\/(\d{2,4})\s+A\s+(\d{2})\/(\d{2})\/(\d{2,4})/);
      if(m) return {ini:iso(m[1], m[2], m[3]), fim:iso(m[4], m[5], m[6])};
    }
    return null;
  }
  function grupo(L){
    for(const l of L.slice(0, 15)){
      const m = l.match(/GRUPO:\s*([\d.\/-]{14,18})\s+(.+?)\s*(\(COMO PAGADOR\))?\s*$/);
      if(m) return {cnpj:soDig(m[1]), nome:m[2].trim()};
    }
    return null;
  }
  function geradoEm(L){ const m = (L[1] || "").match(/(\d{2}\/\d{2}\/\d{2})\s+(\d{2}:\d{2})\s*$/); return m ? dataBR(m[1]) + " " + m[2] : ""; }

  /* ---------- reconhecimento ---------- */
  function detectar(texto, nome){
    const L = linhasDe(texto), topo = L.slice(0, 15).join("\n");
    if(/VALINDENIZ/.test(L.slice(0, 3).join("\n"))) return "indeniz";
    if(/CTRC\/SUBCON/.test(L.slice(0, 4).join("\n")) && /VLR FRETE CTRC ORIGEM/.test(L.slice(0, 4).join("\n"))) return "base";
    if(/RELACAO DOS CTRCS ENTREGUES NO PRAZO/.test(topo)) return "noprazo";
    if(/RELACAO DOS CTRCS ATRASADOS/.test(topo)){
      if(/RESPONSABILIDADE DA TRANSPORTADORA/.test(topo)) return "atr_t";
      if(/RESPONSABILIDADE DO CLIENTE/.test(topo)) return "atr_c";
      return "atr_t";
    }
    if(/PERFORMANCE DE ENTREGAS/.test(topo) && /NAO ENTREGUES/.test(topo)) return "perf";
    return null;
  }

  /* ---------- PERFORMANCE (resumo por destino) ---------- */
  const COLS_PERF = [["exp",53], ["ent",65], ["entP",71], ["np",79], ["npP",85], ["ac",94], ["acP",100], ["at",112], ["atP",118],
                     ["perf",126], ["nePrazo",137], ["nePrazoP",143], ["neAtr",152], ["neAtrP",158]];
  function camposPerf(l){
    const o = {}; COLS_PERF.forEach(c => o[c[0]] = 0);
    const re = /\d[\d.]*(?:,\d+)?/g, s = l.slice(40); let m;
    while((m = re.exec(s))){
      const fim = 40 + m.index + m[0].length, c = COLS_PERF.find(x => Math.abs(x[1] - fim) <= 1);
      if(c) o[c[0]] = numI(m[0]);
    }
    return o;
  }
  function lerPerf(texto){
    const L = linhasDe(texto), g = grupo(L), p = periodo(L), linhas = []; let total = null;
    L.forEach(l => {
      if(/^TOTAL CLIENTE/.test(l)){ total = camposPerf(l); return; }
      let m = l.slice(0, 30).trimEnd().match(/^([A-Z]{3})  ([A-Z]{3})  (\S.*)$/), orig, un, cidade;
      if(m){ orig = m[1]; un = m[2]; cidade = m[3].trim(); }
      else if((m = l.slice(0, 30).trimEnd().match(/^([A-Z]{3})  (\S.*)$/)) && !/^(DES|TOT)/.test(l)){ orig = ""; un = m[1]; cidade = m[2].trim(); }
      else return;
      const c = camposPerf(l);
      if(!c.exp && !c.ent && !c.nePrazo && !c.neAtr) return;
      linhas.push(Object.assign({orig, un, cidade}, c));
    });
    return {grupo:g, per:p, gerado:geradoEm(L), linhas, total};
  }

  /* ---------- listas de CTRCs (no prazo / atrasados) ---------- */
  const FATIAS = [["ctrc",0,11], ["emis",12,20], ["rem",21,35], ["pag",36,53], ["dest",54,68], ["prac",69,73], ["cidade",74,84], ["uf",85,87],
                  ["nf",88,97], ["peso",98,103], ["frete",104,113], ["merc",114,126], ["prev",127,135], ["real",136,144], ["atr",145,148]];
  function lerLista(texto){
    const L = linhasDe(texto), g = grupo(L), p = periodo(L), linhas = [];
    let totRel = null, faixas = [];
    L.forEach((l, i) => {
      if(/^[A-Z0-9]{3}\d{5,8}-\d\s/.test(l)){
        const r = {}; FATIAS.forEach(f => r[f[0]] = l.slice(f[1], f[2]).trim());
        const oc = l.slice(149).trim(), mo = oc.match(/^(\d{1,3})\s+(.*)$/);
        const o = {ctrc:r.ctrc, emis:dataBR(r.emis), rem:r.rem, pag:r.pag, dest:r.dest, prac:r.prac, un:unid(r.prac), cidade:r.cidade, uf:r.uf, nf:r.nf,
          peso:numI(r.peso), frete:num(r.frete), merc:num(r.merc), prev:dataBR(r.prev), real:dataBR(r.real), atr:parseInt(r.atr, 10) || 0,
          cod:mo ? mo[1] : "", ocor:mo ? mo[2].trim() : oc};
        linhas.push(o); return;
      }
      const mt = l.match(/^TOTAL\s+([\d.]+)\s+CTRCS\s+([\d.,]*)\s*([\d.,]*)/);
      if(mt){
        const prox = (L[i + 1] || "").match(/[\d.]+,\d{2}/);
        totRel = {qtd:numI(mt[1]), peso:numI(mt[2]), merc:num(mt[3]), frete:prox ? num(prox[0]) : null};
        // Quando só há uma coluna numérica antes do valor de mercadoria, o SSW alinha peso e mercadoria no mesmo bloco.
      }
      const mf = l.match(/^\s+(APOS 5 DIAS|5 DIAS|4 DIAS|3 DIAS|2 DIAS|1 DIA)\s+(\d+)\s+([\d,]+)/);
      if(mf) faixas.push({faixa:mf[1], qtd:+mf[2]});
    });
    return {grupo:g, per:p, gerado:geradoEm(L), linhas, totRel, faixas};
  }

  /* ---------- base de entregas (CSV 140 colunas) ---------- */
  function lerBase(texto){
    const L = linhasDe(texto).filter(l => l.trim() !== "");
    const iH = L.findIndex(l => /CTRC\/SUBCON/.test(l));
    if(iH < 0) throw new Error("cabeçalho CTRC/SUBCON não encontrado");
    const ix = {}; L[iH].split(";").forEach((n, i) => { n = n.trim(); if(n && !(n in ix)) ix[n] = i; });
    const falta = ["CTRC/SUBCON", "VLR FRETE CTRC ORIGEM", "VAL FRETE/COMIS"].filter(c => !(c in ix));
    if(falta.length) throw new Error("faltam colunas: " + falta.join(", "));
    let g = null, p = null;
    if(iH > 0){
      const c = L[0].split(";"), cl = c.find(x => /^CLIENTE:/.test(x.trim())), cn = c.find(x => /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(x.trim()));
      const mp = L[0].match(/PERIODO:\s*(\d{2})\/(\d{2})\/(\d{2,4})\s+A\s+(\d{2})\/(\d{2})\/(\d{2,4})/);
      if(cl || cn) g = {cnpj:soDig(cn || ""), nome:(cl || "").replace(/^CLIENTE:\s*/, "").trim()};
      if(mp) p = {ini:iso(mp[1], mp[2], mp[3]), fim:iso(mp[4], mp[5], mp[6])};
    }
    const linhas = [];
    L.slice(iH + 1).forEach(l => {
      const c = l.split(";"); if(c.length < 100 || !/^\d+$/.test(c[0].trim())) return;
      const t = n => (n in ix && c[ix[n]] != null) ? c[ix[n]].replace(/\u00a0/g, " ").trim() : "";
      const so = t("SERIE CTRC ORIGEM"), no = t("NUMERO CTRC ORIGEM");
      linhas.push({ctrc:t("CTRC/SUBCON"), emis:dataBR(t("EMISSAO")), rem:t("NOME REMETENTE"), dest:t("NOME DESTINATARIO"), prac:t("PRACA"), un:unid(t("PRACA")),
        cidade:t("CIDADE DESTINO"), uf:t("UF"), pagNome:t("NOME PAGADOR"), pagCnpj:soDig(t("CNPJ PAGADOR")), remCnpj:soDig(t("CNPJ REMETENTE")), freteValor:num(t("FRETE VALOR")), nf:t("NFISCAL"), vol:num(t("QTDE VOL")), peso:num(t("PESO REAL")),
        freteValle:num(t("VAL FRETE/COMIS")), merc:num(t("VAL.MERCADORIA")), ctrcOrig:(so && no) ? so + " " + no : no, emisOrig:dataBR(t("EMISSAO CTRC ORIGEM")),
        freteOrig:num(t("VLR FRETE CTRC ORIGEM")), fobOrig:num(t("FRETE FOB DO CTRC ORIGEM")), situ:t("LOCALIZACAO ATUAL"), cod:t("COD ULT OCORRENC"),
        atraso:parseInt(t("ATRASO"), 10) || 0, prev:dataBR(t("DATA PREV ENTREGA")), ent:dataBR(t("DATA ENTREGA REALIZADA")), unEmis:String(t("CTRC/SUBCON")).slice(0, 3)});
    });
    return {grupo:g, per:p, linhas};
  }

  /* ---------- ponto de entrada ---------- */
  function ler(texto, nome){
    const tipo = detectar(texto, nome);
    if(!tipo) return {tipo:null};
    if(tipo === "perf") return Object.assign({tipo, pv:PV}, lerPerf(texto));
    if(tipo === "base") return Object.assign({tipo, pv:PV}, lerBase(texto));
    if(tipo === "indeniz") return {tipo, pv:PV};
    return Object.assign({tipo, pv:PV}, lerLista(texto));
  }

  const API = {PV, ler, detectar, lerPerf, lerLista, lerBase, num, semAcento, unid};
  if(typeof module !== "undefined" && module.exports) module.exports = API; else root.AGParsers = API;
})(typeof window !== "undefined" ? window : globalThis);

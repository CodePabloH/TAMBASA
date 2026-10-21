/* ===================== PERFORMANCE TESTE — núcleo de leitura e cálculo =====================
   Sem tela e sem armazenamento: só lê os arquivos do SSW e faz as contas.
   (A tela fica em performance-teste.js.)

   DUAS FONTES DE DADOS
   1) BASE DE ENTREGAS  = planilha do SSW "CTRCs EXPEDIDOS E RECEBIDOS" filtrada por PREVISÃO DE ENTREGA.
      É ela que define o universo de documentos de cada Unidade Receptora no mês de competência.
   2) RELATÓRIO 012     = "012 - PERFORMANCE DOS CTRCS ENTREGUES" (um arquivo por DIA de baixa).
      Serve para saber QUEM É O CULPADO pelo atraso: CTRC com asterisco (*) = culpa do CLIENTE;
      atrasado sem asterisco = culpa da TRANSPORTADORA.

   REGRAS DE CÁLCULO (ver calcular())
   - Baixa (entrega feita): Código da Última Ocorrência 01 ou 69; o 46 só vale como baixa na unidade GNA.
   - Atraso: pela coluna "Quantidade de Dias de Atraso" (dias ÚTEIS, igual ao SSW). Se essa coluna vier vazia,
     usa a diferença entre Data da Entrega Realizada e Previsão de Entrega.
   - Baixa no prazo ........ entregue sem atraso
   - Baixa atrasada ........ "Fora do prazo" → Cliente (CTRC com * no 012) ou Transportadora (sem *)
   - Não baixado + atrasado  → Aberto atrasado
   - Não baixado + no prazo  → Aberto no prazo
   - PERFORMANCE % = (Entregas no prazo + Atrasos por culpa do cliente) ÷ Total de entregas feitas
*/
(function(root){
  "use strict";

  const CODIGOS_BAIXA = ["01", "69"];
  const CODIGO_BAIXA_SO_GNA = { codigo: "46", unidade: "GNA" };

  /* ---------- utilidades ---------- */
  function semAcento(s){
    return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "");
  }
  function normCab(s){ return semAcento(s).replace(/�/g, "").replace(/\s+/g, " ").trim().toUpperCase(); }

  // "20/10/26" | "20/10/2026" -> "2026-10-20" ("" se inválida)
  function isoDeBR(s){
    const m = String(s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if(!m) return "";
    let a = Number(m[3]); if(a < 100) a += 2000;
    const mes = Number(m[2]), dia = Number(m[1]);
    if(mes < 1 || mes > 12 || dia < 1 || dia > 31) return "";
    return a + "-" + String(mes).padStart(2, "0") + "-" + String(dia).padStart(2, "0");
  }
  function brDeISO(iso){
    if(!iso) return "";
    const p = iso.split("-");
    return p[2] + "/" + p[1] + "/" + p[0];
  }
  function chaveCtrc(s){ return String(s || "").replace(/\s+/g, "").toUpperCase(); }

  function ehBaixa(codigo, unidade){
    if(CODIGOS_BAIXA.indexOf(codigo) !== -1) return true;
    return codigo === CODIGO_BAIXA_SO_GNA.codigo && unidade === CODIGO_BAIXA_SO_GNA.unidade;
  }

  /* ---------- detecção do tipo de arquivo ---------- */
  function detectarTipo(texto){
    const t = String(texto || "");
    const ini = t.slice(0, 6000);
    if(/012\s*-\s*PERFORMANCE DOS CTRCS ENTREGUES/i.test(ini) || /FILIAL DESTINO:/i.test(ini)) return "012";
    if(/Serie\/Numero CTRC/i.test(semAcento(ini)) || /Unidade Receptora/i.test(semAcento(ini))) return "base";
    return null;
  }

  /* =====================================================================
     RELATÓRIO 012  (um arquivo = um dia de baixas, várias filiais destino)
     ===================================================================== */
  function parse012(texto){
    const linhas = String(texto || "").replace(/\r/g, "").split("\n");
    const avisos = [];

    // data do relatório: linha só com a data, logo abaixo do título "012 - PERFORMANCE..."
    let dia = "";
    for(let i = 0; i < linhas.length && i < 40; i++){
      if(/012\s*-\s*PERFORMANCE DOS CTRCS ENTREGUES/i.test(linhas[i])){
        for(let j = i + 1; j <= i + 3 && j < linhas.length; j++){
          const m = linhas[j].match(/^\s*(\d{2}\/\d{2}\/\d{2,4})\s*$/);
          if(m){ dia = isoDeBR(m[1]); break; }
        }
        break;
      }
    }

    const un = {};              // sigla -> {np, ac, at, cli:[], resumo:{np,ac,at}|null}
    let atual = null;
    let posNo = -1, posAt = -1, posGrade = -1;
    let resumoDe = null;        // unidade cujo bloco R E S U M O está sendo lido
    let hdrResumo = null;       // posições (fim) das colunas do RESUMO

    function unidade(s){
      if(!un[s]) un[s] = { np: 0, ac: 0, at: 0, cli: [], resumo: null };
      return un[s];
    }
    function numerosComFim(linha){
      const out = [], re = /\d[\d.]*/g; let m;
      while((m = re.exec(linha))) out.push({ v: Number(m[0].replace(/\./g, "")), fim: m.index + m[0].length });
      return out;
    }

    for(let i = 0; i < linhas.length; i++){
      const l = linhas[i];

      const fd = l.match(/^FILIAL DESTINO:\s*([A-Z0-9]{2,5})\b/);
      if(fd){ atual = fd[1]; resumoDe = null; unidade(atual); continue; }
      if(/^TODAS AS UNIDADES DESTINO/.test(l)){ atual = null; resumoDe = null; continue; }

      if(/PREVENTR/.test(l) && /NOPRAZO/.test(l) && /ATRASAD/.test(l)){
        posNo = l.indexOf("NOPRAZO"); posAt = l.indexOf("ATRASAD"); posGrade = l.indexOf("|", posAt);
        continue;
      }

      // ---- bloco RESUMO da unidade (confere com a contagem linha a linha) ----
      if(/R\s+E\s+S\s+U\s+M\s+O/.test(l)){ resumoDe = atual; hdrResumo = null; continue; }
      if(resumoDe){
        if(/RESPCLIENTE/.test(l)){
          const iC = l.indexOf("RESPCLIENTE") + "RESPCLIENTE".length;
          const iT2 = l.lastIndexOf("RESPTRANSP") + "RESPTRANSP".length;
          const iT1 = l.indexOf("RESPTRANSP") + "RESPTRANSP".length;
          hdrResumo = { np: iT1, ac: iC, at: iT2 };
          continue;
        }
        if(hdrResumo && /TOTAL\s+QTD/.test(l)){
          const r = { np: 0, ac: 0, at: 0 };
          numerosComFim(l).forEach(n => {
            [["np", hdrResumo.np], ["ac", hdrResumo.ac], ["at", hdrResumo.at]].forEach(([k, fim]) => {
              if(Math.abs(n.fim - fim) <= 2) r[k] = n.v;
            });
          });
          unidade(resumoDe).resumo = r;
          resumoDe = null;
          continue;
        }
        if(/^TRANSPORTADORA DO VALE/.test(l)) resumoDe = null;
        continue;
      }

      // ---- linha de documento ----
      const m = l.match(/^([A-Z0-9]{3}) (\d{6}-\d)\s/);
      if(!m || !atual) continue;
      const ctrc = chaveCtrc(m[1] + m[2]);

      let campoNo = "", campoAt = "";
      if(posNo > 0 && posAt > 0){
        campoNo = l.slice(posNo - 1, posAt - 1);
        campoAt = l.slice(posAt - 1, posGrade > 0 ? posGrade : posAt + 8);
      }else{
        const d = l.match(/\d{2}\/\d{2}\/\d{2,4}(.*)$/);
        const resto = d ? d[1].slice(0, 24) : "";
        campoNo = resto.slice(0, 8); campoAt = resto.slice(8);
      }
      const u = unidade(atual);
      if(/\d/.test(campoAt)){
        if(campoAt.indexOf("*") !== -1){ u.ac++; u.cli.push(ctrc); }
        else u.at++;
      }else{
        u.np++;     // sem número na coluna ATRASADO = entregue no prazo (adiantado ou no dia)
      }
    }

    const unidades = {};
    let total = 0, ac = 0, at = 0, np = 0, divergentes = [];
    Object.keys(un).forEach(s => {
      const u = un[s];
      if(!u.np && !u.ac && !u.at) return;
      unidades[s] = { np: u.np, ac: u.ac, at: u.at, cli: u.cli };
      np += u.np; ac += u.ac; at += u.at; total += u.np + u.ac + u.at;
      if(u.resumo && (u.resumo.np !== u.np || u.resumo.ac !== u.ac || u.resumo.at !== u.at)) divergentes.push(s);
    });
    if(!dia) avisos.push("Não encontrei a data do relatório (linha logo abaixo do título 012).");
    if(divergentes.length) avisos.push("Contagem diferente do RESUMO do próprio relatório em: " + divergentes.join(", ") + ".");
    if(!total) avisos.push("Nenhum documento encontrado nesse relatório.");

    return { dia, unidades, total, np, ac, at, divergentes, avisos };
  }

  /* =====================================================================
     BASE DE ENTREGAS (planilha do SSW por previsão de entrega)
     ===================================================================== */
  function dividirCsv(linha){
    const out = []; let cur = "", asp = false;
    for(let i = 0; i < linha.length; i++){
      const c = linha[i];
      if(c === '"'){ if(asp && linha[i + 1] === '"'){ cur += '"'; i++; } else asp = !asp; }
      else if(c === ";" && !asp){ out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  function parseBase(texto){
    const linhas = String(texto || "").replace(/\r/g, "").split("\n");
    let iCab = -1;
    for(let i = 0; i < Math.min(linhas.length, 12); i++){
      if(/SERIE\/NUMERO CTRC/.test(normCab(linhas[i]))){ iCab = i; break; }
    }
    if(iCab < 0) return { erro: "Não achei a linha de cabeçalho (Serie/Numero CTRC). Confira se é a planilha de CTRCs do SSW.", registros: [] };

    let periodo = "";
    for(let i = 0; i < iCab; i++){
      const m = linhas[i].match(/PREVISAO DE ENTREGA:\s*([\d/]+)\s*A\s*([\d/]+)/i);
      if(m) periodo = m[1] + " a " + m[2];
    }

    const cab = dividirCsv(linhas[iCab]).map(normCab);
    const col = nome => cab.indexOf(nome);
    const C = {
      ctrc: col("SERIE/NUMERO CTRC"), unidade: col("UNIDADE RECEPTORA"), codigo: col("CODIGO DA ULTIMA OCORRENCIA"),
      prev: col("PREVISAO DE ENTREGA"), entrega: col("DATA DA ENTREGA REALIZADA"), dias: col("QUANTIDADE DE DIAS DE ATRASO"),
      rem: col("CLIENTE REMETENTE"), dest: col("CLIENTE DESTINATARIO"), cidade: col("CIDADE DE ENTREGA"),
      nf: col("NOTAS FISCAIS"), canc: col("DATA DO CANCELAMENTO")
    };
    const faltam = ["ctrc", "unidade", "codigo", "prev"].filter(k => C[k] < 0);
    if(faltam.length) return { erro: "Colunas obrigatórias não encontradas: " + faltam.join(", ") + ".", registros: [] };

    const registros = [];
    const ign = { cancelados: 0, semUnidade: 0, semPrevisao: 0 };
    const vistos = new Set();
    let divergenciaDatas = 0;
    for(let i = iCab + 1; i < linhas.length; i++){
      const l = linhas[i];
      if(!l.trim()) continue;
      const f = dividirCsv(l);
      if(f.length <= C.codigo) continue;              // rodapé / linha curta
      const ctrc = chaveCtrc(f[C.ctrc]);
      if(!ctrc) continue;
      if(C.canc >= 0 && String(f[C.canc] || "").trim()){ ign.cancelados++; continue; }
      const u = String(f[C.unidade] || "").trim().toUpperCase();
      if(!u){ ign.semUnidade++; continue; }
      const p = isoDeBR(f[C.prev]);
      if(!p){ ign.semPrevisao++; continue; }
      let cod = String(f[C.codigo] || "").trim();
      if(/^\d+$/.test(cod)) cod = cod.padStart(2, "0");
      const e = C.entrega >= 0 ? isoDeBR(f[C.entrega]) : "";
      const dTxt = C.dias >= 0 ? String(f[C.dias] || "").trim() : "";
      const d = /^-?\d+$/.test(dTxt) ? Number(dTxt) : null;
      if(d !== null && e && ((e > p) !== (d > 0))) divergenciaDatas++;
      if(vistos.has(ctrc)) continue;                  // mesmo CTRC repetido no arquivo
      vistos.add(ctrc);
      registros.push({
        k: ctrc, u, c: cod, p, e, d,
        r: C.rem >= 0 ? String(f[C.rem] || "").trim() : "",
        t: C.dest >= 0 ? String(f[C.dest] || "").trim() : "",
        y: C.cidade >= 0 ? String(f[C.cidade] || "").trim() : "",
        n: C.nf >= 0 ? String(f[C.nf] || "").replace(/�/g, "").trim() : ""
      });
    }
    return { periodo, registros, ignorados: ign, divergenciaDatas };
  }

  /* ---------- situação de um documento ---------- */
  // "atrasado?" — dias úteis do SSW; se a coluna vier vazia, cai na diferença de datas
  function estaAtrasado(r, hojeISO){
    if(r.d !== null && r.d !== undefined) return r.d > 0;
    if(r.e) return r.e > r.p;
    return !!hojeISO && r.p < hojeISO;
  }

  /* =====================================================================
     CÁLCULO DO QUADRO
     base       : Map/array de registros (ver parseBase)
     clienteSet : Set de CTRCs com asterisco nos relatórios 012
     diasCom012 : Set de dias (ISO) que têm 012 importado
     opcoes.mes : "AAAA-MM" (mês de competência por previsão de entrega) ou "" para todos
     ===================================================================== */
  function calcular(base, clienteSet, diasCom012, opcoes){
    opcoes = opcoes || {};
    const mes = opcoes.mes || "";
    const hoje = opcoes.hoje || new Date().toISOString().slice(0, 10);
    const lista = base instanceof Map ? Array.from(base.values()) : base;
    const mapa = {};
    const detalhe = [];
    const semDia012 = {};          // dia -> qtd de atrasos baixados nele sem relatório 012
    let atrasosSem012 = 0;

    lista.forEach(r => {
      if(mes && r.p.slice(0, 7) !== mes) return;
      if(opcoes.sistema && (r.s || "") !== opcoes.sistema) return;
      if(opcoes.de && r.p < opcoes.de) return;
      if(opcoes.ate && r.p > opcoes.ate) return;
      const chave = (r.s || "") + "|" + r.u;
      const m = mapa[chave] || (mapa[chave] = { sigla: r.u, sistema: r.s || "", exped: 0, entregue: 0, noPrazoEnt: 0, atrasCli: 0, atrasTrans: 0, abertoAtrasado: 0, abertoNoPrazo: 0 });
      m.exped++;
      const atrasado = estaAtrasado(r, hoje);
      let situacao;
      if(ehBaixa(r.c, r.u)){
        m.entregue++;
        if(!atrasado){ m.noPrazoEnt++; situacao = "Entregue no prazo"; }
        else if(clienteSet && clienteSet.has(r.k)){ m.atrasCli++; situacao = "Atraso - cliente"; }
        else{
          m.atrasTrans++; situacao = "Atraso - transportadora";
          if(diasCom012 && r.e && !diasCom012.has((r.s || "") + ":" + r.e)){ atrasosSem012++; const kd = (r.s ? r.s + " " : "") + r.e; semDia012[kd] = (semDia012[kd] || 0) + 1; }
        }
      }else if(atrasado){ m.abertoAtrasado++; situacao = "Aberto atrasado"; }
      else{ m.abertoNoPrazo++; situacao = "Aberto no prazo"; }
      if(atrasado || opcoes.detalheTodos) detalhe.push({ r, situacao });
    });

    const unidades = Object.values(mapa).map(m => {
      const foraDoPrazo = m.atrasCli + m.atrasTrans;
      const sla = m.entregue > 0 ? ((m.noPrazoEnt + m.atrasCli) / m.entregue * 100) : null;
      return Object.assign({}, m, { foraDoPrazo, sla, total: m.exped });
    }).sort((a, b) => b.exped - a.exped || a.sigla.localeCompare(b.sigla) || a.sistema.localeCompare(b.sistema));

    const tot = unidades.reduce((a, u) => {
      ["exped", "entregue", "noPrazoEnt", "atrasCli", "atrasTrans", "foraDoPrazo", "abertoAtrasado", "abertoNoPrazo"].forEach(k => a[k] += u[k]);
      return a;
    }, { exped: 0, entregue: 0, noPrazoEnt: 0, atrasCli: 0, atrasTrans: 0, foraDoPrazo: 0, abertoAtrasado: 0, abertoNoPrazo: 0 });
    tot.sla = tot.entregue > 0 ? ((tot.noPrazoEnt + tot.atrasCli) / tot.entregue * 100) : null;

    return { unidades, totais: tot, detalhe, atrasosSem012, semDia012 };
  }

  function mesesDisponiveis(base){
    const set = new Set();
    (base instanceof Map ? Array.from(base.values()) : base).forEach(r => set.add(r.p.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }

  const API = { detectarTipo, parse012, parseBase, calcular, mesesDisponiveis, ehBaixa, estaAtrasado, isoDeBR, brDeISO, chaveCtrc };
  root.PTCore = API;
  if(typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);

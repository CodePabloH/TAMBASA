/* ===================== TABELA DE OCORRÊNCIAS × CULPA =====================
   Para cada código de ocorrência do SSW diz de quem é a culpa quando o documento está aberto em atraso:
     "transp"  = transportadora
     "cliente" = cliente
     "baixa"   = o código encerra o documento (não é "aberto": some de Abertos em atraso)
     ""        = ainda a definir
   PADRÃO: a tabela do relatório SSW 059 "Relação de Ocorrências" (abaixo), atualizada em 10/11/2026.
   REGRA: tipo CLIENTE = cliente · tipo INFORMATIVO / PENDENCIA / SOLUCIONADA = transportadora ·
          tipo ENTREGA / BAIXA = baixa (não conta como aberto). Na performance só 01 e 69 são baixa; 46 só na GNA (regra no performance-teste-core.js).
   AJUSTES: feitos na tela Dashboard Rede > "Ocorrências · culpa" e guardados no navegador
   (localStorage "valle_ocor_culpa_v1"), por cima do padrão. Códigos novos (que não estão no padrão) também ficam ali. */
(function(){
  "use strict";

  const KEY = "valle_ocor_culpa_v1";

  // código: [descrição, tipo no SSW, culpa padrão]
  const T = {
    "01": ["ENTREGA REALIZADA NORMALMENTE", "ENTREGA", "baixa"],
    "02": ["DOCUMENTO EMITIDO EM DUPLICIDADE", "BAIXA", "baixa"],
    "03": ["MERCADORIA DEVOLVIDA AO REMETENTE", "ENTREGA", "baixa"],
    "04": ["CLIENTE RETIRA MERCADORIA", "CLIENTE", "cliente"],
    "05": ["CLIENTE ALEGA MERCAD DESACORDO C/ PEDIDO", "CLIENTE", "cliente"],
    "06": ["DESCONSIDERAR OCORRENCIA ANTERIOR/LANCAM", "INFORMATIVO", "transp"],
    "07": ["CLIENTE RECUSA PAGAR O FRETE", "CLIENTE", "cliente"],
    "08": ["REMETENTE RECUSA RECEBER DEVOLUCAO", "CLIENTE", "cliente"],
    "09": ["LOCAL DE ENTREGA FECHADO/AUSENTE", "CLIENTE", "cliente"],
    "10": ["ENDERECO DE ENTREGA NAO LOCALIZADO", "CLIENTE", "cliente"],
    "11": ["AGUARDANDO AUTORIZACAO PARA REENTREGA", "CLIENTE", "cliente"],
    "15": ["ENTREGA AGENDADA", "INFORMATIVO", "transp"],
    "16": ["MERCADORIA RETIDA ATE SEGUNDA ORDEM", "CLIENTE", "cliente"],
    "18": ["MERCADORIA ENTREGUE NA TRANSP. REDESPACH", "ENTREGA", "baixa"],
    "19": ["COMPROVANTES / BO / ETC", "INFORMATIVO", "transp"],
    "20": ["REGIAO DE ENTREGA NAO ATENDIDA PELA FILI", "INFORMATIVO", "transp"],
    "21": ["AGUARDANDO RETORNO FORN/REDESPACHO", "CLIENTE", "cliente"],
    "23": ["FRETE DO CTRC DE ORIGEM RECEBIDO", "INFORMATIVO", "transp"],
    "24": ["GREVE OU PARALIZACAO", "CLIENTE", "cliente"],
    "25": ["MERCADORIA EM PROCESSO DEVOLUCAO", "BAIXA", "baixa"],
    "26": ["MERCADORIA TROCADA", "INFORMATIVO", "transp"],
    "27": ["AGUARDANDO AUTORIZACAO P/ DEVOLUCAO", "CLIENTE", "cliente"],
    "28": ["FALTA EM PROCESSO DE BUSCAS", "PENDENCIA", "transp"],
    "29": ["DEVOLUCAO AUTORIZADA", "INFORMATIVO", "transp"],
    "30": ["EXCESSO DE VEICULOS NA ENTREGA", "CLIENTE", "cliente"],
    "31": ["LIMPEZA DE RELATORIO, EMISSAO INTERNA E", "BAIXA", "baixa"],
    "32": ["SEGUNDA TENTATIVA DE ENTREGA", "CLIENTE", "cliente"],
    "33": ["AVARIA NA TRANSFERENCIA", "PENDENCIA", "transp"],
    "34": ["MERCADORIA EM CONFERENCIA NO CLIENTE", "CLIENTE", "cliente"],
    "35": ["AGUARDANDO AGENDAMENTO DO CLIENTE", "CLIENTE", "cliente"],
    "38": ["DESTINATARIO RECUSA RECEBER MERCADORIA", "CLIENTE", "cliente"],
    "39": ["COLETA REALIZADA", "INFORMATIVO", "transp"],
    "40": ["AVARIA PARCIAL DE MERCADORIA", "PENDENCIA", "transp"],
    "41": ["EXTRAVIO DE MERCADORIA", "PENDENCIA", "transp"],
    "42": ["FERIAS COLETIVAS / RECESSO", "CLIENTE", "cliente"],
    "43": ["FERIADO MUNICIPAL / ESTADUAL / NACIONAL", "INFORMATIVO", "transp"],
    "44": ["MERCADORIA RECEBIDA COM RESSALVA", "PENDENCIA", "transp"],
    "45": ["REENTREGA AUTORIZADA PELO CLIENTE", "INFORMATIVO", "transp"],
    "46": ["DEVOLUCAO REDESPACHO DE ORIGEM", "ENTREGA", "baixa"],
    "47": ["MERCADORIA AVARIADA NO DEPOSITO", "PENDENCIA", "transp"],
    "48": ["FALTA PARCIAL DE MERCADORIA", "PENDENCIA", "transp"],
    "50": ["FALTA DOCUMENTACAO", "PENDENCIA", "transp"],
    "51": ["SOBRA DE VOLUME/MERCADORIA", "PENDENCIA", "transp"],
    "54": ["EMBALAGEM AVARIADA", "PENDENCIA", "transp"],
    "55": ["CARGA ROUBADA / SINISTRADA", "CLIENTE", "cliente"],
    "56": ["MERCAD RETIDA PELA FISCALIZACAO", "CLIENTE", "cliente"],
    "58": ["VEICULO AVARIADO/SINISTRADO", "PENDENCIA", "transp"],
    "59": ["ADICIONAL/DESCARGA AUTORIZADA PARCEIRO/F", "INFORMATIVO", "transp"],
    "60": ["RODOVIA  / ACESSO INTERDITADO", "CLIENTE", "cliente"],
    "61": ["MERCADORIA LIBERADA PELA FISCALIZACAO", "INFORMATIVO", "transp"],
    "62": ["AGUARDANDO AUT. ADICIONAL DE ENTREGA", "INFORMATIVO", "transp"],
    "63": ["MERC.  DA DHL EM  PROCESSO  DEVOLUCAO", "CLIENTE", "cliente"],
    "64": ["CTRC EMITIDO - MERCADORIA RECEBIDA PARA", "INFORMATIVO", "transp"],
    "65": ["SUBCONTRATO EMITIDO", "INFORMATIVO", "transp"],
    "67": ["MERCADORIA EM PROCESSO DE INDENIZACAO SE", "INFORMATIVO", "transp"],
    "68": ["EDI FOI RECEPCIONADO MAS A MERCADORIA NA", "CLIENTE", "cliente"],
    "69": ["ENTREGA REALIZADA COM RESSALVA (AVARIA/F", "ENTREGA", "baixa"],
    "70": ["ENTREGA REALIZADA COM FALTA", "ENTREGA", "baixa"],
    "71": ["COBRADO DESCARGA/PALETIZACAO NA ENTREGA", "INFORMATIVO", "transp"],
    "72": ["AGUARDANDO COMPROVANTE PAGTO DARE PARCEI", "INFORMATIVO", "transp"],
    "73": ["FATURAMENTO - DOCUMENTACAO PENDENTE", "INFORMATIVO", "transp"],
    "74": ["SAIDA PARA ENTREGA", "INFORMATIVO", "transp"],
    "75": ["PRIMEIRA TENTATIVA DE COLETA", "INFORMATIVO", "transp"],
    "76": ["ENTREGAS COM DIAS ESPECIFICOS/PREVISAO D", "INFORMATIVO", "transp"],
    "77": ["FATURAMENTO - DOCUMENTACAO FINALIZADA", "INFORMATIVO", "transp"],
    "78": ["COLETA CANCELADA", "BAIXA", "baixa"],
    "79": ["AGUARDANDO SOLUCAO", "INFORMATIVO", "transp"],
    "80": ["PRIMEIRA TENTATIVA DE ENTREGA", "CLIENTE", "cliente"],
    "81": ["VEICULO DE TRANSFERENCIA FORA DO HORARIO", "INFORMATIVO", "transp"],
    "82": ["SAIDA DE UNIDADE", "INFORMATIVO", "transp"],
    "84": ["CHEGADA NA UNIDADE DE DESTINO", "INFORMATIVO", "transp"],
    "86": ["ESTORNO DE BAIXA/ENTREGA", "INFORMATIVO", "transp"],
    "87": ["IMPOSSIBILIDADE ENTREGA DEVIDO FESTIVIDA", "CLIENTE", "cliente"],
    "88": ["ENTREGA PREJUDICADA PELO HORARIO/TRANSIT", "PENDENCIA", "transp"],
    "90": ["MERCADORIA NAO EMBARCOU P/ ENTREGA", "PENDENCIA", "transp"],
    "91": ["EM PROCESSO DE INDENIZACAO", "PENDENCIA", "transp"],
    "92": ["MERCADORIA INDENIZADA", "BAIXA", "baixa"],
    "93": ["CTRC EMITIDO PARA EFEITO DE FRETE/IMPOST", "BAIXA", "baixa"],
    "94": ["CTRC SUBSTITUIDO", "BAIXA", "baixa"],
    "95": ["CTRC BAIXADO/CANCELADO", "BAIXA", "baixa"],
    "96": ["SOLICITADO ENTREGAS OU RESGATE CTE E CAN", "PENDENCIA", "transp"],
    "97": ["CLIENTE SEM ESPACO FISICO", "CLIENTE", "cliente"],
    "98": ["PENDENCIA SOLUCIONADA", "SOLUCIONADA", "transp"]
  };
  const VALIDOS = ["transp", "cliente", "baixa", "definir"];

  const store = (typeof window.LS !== "undefined" && window.LS) ? window.LS : window.localStorage;
  let O = {};                                                          // ajustes do usuário: { cod: { c: culpa, d: descrição } }
  try{ const x = JSON.parse(store.getItem(KEY) || "null"); if(x && typeof x === "object") O = x; }catch(e){}
  const gravar = () => { try{ store.setItem(KEY, JSON.stringify(O)); }catch(e){} };

  const cod2 = c => { c = String(c == null ? "" : c).trim(); return /^\d+$/.test(c) ? c.padStart(2, "0") : c.toUpperCase(); };

  function info(c){
    const k = cod2(c); if(!k) return null;
    const d = T[k], o = O[k];
    if(!d && !o) return null;
    const cul = o && o.c ? (o.c === "definir" ? "" : o.c) : (d ? d[2] : "");
    return { cod: k, descr: (o && o.d) || (d ? d[0] : ""), tipo: d ? d[1] : "", culpa: cul, padrao: d ? d[2] : null, editado: !!(o && o.c), novo: !d };
  }

  window.OcorCulpa = {
    tabela: T,
    cod: cod2,
    info,
    // todos os códigos conhecidos (padrão + criados pelo usuário), em ordem de código
    codigos(){
      return Array.from(new Set(Object.keys(T).concat(Object.keys(O)))).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true })).map(info).filter(Boolean);
    },
    // culpa: "transp" | "cliente" | "baixa" | "definir"
    definir(c, culpa, descr){
      const k = cod2(c); if(!k || VALIDOS.indexOf(culpa) === -1) return false;
      const d = T[k], desc = String(descr || (O[k] && O[k].d) || "").trim();
      if(d && culpa === d[2] && (!desc || desc === d[0])) delete O[k];            // igual ao padrão: não precisa guardar
      else if(!d && culpa === "definir" && !desc) delete O[k];
      else O[k] = { c: culpa, d: d && desc === d[0] ? "" : desc };
      gravar(); return true;
    },
    voltarAoPadrao(c){ delete O[cod2(c)]; gravar(); },                 // um código volta ao padrão (ou some, se for novo)
    restaurar(){ O = {}; gravar(); },                                  // tudo volta ao padrão do arquivo
    qtdAjustes: () => Object.keys(O).length
  };
})();

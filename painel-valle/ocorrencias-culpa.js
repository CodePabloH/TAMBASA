/* ===================== TABELA DE OCORRÊNCIAS × CULPA =====================
   Para cada código de ocorrência do SSW diz de quem é a culpa quando o documento está aberto em atraso:
     "transp"  = transportadora
     "cliente" = cliente
     "baixa"   = o código encerra o documento (não é "aberto": some de Abertos em atraso)
     ""        = ainda a definir
   PADRÃO: a tabela do arquivo "relação ocorrência" (abaixo).
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
    "15": ["ENTREGA AGENDADA", "INFORMATIVO", "transp"],               // se estiver em atraso, culpa da transportadora
    "16": ["MERCADORIA RETIDA ATE SEGUNDA ORDEM", "CLIENTE", "cliente"],
    "18": ["MERCADORIA ENTREGUE NA TRANSP. REDESPACH", "ENTREGA", "baixa"],
    "19": ["COMPROVANTES / BO / ETC", "INFORMATIVO", "transp"],
    "20": ["REGIAO DE ENTREGA NAO ATENDIDA PELA FILIAL", "INFORMATIVO", "transp"],
    "21": ["AGUARDANDO RETORNO FORN/REDESPACHO", "CLIENTE", "cliente"],
    "23": ["FRETE DO CTRC DE ORIGEM RECEBIDO", "INFORMATIVO", "cliente"],
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
    // definidos depois (a descrição vem do relatório 150)
    "34": ["", "", "cliente"],
    "35": ["", "", "cliente"],
    "38": ["", "", "cliente"],
    "40": ["", "", "transp"],
    "45": ["", "", "transp"],
    "46": ["", "", "baixa"],
    "54": ["", "", "transp"],
    "59": ["", "", "transp"],
    "62": ["", "", "transp"],
    "64": ["", "", "transp"],
    "82": ["", "", "transp"],
    "86": ["", "", "transp"],
    "88": ["", "", "transp"],
    "90": ["", "", "transp"],
    "91": ["", "", "transp"],
    "93": ["", "", "baixa"],
    "94": ["", "", "baixa"],
    "95": ["", "", "baixa"],
    "96": ["", "", "transp"],
    "98": ["", "", "transp"]
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

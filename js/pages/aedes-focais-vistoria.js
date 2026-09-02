/**
 * ============================================================
 * aedes-focais-vistoria.js - AEDES (Área dos Focais)
 * Integrado com R/Shiny e Contrato Unificado de Identidade
 * ============================================================
 */

const AEDES_FOCAL_SESSION_KEY = "dma_aedes_focal_session_v1";
const AEDES_API_TIMEOUT_MS = 90000;
const DASH_VALUE = "-";

/**
 * CATÁLOGOS FIXOS
 */
const LOCAIS_FOCO_OPTIONS = [
  { value: "objetos_acumulando_agua", label: "Objetos acumulando água" },
  { value: "reservatorio_de_agua", label: "Reservatório de água" },
  { value: "calha", label: "Calha ou ralos" },
  { value: "bromelias", label: "Bromélias ou vasos de plantas" },
  { value: "outros", label: "Outros" }
];

const MOTIVOS_NAO_REMEDIACAO_OPTIONS = [
  { value: "falta_de_treinamento_capacitacao", label: "Falta de treinamento/capacitação" },
  { value: "falta_de_cloro_larvicida", label: "Falta de cloro/larvicida" },
  { value: "necessidade_limpeza_terreno", label: "Necessidade de limpeza do terreno" },
  { value: "reservatorio_sem_cobertura", label: "Reservatório sem cobertura" },
  { value: "aguardando_responsavel_local", label: "Aguardando responsável local" },
  { value: "outros", label: "Outros" }
];

const MOTIVOS_NAO_VISTORIA_OPTIONS = [
  { value: "sem_condicao_acesso", label: "Sem acesso" },
  { value: "sem_brigadista", label: "Sem brigadista" },
  { value: "sem_viatura_disponivel", label: "Sem viatura disponível" },
  { value: "esquecimento", label: "Esquecimento" },
  { value: "outros", label: "Outros" }
];

let currentSession = null;
let gridRows = [];
let systemDate = new Date();

/**
 * Captura parâmetros transmitidos via URL (R/Shiny ou Link Direto)
 */
function captureSessionFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const focalPkParam = urlParams.get("focal_pk");
  const matriculaParam = urlParams.get("matricula");
  const emailParam = urlParams.get("email");
  const nomeParam = urlParams.get("nome");

  // Se receber focal_pk ou email via parâmetros, atualiza a sessão local
  if (focalPkParam || emailParam) {
    const existingSession = getFocalSession() || {};
    
    const sessionData = {
      focal_pk: focalPkParam ? decodeURIComponent(focalPkParam) : existingSession.focal_pk || null,
      matricula: matriculaParam ? decodeURIComponent(matriculaParam).trim() : existingSession.matricula || "",
      email: emailParam ? decodeURIComponent(emailParam).trim().toLowerCase() : existingSession.email || "",
      nome: nomeParam ? decodeURIComponent(nomeParam) : existingSession.nome || "Agente Focal",
      auth_type: "aedes_focal",
      login_at: new Date().toISOString()
    };

    localStorage.setItem(AEDES_FOCAL_SESSION_KEY, JSON.stringify(sessionData));
    return sessionData;
  }

  return getFocalSession();
}

document.addEventListener("DOMContentLoaded", async () => {
  setupActions();
  
  // 1. Captura e atualiza sessão a partir da URL
  currentSession = captureSessionFromURL();
  
  // 2. Valida se possui a sessão mínima (necessita de pelo menos focal_pk OU email)
  if (!isValidSession(currentSession)) {
    showSessionWarning();
    return;
  }

  showApp();
  fillSessionInfo(currentSession);
  initializeSystemDateInfo();
  
  // 3. Busca de unidades e binding de eventos
  await buildGridRows();
  bindGridEvents();
});

function setupActions() {
  const btnEncerrarSessao = document.getElementById("btnEncerrarSessao");
  const form = document.getElementById("vistoriaForm");
  
  if (btnEncerrarSessao) {
    btnEncerrarSessao.addEventListener("click", () => {
      clearFocalSession();
      // Exibe a tela de aviso de sessão sem redirecionar a URL externa
      showSessionWarning();
    });
  }
  
  if (form) {
    form.addEventListener("submit", handleSubmitReport);
  }

  const chk = document.getElementById('chkResponsabilidade');
  const btn = document.getElementById('btnEnviarRelatorio');
  if (chk && btn) {
    chk.addEventListener('change', () => { 
      btn.disabled = !chk.checked;
      btn.style.opacity = chk.checked ? "1" : "0.5"; 
    });
  }
}

function getFocalSession() {
  try {
    const raw = localStorage.getItem(AEDES_FOCAL_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) { 
    return null; 
  }
}

function isValidSession(session) {
  return !!(session && (session.focal_pk || session.email));
}

function clearFocalSession() { 
  localStorage.removeItem(AEDES_FOCAL_SESSION_KEY); 
}

function showSessionWarning() {
  document.getElementById("sessionWarning")?.classList.remove("hidden");
  document.getElementById("vistoriaApp")?.classList.add("hidden");
}

function showApp() {
  document.getElementById("sessionWarning")?.classList.add("hidden");
  document.getElementById("vistoriaApp")?.classList.remove("hidden");
}

function fillSessionInfo(session) {
  const nomeEl = document.getElementById("infoFocalNome");
  const emailEl = document.getElementById("infoFocalEmail");
  if (nomeEl) nomeEl.textContent = session.nome || "Agente Focal";
  if (emailEl) emailEl.textContent = session.email || "---";
}

function initializeSystemDateInfo() {
  systemDate = new Date();
  const dataEl = document.getElementById("infoDataPreenchimento");
  const semanaEl = document.getElementById("infoSemanaReferencia");
  
  if (dataEl) {
    dataEl.textContent = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(systemDate);
  }
  if (semanaEl) {
    const ano = getIsoWeekYear(systemDate);
    const semana = getIsoWeek(systemDate);
    semanaEl.textContent = `Ano ${ano} · Semana ${String(semana).padStart(2, "0")}`;
  }
}

/**
 * Consulta de unidades por focal_pk ou email
 */
async function buildGridRows() {
  const tbody = document.getElementById("vistoriaGridBody");
  if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px;">Sincronizando...</td></tr>`;

  try {
    const focalPk = currentSession?.focal_pk;
    const emailFocal = currentSession?.email;
    
    if (!focalPk && !emailFocal) throw new Error("Identificação do focal ausente.");

    const apiBase = window.AEDES_API_BASE_URL || "https://dma-aedes-api.onrender.com";
    
    // Constrói query aceitando focal_pk ou email
    const queryParam = focalPk 
      ? `focal_pk=${encodeURIComponent(focalPk)}` 
      : `email=${encodeURIComponent(emailFocal)}`;

    const response = await fetch(`${apiBase}/api/aedes/unidades?${queryParam}`);
    
    if (!response.ok) throw new Error("Não foi possível carregar suas unidades.");
    
    const unidadesFocal = await response.json();
    if (!Array.isArray(unidadesFocal) || unidadesFocal.length === 0) {
       if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px;">Nenhuma unidade vinculada.</td></tr>`;
       return;
    }

    gridRows = unidadesFocal.map((item) => ({
      rowId: createLocalId("row"),
      unidadeId: item.unidade_id || item.id || "S/M",
      unidade: item.nome_unidade || item.unidade_nome || "Unidade sem identificação",
      statusLinha: "Pendente",
      vistoriaRealizada: "",
      motivosNaoVistoria: [],
      outrosMotivoNaoVistoria: "",
      focoEncontrado: "",
      locaisFoco: [],
      outrosLocalFoco: "",
      focoRemediado: "",
      motivosNaoRemediacao: [],
      outrosMotivoNaoRemediacao: "",
      observacoes: ""
    }));

    renderGrid();
  } catch (error) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="color:red; text-align:center;">Erro: ${error.message}</td></tr>`;
  }
}

function getRowVisibility(row) {
  const vSim = row.vistoriaRealizada === "sim";
  const vNao = row.vistoriaRealizada === "nao";
  const fSim = row.focoEncontrado === "sim";
  return {
    showFocoEncontrado: vSim,
    showFocoRemediado: vSim && fSim,
    showLocaisFoco: vSim && fSim,
    showMotivosNaoRemediacao: vSim && fSim && row.focoRemediado === "nao",
    showMotivosNaoVistoria: vNao
  };
}

function renderGrid() {
  const tbody = document.getElementById("vistoriaGridBody");
  if (!tbody) return;
  
  document.getElementById("gridUnitCount").textContent = `${formatNumber(gridRows.length)} unidades`;

  tbody.innerHTML = gridRows.map((row, index) => {
    row.statusLinha = getRowStatus(row);
    const v = getRowVisibility(row);
    return `
      <tr data-row-id="${escapeHtml(row.rowId)}">
        <td class="col-unidade">
          <div class="unit-cell">
            <strong class="unit-name">${escapeHtml(row.unidade)}</strong>
            <span class="status-pill ${getStatusClass(row.statusLinha)}">${row.statusLinha}</span>
          </div>
        </td>
        <td class="col-vistoria">${renderInlineRadioGroup({ rowId: row.rowId, field: "vistoriaRealizada", value: row.vistoriaRealizada, index, options: [{ value: "sim", label: "Sim" }, { value: "nao", label: "Não", className: "radio-chip-inline--danger" }] })}</td>
        <td class="col-nao-vistoria">${v.showMotivosNaoVistoria ? renderCheckboxGroup({ rowId: row.rowId, groupKey: "motivosNaoVistoria", values: row.motivosNaoVistoria, otherText: row.outrosMotivoNaoVistoria, options: MOTIVOS_NAO_VISTORIA_OPTIONS, otherPlaceholder: "Especifique", otherField: "outrosMotivoNaoVistoria" }) : DASH_VALUE}</td>
        <td class="col-foco">${v.showFocoEncontrado ? renderInlineRadioGroup({ rowId: row.rowId, field: "focoEncontrado", value: row.focoEncontrado, index, options: [{ value: "sim", label: "Sim" }, { value: "nao", label: "Não", className: "radio-chip-inline--danger" }] }) : DASH_VALUE}</td>
        <td class="col-locais-foco">${v.showLocaisFoco ? renderCheckboxGroup({ rowId: row.rowId, groupKey: "locaisFoco", values: row.locaisFoco, otherText: row.outrosLocalFoco, options: LOCAIS_FOCO_OPTIONS, otherPlaceholder: "Especifique", otherField: "outrosLocalFoco" }) : DASH_VALUE}</td>
        <td class="col-remediacao">${v.showFocoRemediado ? renderInlineRadioGroup({ rowId: row.rowId, field: "focoRemediado", value: row.focoRemediado, index, options: [{ value: "sim", label: "Sim" }, { value: "nao", label: "Não", className: "radio-chip-inline--danger" }] }) : DASH_VALUE}</td>
        <td class="col-nao-remediacao">${v.showMotivosNaoRemediacao ? renderCheckboxGroup({ rowId: row.rowId, groupKey: "motivosNaoRemediacao", values: row.motivosNaoRemediacao, otherText: row.outrosMotivoNaoRemediacao, options: MOTIVOS_NAO_REMEDIACAO_OPTIONS, otherPlaceholder: "Especifique", otherField: "outrosMotivoNaoRemediacao" }) : DASH_VALUE}</td>
        <td class="col-observacoes"><textarea class="input-control input-control--compact" rows="2" data-row-id="${escapeHtml(row.rowId)}" data-field="observacoes">${escapeHtml(row.observacoes)}</textarea></td>
      </tr>`;
  }).join("");
  
  updateConditionalColumnsVisibility();
}

function updateConditionalColumnsVisibility() {
  const table = document.querySelector(".history-table--focal-grid");
  if (!table) return;
  table.classList.toggle("show-col-nao-vistoria", gridRows.some(r => getRowVisibility(r).showMotivosNaoVistoria));
  table.classList.toggle("show-col-locais-foco", gridRows.some(r => getRowVisibility(r).showLocaisFoco));
  table.classList.toggle("show-col-nao-remediacao", gridRows.some(r => getRowVisibility(r).showMotivosNaoRemediacao));
}

function renderInlineRadioGroup({ rowId, field, value, options }) {
  return `<div class="radio-group-inline compact">
    ${options.map((opt) => `
      <label class="radio-chip-inline ${opt.className || ""}">
        <input type="radio" name="${field}_${rowId}" value="${opt.value}" ${value === opt.value ? "checked" : ""} data-row-id="${rowId}" data-field="${field}" />
        <span>${opt.label}</span>
      </label>`).join("")}
  </div>`;
}

function renderCheckboxGroup({ rowId, groupKey, values, otherText, options, otherPlaceholder, otherField }) {
  const hasOther = values.includes("outros");
  return `<div class="checkbox-group">
    ${options.map((opt) => `
      <label class="checkbox-option">
        <input type="checkbox" value="${opt.value}" data-row-id="${rowId}" data-group-key="${groupKey}" ${values.includes(opt.value) ? "checked" : ""} />
        <span>${opt.label}</span>
      </label>`).join("")}
    <textarea class="${hasOther ? "" : "hidden"}" placeholder="${otherPlaceholder}" data-row-id="${rowId}" data-field="${otherField}">${isDashValue(otherText) ? "" : escapeHtml(otherText)}</textarea>
  </div>`;
}

function bindGridEvents() {
  const tbody = document.getElementById("vistoriaGridBody");
  if (!tbody) return;
  
  tbody.addEventListener("change", (e) => {
    const { rowId, field, groupKey } = e.target.dataset;
    if (!rowId) return;
    if (field) updateGridRow(rowId, field, e.target.value, { rerender: true });
    else if (groupKey) updateGridCheckboxGroup(rowId, groupKey, e.target.value, e.target.checked);
  });

  tbody.addEventListener("input", (e) => {
    const { rowId, field } = e.target.dataset;
    if (!rowId || !field) return;

    // Atualização de estado sem re-renderizar para evitar perda de foco
    const row = gridRows.find(r => r.rowId === rowId);
    if (row) {
      row[field] = e.target.value;
      row.statusLinha = getRowStatus(row);
      
      // Atualiza badge de status da linha diretamente no DOM
      const rowTr = tbody.querySelector(`tr[data-row-id="${rowId}"]`);
      if (rowTr) {
        const badge = rowTr.querySelector(".status-pill");
        if (badge) {
          badge.textContent = row.statusLinha;
          badge.className = `status-pill ${getStatusClass(row.statusLinha)}`;
        }
      }
    }
  });
}

function updateGridRow(rowId, field, value, options = { rerender: true }) {
  const row = gridRows.find(r => r.rowId === rowId);
  if (!row) return;
  row[field] = normalizeFieldValue(field, value);
  
  if (field === "vistoriaRealizada") {
    value === "nao" ? applyNoVistoriaState(row) : (clearNoVistoriaState(row), row.focoEncontrado = "", row.focoRemediado = "");
  } else if (field === "focoEncontrado") {
    value === "nao" ? applyNoFocoState(row) : (clearNoFocoState(row), row.focoRemediado = "");
  } else if (field === "focoRemediado" && value === "sim") {
    clearNaoRemediacaoState(row);
  }

  row.statusLinha = getRowStatus(row);
  if (options.rerender) renderGrid();
}

function updateGridCheckboxGroup(rowId, groupKey, val, checked) {
  const row = gridRows.find(r => r.rowId === rowId);
  if (!row) return;
  
  row[groupKey] = checked ? uniqueArray([...row[groupKey], val]) : row[groupKey].filter(v => v !== val);
  
  if (val === "outros" && !checked) {
    if (groupKey === "locaisFoco") row.outrosLocalFoco = "";
    if (groupKey === "motivosNaoRemediacao") row.outrosMotivoNaoRemediacao = "";
    if (groupKey === "motivosNaoVistoria") row.outrosMotivoNaoVistoria = "";
  }
  
  row.statusLinha = getRowStatus(row);
  renderGrid();
}

function applyNoVistoriaState(row) { row.focoEncontrado = row.focoRemediado = row.outrosLocalFoco = row.outrosMotivoNaoRemediacao = DASH_VALUE; row.locaisFoco = row.motivosNaoRemediacao = []; }
function clearNoVistoriaState(row) { row.motivosNaoVistoria = []; row.outrosMotivoNaoVistoria = ""; }
function applyNoFocoState(row) { row.focoRemediado = row.outrosLocalFoco = row.outrosMotivoNaoRemediacao = DASH_VALUE; row.locaisFoco = row.motivosNaoRemediacao = []; }
function clearNoFocoState(row) { row.locaisFoco = row.outrosLocalFoco = row.motivosNaoRemediacao = []; row.outrosMotivoNaoRemediacao = ""; }
function clearNaoRemediacaoState(row) { row.motivosNaoRemediacao = []; row.outrosMotivoNaoRemediacao = ""; }

function getRowStatus(row) {
  if (!row.vistoriaRealizada) return "Pendente";
  if (row.vistoriaRealizada === "nao") return hasValidGroupSelection(row.motivosNaoVistoria, row.outrosMotivoNaoVistoria) ? "Pronto" : "Motivo obrigatório";
  if (!row.focoEncontrado) return "Informar foco";
  if (row.focoEncontrado === "nao") return "Pronto";
  if (!hasValidGroupSelection(row.locaisFoco, row.outrosLocalFoco)) return "Local obrigatório";
  if (!row.focoRemediado) return "Informar remediação";
  if (row.focoRemediado === "nao" && !hasValidGroupSelection(row.motivosNaoRemediacao, row.outrosMotivoNaoRemediacao)) return "Motivo obrigatório";
  return "Pronto";
}

function hasValidGroupSelection(values, otherText) {
  const sel = values.filter(Boolean);
  if (!sel.length) return false;
  if (sel.includes("outros")) return safeTrim(otherText).length > 0 && !isDashValue(otherText);
  return true;
}

function getStatusClass(s) { 
  return s === "Pronto" ? "status-pill--success" : (s === "Pendente" ? "status-pill--muted" : "status-pill--danger"); 
}

/**
 * Montagem de Payload Padronizado
 */
function buildBatchPayload(dataRef) {
  const user = currentSession;
  return {
    cabecalho: {
      focal_pk: user?.focal_pk || null,
      focal_nome: user?.nome || "Não Identificado",
      focal_email: user?.email || "",
      matricula: String(user?.matricula || ""),
      semana_iso: String(getIsoWeek(dataRef)),
      ano_iso: getIsoWeekYear(dataRef),
      total_registros: gridRows.length,
      lote_id_cliente: createLocalId("lote")
    },
    vistorias: gridRows.map(row => ({
      unidade_id: row.unidadeId,
      unidade_nome: row.unidade,
      vistoria_realizada: row.vistoriaRealizada || DASH_VALUE,
      foco_encontrado: row.focoEncontrado || DASH_VALUE,
      foco_remediado: row.focoRemediado || DASH_VALUE,
      locais_foco: row.locaisFoco || [],
      outros_local: safeTrim(row.outrosLocalFoco) || DASH_VALUE,
      motivos_nao_vistoria: row.motivosNaoVistoria || [],
      outros_motivo_nao_vistoria: safeTrim(row.outrosMotivoNaoVistoria) || "",
      motivos_nao_remediacao: row.motivosNaoRemediacao || [],
      outros_motivo_nao_remediacao: safeTrim(row.outrosMotivoNaoRemediacao) || DASH_VALUE,
      observacoes: safeTrim(row.observacoes) || DASH_VALUE
    }))
  };
}

/**
 * Submissão de lote para a API
 */
async function handleSubmitReport(event) {
  if (event?.preventDefault) event.preventDefault();
  
  const chk = document.getElementById('chkResponsabilidade');
  if (chk && !chk.checked) return alert("Aceite o termo de veracidade.");
  if (gridRows.some(r => getRowStatus(r) !== "Pronto")) return alert("Existem linhas pendentes na grade. Preencha todos os campos obrigatórios.");

  const btn = document.getElementById("btnEnviarRelatorio");
  try {
    btn.disabled = true; 
    btn.innerText = "Enviando lote...";
    
    const payloadConcreto = buildBatchPayload(new Date());
    const apiBase = window.AEDES_API_BASE_URL || "https://dma-aedes-api.onrender.com";
    
    const res = await fetch(`${apiBase}/api/aedes/lotes-provisorio`, {
      method: "POST", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadConcreto) 
    });

    if (res.ok) {
      document.querySelector('main').style.display = 'none';
      document.getElementById("successScreen").classList.remove("hidden");
      iniciarAnimacaoSucesso();
    } else {
      let mensagemErro = "Erro ao salvar lote no servidor.";
      try {
        const errorData = await res.json();
        mensagemErro = errorData.error || errorData.detalhe || mensagemErro;
      } catch (jsonErr) {
        console.error("Erro ao ler JSON de erro:", jsonErr);
      }
      throw new Error(mensagemErro);
    }
  } catch (e) {
    alert(e.message);
    btn.disabled = false; 
    btn.innerText = "Enviar relatório";
  }
}

function iniciarAnimacaoSucesso() {
  const fill = document.querySelector('.progress-fill');
  if (fill) { fill.style.width = '100%'; }
  
  // Recarrega a própria página mantendo os parâmetros de URL para renderizar a grade limpa
  setTimeout(() => { 
    window.location.reload(); 
  }, 3000);
}

// Helpers Gerais
function createLocalId(p) { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`; }
function escapeHtml(v) { return String(v ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }
function formatNumber(v) { return new Intl.NumberFormat("pt-BR").format(v); }
function safeTrim(v) { return String(v || "").trim(); }
function uniqueArray(v) { return [...new Set(v.filter(Boolean))]; }
function isDashValue(v) { return safeTrim(v) === DASH_VALUE; }
function normalizeFieldValue(f, v) { return f === "observacoes" ? v : (isDashValue(v) ? DASH_VALUE : safeTrim(v)); }
function getIsoWeek(d) { const t = new Date(d.valueOf()); t.setDate(t.getDate() - ((d.getDay() + 6) % 7) + 3); const f = new Date(t.getFullYear(), 0, 4); return 1 + Math.round((t - (f.setDate(f.getDate() - ((f.getDay() + 6) % 7) + 3))) / 604800000); }
function getIsoWeekYear(d) { const t = new Date(d.valueOf()); t.setDate(t.getDate() - ((d.getDay() + 6) % 7) + 3); return t.getFullYear(); }
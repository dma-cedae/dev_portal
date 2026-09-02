/* =========================================================
   aedes.js:   CONFIGURAÇÕES GLOBAIS E STORAGE
========================================================= */
const TECHNICAL_DRAFTS_STORAGE_KEY = "dma_aedes_technical_drafts_v1";
const BULK_IMPORTS_STORAGE_KEY = "dma_aedes_bulk_imports_v1";
const TECHNICAL_AUTH_SESSION_KEY = "dma_aedes_technical_auth_v1";

// URL DA SUA API NO RENDER
const API_URL = "https://portal-dma.onrender.com";

const state = {
  metadata: {},
  unidades: [],
  vistorias: [],
  filteredVistorias: [],
  technicalDrafts: [],
  lastLoadedAt: null
};

/* =========================================================
   COMUNICAÇÃO COM A API (Substituindo o antigo Seed/DB)
========================================================= */
const AedesAPI = {
  // Busca metadados ou status do sistema
  async getMetadata() {
    try {
      const res = await fetch(`${API_URL}/api/health`);
      return await res.json();
    } catch (err) {
      console.error("Erro ao buscar metadados:", err);
      return { status: "offline", versao: "1.0.0" };
    }
  },

  // Busca a lista de focais (Para o Login de Focal)
  async getFocais() {
    try {
      const res = await fetch(`${API_URL}/api/aedes/focais/lista`);
      return await res.json();
    } catch (err) {
      console.error("Erro ao buscar focais:", err);
      return [];
    }
  },

  // Busca as vistorias (Lotes) enviadas
  async getAllVistorias() {
    try {
      const res = await fetch(`${API_URL}/api/aedes/lotes`);
      return await res.json();
    } catch (err) {
      return [];
    }
  },

  // Login Técnico via API (Seguro)
  async loginTecnico(user, pass) {
    try {
      const res = await fetch(`${API_URL}/api/auth/tecnico`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, pass })
      });
      return await res.json();
    } catch (err) {
      return { authenticated: false, error: "Erro de conexão" };
    }
  }
};
/* =========================================================
   CORE: CARREGAMENTO DE DADOS
========================================================= */
async function loadData() {
  showLoading(true);
  try {
    // 1. Busca dados da API em paralelo
    const [meta, focais, vistoriasBase] = await Promise.all([
      AedesAPI.getMetadata(),
      AedesAPI.getFocais(),
      AedesAPI.getAllVistorias()
    ]);

    state.metadata = meta;
    state.vistorias = vistoriasBase;
    state.filteredVistorias = [...state.vistorias];
    state.lastLoadedAt = new Date();

    // 2. Renderiza a lista de focais no Select de Login (se existir)
    renderFocaisSelect(focais);

    // 3. Atualiza Dashboards
    refreshFilters();
    renderPublicLayer();
    renderManagementLayer();
    renderTechnicalLayer();

    console.log("✅ Dados sincronizados com a API do Render.");
  } catch (error) {
    console.error("❌ Erro no carregamento via API:", error);
  } finally {
    showLoading(false);
  }
}

/* =========================================================
   AUTENTICAÇÃO TÉCNICA (REVISADA)
========================================================= */
async function handleTechnicalLogin() {
  const user = document.getElementById("techUser")?.value;
  const pass = document.getElementById("techPass")?.value;

  const result = await AedesAPI.loginTecnico(user, pass);

  if (result.authenticated) {
    localStorage.setItem(TECHNICAL_AUTH_SESSION_KEY, result.token);
    renderTechnicalAuthState();
    closeModal("loginModal"); // Função utilitária para fechar modal
  } else {
    alert("Usuário ou senha técnica incorretos.");
  }
}

/* =========================================================
   UTILITÁRIOS DE UI
========================================================= */
function renderFocaisSelect(focais) {
  const select = document.getElementById("focalSelect");
  if (!select) return;

  select.innerHTML = '<option value="">Selecione seu nome...</option>';
  focais.forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.matricula;
    opt.textContent = f.nome;
    select.appendChild(opt);
  });
}

function showLoading(active) {
  const loader = document.getElementById("globalLoader");
  if (loader) loader.style.display = active ? "flex" : "none";
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */
function bootstrap() {
  // Verifica se já está logado localmente
  const session = localStorage.getItem(TECHNICAL_AUTH_SESSION_KEY);
  if (session) {
    renderTechnicalAuthState();
  }

  // Carrega os dados da API
  loadData();
  
  // Bind de eventos
  document.getElementById("btnTechLogin")?.addEventListener("click", handleTechnicalLogin);
}

// Inicia tudo
bootstrap();
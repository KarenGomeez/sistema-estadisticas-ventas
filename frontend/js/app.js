// ══════════════════════════════════════════
//  Estado global
// ══════════════════════════════════════════
let currentUser     = null;
let currentFileId   = null;
let currentSheetId  = null;
let currentColumns  = null;
let lastData        = null;

// Agenda
let agendaRows     = [];
let agendaFiltered = [];
let agendaPage     = 1;
const AGENDA_PAGE_SIZE = 50;

// Postventa
let pvRows     = [];
let pvFiltered = [];
let pvPage     = 1;
let pvSummary  = null;
const PV_PAGE_SIZE = 50;

let chartMensual  = null;
let chartTipo     = null;
let chartZona     = null;
let chartVendedor = null;

// ══════════════════════════════════════════
//  Arranque
// ══════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
  setupDate();
  setupDarkMode();
  setupNavigation();
  setupSidebarToggle();
  setupLogin();
  setupLogout();
  setupUpload();
  await checkSession();
});

document.addEventListener("DOMContentLoaded", async () => {
  setupDate();
  setupDarkMode();
  setupLanguage();   // ← agregá esta línea
  setupNavigation();
  setupSidebarToggle();
  setupLogin();
  setupLogout();
  setupUpload();
  await checkSession();
});

// ══════════════════════════════════════════
//  Sesión
// ══════════════════════════════════════════
async function checkSession() {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) throw new Error();
    const user = await res.json();
    currentUser = user;
    showApp(user);
  } catch {
    showLogin();
  }
}

function showApp(user) {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("user-name").textContent   = user.username;
  document.getElementById("user-role").textContent   = user.rol === "admin" ? "Administrador" : "Usuario";
  document.getElementById("user-avatar").textContent = user.username.charAt(0).toUpperCase();

  // Ocultar Administración si no es admin
  const navAdmin = document.querySelector('.nav-item[data-page="administracion"]');
  if (navAdmin) navAdmin.style.display = user.rol === "admin" ? "" : "none";
}

function showLogin() {
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("app").classList.add("hidden");
}

// ══════════════════════════════════════════
//  Login / Logout
// ══════════════════════════════════════════
function setupLogin() {
  // Toggle mostrar/ocultar contraseña
  const btnPwd  = document.getElementById("btn-toggle-pwd");
  const pwdInput = document.getElementById("password");
  if (btnPwd) {
    btnPwd.addEventListener("click", () => {
      const visible = pwdInput.type === "text";
      pwdInput.type = visible ? "password" : "text";
      btnPwd.textContent = visible ? "👁" : "🙈";
    });
  }

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();
    const error    = document.getElementById("login-error");
    const btn      = document.getElementById("btn-login");

    error.classList.add("hidden");
    setBtnLoading(btn, "Ingresando…");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        error.classList.remove("hidden");
        return;
      }
      await checkSession();
    } finally {
      clearBtnLoading(btn, "Ingresar");
    }
  });
}

function setupLogout() {
  document.getElementById("btn-logout").addEventListener("click", async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    location.reload();
  });
}

// ══════════════════════════════════════════
//  Navegación
// ══════════════════════════════════════════
function setupNavigation() {
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      navigateTo(item.dataset.page, item.textContent.trim());
      if (item.dataset.page === "administracion") initAdmin();
      if (item.dataset.page === "bajas") initBajas();
      if (item.dataset.page === "comparador") initComparador();
      document.getElementById("sidebar").classList.remove("open");
    });
  });
}

function navigateTo(pageId, title) {
  document.querySelectorAll(".nav-item").forEach((i) => i.classList.remove("active"));
  document.querySelector(`.nav-item[data-page="${pageId}"]`)?.classList.add("active");
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.getElementById("page-" + pageId)?.classList.add("active");
  document.getElementById("page-title").textContent = title || pageId;
}

function setupSidebarToggle() {
  document.getElementById("btn-menu-toggle").addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });
}

function setupDate() {
  document.getElementById("topbar-date").textContent = new Date().toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

// ══════════════════════════════════════════
//  Upload
// ══════════════════════════════════════════
function setupUpload() {
  document.getElementById("btn-upload").addEventListener("click", uploadFile);
  document.getElementById("btn-load-columns").addEventListener("click", loadColumns);
  document.getElementById("btn-analyze").addEventListener("click", analyzeData);
}

async function uploadFile() {
  const input = document.getElementById("file-input");
  if (!input.files.length) { showToast("Seleccioná un archivo primero.", "warning"); return; }

  const status = document.getElementById("upload-status");
  status.textContent = "Subiendo…";

  const formData = new FormData();
  formData.append("file", input.files[0]);

  try {
    const res = await fetch("/api/upload", { method: "POST", body: formData });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      status.textContent = "Error: " + (err.detail || "No se pudo subir el archivo");
      return;
    }
    const data = await res.json();
    currentFileId = data.file_id;
    status.textContent = "✔ Archivo cargado";

    const select = document.getElementById("sheet-select");
    select.innerHTML = "";
    data.sheets.forEach((sheet) => {
      const opt = document.createElement("option");
      opt.value = sheet.sheet_id;
      opt.textContent = sheet.name;
      select.appendChild(opt);
    });
    document.getElementById("sheet-selector").classList.remove("hidden");
    document.getElementById("column-mapper").classList.add("hidden");
    document.getElementById("kpi-grid").classList.add("hidden");
    document.getElementById("charts-grid").classList.add("hidden");
    document.getElementById("cleaning-report").classList.add("hidden");
    document.getElementById("riesgos-section").classList.add("hidden");
  } catch {
    status.textContent = "Error de red al subir el archivo.";
  }
}

async function loadColumns() {
  currentSheetId = document.getElementById("sheet-select").value;
  try {
    const res = await fetch(`/api/sheets/${currentFileId}/${encodeURIComponent(currentSheetId)}/columns`);
    if (!res.ok) { showToast("No se pudo leer la hoja.", "error"); return; }
    const data = await res.json();
    currentColumns = data.columns;

    fillSelect("col-fecha",      false);
    fillSelect("col-tipo",       false);
    fillSelect("col-zona",       true);
    fillSelect("col-vendedor",   true);
    fillSelect("col-promo",      true);
    fillSelect("col-plan",       true);
    

    document.getElementById("column-mapper").classList.remove("hidden");
  } catch {
    showToast("Error de red al obtener columnas.", "error");
  }
}

function fillSelect(id, optional = false) {
  const select = document.getElementById(id);
  select.innerHTML = optional ? "<option value=''>— opcional —</option>" : "";
  currentColumns.forEach((col) => {
    const opt = document.createElement("option");
    opt.value = opt.textContent = col;
    select.appendChild(opt);
  });
}

// ══════════════════════════════════════════
//  Análisis
// ══════════════════════════════════════════
async function analyzeData() {
  const btn = document.getElementById("btn-analyze");
  setBtnLoading(btn, "Analizando…");

  const payload = {
    file_id:           currentFileId,
    sheet_id:          currentSheetId,
    date_column:       document.getElementById("col-fecha").value,
    tipo_column:       document.getElementById("col-tipo").value,
    zona_column:       document.getElementById("col-zona").value,
    vendedor_column:   document.getElementById("col-vendedor").value,
    promo_column:      document.getElementById("col-promo").value,
    plan_nuevo_column: document.getElementById("col-plan").value,
    
  };

  try {
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast("Error al analizar: " + (err.detail || "Revisá los datos"), "error");
      return;
    }

    lastData = await res.json();
    renderCleaningReport(lastData.cleaning_report);
    renderRiesgos(lastData.riesgos);
    renderAlertasAutomaticas(lastData);
    renderProyecciones(lastData.proyecciones);
    renderKPIs(lastData);
    renderCharts(lastData);
    renderModules(lastData);
    renderHeatmaps(lastData);
    pvSummary = null;
    renderEmbudo(lastData);
    initComparador();
    initAgenda(lastData);
    initPostventa();
    initClientes();
    initReportes();
  } catch {
    showToast("Error de red al analizar.", "error");
  } finally {
    clearBtnLoading(btn, "Analizar datos");
  }
}

// ══════════════════════════════════════════
//  Reporte de limpieza
// ══════════════════════════════════════════
function renderCleaningReport(report) {
  if (!report) return;
  document.getElementById("cleaning-report").classList.remove("hidden");
  document.getElementById("rep-total").textContent = report.total_rows;
  document.getElementById("rep-valid").textContent = report.valid_rows;
  document.getElementById("rep-excl").textContent  = report.excluded_rows;

  const reasons = report.reasons ?? {};
  const keys = Object.keys(reasons);
  document.getElementById("rep-reasons").textContent = keys.length
    ? "(" + keys.map(k => k.replace(/_/g, " ") + ": " + reasons[k]).join(", ") + ")"
    : "";
}

// ══════════════════════════════════════════
//  Riesgos
// ══════════════════════════════════════════
function renderRiesgos(riesgos) {
  if (!riesgos || !Object.keys(riesgos).length) return;
  document.getElementById("riesgos-section").classList.remove("hidden");

 document.getElementById("riesgo-tasa").textContent = riesgos.tasa_baja_promedio + "%";
  document.getElementById("riesgo-tasa-exp").textContent = currentLang === "en"
    ? `For every 100 sales, ${riesgos.tasa_baja_promedio} clients cancel on average`
    : riesgos.tasa_baja_explicacion ?? "";

  document.getElementById("riesgo-zona").textContent =
    riesgos.zona_riesgo + " (" + riesgos.zona_riesgo_cant + ")";
  document.getElementById("riesgo-zona-exp").textContent = currentLang === "en"
    ? `Zone ${riesgos.zona_riesgo} has the lowest activity (${riesgos.zona_riesgo_cant} jobs, ${riesgos.zona_explicacion_pct ?? ""}% of total)`
    : riesgos.zona_explicacion ?? "";

  document.getElementById("riesgo-conc").textContent = riesgos.concentracion_pct + "%";
  document.getElementById("riesgo-conc-exp").textContent = currentLang === "en"
    ? `${riesgos.concentracion_nombres ?? ""} concentrate ${riesgos.concentracion_pct}% of all sales`
    : riesgos.concentracion_explicacion ?? "";
}

// ══════════════════════════════════════════
//  Proyecciones
// ══════════════════════════════════════════
function renderProyecciones(proy) {
  if (!proy) return;
  document.getElementById("proyecciones-section").classList.remove("hidden");
  document.getElementById("proy-semana").textContent = proy.semana ?? "—";
  document.getElementById("proy-mes").textContent    = proy.mes ?? "—";
  document.getElementById("proy-anio").textContent   = proy.anio ?? "—";

  const tend = proy.tendencia ?? 0;
  document.getElementById("proy-tendencia").textContent = (tend >= 0 ? "+" : "") + tend;
  document.getElementById("proy-tend-icon").textContent = tend >= 0 ? "📈" : "📉";

  const card = document.getElementById("proy-tend-card");
  card.classList.remove("proy-tend-up", "proy-tend-down");
  card.classList.add(tend >= 0 ? "proy-tend-up" : "proy-tend-down");

  const tendExp = document.getElementById("proy-tend-exp");
  if (tendExp) {
    const absTend = Math.abs(tend);
    const mesRef  = proy.nombre_mes_anterior || "el mes anterior";
    if (tend > 0) {
      tendExp.textContent = currentLang === "en"
        ? `Rose ${absTend} jobs compared to ${mesRef}`
        : `Subió ${absTend} trabajos respecto a ${mesRef}`;
      tendExp.style.color = "var(--success)";
    } else if (tend < 0) {
      tendExp.textContent = currentLang === "en"
        ? `Dropped ${absTend} jobs compared to ${mesRef}`
        : `Bajó ${absTend} trabajos respecto a ${mesRef}`;
      tendExp.style.color = "var(--danger)";
    } else {
      tendExp.textContent = currentLang === "en"
        ? `No changes compared to ${mesRef}`
        : `Sin cambios respecto a ${mesRef}`;
      tendExp.style.color = "var(--text-secondary)";
    }
  }
  // Comparación mes a mes
  const mesAnt = proy.mes_anterior ?? 0;
  const mesAct = proy.mes_actual ?? 0;
  const varMom = proy.variacion_mom ?? 0;
  const varPct = proy.variacion_pct ?? 0;
  const isUp   = varMom >= 0;

  document.getElementById("proy-mes-ant-label").textContent = proy.nombre_mes_anterior || "Mes anterior";
  document.getElementById("proy-mes-act-label").textContent = proy.nombre_mes_actual   || "Mes actual";
  document.getElementById("proy-mes-ant-val").textContent   = mesAnt;
  document.getElementById("proy-mes-act-val").textContent   = mesAct;

  const varEl  = document.getElementById("proy-variacion-val");
  const pctEl  = document.getElementById("proy-variacion-pct");
  varEl.textContent = (isUp ? "+" : "") + varMom;
  varEl.className   = "proy-comp-value " + (isUp ? "proy-comp-up" : "proy-comp-down");
  pctEl.textContent = (isUp ? "+" : "") + varPct + "%";
  pctEl.className   = "proy-comp-pct "  + (isUp ? "proy-comp-up" : "proy-comp-down");

  document.getElementById("proy-promedio-val").textContent = proy.promedio_mensual ?? "—";

  // Subtítulo y resumen comparación
  const subtitle = document.getElementById("proy-comp-subtitle");
  const resumen  = document.getElementById("proy-comp-resumen");
  if (subtitle) {
    subtitle.textContent = proy.nombre_mes_anterior && proy.nombre_mes_actual
      ? `${proy.nombre_mes_anterior} vs ${proy.nombre_mes_actual}`
      : "";
  }
  if (resumen) {
    const abs = Math.abs(varMom);
    if (varMom < 0) {
      resumen.innerHTML = currentLang === "en"
        ? `⚠️ <span style="color:var(--danger)">Dropped ${abs} jobs compared to previous month (${varPct}%)</span>`
        : `⚠️ <span style="color:var(--danger)">Bajó ${abs} trabajos respecto al mes anterior (${varPct}%)</span>`;
    } else if (varMom > 0) {
      resumen.innerHTML = currentLang === "en"
        ? `✅ <span style="color:var(--success)">Rose ${abs} jobs compared to previous month (+${varPct}%)</span>`
        : `✅ <span style="color:var(--success)">Subió ${abs} trabajos respecto al mes anterior (+${varPct}%)</span>`;
    } else {
      resumen.innerHTML = currentLang === "en"
        ? `<span style="color:var(--text-secondary)">No changes compared to previous month</span>`
        : `<span style="color:var(--text-secondary)">Sin cambios respecto al mes anterior</span>`;
    }
  }
}

// ══════════════════════════════════════════
//  KPIs
// ══════════════════════════════════════════
function renderKPIs(data) {
  document.getElementById("kpi-grid").classList.remove("hidden");

  const meses        = data.resumen_mensual || [];
  const ultimoMes    = meses.length ? meses[meses.length - 1] : null;
  const totalGeneral = data.registros?.length ?? 0;
  const registros    = data.registros ?? [];

  // 1. Trabajos del mes
  document.getElementById("kpi-mes").textContent = ultimoMes?.total ?? "—";

  // 2. Total registros
  document.getElementById("kpi-concretados").textContent = totalGeneral;

  // 3. Zona más activa
  const conteoZona = {};
  registros.forEach(r => { if (r.zona) conteoZona[r.zona] = (conteoZona[r.zona] || 0) + 1; });
  const zonaMasActiva = Object.entries(conteoZona).sort((a, b) => b[1] - a[1])[0];
  document.getElementById("kpi-pendientes").textContent = zonaMasActiva
    ? `${zonaMasActiva[0]} (${zonaMasActiva[1]})`
    : "—";

  // 4. Vendedor del mes
  const regUltimoMes = ultimoMes
    ? registros.filter(r => r.fecha?.slice(0, 7) === ultimoMes.mes)
    : [];
  const conteoVend = {};
  regUltimoMes.forEach(r => { if (r.vendedor) conteoVend[r.vendedor] = (conteoVend[r.vendedor] || 0) + 1; });
  const vendedorMes = Object.entries(conteoVend).sort((a, b) => b[1] - a[1])[0];
  document.getElementById("kpi-cancelados").textContent = vendedorMes
    ? `${vendedorMes[0]} (${vendedorMes[1]})`
    : "—";

  // 5. Tipo más frecuente
  const conteoTipo = {};
  registros.forEach(r => { if (r.tipo) conteoTipo[r.tipo] = (conteoTipo[r.tipo] || 0) + 1; });
  const tipoMasFrecuente = Object.entries(conteoTipo).sort((a, b) => b[1] - a[1])[0];
  const kpiTipo = document.getElementById("kpi-proyeccion");
  kpiTipo.textContent = tipoMasFrecuente ? `${tipoMasFrecuente[0]} (${tipoMasFrecuente[1]})` : "—";
  kpiTipo.className = "kpi-value" + (tipoMasFrecuente && tipoMasFrecuente[0].length > 8 ? " kpi-value-sm" : "");

  // 6. Tasa de baja
  const riesgos = data.riesgos ?? {};
  document.getElementById("kpi-tasa").textContent = riesgos.tasa_baja_promedio
    ? riesgos.tasa_baja_promedio + "%"
    : "—";
}

// ══════════════════════════════════════════
//  Gráficos
// ══════════════════════════════════════════
const COLORS = [
  "#4f46e5","#10b981","#f59e0b","#ef4444","#3b82f6",
  "#8b5cf6","#14b8a6","#f97316","#ec4899","#6366f1",
];

function chartDefaults(type, labels, values, label = "") {
  return {
    type,
    data: {
      labels,
      datasets: [{
        label,
        data: values,
        backgroundColor: type === "pie" || type === "doughnut"
          ? COLORS.slice(0, values.length)
          : COLORS[0],
        borderColor: type === "bar" ? COLORS[0] : undefined,
        borderWidth: 1,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: type === "pie" || type === "doughnut" } },
    },
  };
}

let chartViewMode = "mes"; // "mes" | "anio"

function renderCharts(data) {
  document.getElementById("charts-grid").classList.remove("hidden");

  if (chartTipo)     chartTipo.destroy();
  if (chartZona)     chartZona.destroy();
  if (chartVendedor) chartVendedor.destroy();

  // Botones Mes / Año
  const btnMes  = document.getElementById("btn-view-mes");
  const btnAnio = document.getElementById("btn-view-anio");

  if (!btnMes.dataset.init) {
    btnMes.addEventListener("click", () => {
      chartViewMode = "mes";
      btnMes.classList.add("active");
      btnAnio.classList.remove("active");
      renderChartMensual(data);
    });
    btnAnio.addEventListener("click", () => {
      chartViewMode = "anio";
      btnAnio.classList.add("active");
      btnMes.classList.remove("active");
      renderChartMensual(data);
    });
    btnMes.dataset.init = "1";
  }

  renderChartMensual(data);

  // Doughnut por tipo
  const pTipo = data.trabajos_totales_por_tipo ?? [];
  chartTipo = new Chart(
    document.getElementById("chart-tipo"),
    chartDefaults("doughnut",
      pTipo.map(x => x.valor),
      pTipo.map(x => x.cantidad)
    )
  );

  // Barras por zona
  const pZona = data.zona_totales ?? [];
  chartZona = new Chart(
    document.getElementById("chart-zona"),
    chartDefaults("bar",
      pZona.map(x => x.valor),
      pZona.map(x => x.cantidad)
    )
  );

  // Barras horizontales vendedores
  const pVend = data.vendedor_totales ?? [];
  chartVendedor = new Chart(document.getElementById("chart-vendedor"), {
    type: "bar",
    data: {
      labels: pVend.map(x => x.valor),
      datasets: [{
        label: "Trabajos",
        data: pVend.map(x => x.cantidad),
        backgroundColor: COLORS.slice(0, pVend.length),
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.x} trabajos`
          }
        }
      },
      scales: {
        x: { beginAtZero: true, grid: { color: "rgba(0,0,0,.05)" } },
        y: { grid: { display: false } },
      },
    },
  });
}

function renderChartMensual(data) {
  if (chartMensual) chartMensual.destroy();

  const detalles = data.trabajos_por_mes ?? [];
  const tipos    = [...new Set(detalles.map(x => x.tipo))].sort();

  let labels, datasets;

  if (chartViewMode === "mes") {
    const meses = [...new Set(detalles.map(x => x.mes))].sort();
    labels   = meses;
    datasets = tipos.map((tipo, i) => ({
      label: tipo,
      data: meses.map(mes => {
        const fila = detalles.find(x => x.mes === mes && x.tipo === tipo);
        return fila ? fila.cantidad : 0;
      }),
      borderColor:     COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length] + "22",
      tension: 0.4,
      fill: false,
      pointRadius: 4,
      pointHoverRadius: 6,
    }));
  } else {
    // Agrupar por año
    const anosSet = new Set(detalles.map(x => x.mes?.slice(0, 4)).filter(Boolean));
    const anos    = [...anosSet].sort();
    labels   = anos;
    datasets = tipos.map((tipo, i) => ({
      label: tipo,
      data: anos.map(anio => {
        return detalles
          .filter(x => x.mes?.startsWith(anio) && x.tipo === tipo)
          .reduce((sum, x) => sum + x.cantidad, 0);
      }),
      borderColor:     COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length] + "33",
      tension: 0.4,
      fill: false,
      pointRadius: 5,
      pointHoverRadius: 7,
    }));
  }

  chartMensual = new Chart(document.getElementById("chart-mensual"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, position: "top" },
        tooltip: { mode: "index" },
      },
      scales: {
        x: { grid: { color: "rgba(0,0,0,.05)" } },
        y: { beginAtZero: true, grid: { color: "rgba(0,0,0,.05)" } },
      },
    },
  });
}
// ══════════════════════════════════════════
//  Módulos (tablas reales)
// ══════════════════════════════════════════
function renderModules(data) {
  // Mostrar filtros
  document.getElementById("comercial-filtros").style.display = "block";
  document.getElementById("zonas-filtros").style.display = "block";
  document.getElementById("planes-filtros").style.display = "block";
  document.getElementById("promociones-filtros").style.display = "block";

  // Inicializar filtros (solo primera vez)
  if (!document.getElementById("comercial-filtros").dataset.init) {
    ["comercial", "zonas", "planes", "promociones"].forEach(mod => {
      document.getElementById(`${mod}-desde`).addEventListener("change", () => applyModuleFilter(mod));
      document.getElementById(`${mod}-hasta`).addEventListener("change", () => applyModuleFilter(mod));
      document.getElementById(`${mod}-clear`).addEventListener("click", () => {
        document.getElementById(`${mod}-desde`).value = "";
        document.getElementById(`${mod}-hasta`).value = "";
        if (mod === "zonas") document.getElementById("zonas-filter-tipo").value = "";
        applyModuleFilter(mod);
      });
    });
    document.getElementById("comercial-filtros").dataset.init = "1";
  }

  // Poblar filtro de tipo de trabajo en Zonas
  const tiposZona = [...new Set((data.registros || []).map(r => r.tipo).filter(Boolean))].sort();
  const selTipoZona = document.getElementById("zonas-filter-tipo");
  const valorPrevio = selTipoZona.value;
  selTipoZona.innerHTML = "<option value=''>Todos</option>";
  tiposZona.forEach(t => {
    const o = document.createElement("option");
    o.value = o.textContent = t;
    selTipoZona.appendChild(o);
  });
  selTipoZona.value = tiposZona.includes(valorPrevio) ? valorPrevio : "";

  if (!selTipoZona.dataset.init) {
    selTipoZona.addEventListener("change", () => applyModuleFilter("zonas"));
    selTipoZona.dataset.init = "1";
  }

  applyModuleFilter("comercial");
  applyModuleFilter("zonas");
  applyModuleFilter("planes");
  applyModuleFilter("promociones");
}

function applyModuleFilter(mod) {
  if (!lastData?.registros) return;

  const desde = document.getElementById(`${mod}-desde`).value;
  const hasta = document.getElementById(`${mod}-hasta`).value;

  let registros = lastData.registros.filter(r => {
    const fecha = r.fecha?.slice(0, 10);
    if (!fecha) return true;
    if (desde && fecha < desde) return false;
    if (hasta && fecha > hasta) return false;
    return true;
  });

  let tipoSel = "";
  if (mod === "zonas") {
    tipoSel = document.getElementById("zonas-filter-tipo").value;
    if (tipoSel) registros = registros.filter(r => r.tipo === tipoSel);
  }

  const count = document.getElementById(`${mod}-count`);
  count.textContent = (desde || hasta || tipoSel) ? `${registros.length} registros en el período` : "";

  if (mod === "comercial") {
    const totales = calcTotales(registros, "vendedor");
    renderTable("comercial-content", totales, [["valor", "Vendedor"], ["cantidad", "Trabajos"]], "No hay datos de vendedores.");
  } else if (mod === "zonas") {
    const totales = calcTotales(registros, "zona");
    renderTable("zonas-content", totales, [["valor", "Zona"], ["cantidad", "Trabajos"]], "No hay datos de zonas.");
  } else if (mod === "planes") {
    const totales = calcTotales(registros, "plan");
    renderTable("planes-content", totales, [["valor", "Plan"], ["cantidad", "Cantidad"]], "No hay datos de planes.");
  } else if (mod === "promociones") {
    const totales = calcTotales(registros, "promo");
    renderTable("promociones-content", totales, [["valor", "Promoción"], ["cantidad", "Ventas"]], "No hay datos de promociones.");
  }
}

function calcTotales(registros, campo) {
  const conteo = {};
  registros.forEach(r => {
    const val = r[campo]?.trim().toUpperCase();
    if (!val || val === "" || val === "NAN" || val === "NONE") return;
    conteo[val] = (conteo[val] || 0) + 1;
  });
  return Object.entries(conteo)
    .map(([valor, cantidad]) => ({ valor, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

function renderTable(containerId, rows, columns, emptyMsg) {
  const container = document.getElementById(containerId);
  if (!rows.length) {
    container.innerHTML = `<div class="empty-state">${emptyMsg}</div>`;
    return;
  }

  const thead = columns
    .map(([, label]) => `<th>${label}</th>`)
    .join("");

  const tbody = rows
    .map((row) => {
      const tds = columns.map(([key], i) => {
        const valor = row[key] ?? "—";
        return `<td>${i === 0 ? badgeHtml(valor) : valor}</td>`;
      }).join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  container.innerHTML = `
    <div class="card">
      <table>
        <thead><tr>${thead}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;
}

// ══════════════════════════════════════════
//  Agenda
// ══════════════════════════════════════════
function initAgenda(data) {
  if (!data?.registros?.length) return;

  agendaRows = data.registros;

  // Poblar filtros
  const tipos     = [...new Set(agendaRows.map(r => r.tipo).filter(Boolean))].sort();
  const zonas     = [...new Set(agendaRows.map(r => r.zona).filter(Boolean))].sort();
  const vendedores = [...new Set(agendaRows.map(r => r.vendedor).filter(Boolean))].sort();

  fillAgendaSelect("agenda-filter-tipo",     tipos);
  fillAgendaSelect("agenda-filter-zona",     zonas);
  fillAgendaSelect("agenda-filter-vendedor", vendedores);

  // Eventos (solo la primera vez)
  if (!document.getElementById("agenda-container").dataset.init) {
    document.getElementById("agenda-search").addEventListener("input",  applyAgendaFilters);
    document.getElementById("agenda-filter-tipo").addEventListener("change", applyAgendaFilters);
    document.getElementById("agenda-filter-zona").addEventListener("change", applyAgendaFilters);
    document.getElementById("agenda-filter-vendedor").addEventListener("change", applyAgendaFilters);
    document.getElementById("agenda-clear").addEventListener("click", clearAgendaFilters);
    document.getElementById("agenda-prev").addEventListener("click", () => { agendaPage--; renderAgendaPage(); });
    document.getElementById("agenda-next").addEventListener("click", () => { agendaPage++; renderAgendaPage(); });
    document.getElementById("agenda-container").dataset.init = "1";
  }

  document.getElementById("agenda-empty").classList.add("hidden");
  document.getElementById("agenda-container").classList.remove("hidden");

  applyAgendaFilters();
}

function fillAgendaSelect(id, values) {
  const select = document.getElementById(id);
  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = opt.textContent = v;
    select.appendChild(opt);
  });
}

function applyAgendaFilters() {
  const search   = document.getElementById("agenda-search").value.toLowerCase();
  const tipo     = document.getElementById("agenda-filter-tipo").value;
  const zona     = document.getElementById("agenda-filter-zona").value;
  const vendedor = document.getElementById("agenda-filter-vendedor").value;

  agendaFiltered = agendaRows.filter(r => {
    const matchSearch = !search ||
      (r.vendedor?.toLowerCase().includes(search)) ||
      (r.tipo?.toLowerCase().includes(search)) ||
      (r.zona?.toLowerCase().includes(search));
    const matchTipo     = !tipo     || r.tipo     === tipo;
    const matchZona     = !zona     || r.zona     === zona;
    const matchVendedor = !vendedor || r.vendedor === vendedor;
    return matchSearch && matchTipo && matchZona && matchVendedor;
  });

  agendaPage = 1;
  renderAgendaPage();
}

function clearAgendaFilters() {
  document.getElementById("agenda-search").value = "";
  document.getElementById("agenda-filter-tipo").value = "";
  document.getElementById("agenda-filter-zona").value = "";
  document.getElementById("agenda-filter-vendedor").value = "";
  applyAgendaFilters();
}

function renderAgendaPage() {
  const total  = agendaFiltered.length;
  const pages  = Math.ceil(total / AGENDA_PAGE_SIZE) || 1;
  agendaPage   = Math.min(Math.max(agendaPage, 1), pages);

  const start  = (agendaPage - 1) * AGENDA_PAGE_SIZE;
  const slice  = agendaFiltered.slice(start, start + AGENDA_PAGE_SIZE);

  const tbody  = document.getElementById("agenda-tbody");
  tbody.innerHTML = slice.map((r, i) => `
    <tr>
      <td>${start + i + 1}</td>
      <td>${r.fecha ? r.fecha.slice(0, 10) : "—"}</td>
      <td>${badgeHtml(r.tipo)}</td>
      <td>${badgeHtml(r.zona)}</td>
      <td>${r.vendedor ?? "—"}</td>
      <td>${r.promo ?? "—"}</td>
      <td>${r.plan_nuevo ?? "—"}</td>
    </tr>`).join("");

  document.getElementById("agenda-count").textContent =
    `${total} registros encontrados`;
  document.getElementById("agenda-page-info").textContent =
    `Página ${agendaPage} de ${pages}`;
  document.getElementById("agenda-prev").disabled = agendaPage === 1;
  document.getElementById("agenda-next").disabled = agendaPage === pages;
}

// ══════════════════════════════════════════
//  Postventa
// ══════════════════════════════════════════
function initPostventa() {
  if (!currentFileId) return;

  // Poblar selects con las columnas disponibles
  const columnas = currentColumns ?? [];
  ["pv-col-postventa", "pv-col-respuesta"].forEach(id => {
    const sel = document.getElementById(id);
    const esOpcional = id === "pv-col-respuesta";
    sel.innerHTML = esOpcional ? "<option value=''>— opcional —</option>" : "<option value=''>— elegí una columna —</option>";
    columnas.forEach(col => {
      const opt = document.createElement("option");
      opt.value = opt.textContent = col;
      // autoseleccionar si el nombre coincide
      if (col === "Post Venta" && id === "pv-col-postventa") opt.selected = true;
      if (col === "Respuesta"  && id === "pv-col-respuesta")  opt.selected = true;
      sel.appendChild(opt);
    });
  });

  document.getElementById("postventa-empty").classList.add("hidden");
  document.getElementById("postventa-setup").classList.remove("hidden");

  // Traducir textos de postventa
  document.querySelector("#postventa-setup h4").textContent = currentLang === "en"
    ? "Select after-sales columns"
    : "Seleccioná las columnas de postventa";
  document.querySelector("label[for='pv-col-postventa']").textContent = currentLang === "en"
    ? "After-sales column *"
    : "Columna Post Venta *";
  document.querySelector("label[for='pv-col-respuesta']").textContent = currentLang === "en"
    ? "Response column"
    : "Columna Respuesta";
  document.getElementById("btn-cargar-postventa").textContent = currentLang === "en"
    ? "Load after-sales"
    : "Cargar postventa";
  if (!document.getElementById("postventa-setup").dataset.init) {
    document.getElementById("btn-cargar-postventa").addEventListener("click", cargarPostventa);
    document.getElementById("pv-search").addEventListener("input", applyPvFilters);
    document.getElementById("pv-filter-vendedor").addEventListener("change", applyPvFilters);
    document.getElementById("pv-filter-zona").addEventListener("change", applyPvFilters);
    document.getElementById("pv-clear").addEventListener("click", () => {
      document.getElementById("pv-search").value = "";
      document.getElementById("pv-filter-vendedor").value = "";
      document.getElementById("pv-filter-zona").value = "";
      applyPvFilters();
    });
    document.getElementById("pv-prev").addEventListener("click", () => { pvPage--; renderPvPage(); });
    document.getElementById("pv-next").addEventListener("click", () => { pvPage++; renderPvPage(); });
    document.getElementById("postventa-setup").dataset.init = "1";
  }
}

async function cargarPostventa() {
  const pvCol  = document.getElementById("pv-col-postventa").value;
  const resCol = document.getElementById("pv-col-respuesta").value;

  if (!pvCol) { showToast("Seleccioná la columna de Post Venta.", "warning"); return; }

  const btn = document.getElementById("btn-cargar-postventa");
  setBtnLoading(btn, "Cargando…");

  try {
    const res = await fetch("/api/postventa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_id:           currentFileId,
        sheet_id:          currentSheetId,
        postventa_column:  pvCol,
        respuesta_column:  resCol || null,
        date_column:       document.getElementById("col-fecha").value || null,
        tipo_column:       document.getElementById("col-tipo").value || null,
        zona_column:       document.getElementById("col-zona").value || null,
        vendedor_column:   document.getElementById("col-vendedor").value || null,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.detail || "No se pudo cargar postventa", "error");
      return;
    }

    const data = await res.json();
    document.getElementById("pv-total").textContent        = data.total;
    document.getElementById("pv-contactados").textContent  = data.contactados;
    document.getElementById("pv-no-contactados").textContent = data.no_contactados;
    document.getElementById("pv-pct").textContent          = data.pct_contactados + "%";

    pvRows = data.registros;
    pvSummary = {
      total: data.total,
      contactados: data.contactados,
      no_contactados: data.no_contactados,
      pct_contactados: data.pct_contactados,
    };
    renderEmbudo(lastData);

    // Poblar filtros de vendedor y zona
    const vendedores = [...new Set(pvRows.map(r => r.vendedor).filter(Boolean))].sort();
    const zonas = [...new Set(pvRows.map(r => r.zona).filter(Boolean))].sort();

    const selVend = document.getElementById("pv-filter-vendedor");
    const selZona = document.getElementById("pv-filter-zona");
    selVend.innerHTML = "<option value=''>Todos</option>";
    selZona.innerHTML = "<option value=''>Todas</option>";
    vendedores.forEach(v => { const o = document.createElement("option"); o.value = o.textContent = v; selVend.appendChild(o); });
    zonas.forEach(z => { const o = document.createElement("option"); o.value = o.textContent = z; selZona.appendChild(o); });

    applyPvFilters();

    document.getElementById("postventa-container").classList.remove("hidden");
  } catch {
    showToast("Error de red al cargar postventa.", "error");
  } finally {
    clearBtnLoading(btn, "Cargar postventa");
  }
}

function applyPvFilters() {
  const search   = document.getElementById("pv-search").value.toLowerCase();
  const vendedor = document.getElementById("pv-filter-vendedor").value;
  const zona     = document.getElementById("pv-filter-zona").value;

  pvFiltered = pvRows.filter(r => {
    const matchSearch   = !search   || r.respuesta?.toLowerCase().includes(search);
    const matchVendedor = !vendedor || r.vendedor === vendedor;
    const matchZona     = !zona     || r.zona     === zona;
    return matchSearch && matchVendedor && matchZona;
  });
  pvPage = 1;
  renderPvPage();
}

function renderPvPage() {
  const total = pvFiltered.length;
  const pages = Math.ceil(total / PV_PAGE_SIZE) || 1;
  pvPage = Math.min(Math.max(pvPage, 1), pages);

  const start = (pvPage - 1) * PV_PAGE_SIZE;
  const slice = pvFiltered.slice(start, start + PV_PAGE_SIZE);

  document.getElementById("pv-tbody").innerHTML = slice.map((r, i) => `
    <tr>
      <td>${start + i + 1}</td>
      <td>${r.fecha?.slice(0,10) ?? "—"}</td>
      <td>${badgeHtml(r.tipo)}</td>
      <td>${badgeHtml(r.zona)}</td>
      <td>${r.vendedor ?? "—"}</td>
      <td>${r.respuesta ?? "—"}</td>
    </tr>`).join("");

  document.getElementById("pv-count").textContent = currentLang === "en"
    ? `${total} responses found`
    : `${total} respuestas encontradas`;
  document.getElementById("pv-page-info").textContent = currentLang === "en"
    ? `Page ${pvPage} of ${pages}`
    : `Página ${pvPage} de ${pages}`;
  document.getElementById("pv-prev").disabled = pvPage === 1;
  document.getElementById("pv-next").disabled = pvPage === pages;
}

// ══════════════════════════════════════════
//  Reportes
// ══════════════════════════════════════════
function initReportes() {
  if (!currentFileId) return;
  document.getElementById("reportes-empty").classList.add("hidden");
  document.getElementById("reportes-container").classList.remove("hidden");

  if (!document.getElementById("reportes-container").dataset.init) {
    document.getElementById("btn-exportar").addEventListener("click", exportarExcel);
    document.getElementById("btn-exportar-pdf").addEventListener("click", exportarPDF);
    document.getElementById("reportes-container").dataset.init = "1";
  }
}

async function exportarExcel() {
  const btn    = document.getElementById("btn-exportar");
  const status = document.getElementById("export-status");

  setBtnLoading(btn, "Generando…");
  status.textContent = "";

  try {
    const res = await fetch("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_id:           currentFileId,
        sheet_id:          currentSheetId,
        date_column:       document.getElementById("col-fecha").value,
        tipo_column:       document.getElementById("col-tipo").value,
        zona_column:       document.getElementById("col-zona").value,
        vendedor_column:   document.getElementById("col-vendedor").value,
        promo_column:      document.getElementById("col-promo").value,
        plan_nuevo_column: document.getElementById("col-plan").value,
      }),
    });

    if (!res.ok) {
      status.textContent = "❌ Error al generar el reporte.";
      return;
    }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "reporte_ventas.xlsx";
    a.click();
    URL.revokeObjectURL(url);
    status.textContent = "✔ Reporte descargado correctamente.";
  } catch {
    status.textContent = "❌ Error de red al exportar.";
  } finally {
    clearBtnLoading(btn, "⬇ Descargar reporte Excel");
  }
}

// ══════════════════════════════════════════
//  Exportar resumen ejecutivo en PDF
// ══════════════════════════════════════════
function exportarPDF() {
  if (!lastData) { showToast("No hay datos analizados.", "warning"); return; }

  const status = document.getElementById("export-pdf-status");
  status.textContent = "Generando PDF…";

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const pageWidth  = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX    = 15;
    let y = 20;

    // Encabezado
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Resumen Ejecutivo - Sistema de Ventas", marginX, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(`Generado el ${new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}`, marginX, y);
    doc.setTextColor(0);
    y += 12;

    // KPIs
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Indicadores principales", marginX, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const kpis = [
      ["Trabajos del mes",   document.getElementById("kpi-mes").textContent],
      ["Total registros",    document.getElementById("kpi-concretados").textContent],
      ["Zona más activa",    document.getElementById("kpi-pendientes").textContent],
      ["Vendedor del mes",   document.getElementById("kpi-cancelados").textContent],
      ["Tipo más frecuente", document.getElementById("kpi-proyeccion").textContent],
      ["Tasa de baja",       document.getElementById("kpi-tasa").textContent],
    ];
    kpis.forEach(([label, value]) => {
      doc.text(`•  ${label}: ${value}`, marginX, y);
      y += 6;
    });
    y += 5;

    // Alertas automáticas
    const alertaItems = document.querySelectorAll("#alertas-auto-list .alerta-auto-item");
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Alertas y conclusiones", marginX, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    if (alertaItems.length) {
      alertaItems.forEach(item => {
        const textoRaw = item.querySelector(".alerta-auto-texto")?.textContent ?? "";
        const texto = textoRaw.replace(/→/g, "->");
        const lines = doc.splitTextToSize(`-  ${texto}`, pageWidth - marginX * 2);
        doc.text(lines, marginX, y);
        y += lines.length * 5.5 + 2;
      });
    } else {
      doc.text("No se detectaron anomalías. Todo en orden.", marginX, y);
      y += 6;
    }
    y += 5;

    // Proyecciones y comparación mensual
    const proy = lastData.proyecciones ?? {};
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Proyecciones", marginX, y);
    y += 7;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const tend = proy.tendencia ?? 0;
    doc.text(`•  Esta semana: ${proy.semana ?? "—"}`, marginX, y); y += 6;
    doc.text(`•  Este mes: ${proy.mes ?? "—"}`, marginX, y); y += 6;
    doc.text(`•  Este año: ${proy.anio ?? "—"}`, marginX, y); y += 6;
    doc.text(`•  Tendencia 3 meses: ${tend >= 0 ? "+" : ""}${tend}`, marginX, y); y += 6;

    if (proy.nombre_mes_anterior && proy.nombre_mes_actual) {
      doc.text(
        `•  ${proy.nombre_mes_anterior}: ${proy.mes_anterior ?? "—"}  ->  ${proy.nombre_mes_actual}: ${proy.mes_actual ?? "—"} (${proy.variacion_mom >= 0 ? "+" : ""}${proy.variacion_mom ?? "—"}, ${proy.variacion_pct >= 0 ? "+" : ""}${proy.variacion_pct ?? "—"}%)`,
        marginX, y
      );
      y += 6;
    }

    // Gráficos en página nueva
    doc.addPage();
    y = 20;
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Gráficos", marginX, y);
    y += 8;

    const chartIds     = ["chart-mensual", "chart-tipo", "chart-zona", "chart-vendedor"];
    const chartTitles  = ["Trabajos por mes / año", "Distribución por tipo", "Trabajos por zona", "Ranking de vendedores"];

    chartIds.forEach((id, i) => {
      const canvas = document.getElementById(id);
      if (!canvas) return;

      const imgWidth  = pageWidth - marginX * 2;
      const imgHeight = (canvas.height / canvas.width) * imgWidth;

      if (y + imgHeight + 12 > pageHeight) {
        doc.addPage();
        y = 20;
      }

      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(chartTitles[i], marginX, y);
      y += 6;

      const imgData = canvas.toDataURL("image/png");
      doc.addImage(imgData, "PNG", marginX, y, imgWidth, imgHeight);
      y += imgHeight + 10;
    });

    doc.save("resumen_ejecutivo.pdf");
    status.textContent = "✔ PDF descargado correctamente.";
  } catch (e) {
    status.textContent = "❌ Error al generar el PDF.";
  }
}

// ══════════════════════════════════════════
//  Administración
// ══════════════════════════════════════════
async function initAdmin() {
  const rol = document.getElementById("user-role").textContent;
  if (rol !== "Administrador") {
    document.getElementById("admin-no-permiso").classList.remove("hidden");
    return;
  }
  document.getElementById("admin-container").classList.remove("hidden");
  await loadUsers();

  if (!document.getElementById("admin-container").dataset.init) {
    document.getElementById("btn-crear-usuario").addEventListener("click", crearUsuario);
    document.getElementById("admin-container").dataset.init = "1";
  }
}

async function loadUsers() {
  const res = await fetch("/api/auth/users", { credentials: "include" });
  if (!res.ok) return;
  const users = await res.json();

  document.getElementById("admin-users-tbody").innerHTML = users.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${u.username}</td>
      <td><span class="badge-rol ${u.rol === 'admin' ? 'badge-admin' : 'badge-usuario'}">${u.rol}</span></td>
      <td>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="password" id="pwd-${u.username}" placeholder="Nueva contraseña" style="padding:6px 10px; border-radius:6px; border:1px solid var(--border); background:var(--bg-input, #fff); color:var(--text-primary); font-size:13px;" />
          <button class="btn-secondary" onclick="cambiarPassword('${u.username}')">Guardar</button>
        </div>
      </td>
      <td>
        ${u.username !== 'admin' ? `<button class="btn-danger" onclick="eliminarUsuario('${u.username}')">Eliminar</button>` : '—'}
      </td>
    </tr>`).join("");
}

async function crearUsuario() {
  const username = document.getElementById("new-username").value.trim();
  const password = document.getElementById("new-password").value.trim();
  const rol      = document.getElementById("new-rol").value;
  const status   = document.getElementById("crear-status");

  if (!username || !password) { status.textContent = "❌ Completá usuario y contraseña."; return; }

  const res = await fetch("/api/auth/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, password, rol }),
  });

  if (res.ok) {
    showToast("Usuario creado.", "success");
    document.getElementById("new-username").value = "";
    document.getElementById("new-password").value = "";
    document.getElementById("new-rol").value = "usuario";
    status.textContent = "";
    await loadUsers();
  } else {
    const err = await res.json().catch(() => ({}));
    status.textContent = "❌ " + (err.detail || "Error al crear usuario.");
  }
}

async function cambiarPassword(username) {
  const input = document.getElementById("pwd-" + username);
  const pwd   = input.value.trim();
  if (!pwd) { showToast("Ingresá la nueva contraseña.", "warning"); return; }

  const res = await fetch("/api/auth/users/password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ username, new_password: pwd }),
  });

  if (res.ok) { showToast("Contraseña actualizada.", "success"); input.value = ""; }
  else { showToast("Error al cambiar contraseña.", "error"); }
}

async function eliminarUsuario(username) {
  const ok = await showConfirm(`¿Seguro que querés eliminar al usuario "${username}"?`);
  if (!ok) return;

  const res = await fetch(`/api/auth/users/${username}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (res.ok) {
    showToast("Usuario eliminado.", "success");
    await loadUsers();
  } else {
    const err = await res.json().catch(() => ({}));
    showToast(err.detail || "Error al eliminar.", "error");
  }
}

// ══════════════════════════════════════════
//  Notificaciones (toasts) y confirmaciones
// ══════════════════════════════════════════
function showToast(mensaje, tipo = "info") {
  const cont = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast toast-${tipo}`;
  const icono = { success: "✔", error: "❌", info: "ℹ️", warning: "⚠️" }[tipo] || "ℹ️";
  toast.innerHTML = `<span class="toast-icon">${icono}</span><span class="toast-msg">${mensaje}</span>`;
  cont.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("toast-show"));

  setTimeout(() => {
    toast.classList.remove("toast-show");
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function showConfirm(mensaje) {
  return new Promise((resolve) => {
    const overlay = document.getElementById("confirm-overlay");
    document.getElementById("confirm-message").textContent = mensaje;
    overlay.classList.remove("hidden");

    const btnYes = document.getElementById("confirm-yes");
    const btnNo  = document.getElementById("confirm-no");

    const cerrar = (resultado) => {
      overlay.classList.add("hidden");
      btnYes.removeEventListener("click", onYes);
      btnNo.removeEventListener("click", onNo);
      resolve(resultado);
    };
    const onYes = () => cerrar(true);
    const onNo  = () => cerrar(false);

    btnYes.addEventListener("click", onYes);
    btnNo.addEventListener("click", onNo);
  });
}

// ══════════════════════════════════════════
//  Estados de carga (spinner en botones)
// ══════════════════════════════════════════
function setBtnLoading(btn, loadingText) {
  btn.dataset.originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>${loadingText}`;
}

function clearBtnLoading(btn, finalText) {
  btn.disabled = false;
  btn.innerHTML = finalText ?? btn.dataset.originalText ?? btn.textContent;
}

// ══════════════════════════════════════════
//  Badges de colores (consistencia visual)
// ══════════════════════════════════════════
function badgeHtml(text) {
  if (!text || text === "—") return text ?? "—";
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  const idx = hash % 8;
  return `<span class="badge badge-c${idx}">${text}</span>`;
}
// ══════════════════════════════════════════
//  Módulo de Bajas
// ══════════════════════════════════════════
let chartVentasBajas = null;
let chartMotivos     = null;
let bajasData        = null;

async function initBajas() {
  if (!currentFileId) return;

  document.getElementById("bajas-empty").classList.add("hidden");
  document.getElementById("bajas-container").classList.remove("hidden");

  // Cargar datos
  try {
    const [resBajas, resComp] = await Promise.all([
      fetch(`/api/bajas?file_id=${currentFileId}`),
      fetch("/api/bajas/comparacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_id:           currentFileId,
          sheet_id:          currentSheetId,
          date_column:       document.getElementById("col-fecha").value,
          tipo_column:       document.getElementById("col-tipo").value,
          zona_column:       document.getElementById("col-zona").value    || "",
          vendedor_column:   document.getElementById("col-vendedor").value || "",
          promo_column:      document.getElementById("col-promo").value    || "",
          plan_nuevo_column: document.getElementById("col-plan").value     || "",
        }),
      }),
    ]);

    if (!resBajas.ok || !resComp.ok) {
      showToast("No se encontró la hoja de Bajas en el archivo.", "warning");
      document.getElementById("bajas-container").classList.add("hidden");
      document.getElementById("bajas-empty").classList.remove("hidden");
      return;
    }

    const dataBajas = await resBajas.json();
    const dataComp  = await resComp.json();

    bajasData = { ...dataBajas, ...dataComp };

    if (!document.getElementById("bajas-container").dataset.init) {
      document.getElementById("bajas-desde").addEventListener("change", renderBajasFiltrado);
      document.getElementById("bajas-hasta").addEventListener("change", renderBajasFiltrado);
      document.getElementById("bajas-clear-filtro").addEventListener("click", () => {
        document.getElementById("bajas-desde").value = "";
        document.getElementById("bajas-hasta").value = "";
        renderBajasFiltrado();
      });
      document.getElementById("bajas-container").dataset.init = "1";
    }

    renderBajasFiltrado();

  } catch (e) {
    showToast("Error al cargar datos de Bajas.", "error");
  }
}

function renderBajasFiltrado() {
  if (!bajasData) return;

  const desde = document.getElementById("bajas-desde").value;
  const hasta = document.getElementById("bajas-hasta").value;

  let comp = bajasData.comparacion ?? [];
  if (desde) comp = comp.filter(r => r.mes >= desde.slice(0, 7));
  if (hasta) comp = comp.filter(r => r.mes <= hasta.slice(0, 7));

  let bajasMes = bajasData.bajas_por_mes ?? [];
  if (desde) bajasMes = bajasMes.filter(r => r.mes >= desde.slice(0, 7));
  if (hasta) bajasMes = bajasMes.filter(r => r.mes <= hasta.slice(0, 7));

  // KPIs
  const totalBajas  = bajasMes.reduce((s, r) => s + r.total, 0);
  const totalVentas = comp.reduce((s, r) => s + r.ventas, 0);
  const neto        = totalVentas - totalBajas;
  const tasa        = totalVentas > 0 ? (totalBajas / totalVentas * 100).toFixed(1) : 0;

  document.getElementById("bk-total").textContent  = totalBajas;
  document.getElementById("bk-ventas").textContent = totalVentas;
  const netoEl = document.getElementById("bk-neto");
  netoEl.textContent  = (neto >= 0 ? "+" : "") + neto;
  netoEl.className    = "kpi-value " + (neto >= 0 ? "bajas-neto-pos" : "bajas-neto-neg");
  document.getElementById("bk-tasa").textContent   = tasa + "%";

  // Gráfico comparación
  if (chartVentasBajas) chartVentasBajas.destroy();
  chartVentasBajas = new Chart(document.getElementById("chart-ventas-bajas"), {
    type: "bar",
    data: {
      labels: comp.map(r => r.mes),
      datasets: [
        {
          label: currentLang === "en" ? "Sales" : "Ventas",
          data: comp.map(r => r.ventas),
          backgroundColor: "#4f46e5aa",
          borderColor: "#4f46e5",
          borderWidth: 1,
        },
        {
          label: currentLang === "en" ? "Cancellations" : "Bajas",
          data: comp.map(r => r.bajas),
          backgroundColor: "#ef4444aa",
          borderColor: "#ef4444",
          borderWidth: 1,
        },
        {
          label: currentLang === "en" ? "Net balance" : "Saldo neto",
          data: comp.map(r => r.neto),
          type: "line",
          borderColor: "#10b981",
          backgroundColor: "#10b98122",
          tension: 0.4,
          fill: false,
          pointRadius: 4,
          yAxisID: "y",
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { display: true, position: "top" } },
      scales: {
        x: { grid: { color: "rgba(0,0,0,.05)" } },
        y: { beginAtZero: true, grid: { color: "rgba(0,0,0,.05)" } },
      },
    },
  });

  // Gráfico motivos
  if (chartMotivos) chartMotivos.destroy();
  const todosMotivos = bajasData.bajas_por_motivo ?? [];

  const sinEsp    = todosMotivos.find(m => m.motivo === "Sin especificar");
  const conMotivo = todosMotivos.filter(m => m.motivo !== "Sin especificar");

  const avisoEl = document.getElementById("motivos-aviso");
  if (avisoEl) {
    if (sinEsp) {
      avisoEl.textContent = currentLang === "en"
        ? "⚠️ " + sinEsp.cantidad + " cancellations with no registered reason"
        : "⚠️ " + sinEsp.cantidad + " bajas sin motivo registrado";
      avisoEl.style.display = "block";
    } else {
      avisoEl.style.display = "none";
    }
  }

  const motivos = sinEsp ? [...conMotivo, sinEsp] : conMotivo;
  const coloresMotivos = sinEsp
    ? [...COLORS.slice(0, conMotivo.length), "#9ca3af"]
    : COLORS.slice(0, motivos.length);

  chartMotivos = new Chart(document.getElementById("chart-motivos"), {
    type: "doughnut",
    data: {
      labels: motivos.map(m => m.motivo),
      datasets: [{ data: motivos.map(m => m.cantidad), backgroundColor: coloresMotivos }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true, position: "bottom" } },
    },
  });

  // Tabla mes a mes
  const tbody = document.getElementById("bajas-tbody");
  tbody.innerHTML = comp.map(r => {
    const tasa = r.tasa_baja_pct ?? 0;
    const tasaClass = tasa < 15 ? "tasa-ok" : tasa < 25 ? "tasa-warn" : "tasa-bad";
    const netoClass = r.neto >= 0 ? "bajas-neto-pos" : "bajas-neto-neg";
    return `<tr>
      <td><strong>${r.mes}</strong></td>
      <td>${r.ventas}</td>
      <td>${r.bajas}</td>
      <td class="${netoClass}"><strong>${r.neto >= 0 ? "+" : ""}${r.neto}</strong></td>
      <td><span class="tasa-badge ${tasaClass}">${tasa}%</span></td>
    </tr>`;
  }).join("");

  // Label período
  const label = document.getElementById("bajas-period-label");
  label.textContent = (desde || hasta)
    ? (currentLang === "en" ? `Showing ${comp.length} filtered months` : `Mostrando ${comp.length} meses filtrados`)
    : (currentLang === "en" ? `${comp.length} months total` : `${comp.length} meses en total`);
}

// ══════════════════════════════════════════
//  Mapas de calor
// ══════════════════════════════════════════
function renderHeatmaps(data) {
  const section = document.getElementById("heatmaps-section");
  if (!section) return;

  const registros = data.registros ?? [];
  if (!registros.length) return;

  section.classList.remove("hidden");

  // Construir pivot desde registros
  function buildPivot(campo) {
    const meses    = [...new Set(registros.map(r => r.fecha?.slice(0, 7)).filter(Boolean))].sort();
    const valores  = [...new Set(registros.map(r => r[campo]).filter(Boolean))].sort();
    const pivot    = {};
    let maxVal     = 0;

    valores.forEach(v => {
      pivot[v] = {};
      meses.forEach(m => pivot[v][m] = 0);
    });

    registros.forEach(r => {
      const mes = r.fecha?.slice(0, 7);
      const val = r[campo];
      if (mes && val && pivot[val]) {
        pivot[val][mes]++;
        if (pivot[val][mes] > maxVal) maxVal = pivot[val][mes];
      }
    });

    return { pivot, meses, valores, maxVal };
  }

  function drawHeatmap(containerId, campo) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { pivot, meses, valores, maxVal } = buildPivot(campo);

    const cellW   = 80;
    const cellH   = 44;
    const padLeft = 110;
    const padTop  = 40;
    const width   = padLeft + meses.length * cellW + 20;
    const height  = padTop  + valores.length * cellH + 20;

    const canvas  = document.createElement("canvas");
    canvas.width  = width;
    canvas.height = height;
    canvas.style.width  = "100%";
    canvas.style.maxWidth = width + "px";
    container.innerHTML = "";
    container.appendChild(canvas);

    const ctx = canvas.getContext("2d");

    // Fondo
    ctx.fillStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--bg-card").trim() || "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Encabezados de columnas (meses)
    ctx.fillStyle = "#6b7280";
    ctx.font      = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    meses.forEach((mes, j) => {
      const label = mes.slice(5); // solo MM
      const x = padLeft + j * cellW + cellW / 2;
      ctx.fillText(mes, x, padTop - 10);
    });

    // Filas
    valores.forEach((val, i) => {
      const y = padTop + i * cellH;

      // Etiqueta fila
      ctx.fillStyle = "#374151";
      ctx.font      = "13px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(val, padLeft - 10, y + cellH / 2 + 5);

      meses.forEach((mes, j) => {
        const count  = pivot[val][mes] ?? 0;
        const ratio  = maxVal > 0 ? count / maxVal : 0;

        // Color: de blanco a índigo
        const r = Math.round(255 - ratio * (255 - 79));
        const g = Math.round(255 - ratio * (255 - 70));
        const b = Math.round(255 - ratio * (255 - 229));

        const x = padLeft + j * cellW;

        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);

        // Borde suave
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.strokeRect(x + 2, y + 2, cellW - 4, cellH - 4);

        // Número
        ctx.fillStyle  = ratio > 0.5 ? "#ffffff" : "#1f2937";
        ctx.font       = "bold 14px system-ui, sans-serif";
        ctx.textAlign  = "center";
        ctx.fillText(count, x + cellW / 2, y + cellH / 2 + 5);
      });
    });
  }

  drawHeatmap("heatmap-vendedor", "vendedor");
  drawHeatmap("heatmap-zona",     "zona");

  renderHeatmapInsights("heatmap-vendedor", "vendedor");
  renderHeatmapInsights("heatmap-zona",     "zona");
}

function renderHeatmapInsights(containerId, campo) {
  const registros = lastData?.registros ?? [];
  if (!registros.length) return;

  const meses   = [...new Set(registros.map(r => r.fecha?.slice(0, 7)).filter(Boolean))].sort();
  const valores = [...new Set(registros.map(r => r[campo]).filter(Boolean))].sort();

  // Construir pivot
  const pivot = {};
  valores.forEach(v => { pivot[v] = {}; meses.forEach(m => pivot[v][m] = 0); });
  registros.forEach(r => {
    const mes = r.fecha?.slice(0, 7);
    const val = r[campo];
    if (mes && val && pivot[val]) pivot[val][mes]++;
  });

  // Mejor celda global
  let maxVal = 0, maxNombre = "", maxMes = "";
  // Peor celda (excluyendo ceros)
  let minVal = Infinity, minNombre = "", minMes = "";
  // Sin actividad
  const sinActividad = [];

  valores.forEach(v => {
    meses.forEach(m => {
      const c = pivot[v][m];
      if (c > maxVal) { maxVal = c; maxNombre = v; maxMes = m; }
      if (c === 0) sinActividad.push(`${v} en ${m}`);
      if (c > 0 && c < minVal) { minVal = c; minNombre = v; minMes = m; }
    });
  });

  // Tendencia por fila (primer mes vs último)
  const tendencias = valores.map(v => {
    const primero = pivot[v][meses[0]] ?? 0;
    const ultimo  = pivot[v][meses[meses.length - 1]] ?? 0;
    return { nombre: v, diff: ultimo - primero };
  }).sort((a, b) => b.diff - a.diff);

  const mejorTendencia = tendencias[0];
  const peorTendencia  = tendencias[tendencias.length - 1];

  // Armar texto
  const insights = [];

  insights.push(currentLang === "en"
    ? `🏆 <strong>${maxNombre}</strong> had their best month in <strong>${maxMes}</strong> with <strong>${maxVal}</strong> jobs.`
    : `🏆 <strong>${maxNombre}</strong> tuvo su mejor mes en <strong>${maxMes}</strong> con <strong>${maxVal}</strong> trabajos.`);

  if (sinActividad.length > 0 && sinActividad.length <= 4) {
    insights.push(currentLang === "en"
      ? `⚠️ No activity: ${sinActividad.map(s => `<strong>${s}</strong>`).join(", ")}.`
      : `⚠️ Sin actividad: ${sinActividad.map(s => `<strong>${s}</strong>`).join(", ")}.`);
  } else if (sinActividad.length > 4) {
    insights.push(currentLang === "en"
      ? `⚠️ There are <strong>${sinActividad.length}</strong> combinations with no recorded activity.`
      : `⚠️ Hay <strong>${sinActividad.length}</strong> combinaciones sin actividad registrada.`);
  }

  if (mejorTendencia && mejorTendencia.diff > 0) {
    insights.push(currentLang === "en"
      ? `📈 <strong>${mejorTendencia.nombre}</strong> showed the best trend (+${mejorTendencia.diff} from first to last month).`
      : `📈 <strong>${mejorTendencia.nombre}</strong> mostró la mejor tendencia (+${mejorTendencia.diff} del primer al último mes).`);
  }
  if (peorTendencia && peorTendencia.diff < 0) {
    insights.push(currentLang === "en"
      ? `📉 <strong>${peorTendencia.nombre}</strong> showed the biggest drop (${peorTendencia.diff} from first to last month).`
      : `📉 <strong>${peorTendencia.nombre}</strong> mostró la mayor caída (${peorTendencia.diff} del primer al último mes).`);
  }

  // Insertar debajo del canvas
  const container = document.getElementById(containerId);
  const insightDiv = document.createElement("div");
  insightDiv.style.cssText = "margin-top:12px; font-size:13px; color:var(--text-secondary); line-height:1.8;";
  insightDiv.innerHTML = insights.map(i => `<div>${i}</div>`).join("");
  container.appendChild(insightDiv);
}

// ══════════════════════════════════════════
//  Exportar gráfico como PNG
// ══════════════════════════════════════════
function exportChart(canvasId, filename) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const link = document.createElement("a");
  link.download = filename + ".png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// ══════════════════════════════════════════
//  Comparador de períodos
// ══════════════════════════════════════════
let compChartTipo     = null;
let compChartZona     = null;
let compChartVendedor = null;

function initComparador() {
  if (!lastData?.registros?.length) return;

  document.getElementById("comparador-empty").classList.add("hidden");
  document.getElementById("comparador-container").classList.remove("hidden");

  if (!document.getElementById("comparador-container").dataset.init) {
    document.getElementById("btn-comparar").addEventListener("click", ejecutarComparacion);
    document.getElementById("comparador-container").dataset.init = "1";
  }
}

function filtrarPorPeriodo(registros, desde, hasta) {
  return registros.filter(r => {
    const fecha = r.fecha?.slice(0, 10);
    if (!fecha) return false;
    if (desde && fecha < desde) return false;
    if (hasta && fecha > hasta) return false;
    return true;
  });
}

function calcResumen(registros) {
  const porTipo     = {};
  const porZona     = {};
  const porVendedor = {};

  registros.forEach(r => {
    if (r.tipo)     porTipo[r.tipo]         = (porTipo[r.tipo]         || 0) + 1;
    if (r.zona)     porZona[r.zona]         = (porZona[r.zona]         || 0) + 1;
    if (r.vendedor) porVendedor[r.vendedor] = (porVendedor[r.vendedor] || 0) + 1;
  });

  return { total: registros.length, porTipo, porZona, porVendedor };
}

function ejecutarComparacion() {
  const p1desde = document.getElementById("comp-p1-desde").value;
  const p1hasta = document.getElementById("comp-p1-hasta").value;
  const p2desde = document.getElementById("comp-p2-desde").value;
  const p2hasta = document.getElementById("comp-p2-hasta").value;

  if (!p1desde || !p1hasta || !p2desde || !p2hasta) {
    showToast("Completá las fechas de ambos períodos.", "warning");
    return;
  }

  const registros = lastData.registros ?? [];
  const r1 = filtrarPorPeriodo(registros, p1desde, p1hasta);
  const r2 = filtrarPorPeriodo(registros, p2desde, p2hasta);

  const s1 = calcResumen(r1);
  const s2 = calcResumen(r2);

  document.getElementById("comparador-resultado").classList.remove("hidden");

  // KPIs
  const varTotal = s2.total - s1.total;
  const varPct   = s1.total > 0 ? ((varTotal / s1.total) * 100).toFixed(1) : "—";
  const isUp     = varTotal >= 0;

  document.getElementById("comp-kpis").innerHTML = `
    <div class="riesgo-card riesgo-info">
      <div class="riesgo-icon">📅</div>
      <div class="riesgo-info">
        <span class="riesgo-label">Período 1</span>
        <span class="riesgo-value">${s1.total} trabajos</span>
        <span class="riesgo-explicacion">${p1desde} → ${p1hasta}</span>
      </div>
    </div>
    <div class="riesgo-card riesgo-warn">
      <div class="riesgo-icon">📅</div>
      <div class="riesgo-info">
        <span class="riesgo-label">Período 2</span>
        <span class="riesgo-value">${s2.total} trabajos</span>
        <span class="riesgo-explicacion">${p2desde} → ${p2hasta}</span>
      </div>
    </div>
    <div class="riesgo-card ${isUp ? '' : 'riesgo-danger'}">
      <div class="riesgo-icon">${isUp ? "📈" : "📉"}</div>
      <div class="riesgo-info">
        <span class="riesgo-label">Variación</span>
        <span class="riesgo-value" style="color:${isUp ? 'var(--success)' : 'var(--danger)'}">
          ${isUp ? "+" : ""}${varTotal} (${isUp ? "+" : ""}${varPct}%)
        </span>
        <span class="riesgo-explicacion">${isUp ? "Mejor que el período anterior" : "Menor que el período anterior"}</span>
      </div>
    </div>
  `;

  // Gráficos
  const allKeys = (obj1, obj2) => [...new Set([...Object.keys(obj1), ...Object.keys(obj2)])].sort();

  function renderCompChart(canvasId, chartRef, label1, label2, data1, data2) {
    if (chartRef) chartRef.destroy();
    const keys = allKeys(data1, data2);
    return new Chart(document.getElementById(canvasId), {
      type: "bar",
      data: {
        labels: keys,
        datasets: [
          {
            label: label1,
            data: keys.map(k => data1[k] || 0),
            backgroundColor: "#4f46e5aa",
            borderColor: "#4f46e5",
            borderWidth: 1,
            borderRadius: 4,
          },
          {
            label: label2,
            data: keys.map(k => data2[k] || 0),
            backgroundColor: "#ec4899aa",
          borderColor: "#ec4899",
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true, position: "top" } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true, grid: { color: "rgba(0,0,0,.05)" } },
        },
      },
    });
  }

  const label1 = `P1 (${p1desde} → ${p1hasta})`;
  const label2 = `P2 (${p2desde} → ${p2hasta})`;

  compChartTipo     = renderCompChart("comp-chart-tipo",     compChartTipo,     label1, label2, s1.porTipo,     s2.porTipo);
  compChartZona     = renderCompChart("comp-chart-zona",     compChartZona,     label1, label2, s1.porZona,     s2.porZona);
  compChartVendedor = renderCompChart("comp-chart-vendedor", compChartVendedor, label1, label2, s1.porVendedor, s2.porVendedor);

  // Tabla detalle
  function tablaCategoria(titulo, data1, data2) {
    const keys = allKeys(data1, data2);
    const rows = keys.map(k => {
      const v1  = data1[k] || 0;
      const v2  = data2[k] || 0;
      const diff = v2 - v1;
      const cls  = diff > 0 ? "bajas-neto-pos" : diff < 0 ? "bajas-neto-neg" : "";
      return `<tr>
        <td>${badgeHtml(k)}</td>
        <td>${v1}</td>
        <td>${v2}</td>
        <td class="${cls}"><strong>${diff > 0 ? "+" : ""}${diff}</strong></td>
      </tr>`;
    }).join("");

    return `
      <h5 style="margin:16px 0 8px; color:var(--text-secondary); text-transform:uppercase; font-size:11px; letter-spacing:1px;">${titulo}</h5>
      <table style="margin-bottom:16px;">
        <thead><tr><th>Categoría</th><th>Período 1</th><th>Período 2</th><th>Variación</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  document.getElementById("comp-tabla").innerHTML =
    tablaCategoria("Por tipo",      s1.porTipo,     s2.porTipo)     +
    tablaCategoria("Por zona",      s1.porZona,     s2.porZona)     +
    tablaCategoria("Por vendedor",  s1.porVendedor, s2.porVendedor);
}

// ══════════════════════════════════════════
//  Idioma (ES / EN)
// ══════════════════════════════════════════
let currentLang = "es";

const i18n = {
  es: {
    // Sidebar
    nav_principal: "PRINCIPAL",
    nav_gestion: "GESTIÓN",
    nav_seguimiento: "SEGUIMIENTO",
    nav_sistema: "SISTEMA",
    nav_dashboard: "Dashboard",
    nav_agenda: "Agenda",
    nav_comercial: "Comercial",
    nav_clientes: "Clientes",
    nav_zonas: "Zonas",
    nav_planes: "Planes",
    nav_promociones: "Promociones",
    nav_postventa: "Postventa",
    nav_reportes: "Reportes",
    nav_bajas: "Bajas",
    nav_comparador: "Comparador",
    nav_administracion: "Administración",
    // Dashboard
    dashboard_titulo: "Resumen Ejecutivo",
    dashboard_subtitulo: "Cargá un archivo Excel para ver los datos",
    upload_label: "📂 Cargar archivo Excel",
    btn_upload: "Cargar archivo",
    btn_analizar: "Analizar datos",
    hoja_label: "Hoja:",
    btn_sel_hoja: "Seleccionar hoja",
    mapear_titulo: "Mapear columnas",
    col_fecha: "Fecha *",
    col_tipo: "Tipo de trabajo *",
    col_zona: "Zona",
    col_vendedor: "Vendedor",
    col_promo: "Promoción",
    col_plan: "Plan nuevo",
    opcional: "— opcional —",
    // KPIs
    kpi_mes: "Trabajos del mes",
    kpi_total: "Total registros",
    kpi_zona: "Zona más activa",
    kpi_vendedor: "Vendedor del mes",
    kpi_tipo: "Tipo más frecuente",
    kpi_tasa: "Tasa de baja",
    // Proyecciones
    proy_titulo: "Proyecciones",
    proy_subtitulo: "Basadas en el promedio de los últimos 3 meses",
    proy_semana: "Esta semana",
    proy_mes: "Este mes",
    proy_anio: "Este año",
    proy_tendencia: "Tendencia 3 meses",
    comp_mensual: "Comparación mensual",
    // Riesgos
    riesgos_titulo: "Alertas y riesgos",
    riesgo_tasa: "Tasa de baja promedio",
    riesgo_zona: "Zona con menor actividad",
    riesgo_conc: "Concentración de ventas",
    // Alertas
    alertas_titulo: "🔔 Alertas automáticas",
    alertas_subtitulo: "Anomalías detectadas en los datos cargados",
    // Módulos
    desde: "Desde",
    hasta: "Hasta",
    limpiar_fechas: "Limpiar fechas",
    limpiar_filtros: "Limpiar filtros",
    tipo_trabajo: "Tipo de trabajo",
    todos: "Todos",
    todas: "Todas",
    buscar: "Buscar",
    // Agenda
    agenda_titulo: "Agenda",
    agenda_subtitulo: "Todos los registros cargados",
    agenda_empty: "📅 Cargá un archivo en el Dashboard primero",
    col_fecha_th: "Fecha",
    col_tipo_th: "Tipo",
    col_zona_th: "Zona",
    col_vendedor_th: "Vendedor",
    col_promo_th: "Promoción",
    col_plan_th: "Plan nuevo",
    // Reportes
    reportes_titulo: "Reportes",
    reportes_subtitulo: "Exportá los datos analizados a Excel",
    reportes_empty: "📈 Cargá un archivo en el Dashboard primero",
    reporte_titulo_card: "Reporte completo de ventas",
    reporte_desc: "Descargá un Excel con 6 hojas: Resumen general, Agenda completa, Por mes, Por vendedor, Por tipo y Por zona.",
    btn_excel: "⬇ Descargar reporte Excel",
    btn_pdf: "📄 Descargar resumen PDF",
    // Bajas
    bajas_titulo: "Módulo de Bajas",
    bajas_subtitulo: "Estadísticas y comparación de bajas vs ventas",
    bajas_empty: "📉 Cargá un archivo en el Dashboard primero",
    bk_total: "Total bajas",
    bk_ventas: "Total ventas",
    bk_neto: "Saldo neto",
    bk_tasa: "Tasa de baja",
    // Comparador
    comp_titulo: "Comparador de períodos",
    comp_subtitulo: "Compará dos rangos de fechas y analizá las diferencias",
    comp_empty: "🔀 Cargá un archivo en el Dashboard primero",
    btn_comparar: "Comparar períodos",
    // Admin
    admin_titulo: "Administración",
    admin_subtitulo: "Gestión de usuarios del sistema",
    admin_crear: "➕ Crear usuario",
    admin_lista: "👥 Usuarios del sistema",
    admin_usuario: "Usuario",
    admin_password: "Contraseña",
    admin_rol: "Rol",
    btn_crear: "Crear usuario",
    // Login
    login_titulo: "Sistema de Ventas",
    login_subtitulo: "Ingresá tus credenciales para continuar",
    login_usuario: "Usuario",
    login_password: "Contraseña",
    login_placeholder_user: "Tu usuario",
    login_placeholder_pwd: "Tu contraseña",
    btn_login: "Ingresar",
    login_error: "Usuario o contraseña incorrectos",
    clientes_titulo: "Clientes",
    clientes_subtitulo: "Listado de clientes agendados",
    clientes_empty: "Cargá un archivo en el Dashboard primero",
    comercial_titulo: "Módulo Comercial",
    comercial_empty: "Cargá un archivo en el Dashboard primero",
    zonas_titulo: "Zonas",
    zonas_empty: "Cargá un archivo en el Dashboard primero",
    planes_titulo: "Planes",
    planes_empty: "Cargá un archivo en el Dashboard primero",
    promociones_titulo: "Promociones",
    promociones_empty: "Cargá un archivo en el Dashboard primero",
    postventa_titulo: "Postventa",
    postventa_empty: "🔧 Cargá un archivo en el Dashboard primero",
    pag_anterior: "← Anterior",
    pag_siguiente: "Siguiente →",
  },
  en: {
    // Sidebar
    nav_principal: "MAIN",
    nav_gestion: "MANAGEMENT",
    nav_seguimiento: "TRACKING",
    nav_sistema: "SYSTEM",
    nav_dashboard: "Dashboard",
    nav_agenda: "Schedule",
    nav_comercial: "Sales",
    nav_clientes: "Clients",
    nav_zonas: "Zones",
    nav_planes: "Plans",
    nav_promociones: "Promotions",
    nav_postventa: "After-sales",
    nav_reportes: "Reports",
    nav_bajas: "Cancellations",
    nav_comparador: "Comparator",
    nav_administracion: "Administration",
    // Dashboard
    dashboard_titulo: "Executive Summary",
    dashboard_subtitulo: "Load an Excel file to view data",
    upload_label: "📂 Load Excel file",
    btn_upload: "Load file",
    btn_analizar: "Analyze data",
    hoja_label: "Sheet:",
    btn_sel_hoja: "Select sheet",
    mapear_titulo: "Map columns",
    col_fecha: "Date *",
    col_tipo: "Work type *",
    col_zona: "Zone",
    col_vendedor: "Salesperson",
    col_promo: "Promotion",
    col_plan: "New plan",
    opcional: "— optional —",
    // KPIs
    kpi_mes: "Jobs this month",
    kpi_total: "Total records",
    kpi_zona: "Most active zone",
    kpi_vendedor: "Salesperson of the month",
    kpi_tipo: "Most frequent type",
    kpi_tasa: "Cancellation rate",
    // Proyecciones
    proy_titulo: "Projections",
    proy_subtitulo: "Based on the last 3-month average",
    proy_semana: "This week",
    proy_mes: "This month",
    proy_anio: "This year",
    proy_tendencia: "3-month trend",
    comp_mensual: "Monthly comparison",
    // Riesgos
    riesgos_titulo: "Alerts & risks",
    riesgo_tasa: "Average cancellation rate",
    riesgo_zona: "Least active zone",
    riesgo_conc: "Sales concentration",
    // Alertas
    alertas_titulo: "🔔 Automatic alerts",
    alertas_subtitulo: "Anomalies detected in loaded data",
    // Módulos
    desde: "From",
    hasta: "To",
    limpiar_fechas: "Clear dates",
    limpiar_filtros: "Clear filters",
    tipo_trabajo: "Work type",
    todos: "All",
    todas: "All",
    buscar: "Search",
    // Agenda
    agenda_titulo: "Schedule",
    agenda_subtitulo: "All loaded records",
    agenda_empty: "📅 Load a file in the Dashboard first",
    col_fecha_th: "Date",
    col_tipo_th: "Type",
    col_zona_th: "Zone",
    col_vendedor_th: "Salesperson",
    col_promo_th: "Promotion",
    col_plan_th: "New plan",
    // Reportes
    reportes_titulo: "Reports",
    reportes_subtitulo: "Export analyzed data to Excel",
    reportes_empty: "📈 Load a file in the Dashboard first",
    reporte_titulo_card: "Full sales report",
    reporte_desc: "Download an Excel with 6 sheets: General summary, Full schedule, By month, By salesperson, By type and By zone.",
    btn_excel: "⬇ Download Excel report",
    btn_pdf: "📄 Download PDF summary",
    // Bajas
    bajas_titulo: "Cancellations",
    bajas_subtitulo: "Statistics and comparison of cancellations vs sales",
    bajas_empty: "📉 Load a file in the Dashboard first",
    bk_total: "Total cancellations",
    bk_ventas: "Total sales",
    bk_neto: "Net balance",
    bk_tasa: "Cancellation rate",
    // Comparador
    comp_titulo: "Period comparator",
    comp_subtitulo: "Compare two date ranges and analyze differences",
    comp_empty: "🔀 Load a file in the Dashboard first",
    btn_comparar: "Compare periods",
    // Admin
    admin_titulo: "Administration",
    admin_subtitulo: "System user management",
    admin_crear: "➕ Create user",
    admin_lista: "👥 System users",
    admin_usuario: "Username",
    admin_password: "Password",
    admin_rol: "Role",
    btn_crear: "Create user",
    // Login
    login_titulo: "Sales System",
    login_subtitulo: "Enter your credentials to continue",
    login_usuario: "Username",
    login_password: "Password",
    login_placeholder_user: "Your username",
    login_placeholder_pwd: "Your password",
    btn_login: "Sign in",
    login_error: "Incorrect username or password",
    clientes_titulo: "Clients",
    clientes_subtitulo: "List of scheduled clients",
    clientes_empty: "Load a file in the Dashboard first",
    comercial_titulo: "Sales Module",
    comercial_empty: "Load a file in the Dashboard first",
    zonas_titulo: "Zones",
    zonas_empty: "Load a file in the Dashboard first",
    planes_titulo: "Plans",
    planes_empty: "Load a file in the Dashboard first",
    promociones_titulo: "Promotions",
    promociones_empty: "Load a file in the Dashboard first",
    postventa_titulo: "After-sales",
    postventa_empty: "🔧 Load a file in the Dashboard first",
    pag_anterior: "← Previous",
    pag_siguiente: "Next →",
  }
};

function t(key) {
  return i18n[currentLang]?.[key] ?? i18n["es"][key] ?? key;
}

function applyLanguage() {
  const l = currentLang;

  // Login
  document.querySelector("#login-screen h1").textContent = t("login_titulo");
  document.querySelector("#login-screen p").textContent = t("login_subtitulo");
  document.querySelector("label[for='username']").textContent = t("login_usuario");
  document.querySelector("label[for='password']").textContent = t("login_password");
  document.getElementById("username").placeholder = t("login_placeholder_user");
  document.getElementById("password").placeholder = t("login_placeholder_pwd");
  document.getElementById("btn-login").textContent = t("btn_login");
  document.getElementById("login-error").textContent = t("login_error");

  // Sidebar labels
  const labels = document.querySelectorAll(".nav-section-label");
  const labelKeys = ["nav_principal", "nav_gestion", "nav_seguimiento", "nav_sistema"];
  labels.forEach((el, i) => { if (labelKeys[i]) el.textContent = t(labelKeys[i]); });

  // Nav items
  const navMap = {
    dashboard: "nav_dashboard", agenda: "nav_agenda", comercial: "nav_comercial",
    clientes: "nav_clientes", zonas: "nav_zonas", planes: "nav_planes",
    promociones: "nav_promociones", postventa: "nav_postventa", reportes: "nav_reportes",
    bajas: "nav_bajas", comparador: "nav_comparador", administracion: "nav_administracion",
  };
  document.querySelectorAll(".nav-item[data-page]").forEach(el => {
    const key = navMap[el.dataset.page];
    if (key) {
      const icon = el.querySelector(".nav-icon");
      el.textContent = " " + t(key);
      if (icon) el.prepend(icon);
    }
  });

  // Dashboard
  document.querySelector("#page-dashboard .section-header h3").textContent = t("dashboard_titulo");
  document.querySelector("#page-dashboard .section-header p").textContent = t("dashboard_subtitulo");
  document.querySelector("#upload-bar span").textContent = t("upload_label");
  document.getElementById("btn-upload").textContent = t("btn_upload");
  document.getElementById("btn-analyze").textContent = t("btn_analizar");
  document.querySelector("#sheet-selector label").textContent = t("hoja_label");
  document.getElementById("btn-load-columns").textContent = t("btn_sel_hoja");
  document.querySelector("#column-mapper h4").textContent = t("mapear_titulo");

  // KPI labels
  const kpiLabels = document.querySelectorAll(".kpi-label");
  const kpiKeys = ["kpi_mes", "kpi_total", "kpi_zona", "kpi_vendedor", "kpi_tipo", "kpi_tasa"];
  kpiLabels.forEach((el, i) => { if (kpiKeys[i]) el.textContent = t(kpiKeys[i]); });

  // Proyecciones
  const proySection = document.querySelector("#proyecciones-section .section-header h3");
  if (proySection) proySection.textContent = t("proy_titulo");
  const proyLabels = document.querySelectorAll(".proy-label");
  const proyKeys = ["proy_semana", "proy_mes", "proy_anio", "proy_tendencia"];
  proyLabels.forEach((el, i) => { if (proyKeys[i]) el.textContent = t(proyKeys[i]); });

  // Riesgos
  const riesgosH3 = document.querySelector("#riesgos-section .section-header h3");
  if (riesgosH3) riesgosH3.textContent = t("riesgos_titulo");
  const riesgoLabels = document.querySelectorAll(".riesgo-label");
  const riesgoKeys = ["riesgo_tasa", "riesgo_zona", "riesgo_conc"];
  riesgoLabels.forEach((el, i) => { if (riesgoKeys[i]) el.textContent = t(riesgoKeys[i]); });

  // Botones de filtros
  document.querySelectorAll("[id$='-clear']").forEach(btn => {
    if (btn.id === "agenda-clear") btn.textContent = t("limpiar_filtros");
    else btn.textContent = t("limpiar_fechas");
  });
  document.querySelectorAll("[id$='-desde']").closest?.(".form-group");

  // Labels Desde/Hasta en todos los módulos
  document.querySelectorAll(".form-group label").forEach(label => {
    if (label.textContent.trim() === "Desde" || label.textContent.trim() === "From")
      label.textContent = t("desde");
    if (label.textContent.trim() === "Hasta" || label.textContent.trim() === "To")
      label.textContent = t("hasta");
    if (label.textContent.trim() === "Tipo de trabajo" || label.textContent.trim() === "Work type")
      label.textContent = t("tipo_trabajo");
    if (label.textContent.trim() === "Buscar" || label.textContent.trim() === "Search")
      label.textContent = t("buscar");
  });

  // Agenda
  document.querySelector("#page-agenda .section-header h3").textContent = t("agenda_titulo");
  document.querySelector("#page-agenda .section-header p").textContent = t("agenda_subtitulo");
  document.getElementById("agenda-empty").textContent = t("agenda_empty");

  // Reportes
  document.querySelector("#page-reportes .section-header h3").textContent = t("reportes_titulo");
  document.querySelector("#page-reportes .section-header p").textContent = t("reportes_subtitulo");
  document.getElementById("reportes-empty").textContent = t("reportes_empty");

  // Bajas
  document.querySelector("#page-bajas .section-header h3").textContent = t("bajas_titulo");
  document.querySelector("#page-bajas .section-header p").textContent = t("bajas_subtitulo");
  document.getElementById("bajas-empty").textContent = t("bajas_empty");
  document.querySelectorAll("#bajas-kpi-grid .kpi-label").forEach((el, i) => {
    const keys = ["bk_total", "bk_ventas", "bk_neto", "bk_tasa"];
    if (keys[i]) el.textContent = t(keys[i]);
  });

  // Comparador
  document.querySelector("#page-comparador .section-header h3").textContent = t("comp_titulo");
  document.querySelector("#page-comparador .section-header p").textContent = t("comp_subtitulo");
  document.getElementById("comparador-empty").textContent = t("comp_empty");
  document.getElementById("btn-comparar").textContent = t("btn_comparar");

  // Reportes botones
  const btnExcel = document.getElementById("btn-exportar");
  if (btnExcel) btnExcel.textContent = t("btn_excel");
  const btnPdf = document.getElementById("btn-exportar-pdf");
  if (btnPdf) btnPdf.textContent = t("btn_pdf");

// Comparador títulos período
  const compP1 = document.getElementById("comp-p1-titulo");
  const compP2 = document.getElementById("comp-p2-titulo");
  if (compP1) compP1.textContent = currentLang === "en" ? "📅 Period 1" : "📅 Período 1";
  if (compP2) compP2.textContent = currentLang === "en" ? "📅 Period 2" : "📅 Período 2";

  // Admin
  document.querySelector("#page-administracion .section-header h3").textContent = t("admin_titulo");

  // Admin
  document.querySelector("#page-administracion .section-header h3").textContent = t("admin_titulo");
  document.querySelector("#page-administracion .section-header p").textContent = t("admin_subtitulo");

  // Clientes
  const clientesH3 = document.querySelector("#page-clientes .section-header h3");
  if (clientesH3) clientesH3.textContent = t("clientes_titulo");
  const clientesP = document.querySelector("#page-clientes .section-header p");
  if (clientesP) clientesP.textContent = t("clientes_subtitulo");
  const clientesEmpty = document.querySelector("#clientes-content .empty-state");
  if (clientesEmpty) clientesEmpty.textContent = t("clientes_empty");

  // Comercial
  const comercialH3 = document.querySelector("#page-comercial .section-header h3");
  if (comercialH3) comercialH3.textContent = t("comercial_titulo");
  const comercialEmpty = document.querySelector("#comercial-content .empty-state");
  if (comercialEmpty) comercialEmpty.textContent = t("comercial_empty");

  // Zonas
  const zonasH3 = document.querySelector("#page-zonas .section-header h3");
  if (zonasH3) zonasH3.textContent = t("zonas_titulo");
  const zonasEmpty = document.querySelector("#zonas-content .empty-state");
  if (zonasEmpty) zonasEmpty.textContent = t("zonas_empty");

  // Planes
  const planesH3 = document.querySelector("#page-planes .section-header h3");
  if (planesH3) planesH3.textContent = t("planes_titulo");
  const planesEmpty = document.querySelector("#planes-content .empty-state");
  if (planesEmpty) planesEmpty.textContent = t("planes_empty");

  // Promociones
  const promoH3 = document.querySelector("#page-promociones .section-header h3");
  if (promoH3) promoH3.textContent = t("promociones_titulo");
  const promoEmpty = document.querySelector("#promociones-content .empty-state");
  if (promoEmpty) promoEmpty.textContent = t("promociones_empty");

  // Postventa
  const pvH3 = document.querySelector("#page-postventa .section-header h3");
  if (pvH3) pvH3.textContent = t("postventa_titulo");
  document.getElementById("postventa-empty").textContent = t("postventa_empty");

  // Paginación
  const clientesPrev = document.getElementById("clientes-prev");
  const clientesNext = document.getElementById("clientes-next");
  if (clientesPrev) clientesPrev.textContent = t("pag_anterior");
  if (clientesNext) clientesNext.textContent = t("pag_siguiente");
  const agendaPrev = document.getElementById("agenda-prev");
  const agendaNext = document.getElementById("agenda-next");
  if (agendaPrev) agendaPrev.textContent = t("pag_anterior");
  if (agendaNext) agendaNext.textContent = t("pag_siguiente");

  // Fecha en topbar
  document.getElementById("topbar-date").textContent = new Date().toLocaleDateString(
    l === "en" ? "en-US" : "es-ES",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" }
  );

  // Label botón idioma
  document.getElementById("lang-label").textContent = l === "es" ? "ES" : "EN";
}

function setupLanguage() {
  const btn = document.getElementById("btn-lang-toggle");
  if (!btn) return;
  try {
    const saved = localStorage.getItem("language");
    if (saved) currentLang = saved;
  } catch(e) {}
  applyLanguage();
  btn.addEventListener("click", () => {
    currentLang = currentLang === "es" ? "en" : "es";
    try { localStorage.setItem("language", currentLang); } catch(e) {}
    applyLanguage();
  });
}

// ══════════════════════════════════════════
//  Modo oscuro
// ══════════════════════════════════════════
function setupDarkMode() {
  const btn       = document.getElementById("btn-dark-toggle");
  const iconDark  = document.getElementById("icon-dark");
  const iconLight = document.getElementById("icon-light");
  const body      = document.body;

  // Recordar preferencia
  if (localStorage.getItem("darkMode") === "true") {
    body.classList.add("dark");
    iconDark.style.display  = "none";
    iconLight.style.display = "";
  }

  btn.addEventListener("click", () => {
    const isDark = body.classList.toggle("dark");
    iconDark.style.display  = isDark ? "none" : "";
    iconLight.style.display = isDark ? "" : "none";
    try { localStorage.setItem("darkMode", isDark); } catch(e) {}
  });
}

// ══════════════════════════════════════════
//  Alertas automáticas
// ══════════════════════════════════════════
function renderAlertasAutomaticas(data) {
  const registros = data.registros ?? [];
  if (!registros.length) return;

  const section = document.getElementById("alertas-auto-section");
  const list    = document.getElementById("alertas-auto-list");
  if (!section || !list) return;

  section.classList.remove("hidden");

  const alertas = [];

  // 1. Variación mensual fuerte (usa proyecciones)
  const proy   = data.proyecciones ?? {};
  const varPct = proy.variacion_pct;
  if (typeof varPct === "number") {
    const mesAct = proy.nombre_mes_actual   || "el mes actual";
    const mesAnt = proy.nombre_mes_anterior || "el mes anterior";
    if (varPct <= -20) {
      alertas.push({ tipo: "danger", icono: "📉", texto: currentLang === "en"
        ? `Strong drop: <strong>${mesAct}</strong> fell <strong>${Math.abs(varPct)}%</strong> compared to ${mesAnt}.`
        : `Caída fuerte: <strong>${mesAct}</strong> bajó <strong>${Math.abs(varPct)}%</strong> respecto a ${mesAnt}.` });
    } else if (varPct <= -10) {
      alertas.push({ tipo: "warning", icono: "⚠️", texto: currentLang === "en"
        ? `<strong>${mesAct}</strong> fell <strong>${Math.abs(varPct)}%</strong> compared to ${mesAnt}.`
        : `<strong>${mesAct}</strong> bajó <strong>${Math.abs(varPct)}%</strong> respecto a ${mesAnt}.` });
    } else if (varPct >= 20) {
      alertas.push({ tipo: "success", icono: "📈", texto: currentLang === "en"
        ? `Great month: <strong>${mesAct}</strong> rose <strong>${varPct}%</strong> compared to ${mesAnt}.`
        : `Buen mes: <strong>${mesAct}</strong> subió <strong>${varPct}%</strong> respecto a ${mesAnt}.` });
    }
  }

  // 2. Tasa de baja alta
  const tasaBaja = data.riesgos?.tasa_baja_promedio;
  if (typeof tasaBaja === "number" && tasaBaja >= 25) {
    alertas.push({ tipo: "danger", icono: "🔻", texto: `Tasa de baja muy alta: <strong>${tasaBaja}%</strong> de las ventas se dan de baja en promedio.` });
  }

  // 3. Vendedores sin actividad reciente (2+ meses)
  const mesesOrdenados = [...new Set(registros.map(r => r.fecha?.slice(0, 7)).filter(Boolean))].sort();
  if (mesesOrdenados.length >= 3) {
    const ultimoMes  = mesesOrdenados[mesesOrdenados.length - 1];
    const vendedores = [...new Set(registros.map(r => r.vendedor).filter(Boolean))];

    vendedores.forEach(v => {
      const mesesVendedor = registros
        .filter(r => r.vendedor === v && r.fecha)
        .map(r => r.fecha.slice(0, 7))
        .sort();
      const ultimoMesVendedor = mesesVendedor[mesesVendedor.length - 1];
      const idxUltimo = mesesOrdenados.indexOf(ultimoMesVendedor);
      const idxActual  = mesesOrdenados.indexOf(ultimoMes);

      if (idxUltimo !== -1 && idxActual - idxUltimo >= 2) {
        alertas.push({ tipo: "warning", icono: "👤", texto: currentLang === "en"
          ? `<strong>${v}</strong> has had no activity since <strong>${ultimoMesVendedor}</strong>.`
          : `<strong>${v}</strong> no registra actividad desde <strong>${ultimoMesVendedor}</strong>.` });
      }
    });
  }

  // 4. Zona con caída fuerte respecto al mes anterior
  if (mesesOrdenados.length >= 2) {
    const mesActual   = mesesOrdenados[mesesOrdenados.length - 1];
    const mesAnterior = mesesOrdenados[mesesOrdenados.length - 2];
    const zonas       = [...new Set(registros.map(r => r.zona).filter(Boolean))];

    zonas.forEach(z => {
      const actual   = registros.filter(r => r.zona === z && r.fecha?.slice(0, 7) === mesActual).length;
      const anterior = registros.filter(r => r.zona === z && r.fecha?.slice(0, 7) === mesAnterior).length;

      if (anterior >= 5) {
        const variacion = ((actual - anterior) / anterior) * 100;
        if (variacion <= -40) {
          alertas.push({ tipo: "danger", icono: "📍", texto: currentLang === "en"
            ? `Zone <strong>${z}</strong> dropped <strong>${Math.abs(variacion).toFixed(0)}%</strong> in ${mesActual} (${anterior} → ${actual}).`
            : `Zona <strong>${z}</strong> cayó <strong>${Math.abs(variacion).toFixed(0)}%</strong> en ${mesActual} (${anterior} → ${actual}).` });
        }
      }
    });
  }

  // Render
  if (!alertas.length) {
    list.innerHTML = `<div class="empty-state">✅ No se detectaron anomalías. Todo en orden.</div>`;
    return;
  }

  list.innerHTML = alertas.map(a => `
    <div class="alerta-auto-item alerta-auto-${a.tipo}">
      <span class="alerta-auto-icon">${a.icono}</span>
      <span class="alerta-auto-texto">${a.texto}</span>
    </div>
  `).join("");
}

// ══════════════════════════════════════════
//  Embudo de conversión
// ══════════════════════════════════════════
function renderEmbudo(data) {
  const section = document.getElementById("embudo-section");
  const list    = document.getElementById("embudo-list");
  const nota    = document.getElementById("embudo-nota");
  if (!section || !list) return;

  const registros = data.registros ?? [];
  if (!registros.length) return;

  section.classList.remove("hidden");

  const totalAgenda      = registros.length;
  const totalInstalacion = registros.filter(r => r.tipo === "Instalación").length;

  const stages = [
    { label: currentLang === "en" ? "Total schedule" : "Agenda total", valor: totalAgenda,      color: "#4f46e5" },
    { label: currentLang === "en" ? "Installation"   : "Instalación",  valor: totalInstalacion, color: "#10b981" },
  ];

  if (pvSummary) {
    const contactadas = Math.min(pvSummary.contactados, totalInstalacion);
    const pct = totalInstalacion > 0 ? Math.round((contactadas / totalInstalacion) * 100) : 0;
    stages.push({ label: currentLang === "en" ? "Contacted by after-sales" : "Contactadas por postventa", valor: contactadas, color: "#f59e0b" });
    nota.innerHTML = currentLang === "en"
      ? `📞 Out of <strong>${totalInstalacion}</strong> installations, <strong>${contactadas}</strong> were contacted for after-sales (<strong>${pct}%</strong>).`
      : `📞 De <strong>${totalInstalacion}</strong> instalaciones, <strong>${contactadas}</strong> fueron contactadas para postventa (<strong>${pct}%</strong>).`;
  } else {
    nota.textContent = currentLang === "en"
      ? "ℹ️ Load the After-sales tab to complete the third step of the funnel."
      : "ℹ️ Cargá la solapa Postventa para completar el tercer paso del embudo.";
  }

  const base = stages[0].valor || 1;

  list.innerHTML = stages.map((s, i) => {
    const pct = Math.round((s.valor / base) * 100);
    let dropHtml = "";
    if (i > 0) {
      const anterior = stages[i - 1].valor || 1;
      const drop = anterior - s.valor;
      const dropPct = anterior > 0 ? Math.round((drop / anterior) * 100) : 0;
      dropHtml = drop > 0
        ? `<div class="embudo-drop">↓ ${drop} ${currentLang === "en" ? `lost (${dropPct}%) from previous step` : `se pierden (${dropPct}%) respecto al paso anterior`}</div>`
        : "";
    }
    return `
      ${dropHtml}
      <div class="embudo-stage">
        <div class="embudo-stage-header">
          <span class="embudo-stage-label">${s.label}</span>
          <span><span class="embudo-stage-value">${s.valor}</span><span class="embudo-stage-pct">(${pct}% ${currentLang === "en" ? "of total" : "del total"})</span></span>
        </div>
        <div class="embudo-bar-track">
          <div class="embudo-bar-fill" style="width:${pct}%; background:${s.color};"></div>
        </div>
      </div>`;
  }).join("");
}

// ══════════════════════════════════════════
//  CLIENTES
// ══════════════════════════════════════════
let clientesRows     = [];
let clientesFiltered = [];
let clientesPage     = 1;
const CLIENTES_PER_PAGE = 25;

async function initClientes() {
  if (!currentFileId) return;
  try {
    const res  = await fetch(`/api/clientes?file_id=${currentFileId}`);
    if (!res.ok) return;
    const data = await res.json();
    clientesRows = data.registros || [];
    if (!clientesRows.length) return;

    document.getElementById("clientes-filtros").style.display    = "block";
    document.getElementById("clientes-pagination").style.display = "flex";

    fillClientesSelect("clientes-filter-agendar",   [...new Set(clientesRows.map(r => r.agendar).filter(Boolean))].sort());
    fillClientesSelect("clientes-filter-vendedor",  [...new Set(clientesRows.map(r => r.vendedor).filter(Boolean))].sort());
    fillClientesSelect("clientes-filter-zona",      [...new Set(clientesRows.map(r => r.zona).filter(Boolean))].sort());
    fillClientesSelect("clientes-filter-situacion", [...new Set(clientesRows.map(r => r.situacion).filter(Boolean))].sort());

    if (!document.getElementById("clientes-filtros").dataset.init) {
      ["clientes-search","clientes-filter-agendar","clientes-filter-vendedor",
       "clientes-filter-zona","clientes-filter-situacion","clientes-desde","clientes-hasta"]
        .forEach(id => document.getElementById(id).addEventListener("input",  applyClientesFilters));
      ["clientes-filter-agendar","clientes-filter-vendedor","clientes-filter-zona","clientes-filter-situacion"]
        .forEach(id => document.getElementById(id).addEventListener("change", applyClientesFilters));
      document.getElementById("clientes-clear").addEventListener("click", clearClientesFilters);
      document.getElementById("clientes-prev").addEventListener("click", () => { clientesPage--; renderClientesPage(); });
      document.getElementById("clientes-next").addEventListener("click", () => { clientesPage++; renderClientesPage(); });
      document.getElementById("clientes-filtros").dataset.init = "1";
    }
    applyClientesFilters();
  } catch(e) { console.warn("Clientes:", e); }
}

function fillClientesSelect(id, values) {
  const sel   = document.getElementById(id);
  const first = sel.options[0];
  sel.innerHTML = "";
  sel.appendChild(first);
  values.forEach(v => { const o = document.createElement("option"); o.value = v; o.textContent = v; sel.appendChild(o); });
}

function applyClientesFilters() {
  const search    = document.getElementById("clientes-search").value.toLowerCase();
  const agendar   = document.getElementById("clientes-filter-agendar").value;
  const vendedor  = document.getElementById("clientes-filter-vendedor").value;
  const zona      = document.getElementById("clientes-filter-zona").value;
  const situacion = document.getElementById("clientes-filter-situacion").value;
  const desde     = document.getElementById("clientes-desde").value;
  const hasta     = document.getElementById("clientes-hasta").value;

  clientesFiltered = clientesRows.filter(r => {
    if (search && !(r.nombre.toLowerCase().includes(search) || r.dni.includes(search) || r.codigo.includes(search))) return false;
    if (agendar   && r.agendar   !== agendar)   return false;
    if (vendedor  && r.vendedor  !== vendedor)   return false;
    if (zona      && r.zona      !== zona)       return false;
    if (situacion && r.situacion !== situacion)  return false;
    if (desde && r.fecha && r.fecha < desde)     return false;
    if (hasta && r.fecha && r.fecha > hasta)     return false;
    return true;
  });

  document.getElementById("clientes-count").textContent = `${clientesFiltered.length} de ${clientesRows.length} clientes`;
  clientesPage = 1;
  renderClientesPage();
}

function clearClientesFilters() {
  ["clientes-search","clientes-filter-agendar","clientes-filter-vendedor",
   "clientes-filter-zona","clientes-filter-situacion","clientes-desde","clientes-hasta"]
    .forEach(id => { document.getElementById(id).value = ""; });
  applyClientesFilters();
}

function renderClientesPage() {
  const total  = clientesFiltered.length;
  const pages  = Math.ceil(total / CLIENTES_PER_PAGE) || 1;
  clientesPage = Math.min(Math.max(clientesPage, 1), pages);
  const start  = (clientesPage - 1) * CLIENTES_PER_PAGE;
  const slice  = clientesFiltered.slice(start, start + CLIENTES_PER_PAGE);

  document.getElementById("clientes-page-info").textContent = `Página ${clientesPage} de ${pages} (${total} resultados)`;
  document.getElementById("clientes-prev").disabled = clientesPage <= 1;
  document.getElementById("clientes-next").disabled = clientesPage >= pages;

  const container = document.getElementById("clientes-content");
  if (!slice.length) { container.innerHTML = `<div class="empty-state">No se encontraron clientes.</div>`; return; }

  const esc  = s => (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const rows = slice.map(r => `<tr>
    <td>${(r.codigo||"")}</td>
    <td><strong>${(r.nombre||"")}</strong></td>
    <td>${(r.dni||"")}</td>
    <td>${badgeHtml(r.agendar)}</td>
    <td>${(r.fecha||"")}</td>
    <td>${(r.vendedor||"")}</td>
    <td>${badgeHtml(r.zona)}</td>
    <td>${badgeHtml(r.situacion)}</td>
  </tr>`).join("");

  container.innerHTML = `<div style="overflow-x:auto;"><table class="data-table">
    <thead><tr>
      <th>Código</th><th>Nombre y Apellido</th><th>DNI</th>
      <th>Agendar como</th><th>Fecha turno</th><th>Vendedor</th><th>Zona</th><th>Situación</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
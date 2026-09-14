// ============================================================
// 🐝 STINGER V6 — ADMIN CONTROL CENTER
// ============================================================

"use strict";

const API_BASE = "";

let adminToken =
  sessionStorage.getItem("stinger_admin_token") || "";

let dashboardTimer = null;
let activityTimer = null;

// ============================================================
// DOM HELPERS
// ============================================================

function $(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const element = $(id);

  if (element) {
    element.textContent =
      value === undefined ||
      value === null ||
      value === ""
        ? "--"
        : value;
  }
}

function showMessage(message) {
  if (typeof window.showToast === "function") {
    window.showToast(message);
    return;
  }

  console.log("[STINGER ADMIN]", message);
}

// ============================================================
// API REQUEST
// ============================================================

async function apiRequest(
  endpoint,
  options = {}
) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (adminToken) {
    headers.Authorization =
      `Bearer ${adminToken}`;
  }

  const response = await fetch(
    API_BASE + endpoint,
    {
      ...options,
      headers,
      cache: "no-store"
    }
  );

  let data = {};

  try {
    data = await response.json();
  } catch (_) {
    data = {};
  }

  if (response.status === 401) {
    logout(false);

    throw new Error(
      "Administrator session expired."
    );
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

// ============================================================
// LOGIN
// ============================================================

async function login() {
  const passwordInput =
    $("adminPassword");

  const loginButton =
    $("loginButton");

  const error =
    $("loginError");

  if (!passwordInput) {
    return;
  }

  const password =
    passwordInput.value.trim();

  if (!password) {
    if (error) {
      error.textContent =
        "Enter the administrator password.";
    }

    return;
  }

  if (loginButton) {
    loginButton.disabled = true;
    loginButton.textContent =
      "AUTHENTICATING...";
  }

  if (error) {
    error.textContent = "";
  }

  try {

    /*
     * The backend endpoint will be implemented
     * with the secure admin authentication system.
     */

    const data =
      await apiRequest(
        "/api/admin/login",
        {
          method: "POST",

          body: JSON.stringify({
            password
          })
        }
      );

    if (!data.token) {
      throw new Error(
        "Authentication server returned no token."
      );
    }

    adminToken = data.token;

    sessionStorage.setItem(
      "stinger_admin_token",
      adminToken
    );

    passwordInput.value = "";

    showApplication();

    await loadDashboard();

    startLiveMonitoring();

    showMessage(
      "Welcome to STINGER V6 Command Center."
    );

  } catch (err) {

    console.error(
      "[ADMIN LOGIN]",
      err
    );

    if (error) {
      error.textContent =
        err.message ||
        "Authentication failed.";
    }

  } finally {

    if (loginButton) {
      loginButton.disabled = false;
      loginButton.textContent =
        "🔐 ACCESS COMMAND CENTER";
    }

  }
}

// ============================================================
// SHOW APPLICATION
// ============================================================

function showApplication() {

  const loginScreen =
    $("loginScreen");

  const app =
    $("app");

  if (loginScreen) {
    loginScreen.style.display =
      "none";
  }

  if (app) {
    app.classList.add("active");
  }
}

// ============================================================
// LOGOUT
// ============================================================

async function logout(
  notify = true
) {

  stopLiveMonitoring();

  try {

    if (adminToken) {

      await fetch(
        API_BASE +
        "/api/admin/logout",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            Authorization:
              `Bearer ${adminToken}`
          },

          cache: "no-store"
        }
      );

    }

  } catch (_) {
    // Local logout continues even if
    // the server is unavailable.
  }

  adminToken = "";

  sessionStorage.removeItem(
    "stinger_admin_token"
  );

  const app =
    $("app");

  const loginScreen =
    $("loginScreen");

  if (app) {
    app.classList.remove("active");
  }

  if (loginScreen) {
    loginScreen.style.display =
      "flex";
  }

  if (notify) {
    showMessage(
      "Administrator session closed."
    );
  }
}

// ============================================================
// DASHBOARD
// ============================================================

async function loadDashboard() {

  if (!adminToken) {
    return;
  }

  try {

    const data =
      await apiRequest(
        "/api/admin/dashboard"
      );

    updateDashboard(data);

  } catch (err) {

    console.warn(
      "[DASHBOARD]",
      err.message
    );

    /*
     * Do not immediately log the administrator out
     * because temporary network errors should not
     * destroy a valid session.
     */

    setText(
      "lastUpdated",
      "Connection error"
    );
  }
}

// ============================================================
// UPDATE DASHBOARD
// ============================================================

function updateDashboard(data) {

  const bot =
    data.bot || {};

  const system =
    data.system || {};

  const database =
    data.database || {};

  const statistics =
    data.statistics ||
    data.stats ||
    {};

  // ----------------------------------------------------------
  // BOT
  // ----------------------------------------------------------

  const connected =
    data.connected !== undefined
      ? data.connected
      : bot.connected;

  setText(
    "botStatus",
    connected
      ? "ONLINE"
      : "OFFLINE"
  );

  const botStatus =
    $("botStatus");

  if (botStatus) {

    botStatus.classList.remove(
      "good",
      "bad"
    );

    botStatus.classList.add(
      connected
        ? "good"
        : "bad"
    );
  }

  setText(
    "botName",
    bot.name ||
    data.botName ||
    "STINGER VERSION 6"
  );

  setText(
    "botVersion",
    bot.version ||
    data.version ||
    "6.0.0"
  );

  setText(
    "uptime",
    formatUptime(
      data.uptime ??
      bot.uptime ??
      0
    )
  );

  // ----------------------------------------------------------
  // COUNTERS
  // ----------------------------------------------------------

  setText(
    "userCount",
    statistics.users ??
    data.users ??
    0
  );

  setText(
    "pluginCount",
    statistics.plugins ??
    data.plugins ??
    0
  );

  // ----------------------------------------------------------
  // DATABASE
  // ----------------------------------------------------------

  const databaseConnected =
    database.connected !== undefined
      ? database.connected
      : true;

  setText(
    "databaseStatus",
    databaseConnected
      ? "CONNECTED"
      : "OFFLINE"
  );

  const databaseElement =
    $("databaseStatus");

  if (databaseElement) {

    databaseElement.classList.remove(
      "good",
      "bad"
    );

    databaseElement.classList.add(
      databaseConnected
        ? "good"
        : "bad"
    );
  }

  // ----------------------------------------------------------
  // WHATSAPP
  // ----------------------------------------------------------

  const whatsapp =
    data.whatsapp ||
    {};

  const whatsappConnected =
    whatsapp.connected !== undefined
      ? whatsapp.connected
      : connected;

  setText(
    "whatsappStatus",
    whatsappConnected
      ? "CONNECTED"
      : "DISCONNECTED"
  );

  const whatsappElement =
    $("whatsappStatus");

  if (whatsappElement) {

    whatsappElement.classList.remove(
      "good",
      "bad"
    );

    whatsappElement.classList.add(
      whatsappConnected
        ? "good"
        : "bad"
    );
  }

  // ----------------------------------------------------------
  // SERVER
  // ----------------------------------------------------------

  setText(
    "runtime",
    system.runtime ||
    "Node.js"
  );

  setText(
    "nodeVersion",
    system.node ||
    system.nodeVersion ||
    data.nodeVersion ||
    "--"
  );

  setText(
    "platform",
    system.platform ||
    data.platform ||
    "--"
  );

  setText(
    "cpuUsage",
    formatPercent(
      system.cpu ??
      data.cpu
    )
  );

  setText(
    "memoryUsage",
    formatMemory(
      system.memory ??
      data.memory
    )
  );

  setText(
    "lastUpdated",
    "Updated " +
    new Date().toLocaleTimeString()
  );
}

// ============================================================
// UPTIME
// ============================================================

function formatUptime(value) {

  if (
    typeof value === "string"
  ) {
    return value;
  }

  let seconds =
    Number(value);

  if (!Number.isFinite(seconds)) {
    return "--";
  }

  /*
   * If the backend provides milliseconds,
   * convert them.
   */

  if (seconds > 100000000) {
    seconds =
      Math.floor(
        seconds / 1000
      );
  }

  seconds =
    Math.max(
      0,
      Math.floor(seconds)
    );

  const days =
    Math.floor(
      seconds / 86400
    );

  seconds %= 86400;

  const hours =
    Math.floor(
      seconds / 3600
    );

  seconds %= 3600;

  const minutes =
    Math.floor(
      seconds / 60
    );

  seconds %= 60;

  const hh =
    String(hours)
      .padStart(2, "0");

  const mm =
    String(minutes)
      .padStart(2, "0");

  const ss =
    String(seconds)
      .padStart(2, "0");

  if (days > 0) {
    return `${days}d ${hh}:${mm}:${ss}`;
  }

  return `${hh}:${mm}:${ss}`;
}

// ============================================================
// PERCENT
// ============================================================

function formatPercent(value) {

  if (
    value === undefined ||
    value === null
  ) {
    return "--";
  }

  if (
    typeof value === "string" &&
    value.includes("%")
  ) {
    return value;
  }

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return "--";
  }

  return `${number.toFixed(1)}%`;
}

// ============================================================
// MEMORY
// ============================================================

function formatMemory(value) {

  if (
    value === undefined ||
    value === null
  ) {
    return "--";
  }

  if (
    typeof value === "string"
  ) {
    return value;
  }

  if (
    typeof value === "object"
  ) {

    if (value.used &&
        value.total) {

      return `${value.used} / ${value.total}`;
    }

    if (value.percent !== undefined) {

      return `${Number(
        value.percent
      ).toFixed(1)}%`;
    }
  }

  const number =
    Number(value);

  if (!Number.isFinite(number)) {
    return "--";
  }

  /*
   * Treat a large number as bytes.
   */

  if (number > 1024 * 1024) {

    return formatBytes(number);
  }

  return `${number.toFixed(1)}%`;
}

// ============================================================
// BYTES
// ============================================================

function formatBytes(bytes) {

  if (!Number.isFinite(
    Number(bytes)
  )) {
    return "--";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB"
  ];

  let value =
    Number(bytes);

  let index = 0;

  while (
    value >= 1024 &&
    index < units.length - 1
  ) {

    value /= 1024;
    index++;
  }

  return `${value.toFixed(1)} ${units[index]}`;
}

// ============================================================
// LIVE MONITORING
// ============================================================

function startLiveMonitoring() {

  stopLiveMonitoring();

  loadDashboard();

  dashboardTimer =
    setInterval(
      loadDashboard,
      10000
    );

  /*
   * Activity refresh is intentionally slower
   * so the server is not unnecessarily flooded.
   */

  loadActivity();

  activityTimer =
    setInterval(
      loadActivity,
      7000
    );
}

function stopLiveMonitoring() {

  if (dashboardTimer) {

    clearInterval(
      dashboardTimer
    );

    dashboardTimer = null;
  }

  if (activityTimer) {

    clearInterval(
      activityTimer
    );

    activityTimer = null;
  }
}

// ============================================================
// ACTIVITY
// ============================================================

async function loadActivity() {

  if (!adminToken) {
    return;
  }

  try {

    const data =
      await apiRequest(
        "/api/admin/activity"
      );

    renderActivity(
      data.activities ||
      data.activity ||
      []
    );

  } catch (err) {

    console.warn(
      "[ACTIVITY]",
      err.message
    );
  }
}

function renderActivity(items) {

  const container =
    $("activityList");

  if (!container) {
    return;
  }

  if (!Array.isArray(items) ||
      items.length === 0) {

    return;
  }

  container.innerHTML = "";

  items
    .slice(0, 10)
    .forEach(item => {

      const row =
        document.createElement(
          "div"
        );

      row.className =
        "activity-item";

      const icon =
        document.createElement(
          "div"
        );

      icon.className =
        "activity-icon";

      icon.textContent =
        item.icon ||
        "•";

      const text =
        document.createElement(
          "div"
        );

      text.className =
        "activity-text";

      const title =
        document.createElement(
          "strong"
        );

      title.textContent =
        item.message ||
        item.title ||
        "System event";

      const time =
        document.createElement(
          "small"
        );

      time.textContent =
        item.time ||
        item.createdAt ||
        "Recently";

      text.appendChild(title);
      text.appendChild(time);

      row.appendChild(icon);
      row.appendChild(text);

      container.appendChild(row);
    });
}

// ============================================================
// ADMIN ACTIONS
// ============================================================

async function performAdminAction(
  action
) {

  if (!adminToken) {

    showMessage(
      "Administrator authentication required."
    );

    return;
  }

  const dangerousActions = [
    "restart",
    "shutdown",
    "logoutAll"
  ];

  if (
    dangerousActions.includes(action)
  ) {

    const confirmed =
      window.confirm(
        `Are you sure you want to execute "${action}"?`
      );

    if (!confirmed) {
      return;
    }
  }

  showMessage(
    `Executing ${action}...`
  );

  try {

    const data =
      await apiRequest(
        "/api/admin/action",
        {
          method: "POST",

          body: JSON.stringify({
            action
          })
        }
      );

    showMessage(
      data.message ||
      `${action} completed successfully.`
    );

    await loadDashboard();
    await loadActivity();

  } catch (err) {

    console.error(
      "[ADMIN ACTION]",
      err
    );

    showMessage(
      err.message ||
      `Unable to execute ${action}.`
    );
  }
}

// ============================================================
// REFRESH
// ============================================================

window.loadDashboard =
  loadDashboard;

window.performAdminAction =
  performAdminAction;

window.login =
  login;

window.logout =
  logout;

// ============================================================
// ENTER TO LOGIN
// ============================================================

document.addEventListener(
  "DOMContentLoaded",
  () => {

    const password =
      $("adminPassword");

    if (password) {

      password.addEventListener(
        "keydown",
        event => {

          if (
            event.key === "Enter"
          ) {
            login();
          }
        }
      );
    }

    /*
     * Do not automatically trust an old token.
     * Validate it against the backend.
     */

    if (adminToken) {

      apiRequest(
        "/api/admin/session"
      )
        .then(() => {

          showApplication();

          loadDashboard();

          startLiveMonitoring();

        })
        .catch(() => {

          logout(false);

        });
    }

  }
);

// ============================================================
// PAGE VISIBILITY
// ============================================================

document.addEventListener(
  "visibilitychange",
  () => {

    if (
      document.visibilityState ===
      "visible"
    ) {

      if (
        adminToken &&
        !dashboardTimer
      ) {
        startLiveMonitoring();
      }

    } else {

      /*
       * Reduce polling while the dashboard
       * is hidden/backgrounded.
       */

      stopLiveMonitoring();
    }

  }
);

// ============================================================
// SECURITY
// ============================================================

window.addEventListener(
  "beforeunload",
  () => {

    /*
     * The token lives only in sessionStorage
     * and disappears when the browser session
     * is closed.
     */

    stopLiveMonitoring();
  }
);

// ============================================================
// STINGER ADMIN READY
// ============================================================

console.log(
  "%c🐝 STINGER V6 ADMIN READY",
  "font-weight:900;font-size:16px;"
);

console.log(
  "%cAdministrator controls are protected by the server.",
  "font-size:11px;"
);

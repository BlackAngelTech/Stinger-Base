// ============================================================
// 🐝 STINGER V6 — MAIN SERVER
// 🌐 WebPair + Admin API + Plugin Core
// ============================================================

"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const os = require("os");
const express = require("express");

// ============================================================
// 📦 INTERNAL MODULES
// ============================================================

const Stinger = require("./Stinger");
const Pair = require("./Pair");

// ============================================================
// ⚙️ CONFIGURATION
// ============================================================

const PORT = Number(process.env.PORT || 3000);

const ROOT = __dirname;

const DATABASE_DIR = path.join(ROOT, "database");
const SESSION_DIR = path.join(ROOT, "sessions");
const TEMP_DIR = path.join(ROOT, "temp");
const PLUGIN_DIR = path.join(ROOT, "Plugins");

// ============================================================
// 📁 DIRECTORIES
// ============================================================

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }
}

[
    DATABASE_DIR,
    SESSION_DIR,
    TEMP_DIR,
    PLUGIN_DIR
].forEach(ensureDir);

// ============================================================
// 🗄️ DATABASE
// ============================================================

const DB_FILES = {
    users: path.join(DATABASE_DIR, "users.json"),
    settings: path.join(DATABASE_DIR, "settings.json"),
    broadcasts: path.join(DATABASE_DIR, "broadcasts.json"),
    logs: path.join(DATABASE_DIR, "logs.json"),
    admins: path.join(DATABASE_DIR, "admins.json")
};

const DEFAULT_DATABASE = {
    users: [],
    settings: {
        botName: "STINGER VERSION 6",
        version: "6.0.0",
        developer: "Alpha",
        country: "Zimbabwe 🇿🇼",
        prefix: ".",
        maintenance: false,
        autoRead: false,
        autoTyping: false
    },
    broadcasts: [],
    logs: [],
    admins: []
};

function readJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            fs.writeFileSync(
                file,
                JSON.stringify(fallback, null, 2)
            );

            return fallback;
        }

        const raw = fs.readFileSync(file, "utf8");

        if (!raw.trim()) {
            return fallback;
        }

        return JSON.parse(raw);
    } catch (error) {
        console.error(
            `❌ Failed reading ${path.basename(file)}:`,
            error.message
        );

        return fallback;
    }
}

function writeJSON(file, data) {
    const tempFile = `${file}.tmp`;

    fs.writeFileSync(
        tempFile,
        JSON.stringify(data, null, 2)
    );

    fs.renameSync(tempFile, file);
}

// Create database files
for (const [key, file] of Object.entries(DB_FILES)) {
    if (!fs.existsSync(file)) {
        writeJSON(file, DEFAULT_DATABASE[key]);
    }
}

// ============================================================
// 📝 LOGGER
// ============================================================

function log(level, message, meta = {}) {
    const logs = readJSON(DB_FILES.logs, []);

    logs.push({
        id: crypto.randomUUID(),
        level,
        message,
        meta,
        timestamp: new Date().toISOString()
    });

    const limit = Number(
        process.env.LOG_RETENTION || 5000
    );

    if (logs.length > limit) {
        logs.splice(0, logs.length - limit);
    }

    writeJSON(DB_FILES.logs, logs);

    const prefix = `[${level}]`;

    if (level === "ERROR") {
        console.error(prefix, message);
    } else {
        console.log(prefix, message);
    }
}

// ============================================================
// 🌐 EXPRESS
// ============================================================

const app = express();

app.disable("x-powered-by");

app.use(
    express.json({
        limit: "10mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "10mb"
    })
);

// ============================================================
// 🛡️ SECURITY HEADERS
// ============================================================

app.use((req, res, next) => {
    res.setHeader(
        "X-Content-Type-Options",
        "nosniff"
    );

    res.setHeader(
        "X-Frame-Options",
        "SAMEORIGIN"
    );

    res.setHeader(
        "Referrer-Policy",
        "strict-origin-when-cross-origin"
    );

    next();
});

// ============================================================
// 🔐 ADMIN SESSIONS
// ============================================================

const adminSessions = new Map();

const LOGIN_WINDOW = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;

const loginAttempts = new Map();

function cleanupAdminSessions() {
    const now = Date.now();

    for (const [
        token,
        session
    ] of adminSessions.entries()) {

        if (session.expiresAt <= now) {
            adminSessions.delete(token);
        }
    }
}

setInterval(
    cleanupAdminSessions,
    60 * 1000
).unref();

// ============================================================
// 🔑 PASSWORD HASH
// ============================================================

function verifyPassword(password) {
    const stored = process.env.ADMIN_PASSWORD_HASH;

    if (!stored) {
        return false;
    }

    const parts = stored.split(":");

    if (parts.length !== 2) {
        return false;
    }

    const [
        salt,
        storedHash
    ] = parts;

    try {
        const derived = crypto.scryptSync(
            password,
            salt,
            64
        );

        const expected = Buffer.from(
            storedHash,
            "hex"
        );

        if (derived.length !== expected.length) {
            return false;
        }

        return crypto.timingSafeEqual(
            derived,
            expected
        );
    } catch {
        return false;
    }
}

// ============================================================
// 👮 ADMIN AUTH MIDDLEWARE
// ============================================================

function requireAdmin(req, res, next) {
    const auth = req.headers.authorization || "";

    if (!auth.startsWith("Bearer ")) {
        return res.status(401).json({
            success: false,
            error: "Authentication required"
        });
    }

    const token = auth.slice(7);

    const session = adminSessions.get(token);

    if (!session) {
        return res.status(401).json({
            success: false,
            error: "Invalid or expired session"
        });
    }

    if (session.expiresAt <= Date.now()) {
        adminSessions.delete(token);

        return res.status(401).json({
            success: false,
            error: "Session expired"
        });
    }

    req.admin = session;

    next();
}

// ============================================================
// 🔐 ADMIN LOGIN
// ============================================================

app.post(
    "/api/admin/login",
    (req, res) => {

        const ip =
            req.ip ||
            req.socket.remoteAddress ||
            "unknown";

        const now = Date.now();

        let attempt = loginAttempts.get(ip);

        if (!attempt) {
            attempt = {
                count: 0,
                firstAttempt: now
            };

            loginAttempts.set(
                ip,
                attempt
            );
        }

        if (
            now - attempt.firstAttempt >
            LOGIN_WINDOW
        ) {
            attempt.count = 0;
            attempt.firstAttempt = now;
        }

        if (
            attempt.count >=
            MAX_LOGIN_ATTEMPTS
        ) {
            return res.status(429).json({
                success: false,
                error: "Too many login attempts"
            });
        }

        const {
            password
        } = req.body || {};

        if (
            typeof password !== "string" ||
            !password
        ) {
            return res.status(400).json({
                success: false,
                error: "Password required"
            });
        }

        if (!verifyPassword(password)) {
            attempt.count++;

            log(
                "WARNING",
                "Failed admin login",
                {
                    ip
                }
            );

            return res.status(401).json({
                success: false,
                error: "Invalid credentials"
            });
        }

        attempt.count = 0;

        const token =
            crypto.randomBytes(48)
                .toString("hex");

        adminSessions.set(token, {
            createdAt: now,
            expiresAt:
                now + 12 * 60 * 60 * 1000,
            ip
        });

        log(
            "INFO",
            "Admin login successful",
            {
                ip
            }
        );

        res.json({
            success: true,
            token
        });
    }
);

// ============================================================
// 🔎 ADMIN SESSION
// ============================================================

app.get(
    "/api/admin/session",
    requireAdmin,
    (req, res) => {

        res.json({
            success: true,
            authenticated: true,
            expiresAt:
                req.admin.expiresAt
        });
    }
);

// ============================================================
// 🚪 ADMIN LOGOUT
// ============================================================

app.post(
    "/api/admin/logout",
    requireAdmin,
    (req, res) => {

        const auth =
            req.headers.authorization || "";

        const token = auth.slice(7);

        adminSessions.delete(token);

        log(
            "INFO",
            "Admin logged out"
        );

        res.json({
            success: true
        });
    }
);

// ============================================================
// 📊 ADMIN DASHBOARD
// ============================================================

app.get(
    "/api/admin/dashboard",
    requireAdmin,
    (req, res) => {

        const users =
            readJSON(
                DB_FILES.users,
                []
            );

        const logs =
            readJSON(
                DB_FILES.logs,
                []
            );

        const plugins =
            Stinger.getPlugins
                ? Stinger.getPlugins()
                : [];

        const memory =
            process.memoryUsage();

        const cpu =
            os.cpus();

        const connected =
            Stinger.isConnected
                ? Stinger.isConnected()
                : false;

        res.json({
            success: true,

            bot: {
                name: "STINGER VERSION 6",
                version: "6.0.0",
                developer: "Alpha",
                status:
                    connected
                        ? "ONLINE"
                        : "OFFLINE",
                uptime:
                    Stinger.getUptime
                        ? Stinger.getUptime()
                        : process.uptime()
            },

            stats: {
                users: users.length,
                plugins: plugins.length,
                logs: logs.length,
                sessions:
                    fs.existsSync(
                        SESSION_DIR
                    )
                        ? fs.readdirSync(
                            SESSION_DIR
                        ).length
                        : 0
            },

            system: {
                platform: process.platform,
                arch: process.arch,
                node: process.version,
                hostname: os.hostname(),
                cpuCount: cpu.length,
                cpuModel:
                    cpu[0]
                        ? cpu[0].model
                        : "Unknown",
                memory: {
                    rss: memory.rss,
                    heapUsed:
                        memory.heapUsed,
                    heapTotal:
                        memory.heapTotal,
                    external:
                        memory.external
                },
                totalMemory:
                    os.totalmem(),
                freeMemory:
                    os.freemem()
            }
        });
    }
);

// ============================================================
// 📡 ADMIN ACTIVITY
// ============================================================

app.get(
    "/api/admin/activity",
    requireAdmin,
    (req, res) => {

        const logs =
            readJSON(
                DB_FILES.logs,
                []
            );

        res.json({
            success: true,
            activity:
                logs.slice(-100).reverse()
        });
    }
);

// ============================================================
// 👥 ADMIN USERS
// ============================================================

app.get(
    "/api/admin/users",
    requireAdmin,
    (req, res) => {

        const users =
            readJSON(
                DB_FILES.users,
                []
            );

        res.json({
            success: true,
            users
        });
    }
);

// ============================================================
// 🧩 ADMIN PLUGINS
// ============================================================

app.get(
    "/api/admin/plugins",
    requireAdmin,
    (req, res) => {

        const plugins =
            Stinger.getPlugins
                ? Stinger.getPlugins()
                : [];

        res.json({
            success: true,
            plugins
        });
    }
);

// ============================================================
// 📝 ADMIN LOGS
// ============================================================

app.get(
    "/api/admin/logs",
    requireAdmin,
    (req, res) => {

        const logs =
            readJSON(
                DB_FILES.logs,
                []
            );

        res.json({
            success: true,
            logs:
                logs.slice().reverse()
        });
    }
);

// ============================================================
// ⚙️ GET SETTINGS
// ============================================================

app.get(
    "/api/admin/settings",
    requireAdmin,
    (req, res) => {

        const settings =
            readJSON(
                DB_FILES.settings,
                DEFAULT_DATABASE.settings
            );

        res.json({
            success: true,
            settings
        });
    }
);

// ============================================================
// 💾 UPDATE SETTINGS
// ============================================================

app.post(
    "/api/admin/settings",
    requireAdmin,
    (req, res) => {

        const current =
            readJSON(
                DB_FILES.settings,
                DEFAULT_DATABASE.settings
            );

        const incoming =
            req.body || {};

        const updated = {
            ...current,
            ...incoming
        };

        writeJSON(
            DB_FILES.settings,
            updated
        );

        log(
            "INFO",
            "Bot settings updated"
        );

        res.json({
            success: true,
            settings: updated
        });
    }
);

// ============================================================
// 🛠️ ADMIN ACTIONS
// ============================================================

app.post(
    "/api/admin/action",
    requireAdmin,
    async (req, res) => {

        const {
            action
        } = req.body || {};

        if (!action) {
            return res.status(400).json({
                success: false,
                error: "Action required"
            });
        }

        try {

            switch (action) {

                case "reconnect":

                    if (Stinger.connect) {
                        await Stinger.connect();
                    }

                    log(
                        "INFO",
                        "Bot reconnect requested"
                    );

                    return res.json({
                        success: true,
                        message:
                            "Reconnect requested"
                    });

                case "reloadPlugins":

                    if (
                        Stinger.reloadPlugins
                    ) {
                        await Stinger.reloadPlugins();
                    }

                    log(
                        "INFO",
                        "Plugins reloaded"
                    );

                    return res.json({
                        success: true,
                        message:
                            "Plugins reloaded"
                    });

                case "refreshDatabase":

                    for (
                        const [key, file]
                        of Object.entries(DB_FILES)
                    ) {

                        if (
                            !fs.existsSync(file)
                        ) {
                            writeJSON(
                                file,
                                DEFAULT_DATABASE[key]
                            );
                        }
                    }

                    log(
                        "INFO",
                        "Database refreshed"
                    );

                    return res.json({
                        success: true,
                        message:
                            "Database refreshed"
                    });

                case "clearCache":

                    for (
                        const file
                        of fs.readdirSync(TEMP_DIR)
                    ) {

                        const target =
                            path.join(
                                TEMP_DIR,
                                file
                            );

                        fs.rmSync(
                            target,
                            {
                                recursive: true,
                                force: true
                            }
                        );
                    }

                    log(
                        "INFO",
                        "Temporary cache cleared"
                    );

                    return res.json({
                        success: true,
                        message:
                            "Cache cleared"
                    });

                case "logoutAll":

                    adminSessions.clear();

                    log(
                        "WARNING",
                        "All admin sessions logged out"
                    );

                    return res.json({
                        success: true,
                        message:
                            "All sessions logged out"
                    });

                case "healthCheck":

                    return res.json({
                        success: true,
                        health: {
                            server: "OK",
                            database:
                                fs.existsSync(
                                    DATABASE_DIR
                                )
                                    ? "OK"
                                    : "ERROR",
                            plugins:
                                fs.existsSync(
                                    PLUGIN_DIR
                                )
                                    ? "OK"
                                    : "ERROR",
                            sessions:
                                fs.existsSync(
                                    SESSION_DIR
                                )
                                    ? "OK"
                                    : "ERROR",
                            uptime:
                                process.uptime()
                        }
                    });

                case "restart":

                    log(
                        "WARNING",
                        "Server restart requested"
                    );

                    res.json({
                        success: true,
                        message:
                            "Restarting server..."
                    });

                    setTimeout(
                        gracefulShutdown,
                        500
                    );

                    return;

                case "shutdown":

                    log(
                        "WARNING",
                        "Server shutdown requested"
                    );

                    res.json({
                        success: true,
                        message:
                            "Shutting down..."
                    });

                    setTimeout(
                        gracefulShutdown,
                        500
                    );

                    return;

                default:

                    return res.status(400).json({
                        success: false,
                        error:
                            `Unknown action: ${action}`
                    });
            }

        } catch (error) {

            log(
                "ERROR",
                `Admin action failed: ${action}`,
                {
                    error:
                        error.message
                }
            );

            return res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }
);

// ============================================================
// ❤️ HEALTH CHECK
// ============================================================

app.get(
    "/health",
    (req, res) => {

        res.json({
            status: "ok",
            bot: "STINGER VERSION 6",
            uptime: process.uptime(),
            timestamp:
                new Date().toISOString()
        });
    }
);

// ============================================================
// 🌐 STATIC WEBPAGES
// ============================================================

app.get(
    "/",
    (req, res) => {
        res.sendFile(
            path.join(
                ROOT,
                "Pair.html"
            )
        );
    }
);

app.get(
    "/pair",
    (req, res) => {
        res.sendFile(
            path.join(
                ROOT,
                "Pair.html"
            )
        );
    }
);

app.get(
    "/admin",
    (req, res) => {
        res.sendFile(
            path.join(
                ROOT,
                "Admin.html"
            )
        );
    }
);

// ============================================================
// 🎨 STATIC ASSETS
// ============================================================

app.get(
    "/Admin.js",
    (req, res) => {
        res.sendFile(
            path.join(
                ROOT,
                "Admin.js"
            )
        );
    }
);

app.get(
    "/Admin.css",
    (req, res) => {
        res.sendFile(
            path.join(
                ROOT,
                "Admin.css"
            )
        );
    }
);

app.get(
    "/menu.png",
    (req, res) => {
        res.sendFile(
            path.join(
                ROOT,
                "menu.png"
            )
        );
    }
);

// ============================================================
// 🌐 WEBPAIR API ROUTES
// ============================================================
//
// IMPORTANT:
// Pair.html should use /api/pair.
//
// We ALSO expose the same router directly at /pair
// so older Pair.html versions continue to work.
//
// Therefore both are valid:
//
// POST /pair
// POST /api/pair
//
// GET /pair/status/:number
// GET /api/pair/status/:number
//
// POST /pair/cancel
// POST /api/pair/cancel
//
// GET /pair/health
// GET /api/pair/health
//
// ============================================================

let pairRouter;

try {

    pairRouter =
        Pair.createPairRouter();

    if (pairRouter) {

        // API version
        app.use(
            "/api",
            pairRouter
        );

        // Compatibility version
        app.use(
            "/",
            pairRouter
        );

        log(
            "INFO",
            "WebPair routes mounted"
        );

    } else {

        log(
            "ERROR",
            "Pair router could not be created"
        );
    }

} catch (error) {

    log(
        "ERROR",
        "Failed to mount Pair router",
        {
            error:
                error.message
        }
    );
}

// ============================================================
// 🚫 PROTECTED FILES
// ============================================================

const blockedPaths = [
    "/database",
    "/sessions",
    "/temp",
    "/Plugins",
    "/.git",
    "/.env",
    "/package.json",
    "/render.yaml",
    "/vercel.yaml",
    "/heroku.yaml"
];

app.use(
    (req, res, next) => {

        const normalized =
            req.path.replace(
                /\/+$/,
                ""
            ) || "/";

        if (
            blockedPaths.some(
                blocked =>
                    normalized === blocked ||
                    normalized.startsWith(
                        `${blocked}/`
                    )
            )
        ) {

            return res.status(403).json({
                success: false,
                error: "Access denied"
            });
        }

        next();
    }
);

// ============================================================
// ❌ 404 HANDLER
// ============================================================

app.use(
    (req, res) => {

        res.status(404).json({
            success: false,
            error: "Route not found",
            path: req.path
        });
    }
);

// ============================================================
// 💥 ERROR HANDLER
// ============================================================

app.use(
    (error, req, res, next) => {

        log(
            "ERROR",
            "Express server error",
            {
                error:
                    error.message,
                path:
                    req.path
            }
        );

        res.status(500).json({
            success: false,
            error:
                "Internal server error"
        });
    }
);

// ============================================================
// 🚦 HTTP SERVER
// ============================================================

const server =
    http.createServer(app);

// ============================================================
// 🧹 GRACEFUL SHUTDOWN
// ============================================================

let shuttingDown = false;

async function gracefulShutdown() {

    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    log(
        "INFO",
        "STINGER V6 shutting down..."
    );

    try {

        if (Stinger.stop) {
            await Stinger.stop();
        }

    } catch (error) {

        log(
            "ERROR",
            "Failed stopping Stinger",
            {
                error:
                    error.message
            }
        );
    }

    server.close(
        () => {

            log(
                "INFO",
                "HTTP server closed"
            );

            process.exit(0);
        }
    );

    setTimeout(
        () => process.exit(1),
        10000
    ).unref();
}

process.on(
    "SIGINT",
    gracefulShutdown
);

process.on(
    "SIGTERM",
    gracefulShutdown
);

// ============================================================
// 🚀 START
// ============================================================

async function start() {

    try {

        log(
            "INFO",
            "Starting STINGER VERSION 6..."
        );

        // Start WhatsApp core
        if (Stinger.start) {

            await Stinger.start({
                rootDir: ROOT,
                databaseDir:
                    DATABASE_DIR,
                sessionDir:
                    SESSION_DIR,
                tempDir:
                    TEMP_DIR,
                pluginDir:
                    PLUGIN_DIR
            });

        }

        server.listen(
            PORT,
            "0.0.0.0",
            () => {

                log(
                    "INFO",
                    `STINGER V6 running on port ${PORT}`
                );

                console.log("");
                console.log(
                    "╭──────────────────────────────────╮"
                );
                console.log(
                    "│       🐝 STINGER VERSION 6       │"
                );
                console.log(
                    "├──────────────────────────────────┤"
                );
                console.log(
                    `│ 🌐 Port    : ${PORT}`
                );
                console.log(
                    "│ ⚡ Status  : ONLINE"
                );
                console.log(
                    "│ 🌐 Pair    : /pair"
                );
                console.log(
                    "│ 🛡️ Admin   : /admin"
                );
                console.log(
                    "│ ❤️ Health  : /health"
                );
                console.log(
                    "╰──────────────────────────────────╯"
                );
                console.log("");
            }
        );

    } catch (error) {

        log(
            "ERROR",
            "Failed to start STINGER V6",
            {
                error:
                    error.message
            }
        );

        console.error(error);

        process.exit(1);
    }
}

// ============================================================
// ▶️ RUN
// ============================================================

start();

// ============================================================
// 📤 EXPORTS
// ============================================================

module.exports = {
    app,
    server,
    start,
    gracefulShutdown
};

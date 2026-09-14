// ============================================================
// 🐝 STINGER V6 — MAIN SERVER
// ============================================================
// Admin API + WebPair + Bot + Database + Security
// ============================================================

"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const os = require("os");
const express = require("express");

// ============================================================
// CONFIG
// ============================================================

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

const ROOT_DIR = __dirname;

const DATABASE_DIR = path.join(ROOT_DIR, "database");
const SESSIONS_DIR = path.join(ROOT_DIR, "sessions");
const TEMP_DIR = path.join(ROOT_DIR, "temp");
const PLUGINS_DIR = path.join(ROOT_DIR, "Plugins");

const PUBLIC_FILES = [
    "Pair.html",
    "Admin.html",
    "Admin.js",
    "Admin.css",
    "menu.png"
];

// ============================================================
// APP
// ============================================================

const app = express();
const server = http.createServer(app);

// ============================================================
// DATABASE FILES
// ============================================================

const DB_FILES = {
    users: path.join(DATABASE_DIR, "users.json"),
    settings: path.join(DATABASE_DIR, "settings.json"),
    broadcasts: path.join(DATABASE_DIR, "broadcasts.json"),
    logs: path.join(DATABASE_DIR, "logs.json"),
    admins: path.join(DATABASE_DIR, "admins.json")
};

// ============================================================
// DEFAULT DATABASE
// ============================================================

const DEFAULT_DB = {
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

// ============================================================
// DIRECTORIES
// ============================================================

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
            recursive: true
        });
    }
}

function ensureDirectories() {
    ensureDir(DATABASE_DIR);
    ensureDir(SESSIONS_DIR);
    ensureDir(TEMP_DIR);
    ensureDir(PLUGINS_DIR);
}

// ============================================================
// SAFE JSON
// ============================================================

function writeJSON(file, data) {
    const tempFile = `${file}.tmp`;

    fs.writeFileSync(
        tempFile,
        JSON.stringify(data, null, 2),
        "utf8"
    );

    fs.renameSync(tempFile, file);
}

function readJSON(file, fallback) {
    try {
        if (!fs.existsSync(file)) {
            writeJSON(file, fallback);
            return fallback;
        }

        const raw = fs.readFileSync(file, "utf8");

        if (!raw.trim()) {
            writeJSON(file, fallback);
            return fallback;
        }

        return JSON.parse(raw);
    } catch (error) {
        console.error(
            `[DATABASE] Failed reading ${path.basename(file)}:`,
            error.message
        );

        return fallback;
    }
}

function ensureDatabase() {
    for (const [name, file] of Object.entries(DB_FILES)) {
        const fallback = DEFAULT_DB[name];

        if (!fs.existsSync(file)) {
            writeJSON(file, fallback);
        } else {
            readJSON(file, fallback);
        }
    }
}

// ============================================================
// LOGGING
// ============================================================

function writeLog(level, type, message, meta = {}) {
    const logs = readJSON(DB_FILES.logs, []);

    logs.push({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        level,
        type,
        message,
        meta
    });

    // Keep JSON database from becoming enormous.
    const trimmed = logs.slice(-5000);

    writeJSON(DB_FILES.logs, trimmed);

    console.log(
        `[${level}] [${type}] ${message}`
    );
}

// ============================================================
// MIDDLEWARE
// ============================================================

app.disable("x-powered-by");

app.use(express.json({
    limit: "2mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "2mb"
}));

// ============================================================
// SECURITY HEADERS
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
        "same-origin"
    );

    res.setHeader(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()"
    );

    next();
});

// ============================================================
// ADMIN SESSIONS
// ============================================================

const adminSessions = new Map();

const SESSION_DURATION =
    1000 * 60 * 60 * 12; // 12 hours

function generateToken() {
    return crypto.randomBytes(48).toString("hex");
}

function cleanupSessions() {

    const now = Date.now();

    for (const [token, session] of adminSessions.entries()) {

        if (session.expiresAt <= now) {
            adminSessions.delete(token);
        }
    }
}

setInterval(
    cleanupSessions,
    10 * 60 * 1000
).unref();

// ============================================================
// PASSWORD SECURITY
// ============================================================
// Set ADMIN_PASSWORD_HASH in your hosting environment.
//
// Generate a hash with:
// node -e "const c=require('crypto'); const p=process.argv[1]; const s=c.randomBytes(16).toString('hex'); console.log(s+':'+c.scryptSync(p,s,64).toString('hex'))" YOUR_PASSWORD
//
// Then set:
// ADMIN_PASSWORD_HASH=salt:hash
// ============================================================

function verifyPassword(password) {

    const stored =
        process.env.ADMIN_PASSWORD_HASH;

    if (!stored || !password) {
        return false;
    }

    const parts = stored.split(":");

    if (parts.length !== 2) {
        return false;
    }

    const [salt, storedHash] = parts;

    try {

        const derivedHash =
            crypto.scryptSync(
                password,
                salt,
                64
            );

        const expected =
            Buffer.from(storedHash, "hex");

        if (derivedHash.length !== expected.length) {
            return false;
        }

        return crypto.timingSafeEqual(
            derivedHash,
            expected
        );

    } catch {
        return false;
    }
}

// ============================================================
// ADMIN AUTH
// ============================================================

function getAdminSession(req) {

    const header =
        req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
        return null;
    }

    const token =
        header.slice(7).trim();

    if (!token) {
        return null;
    }

    const session =
        adminSessions.get(token);

    if (!session) {
        return null;
    }

    if (session.expiresAt <= Date.now()) {
        adminSessions.delete(token);
        return null;
    }

    return {
        token,
        ...session
    };
}

function requireAdmin(req, res, next) {

    const session =
        getAdminSession(req);

    if (!session) {

        return res.status(401).json({
            success: false,
            error: "Unauthorized"
        });
    }

    req.admin = session;

    next();
}

// ============================================================
// LOGIN RATE LIMIT
// ============================================================

const loginAttempts = new Map();

function checkLoginRateLimit(ip) {

    const now = Date.now();

    const record =
        loginAttempts.get(ip);

    if (!record) {
        return true;
    }

    if (now - record.windowStart > 15 * 60 * 1000) {

        loginAttempts.delete(ip);

        return true;
    }

    return record.attempts < 10;
}

function registerLoginFailure(ip) {

    const now = Date.now();

    const record =
        loginAttempts.get(ip);

    if (!record) {

        loginAttempts.set(ip, {
            attempts: 1,
            windowStart: now
        });

        return;
    }

    record.attempts++;
}

// ============================================================
// ADMIN LOGIN
// ============================================================

app.post(
    "/api/admin/login",
    (req, res) => {

        const ip =
            req.ip ||
            req.socket.remoteAddress ||
            "unknown";

        if (!checkLoginRateLimit(ip)) {

            writeLog(
                "WARNING",
                "SECURITY",
                "Admin login rate limit triggered",
                { ip }
            );

            return res.status(429).json({
                success: false,
                error: "Too many login attempts. Try again later."
            });
        }

        const password =
            typeof req.body?.password === "string"
                ? req.body.password
                : "";

        if (!verifyPassword(password)) {

            registerLoginFailure(ip);

            writeLog(
                "WARNING",
                "SECURITY",
                "Failed admin login",
                { ip }
            );

            return res.status(401).json({
                success: false,
                error: "Invalid credentials"
            });
        }

        const token =
            generateToken();

        const expiresAt =
            Date.now() + SESSION_DURATION;

        adminSessions.set(token, {
            role: "OWNER",
            createdAt: Date.now(),
            expiresAt,
            ip
        });

        writeLog(
            "INFO",
            "ADMIN",
            "Admin login successful",
            { ip }
        );

        return res.json({
            success: true,
            token,
            expiresAt,
            admin: {
                role: "OWNER"
            }
        });
    }
);

// ============================================================
// SESSION VALIDATION
// ============================================================

app.get(
    "/api/admin/session",
    requireAdmin,
    (req, res) => {

        res.json({
            success: true,
            authenticated: true,
            admin: {
                role: req.admin.role
            },
            expiresAt: req.admin.expiresAt
        });
    }
);

// ============================================================
// ADMIN LOGOUT
// ============================================================

app.post(
    "/api/admin/logout",
    requireAdmin,
    (req, res) => {

        adminSessions.delete(
            req.admin.token
        );

        writeLog(
            "INFO",
            "ADMIN",
            "Admin logged out"
        );

        res.json({
            success: true
        });
    }
);

// ============================================================
// LOGOUT ALL ADMIN SESSIONS
// ============================================================

function logoutAllAdmins() {

    const count =
        adminSessions.size;

    adminSessions.clear();

    writeLog(
        "WARNING",
        "SECURITY",
        "All admin sessions revoked",
        { count }
    );

    return count;
}

// ============================================================
// LOAD STINGER
// ============================================================

let Stinger = null;
let Pair = null;

try {

    Stinger =
        require("./Stinger");

    console.log(
        "🐝 STINGER core loaded."
    );

} catch (error) {

    console.error(
        "❌ Failed to load Stinger.js:",
        error.message
    );

    writeLog(
        "CRITICAL",
        "SYSTEM",
        "Failed to load Stinger.js",
        { error: error.message }
    );
}

try {

    Pair =
        require("./Pair");

    console.log(
        "🔗 Pair system loaded."
    );

} catch (error) {

    console.error(
        "❌ Failed to load Pair.js:",
        error.message
    );

    writeLog(
        "WARNING",
        "WEBPAIR",
        "Pair.js unavailable",
        { error: error.message }
    );
}

// ============================================================
// WEBPAIR ROUTER
// ============================================================

if (
    Pair &&
    typeof Pair.createPairRouter === "function"
) {

    try {

        const pairRouter =
            Pair.createPairRouter();

        app.use(
            "/api",
            pairRouter
        );

        console.log(
            "🔗 WebPair API mounted."
        );

    } catch (error) {

        console.error(
            "❌ Failed to mount WebPair:",
            error.message
        );

        writeLog(
            "ERROR",
            "WEBPAIR",
            "Failed to mount WebPair router",
            { error: error.message }
        );
    }
}

// ============================================================
// DASHBOARD HELPERS
// ============================================================

function getMemoryInfo() {

    const memory =
        process.memoryUsage();

    return {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
        arrayBuffers: memory.arrayBuffers || 0
    };
}

function getSystemInfo() {

    const memory =
        getMemoryInfo();

    const totalMemory =
        os.totalmem();

    const freeMemory =
        os.freemem();

    const usedMemory =
        totalMemory - freeMemory;

    return {

        node: process.version,

        platform:
            process.platform,

        architecture:
            process.arch,

        hostname:
            os.hostname(),

        cpu:
            os.cpus()?.[0]?.model || "Unknown",

        cpuCores:
            os.cpus()?.length || 0,

        systemMemory: {
            total: totalMemory,
            free: freeMemory,
            used: usedMemory,
            percent:
                Math.round(
                    (usedMemory / totalMemory) * 100
                )
        },

        processMemory:
            memory,

        uptime:
            process.uptime()
    };
}

function getPluginCount() {

    try {

        if (
            Stinger &&
            typeof Stinger.getPlugins === "function"
        ) {

            const plugins =
                Stinger.getPlugins();

            if (Array.isArray(plugins)) {
                return plugins.length;
            }

            if (plugins instanceof Map) {
                return plugins.size;
            }

            if (plugins && typeof plugins === "object") {
                return Object.keys(plugins).length;
            }
        }

        const files =
            fs.readdirSync(
                PLUGINS_DIR
            );

        return files.filter(
            file =>
                file.endsWith(".js")
        ).length;

    } catch {

        return 0;
    }
}

// ============================================================
// BOT STATUS
// ============================================================

function getBotStatus() {

    let online = false;

    try {

        if (
            Stinger &&
            typeof Stinger.isConnected === "function"
        ) {

            online =
                Boolean(
                    Stinger.isConnected()
                );
        }

    } catch {
        online = false;
    }

    return online
        ? "ONLINE"
        : "OFFLINE";
}

// ============================================================
// USERS
// ============================================================

function getUsers() {

    try {

        if (
            Stinger &&
            typeof Stinger.getUsers === "function"
        ) {

            const users =
                Stinger.getUsers();

            return Array.isArray(users)
                ? users
                : [];
        }

    } catch {}

    return readJSON(
        DB_FILES.users,
        []
    );
}

// ============================================================
// DASHBOARD
// ============================================================

app.get(
    "/api/admin/dashboard",
    requireAdmin,
    (req, res) => {

        const settings =
            readJSON(
                DB_FILES.settings,
                DEFAULT_DB.settings
            );

        const users =
            getUsers();

        const logs =
            readJSON(
                DB_FILES.logs,
                []
            );

        const broadcasts =
            readJSON(
                DB_FILES.broadcasts,
                []
            );

        let uptime =
            process.uptime();

        try {

            if (
                Stinger &&
                typeof Stinger.getUptime === "function"
            ) {

                uptime =
                    Stinger.getUptime();
            }

        } catch {}

        res.json({

            success: true,

            bot: {

                name:
                    settings.botName ||
                    "STINGER VERSION 6",

                version:
                    settings.version ||
                    "6.0.0",

                developer:
                    settings.developer ||
                    "Alpha",

                status:
                    getBotStatus(),

                uptime
            },

            users: {

                total:
                    users.length,

                online:
                    users.filter(
                        user =>
                            user.status === "online" ||
                            user.connected === true
                    ).length
            },

            plugins: {

                total:
                    getPluginCount()
            },

            system:
                getSystemInfo(),

            database: {

                users:
                    users.length,

                logs:
                    logs.length,

                broadcasts:
                    broadcasts.length
            },

            settings,

            server: {

                port:
                    PORT,

                host:
                    HOST,

                pid:
                    process.pid,

                startedAt:
                    new Date(
                        Date.now() -
                        process.uptime() * 1000
                    ).toISOString()
            }

        });
    }
);

// ============================================================
// ACTIVITY
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

        const limit =
            Math.min(
                Number(req.query.limit) || 30,
                100
            );

        res.json({
            success: true,
            activity:
                logs
                    .slice(-limit)
                    .reverse()
        });
    }
);

// ============================================================
// USERS API
// ============================================================

app.get(
    "/api/admin/users",
    requireAdmin,
    (req, res) => {

        const users =
            getUsers();

        res.json({
            success: true,
            users
        });
    }
);

// ============================================================
// PLUGINS API
// ============================================================

app.get(
    "/api/admin/plugins",
    requireAdmin,
    (req, res) => {

        let plugins = [];

        try {

            if (
                Stinger &&
                typeof Stinger.getPlugins === "function"
            ) {

                const loaded =
                    Stinger.getPlugins();

                if (Array.isArray(loaded)) {
                    plugins = loaded;
                } else if (loaded instanceof Map) {
                    plugins =
                        Array.from(
                            loaded.values()
                        );
                } else if (loaded) {
                    plugins =
                        Object.values(loaded);
                }
            }

        } catch {}

        res.json({
            success: true,
            count: plugins.length,
            plugins
        });
    }
);

// ============================================================
// LOGS API
// ============================================================

app.get(
    "/api/admin/logs",
    requireAdmin,
    (req, res) => {

        let logs =
            readJSON(
                DB_FILES.logs,
                []
            );

        const level =
            String(
                req.query.level || ""
            ).toUpperCase();

        const type =
            String(
                req.query.type || ""
            ).toUpperCase();

        if (level) {

            logs =
                logs.filter(
                    log =>
                        String(
                            log.level
                        ).toUpperCase() === level
                );
        }

        if (type) {

            logs =
                logs.filter(
                    log =>
                        String(
                            log.type
                        ).toUpperCase() === type
                );
        }

        res.json({
            success: true,
            logs:
                logs.slice(-500).reverse()
        });
    }
);

// ============================================================
// ADMIN ACTIONS
// ============================================================

app.post(
    "/api/admin/action",
    requireAdmin,
    async (req, res) => {

        const action =
            String(
                req.body?.action || ""
            ).trim();

        if (!action) {

            return res.status(400).json({
                success: false,
                error: "Action is required"
            });
        }

        writeLog(
            "INFO",
            "ADMIN",
            `Admin action requested: ${action}`
        );

        try {

            switch (action) {

                // ------------------------------------------------
                // RECONNECT
                // ------------------------------------------------

                case "reconnect":

                    if (
                        Stinger &&
                        typeof Stinger.connect === "function"
                    ) {

                        await Stinger.connect();

                        return res.json({
                            success: true,
                            message:
                                "Reconnect requested"
                        });
                    }

                    return res.status(503).json({
                        success: false,
                        error:
                            "Stinger connection controller unavailable"
                    });

                // ------------------------------------------------
                // RELOAD PLUGINS
                // ------------------------------------------------

                case "reloadPlugins":

                    if (
                        Stinger &&
                        typeof Stinger.reloadPlugins === "function"
                    ) {

                        await Stinger.reloadPlugins();

                        return res.json({
                            success: true,
                            message:
                                "Plugins reloaded"
                        });
                    }

                    return res.status(503).json({
                        success: false,
                        error:
                            "Plugin manager unavailable"
                    });

                // ------------------------------------------------
                // REFRESH DATABASE
                // ------------------------------------------------

                case "refreshDatabase":

                    ensureDirectories();
                    ensureDatabase();

                    writeLog(
                        "INFO",
                        "DATABASE",
                        "Database refreshed"
                    );

                    return res.json({
                        success: true,
                        message:
                            "Database refreshed"
                    });

                // ------------------------------------------------
                // CLEAR CACHE
                // ------------------------------------------------

                case "clearCache":

                    try {

                        const files =
                            fs.readdirSync(
                                TEMP_DIR
                            );

                        let removed = 0;

                        for (const file of files) {

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

                            removed++;
                        }

                        writeLog(
                            "INFO",
                            "SYSTEM",
                            "Temporary cache cleared",
                            { removed }
                        );

                        return res.json({
                            success: true,
                            message:
                                `Cleared ${removed} temporary item(s)`
                        });

                    } catch (error) {

                        return res.status(500).json({
                            success: false,
                            error:
                                error.message
                        });
                    }

                // ------------------------------------------------
                // LOGOUT ALL
                // ------------------------------------------------

                case "logoutAll":

                    const count =
                        logoutAllAdmins();

                    return res.json({
                        success: true,
                        message:
                            `Revoked ${count} admin session(s)`
                    });

                // ------------------------------------------------
                // RESTART
                // ------------------------------------------------

                case "restart":

                    writeLog(
                        "WARNING",
                        "SYSTEM",
                        "Restart requested by admin"
                    );

                    res.json({
                        success: true,
                        message:
                            "Restart requested"
                    });

                    setTimeout(() => {

                        gracefulShutdown(
                            "ADMIN_RESTART",
                            0
                        );

                    }, 500);

                    return;

                // ------------------------------------------------
                // SHUTDOWN
                // ------------------------------------------------

                case "shutdown":

                    writeLog(
                        "CRITICAL",
                        "SYSTEM",
                        "Shutdown requested by admin"
                    );

                    res.json({
                        success: true,
                        message:
                            "Shutdown requested"
                    });

                    setTimeout(() => {

                        gracefulShutdown(
                            "ADMIN_SHUTDOWN",
                            0
                        );

                    }, 500);

                    return;

                // ------------------------------------------------
                // HEALTH TEST
                // ------------------------------------------------

                case "healthCheck":

                    return res.json({
                        success: true,
                        message:
                            "Server health check passed",
                        health: {
                            server: true,
                            database:
                                fs.existsSync(
                                    DATABASE_DIR
                                ),
                            plugins:
                                fs.existsSync(
                                    PLUGINS_DIR
                                ),
                            stinger:
                                Boolean(Stinger)
                        }
                    });

                // ------------------------------------------------
                // UNKNOWN
                // ------------------------------------------------

                default:

                    return res.status(400).json({
                        success: false,
                        error:
                            `Unknown admin action: ${action}`
                    });
            }

        } catch (error) {

            writeLog(
                "ERROR",
                "ADMIN",
                `Action failed: ${action}`,
                {
                    error:
                        error.message
                }
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message
            });
        }
    }
);

// ============================================================
// SETTINGS API
// ============================================================

app.get(
    "/api/admin/settings",
    requireAdmin,
    (req, res) => {

        res.json({
            success: true,
            settings:
                readJSON(
                    DB_FILES.settings,
                    DEFAULT_DB.settings
                )
        });
    }
);

app.post(
    "/api/admin/settings",
    requireAdmin,
    (req, res) => {

        const current =
            readJSON(
                DB_FILES.settings,
                DEFAULT_DB.settings
            );

        const allowed = [
            "botName",
            "version",
            "developer",
            "country",
            "prefix",
            "maintenance",
            "autoRead",
            "autoTyping"
        ];

        for (const key of allowed) {

            if (
                Object.prototype.hasOwnProperty.call(
                    req.body,
                    key
                )
            ) {

                current[key] =
                    req.body[key];
            }
        }

        writeJSON(
            DB_FILES.settings,
            current
        );

        writeLog(
            "INFO",
            "CONFIG",
            "Bot settings updated"
        );

        res.json({
            success: true,
            settings: current
        });
    }
);

// ============================================================
// HEALTH
// ============================================================

app.get(
    "/health",
    (req, res) => {

        res.json({
            success: true,
            status: "online",
            bot:
                getBotStatus(),
            uptime:
                process.uptime(),
            timestamp:
                new Date().toISOString()
        });
    }
);

// ============================================================
// PUBLIC ROUTES
// ============================================================

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                ROOT_DIR,
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
                ROOT_DIR,
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
                ROOT_DIR,
                "Admin.html"
            )
        );
    }
);

// ============================================================
// SAFE STATIC FILE ROUTES
// ============================================================

for (const file of PUBLIC_FILES) {

    const route =
        "/" + file;

    app.get(
        route,
        (req, res) => {

            const fullPath =
                path.join(
                    ROOT_DIR,
                    file
                );

            if (
                !fs.existsSync(fullPath)
            ) {

                return res.status(404).send(
                    "File not found"
                );
            }

            res.sendFile(fullPath);
        }
    );
}

// ============================================================
// BLOCK SENSITIVE PATHS
// ============================================================

app.use(
    [
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
    ],
    (req, res) => {

        res.status(403).json({
            success: false,
            error: "Forbidden"
        });
    }
);

// ============================================================
// 404
// ============================================================

app.use(
    (req, res) => {

        res.status(404).json({
            success: false,
            error: "Route not found"
        });
    }
);

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
    (error, req, res, next) => {

        console.error(
            "SERVER ERROR:",
            error
        );

        writeLog(
            "ERROR",
            "SERVER",
            error.message
        );

        res.status(500).json({
            success: false,
            error:
                "Internal server error"
        });
    }
);

// ============================================================
// START STINGER
// ============================================================

let shuttingDown = false;

async function startStinger() {

    ensureDirectories();
    ensureDatabase();

    writeLog(
        "INFO",
        "SYSTEM",
        "STINGER V6 server starting"
    );

    if (
        Stinger &&
        typeof Stinger.start === "function"
    ) {

        await Stinger.start({
            rootDir: ROOT_DIR,
            databaseDir: DATABASE_DIR,
            sessionsDir: SESSIONS_DIR,
            tempDir: TEMP_DIR,
            pluginsDir: PLUGINS_DIR
        });

        writeLog(
            "INFO",
            "BOT",
            "STINGER core started"
        );
    }

    server.listen(
        PORT,
        HOST,
        () => {

            console.log("");
            console.log(
                "╭────────────────────────────────────╮"
            );
            console.log(
                "│        🐝 STINGER V6 ONLINE         │"
            );
            console.log(
                "├────────────────────────────────────┤"
            );
            console.log(
                `│ PORT      : ${PORT}`
            );
            console.log(
                `│ HOST      : ${HOST}`
            );
            console.log(
                `│ NODE      : ${process.version}`
            );
            console.log(
                `│ PLATFORM  : ${process.platform}`
            );
            console.log(
                "│ WEBPAIR   : /pair"
            );
            console.log(
                "│ ADMIN     : /admin"
            );
            console.log(
                "│ HEALTH    : /health"
            );
            console.log(
                "╰────────────────────────────────────╯"
            );
            console.log("");

            writeLog(
                "INFO",
                "SERVER",
                `HTTP server listening on port ${PORT}`
            );
        }
    );
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

async function gracefulShutdown(
    signal = "UNKNOWN",
    exitCode = 0
) {

    if (shuttingDown) {
        return;
    }

    shuttingDown = true;

    console.log(
        `\n🛑 Shutdown signal: ${signal}`
    );

    writeLog(
        "INFO",
        "SYSTEM",
        `Graceful shutdown started: ${signal}`
    );

    try {

        if (
            Stinger &&
            typeof Stinger.stop === "function"
        ) {

            await Stinger.stop();
        }

    } catch (error) {

        console.error(
            "Failed stopping Stinger:",
            error.message
        );
    }

    try {

        server.close(
            () => {

                writeLog(
                    "INFO",
                    "SERVER",
                    "HTTP server closed"
                );

                process.exit(
                    exitCode
                );
            }
        );

        setTimeout(
            () => process.exit(exitCode),
            8000
        ).unref();

    } catch {

        process.exit(exitCode);
    }
}

// ============================================================
// PROCESS EVENTS
// ============================================================

process.on(
    "SIGINT",
    () =>
        gracefulShutdown(
            "SIGINT"
        )
);

process.on(
    "SIGTERM",
    () =>
        gracefulShutdown(
            "SIGTERM"
        )
);

process.on(
    "uncaughtException",
    error => {

        console.error(
            "UNCAUGHT EXCEPTION:",
            error
        );

        writeLog(
            "CRITICAL",
            "PROCESS",
            error.message,
            {
                stack:
                    error.stack
            }
        );
    }
);

process.on(
    "unhandledRejection",
    reason => {

        console.error(
            "UNHANDLED REJECTION:",
            reason
        );

        writeLog(
            "ERROR",
            "PROCESS",
            String(reason)
        );
    }
);

// ============================================================
// START
// ============================================================

startStinger().catch(
    error => {

        console.error(
            "❌ STINGER failed to start:",
            error
        );

        writeLog(
            "CRITICAL",
            "SYSTEM",
            "STINGER failed to start",
            {
                error:
                    error.message
            }
        );

        process.exit(1);
    }
);

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    app,
    server,
    adminSessions,
    writeLog,
    getAdminSession,
    getBotStatus,
    getSystemInfo,
    gracefulShutdown
};

// ============================================================
// 🐝 STINGER V6 — WEBPAIR ENGINE
// 🔐 WhatsApp Pairing Code System
// ============================================================

"use strict";

const fs = require("fs");
const path = require("path");
const pino = require("pino");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    Browsers
} = require("@whiskeysockets/baileys");

const express = require("express");

// ============================================================
// 📁 DIRECTORIES
// ============================================================

const ROOT = __dirname;

const SESSIONS_DIR =
    path.join(ROOT, "sessions");

const DATABASE_DIR =
    path.join(ROOT, "database");

if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, {
        recursive: true
    });
}

if (!fs.existsSync(DATABASE_DIR)) {
    fs.mkdirSync(DATABASE_DIR, {
        recursive: true
    });
}

// ============================================================
// ⚙️ CONFIG
// ============================================================

const PAIR_TIMEOUT = Number(
    process.env.PAIR_TIMEOUT || 120000
);

// Keep pairing sockets alive.
// WhatsApp needs the socket to remain connected while
// the user enters the code on their phone.
const pairingRequests = new Map();

// ============================================================
// 🧹 NUMBER NORMALIZER
// ============================================================

function normalizeNumber(value) {

    if (
        typeof value !== "string" &&
        typeof value !== "number"
    ) {
        return null;
    }

    const number =
        String(value)
            .replace(/\D/g, "");

    // International number should normally
    // contain country code.
    if (
        number.length < 7 ||
        number.length > 15
    ) {
        return null;
    }

    return number;
}

// ============================================================
// 📂 SESSION PATH
// ============================================================

function getSessionPath(number) {

    return path.join(
        SESSIONS_DIR,
        `pair_${number}`
    );
}

// ============================================================
// 🧹 REMOVE OLD SESSION
// ============================================================

function removeSession(number) {

    const sessionPath =
        getSessionPath(number);

    if (!fs.existsSync(sessionPath)) {
        return;
    }

    try {

        fs.rmSync(
            sessionPath,
            {
                recursive: true,
                force: true
            }
        );

    } catch (error) {

        console.error(
            "❌ Failed removing pairing session:",
            error.message
        );
    }
}

// ============================================================
// 📊 STATUS
// ============================================================

function getPairingStatus(number) {

    const normalized =
        normalizeNumber(number);

    if (!normalized) {

        return {
            exists: false,
            status: "invalid_number"
        };
    }

    const request =
        pairingRequests.get(normalized);

    if (!request) {

        return {
            exists: false,
            status: "not_found"
        };
    }

    return {
        exists: true,
        number: normalized,
        status: request.status,
        code: request.code || null,
        createdAt: request.createdAt,
        expiresAt: request.expiresAt,
        connected: request.connected === true,
        error: request.error || null
    };
}

// ============================================================
// 🔐 GENERATE PAIRING CODE
// ============================================================

async function generatePairingCode(
    rawNumber
) {

    const number =
        normalizeNumber(rawNumber);

    if (!number) {

        throw new Error(
            "Invalid phone number. Use international format, digits only."
        );
    }

    // --------------------------------------------------------
    // Existing request
    // --------------------------------------------------------

    const existing =
        pairingRequests.get(number);

    if (
        existing &&
        (
            existing.status === "waiting" ||
            existing.status === "connecting"
        )
    ) {

        return {
            success: true,
            number,
            code: existing.code || null,
            status: existing.status,
            existing: true
        };
    }

    // --------------------------------------------------------
    // Fresh session
    // --------------------------------------------------------

    const sessionPath =
        getSessionPath(number);

    // Don't destroy an already authenticated session.
    if (!fs.existsSync(sessionPath)) {
        fs.mkdirSync(
            sessionPath,
            {
                recursive: true
            }
        );
    }

    const {
        state,
        saveCreds
    } =
        await useMultiFileAuthState(
            sessionPath
        );

    // Already authenticated?
    if (state.creds.registered) {

        return {
            success: false,
            number,
            status: "already_registered",
            message:
                "This number already has an active STINGER session."
        };
    }

    // --------------------------------------------------------
    // Request state
    // --------------------------------------------------------

    const request = {
        number,
        socket: null,
        code: null,
        status: "connecting",
        connected: false,
        createdAt: Date.now(),
        expiresAt:
            Date.now() + PAIR_TIMEOUT,
        error: null,
        timer: null
    };

    pairingRequests.set(
        number,
        request
    );

    // --------------------------------------------------------
    // Logger
    // --------------------------------------------------------

    const logger =
        pino({
            level:
                process.env.LOG_LEVEL || "info"
        });

    // --------------------------------------------------------
    // Create socket
    // --------------------------------------------------------

    const sock =
        makeWASocket({

            auth: state,

            logger,

            // Important for pairing code.
            printQRInTerminal: false,

            // Desktop-style identity.
            browser:
                Browsers.macOS(
                    "Chrome"
                ),

            // Don't request huge history
            // during the pairing process.
            syncFullHistory: false,

            markOnlineOnConnect: false,

            connectTimeoutMs: 60000,

            defaultQueryTimeoutMs: 60000,

            keepAliveIntervalMs: 20000
        });

    request.socket = sock;

    // --------------------------------------------------------
    // Save credentials
    // --------------------------------------------------------

    sock.ev.on(
        "creds.update",
        async () => {

            try {

                await saveCreds();

            } catch (error) {

                request.error =
                    error.message;

                console.error(
                    "❌ Failed saving credentials:",
                    error.message
                );
            }
        }
    );

    // --------------------------------------------------------
    // Connection events
    // --------------------------------------------------------

    sock.ev.on(
        "connection.update",
        async update => {

            const {
                connection,
                lastDisconnect,
                qr
            } = update;

            // ------------------------------------------------
            // QR received
            // ------------------------------------------------

            if (qr) {

                console.log(
                    `🐝 Pairing socket ready for ${number}`
                );

                // Only request the code once.
                if (
                    !request.code &&
                    !state.creds.registered
                ) {

                    try {

                        request.status =
                            "requesting_code";

                        /*
                         * WhatsApp pairing requires
                         * international digits only.
                         */
                        const code =
                            await sock.requestPairingCode(
                                number
                            );

                        request.code =
                            code;

                        request.status =
                            "waiting";

                        request.expiresAt =
                            Date.now() +
                            PAIR_TIMEOUT;

                        console.log(
                            `🔐 Pairing code for ${number}: ${code}`
                        );

                    } catch (error) {

                        request.status =
                            "error";

                        request.error =
                            error.message;

                        console.error(
                            `❌ Pairing code failed for ${number}:`,
                            error
                        );
                    }
                }
            }

            // ------------------------------------------------
            // Connection opened
            // ------------------------------------------------

            if (
                connection === "open"
            ) {

                request.status =
                    "connected";

                request.connected =
                    true;

                request.error =
                    null;

                console.log(
                    `✅ WhatsApp paired successfully: ${number}`
                );

                // Save credentials immediately.
                try {
                    await saveCreds();
                } catch {}

                // Don't destroy the socket immediately.
                // The session is now authenticated.
            }

            // ------------------------------------------------
            // Connection closed
            // ------------------------------------------------

            if (
                connection === "close"
            ) {

                const statusCode =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode;

                console.log(
                    `⚠️ Pairing connection closed for ${number}: ${statusCode || "unknown"}`
                );

                // Successful login can sometimes
                // cause a temporary reconnect.
                if (
                    statusCode ===
                    DisconnectReason.restartRequired
                ) {

                    request.status =
                        "restarting";

                    return;
                }

                if (
                    statusCode ===
                    DisconnectReason.loggedOut
                ) {

                    request.status =
                        "logged_out";

                    request.connected =
                        false;

                    return;
                }

                if (
                    request.status !==
                    "connected"
                ) {

                    request.status =
                        "disconnected";

                    request.connected =
                        false;

                    request.error =
                        `WhatsApp connection closed (${statusCode || "unknown"})`;
                }
            }
        }
    );

    // --------------------------------------------------------
    // Expiration timer
    // --------------------------------------------------------

    request.timer =
        setTimeout(
            () => {

                const current =
                    pairingRequests.get(
                        number
                    );

                if (!current) {
                    return;
                }

                if (
                    current.status ===
                    "waiting"
                ) {

                    current.status =
                        "expired";

                    current.error =
                        "Pairing code expired";

                    try {

                        sock.end(
                            new Error(
                                "Pairing timeout"
                            )
                        );

                    } catch {}

                    console.log(
                        `⌛ Pairing expired: ${number}`
                    );
                }

            },
            PAIR_TIMEOUT
        );

    return {
        success: true,
        number,
        code: null,
        status: "connecting",
        existing: false
    };
}

// ============================================================
// 🔎 FIND SOCKET
// ============================================================

function getPairingSocket(number) {

    const normalized =
        normalizeNumber(number);

    if (!normalized) {
        return null;
    }

    return (
        pairingRequests.get(
            normalized
        )?.socket || null
    );
}

// ============================================================
// ❌ CANCEL PAIRING
// ============================================================

async function cancelPairing(
    rawNumber
) {

    const number =
        normalizeNumber(rawNumber);

    if (!number) {

        return {
            success: false,
            error: "Invalid number"
        };
    }

    const request =
        pairingRequests.get(number);

    if (!request) {

        return {
            success: false,
            error: "Pairing request not found"
        };
    }

    if (request.timer) {
        clearTimeout(
            request.timer
        );
    }

    try {

        if (request.socket) {
            request.socket.end(
                new Error(
                    "Pairing cancelled"
                )
            );
        }

    } catch {}

    pairingRequests.delete(
        number
    );

    return {
        success: true
    };
}

// ============================================================
// 🌐 EXPRESS ROUTER
// ============================================================

function createPairRouter() {

    const router =
        express.Router();

    // --------------------------------------------------------
    // POST /pair
    // --------------------------------------------------------

    router.post(
        "/pair",
        async (req, res) => {

            try {

                const {
                    number
                } = req.body || {};

                const normalized =
                    normalizeNumber(
                        number
                    );

                if (!normalized) {

                    return res.status(400).json({
                        success: false,
                        error:
                            "Enter a valid international phone number."
                    });
                }

                console.log(
                    `📲 Pair request received: ${normalized}`
                );

                const result =
                    await generatePairingCode(
                        normalized
                    );

                return res.json(
                    result
                );

            } catch (error) {

                console.error(
                    "❌ Pair API error:",
                    error
                );

                return res.status(500).json({
                    success: false,
                    error:
                        error.message ||
                        "Pairing failed"
                });
            }
        }
    );

    // --------------------------------------------------------
    // GET /pair/status/:number
    // --------------------------------------------------------

    router.get(
        "/pair/status/:number",
        (req, res) => {

            const status =
                getPairingStatus(
                    req.params.number
                );

            res.json({
                success: true,
                ...status
            });
        }
    );

    // --------------------------------------------------------
    // POST /pair/cancel
    // --------------------------------------------------------

    router.post(
        "/pair/cancel",
        async (req, res) => {

            try {

                const result =
                    await cancelPairing(
                        req.body?.number
                    );

                res.json(
                    result
                );

            } catch (error) {

                res.status(500).json({
                    success: false,
                    error:
                        error.message
                });
            }
        }
    );

    // --------------------------------------------------------
    // GET /pair/health
    // --------------------------------------------------------

    router.get(
        "/pair/health",
        (req, res) => {

            res.json({
                success: true,
                service:
                    "STINGER V6 WebPair",
                activeRequests:
                    pairingRequests.size,
                timestamp:
                    new Date().toISOString()
            });
        }
    );

    return router;
}

// ============================================================
// 📤 EXPORTS
// ============================================================

module.exports = {
    generatePairingCode,
    getPairingStatus,
    getPairingSocket,
    cancelPairing,
    createPairRouter,
    normalizeNumber
};

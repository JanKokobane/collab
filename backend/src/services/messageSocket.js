const { WebSocketServer, WebSocket } = require('ws');
const { getFirebaseAdmin } = require('../config/firebaseAdmin');
const { pool } = require('../config/db');

const socketPath = '/api/messages/socket';
const notificationChannel = 'collab_message_events';
let notificationClient = null;
let notificationRetryTimer = null;
let shuttingDown = false;

const deliverMessageEvent = async (webSocketServer, notification) => {
    if (notification.channel !== notificationChannel) return;
    try {
        const { uids, event: initialEvent } = JSON.parse(notification.payload);
        let event = initialEvent;
        if (event.type === 'message.created') {
            const result = await pool.query(
                `SELECT m.message_id, m.conversation_id, m.sender_firebase_uid,
                        sender.email AS sender_email, sender.display_name AS sender_name,
                        m.body, m.reply_to_message_id, reply.body AS reply_to_body,
                        reply_sender.display_name AS reply_to_sender_name,
                        m.attachments, m.forwarded_from, m.is_pinned, m.edited_at, m.created_at
                 FROM messages m
                 JOIN message_conversation_members sender
                   ON sender.conversation_id = m.conversation_id
                  AND sender.firebase_uid = m.sender_firebase_uid
                 LEFT JOIN messages reply ON reply.message_id = m.reply_to_message_id
                 LEFT JOIN message_conversation_members reply_sender
                   ON reply_sender.conversation_id = m.conversation_id
                  AND reply_sender.firebase_uid = reply.sender_firebase_uid
                 WHERE m.message_id = $1
                   AND m.deleted_at IS NULL`,
                [event.messageId]
            );
            if (!result.rowCount) return;
            event = {
                ...event,
                message: {
                    ...result.rows[0],
                    reactions: [],
                    read_at: null
                }
            };
        }
        const payload = JSON.stringify(event);
        for (const client of webSocketServer.clients) {
            if (client.readyState === WebSocket.OPEN && uids.includes(client.firebaseUid)) {
                client.send(payload);
            }
        }
    } catch (error) {
        console.error('PostgreSQL message event delivery failed:', error.message);
    }
};

const initializeMessageSocket = async server => {
    const allowedOrigins = [
        process.env.FRONTEND_URL,
        process.env.PRODUCTION_FRONTEND_URL,
        ...(process.env.CORS_ALLOWED_ORIGINS ||
            'http://127.0.0.1:5500,http://localhost:5500,http://127.0.0.1:8000,http://localhost:8000'
        ).split(',')
    ].map(origin => origin?.trim()).filter(Boolean);

    const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 8192 });
    const listenForMessageEvents = async () => {
        if (shuttingDown) return;
        let client;
        try {
            client = await pool.connect();
            await client.query(`LISTEN ${notificationChannel}`);
            if (shuttingDown) {
                await client.query(`UNLISTEN ${notificationChannel}`);
                client.release();
                return;
            }
            notificationClient = client;
            client.on('notification', notification => {
                deliverMessageEvent(webSocketServer, notification)
                    .catch(error => console.error('Message WebSocket delivery failed:', error.message));
            });
            client.once('error', error => {
                if (notificationClient !== client) return;
                console.error('Message WebSocket database listener failed:', error.message);
                notificationClient = null;
                client.release(error);
                notificationRetryTimer = setTimeout(listenForMessageEvents, 5000);
            });
        } catch (error) {
            if (client) client.release(error);
            if (!shuttingDown) {
                console.error('Unable to subscribe to message events:', error.message);
                notificationRetryTimer = setTimeout(listenForMessageEvents, 5000);
            }
        }
    };

    await listenForMessageEvents();
    if (!notificationClient) {
        throw new Error('Unable to establish the PostgreSQL message event listener.');
    }

    server.on('upgrade', (request, socket, head) => {
        let requestUrl;
        try {
            requestUrl = new URL(request.url, 'http://localhost');
        } catch {
            socket.destroy();
            return;
        }
        if (requestUrl.pathname !== socketPath) {
            socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
            socket.destroy();
            return;
        }
        if (request.headers.origin && !allowedOrigins.includes(request.headers.origin)) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
        }
        webSocketServer.handleUpgrade(request, socket, head, webSocket => {
            webSocketServer.emit('connection', webSocket, request);
        });
    });

    webSocketServer.on('connection', socket => {
        let authenticationAttempted = false;
        const authenticationTimeout = setTimeout(() => socket.close(4401, 'Authentication required'), 5000);
        socket.on('message', async data => {
            if (authenticationAttempted) {
                socket.close(4400, 'Client messages are not supported');
                return;
            }
            authenticationAttempted = true;
            try {
                const frame = JSON.parse(data.toString());
                if (frame?.type !== 'authenticate' || typeof frame.token !== 'string' || frame.token.length > 8192) {
                    socket.close(4401, 'Invalid authentication frame');
                    return;
                }
                const decoded = await getFirebaseAdmin().auth().verifyIdToken(frame.token);
                clearTimeout(authenticationTimeout);
                socket.firebaseUid = decoded.uid;
                if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ready' }));
            } catch (error) {
                clearTimeout(authenticationTimeout);
                console.error('Message WebSocket authentication failed:', error.message);
                socket.close(4401, 'Authentication failed');
            }
        });
        socket.once('close', () => clearTimeout(authenticationTimeout));
    });

    return {
        close: async () => {
            shuttingDown = true;
            if (notificationRetryTimer) clearTimeout(notificationRetryTimer);
            let listenerError = null;
            if (notificationClient) {
                const client = notificationClient;
                notificationClient = null;
                try {
                    await client.query(`UNLISTEN ${notificationChannel}`);
                } catch (error) {
                    listenerError = error;
                } finally {
                    client.release();
                }
            }
            for (const client of webSocketServer.clients) client.terminate();
            await new Promise(resolve => webSocketServer.close(resolve));
            if (listenerError) throw listenerError;
        }
    };
};

const publishMessageEvent = async (uids, event) => {
    await pool.query(
        'SELECT pg_notify($1, $2)',
        [notificationChannel, JSON.stringify({ uids, event })]
    );
};

module.exports = { initializeMessageSocket, publishMessageEvent };

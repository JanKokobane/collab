import type { User } from 'firebase/auth';

type Listener = (payload?: unknown) => void;

const socketBaseUrl = (
  process.env.EXPO_PUBLIC_API_BASE_URL || 'https://collab-y7pb.onrender.com'
).replace(/\/+$/, '');

export class MessagesRealtime {
  private socket: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempt = 0;
  private nextAckId = 1;
  private pendingAcks = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private stopped = false;
  private connected = false;
  private refreshTokenOnReconnect = false;
  private refreshedToken = false;

  constructor(private readonly user: User) {}

  get isConnected(): boolean {
    return this.connected && this.socket?.readyState === WebSocket.OPEN;
  }

  start(): void {
    this.stopped = false;
    this.openSocket();
  }

  on<T = unknown>(event: string, listener: (payload?: T) => void): () => void {
    const listeners = this.listeners.get(event) || new Set<Listener>();
    const wrapped: Listener = (payload) => listener(payload as T);
    listeners.add(wrapped);
    this.listeners.set(event, listeners);
    return () => {
      listeners.delete(wrapped);
      if (!listeners.size) this.listeners.delete(event);
    };
  }

  async emitWithAck(event: string, ...args: unknown[]): Promise<unknown> {
    if (!this.isConnected || !this.socket) {
      throw new Error('Realtime messaging is reconnecting. Please try again.');
    }

    const id = this.nextAckId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(id);
        reject(new Error(`The messaging server did not confirm "${event}" in time.`));
      }, 30000);
      this.pendingAcks.set(id, { resolve, reject, timeout });
      if (!this.sendPacket(`42${id}${JSON.stringify([event, ...args])}`)) {
        clearTimeout(timeout);
        this.pendingAcks.delete(id);
        reject(new Error('Realtime messaging disconnected before the request was sent.'));
      }
    });
  }

  stop(): void {
    this.stopped = true;
    this.connected = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (this.socket?.readyState === WebSocket.OPEN) this.sendPacket('41');
    this.socket?.close();
    this.socket = null;
    this.rejectPendingAcks(new Error('Realtime messaging was closed.'));
    this.listeners.clear();
  }

  private openSocket(): void {
    if (this.stopped) return;
    const url = `${socketBaseUrl.replace(/^http/, 'ws')}/socket.io/?EIO=4&transport=websocket`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onmessage = (event) => {
      if (typeof event.data === 'string') void this.handlePacket(event.data);
    };
    socket.onerror = () => {
      this.emit('transport-error', new Error('Realtime messaging connection failed.'));
    };
    socket.onclose = () => {
      this.connected = false;
      this.rejectPendingAcks(new Error('Realtime messaging disconnected before the server confirmed the request.'));
      this.emit('disconnect');
      if (!this.stopped) this.scheduleReconnect();
    };
  }

  private async handlePacket(packet: string): Promise<void> {
    if (packet.includes('\x1e')) {
      for (const part of packet.split('\x1e')) {
        if (part) await this.handlePacket(part);
      }
      return;
    }
    if (packet.startsWith('2')) {
      this.sendPacket(`3${packet.slice(1)}`);
      return;
    }
    if (packet.startsWith('3') || packet.startsWith('6')) return;
    if (packet.startsWith('0')) {
      try {
        const token = await this.user.getIdToken(this.refreshTokenOnReconnect);
        this.refreshTokenOnReconnect = false;
        if (!this.stopped && this.socket?.readyState === WebSocket.OPEN) {
          this.sendPacket(`40${JSON.stringify({ token })}`);
        }
      } catch (error) {
        this.emit('transport-error', error);
        this.socket?.close();
      }
      return;
    }
    if (packet.startsWith('40')) {
      this.connected = true;
      this.retryAttempt = 0;
      this.refreshedToken = false;
      this.emit('connect');
      return;
    }
    if (packet.startsWith('44')) {
      const message = packet.slice(2);
      if (!this.refreshedToken && /auth/i.test(message)) {
        this.refreshedToken = true;
        this.refreshTokenOnReconnect = true;
        this.socket?.close();
      } else {
        this.emit('transport-error', new Error('Realtime authentication failed.'));
        this.socket?.close();
      }
      return;
    }
    if (packet.startsWith('43')) {
      const match = packet.slice(2).match(/^(?:\/[^,]+,)?(\d+)(.*)$/);
      if (!match) return;
      const id = Number(match[1]);
      const pending = this.pendingAcks.get(id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      this.pendingAcks.delete(id);
      try {
        const payload = JSON.parse(match[2] || 'null');
        const result = Array.isArray(payload) && payload.length === 1 ? payload[0] : payload;
        if (result?.success === false) {
          pending.reject(new Error(result.message || 'Conversation access was denied.'));
        } else {
          pending.resolve(result);
        }
      } catch {
        pending.reject(new Error('The messaging server returned an invalid acknowledgement.'));
      }
      return;
    }
    if (packet.startsWith('42')) {
      try {
        const [event, payload] = JSON.parse(packet.slice(2)) as [string, unknown];
        this.emit(event, payload);
      } catch (error) {
        console.error('Unable to parse a realtime messaging event:', error);
      }
    }
  }

  private emit(event: string, payload?: unknown): void {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }

  private sendPacket(packet: string): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(packet);
    return true;
  }

  private scheduleReconnect(): void {
    if (this.retryTimer || this.stopped) return;
    const delay = Math.min(1000 * (2 ** this.retryAttempt), 30000);
    this.retryAttempt = Math.min(this.retryAttempt + 1, 5);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.openSocket();
    }, delay);
  }

  private rejectPendingAcks(error: Error): void {
    this.pendingAcks.forEach((pending) => {
      clearTimeout(pending.timeout);
      pending.reject(error);
    });
    this.pendingAcks.clear();
  }
}

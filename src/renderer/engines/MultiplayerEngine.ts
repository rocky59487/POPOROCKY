import eventBus from './EventBus';

// Multiplayer Engine using Yjs CRDT for conflict-free real-time collaboration

export interface CollaboratorInfo {
  id: string;
  name: string;
  color: string;
  cursorPosition: { x: number; y: number; z: number } | null;
  lastActive: number;
}

export interface MultiplayerState {
  connected: boolean;
  roomId: string | null;
  localUserId: string;
  collaborators: Map<string, CollaboratorInfo>;
}

export class MultiplayerEngine {
  private ydoc: any = null;
  private provider: any = null;
  private awareness: any = null;
  private voxelMap: any = null; // Y.Map for voxel data
  private state: MultiplayerState = {
    connected: false,
    roomId: null,
    localUserId: `user_${Date.now().toString(36)}`,
    collaborators: new Map(),
  };
  private yInitialized = false;

  constructor() {
    this.initYjs();
  }

  private async initYjs() {
    try {
      const Y = await import('yjs');
      this.ydoc = new Y.Doc();
      this.voxelMap = this.ydoc.getMap('voxels');

      // Listen for remote voxel changes
      this.voxelMap.observe((event: any) => {
        event.changes.keys.forEach((change: any, key: string) => {
          if (change.action === 'add' || change.action === 'update') {
            const voxelData = this.voxelMap.get(key);
            eventBus.emit('multiplayer:voxel-changed', { key, data: voxelData, action: change.action });
          } else if (change.action === 'delete') {
            eventBus.emit('multiplayer:voxel-removed', { key });
          }
        });
      });

      this.yInitialized = true;
      console.log('[MultiplayerEngine] Yjs document initialized');
      eventBus.emit('multiplayer:yjs-ready', {});
    } catch (e) {
      console.warn('[MultiplayerEngine] Yjs not available', e);
    }
  }

  // Connect to a WebSocket room
  async connect(roomId: string, wsUrl: string = 'ws://localhost:1234'): Promise<boolean> {
    if (!this.yInitialized || !this.ydoc) {
      console.warn('[MultiplayerEngine] Yjs not initialized');
      return false;
    }

    try {
      const { WebsocketProvider } = await import('y-websocket');
      this.provider = new WebsocketProvider(wsUrl, roomId, this.ydoc);
      this.awareness = this.provider.awareness;

      // Set local user info
      this.awareness.setLocalStateField('user', {
        name: this.state.localUserId,
        color: this.generateUserColor(),
        cursor: null,
      });

      // Listen for awareness changes (cursor tracking, user list)
      this.awareness.on('change', () => {
        this.updateCollaborators();
      });

      this.provider.on('status', (event: any) => {
        this.state.connected = event.status === 'connected';
        eventBus.emit('multiplayer:status', { connected: this.state.connected });
        console.log(`[MultiplayerEngine] WebSocket ${event.status}`);
      });

      this.state.roomId = roomId;
      eventBus.emit('multiplayer:connected', { roomId });
      console.log(`[MultiplayerEngine] Connected to room: ${roomId}`);
      return true;
    } catch (e) {
      console.warn('[MultiplayerEngine] WebSocket connection failed', e);
      return false;
    }
  }

  disconnect(): void {
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
      this.awareness = null;
    }
    this.state.connected = false;
    this.state.roomId = null;
    this.state.collaborators.clear();
    eventBus.emit('multiplayer:disconnected', {});
  }

  // Sync voxel operations
  setVoxel(key: string, data: any): void {
    if (this.voxelMap) {
      this.voxelMap.set(key, data);
    }
  }

  deleteVoxel(key: string): void {
    if (this.voxelMap) {
      this.voxelMap.delete(key);
    }
  }

  getVoxel(key: string): any {
    return this.voxelMap ? this.voxelMap.get(key) : null;
  }

  getAllVoxels(): Map<string, any> {
    const result = new Map<string, any>();
    if (this.voxelMap) {
      this.voxelMap.forEach((value: any, key: string) => {
        result.set(key, value);
      });
    }
    return result;
  }

  // Update local cursor position (broadcast to other users)
  updateCursorPosition(x: number, y: number, z: number): void {
    if (this.awareness) {
      this.awareness.setLocalStateField('user', {
        ...this.awareness.getLocalState()?.user,
        cursor: { x, y, z },
      });
    }
  }

  // Get all collaborators from awareness
  private updateCollaborators(): void {
    if (!this.awareness) return;
    const states = this.awareness.getStates();
    const newCollaborators = new Map<string, CollaboratorInfo>();

    states.forEach((state: any, clientId: number) => {
      if (clientId === this.awareness.clientID) return; // skip self
      const user = state.user;
      if (user) {
        newCollaborators.set(String(clientId), {
          id: String(clientId),
          name: user.name || `User ${clientId}`,
          color: user.color || '#ffffff',
          cursorPosition: user.cursor || null,
          lastActive: Date.now(),
        });
      }
    });

    this.state.collaborators = newCollaborators;
    eventBus.emit('multiplayer:collaborators-updated', {
      count: newCollaborators.size,
      collaborators: Array.from(newCollaborators.values()),
    });
  }

  private generateUserColor(): string {
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#e91e63'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  getState(): MultiplayerState { return this.state; }
  getCollaborators(): CollaboratorInfo[] { return Array.from(this.state.collaborators.values()); }
  isConnected(): boolean { return this.state.connected; }
  getLocalUserId(): string { return this.state.localUserId; }

  getStats() {
    return {
      connected: this.state.connected,
      roomId: this.state.roomId,
      collaboratorCount: this.state.collaborators.size,
      voxelCount: this.voxelMap ? this.voxelMap.size : 0,
      yInitialized: this.yInitialized,
    };
  }
}

export const multiplayerEngine = new MultiplayerEngine();

type Handler = (...args: any[]) => void;
class EventBus {
  private handlers: Map<string, Set<Handler>> = new Map();
  private history: { event: string; ts: number; data?: any }[] = [];
  on(event: string, handler: Handler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }
  off(event: string, handler: Handler): void { this.handlers.get(event)?.delete(handler); }
  emit(event: string, ...args: any[]): void {
    this.history.push({ event, ts: Date.now(), data: args[0] });
    if (this.history.length > 200) this.history = this.history.slice(-100);
    this.handlers.get(event)?.forEach(h => { try { h(...args); } catch (e) { console.error(`EventBus [${event}]:`, e); } });
  }
  getHistory() { return this.history; }
  clear() { this.handlers.clear(); this.history = []; }
}
export const eventBus = new EventBus();
export default eventBus;

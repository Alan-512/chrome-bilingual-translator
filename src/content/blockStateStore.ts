export type BlockLifecycleState = "queued" | "pending" | "translated" | "failed" | "skipped";

export class BlockStateStore {
  private readonly state = new Map<string, BlockLifecycleState>();

  has(blockId: string): boolean {
    return this.state.has(blockId);
  }

  get(blockId: string): BlockLifecycleState | undefined {
    return this.state.get(blockId);
  }

  set(blockId: string, nextState: BlockLifecycleState): void {
    this.state.set(blockId, nextState);
  }

  clear(): void {
    this.state.clear();
  }
}

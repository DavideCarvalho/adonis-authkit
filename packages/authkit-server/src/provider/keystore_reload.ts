/**
 * Poll de housekeeping (da lib): lê um `head` barato do cofre e dispara `reload`
 * quando ele muda desde o último observado. Propaga rotações feitas por outro
 * processo/instância sem restart. Fail-safe: erros viram no-op (repassados a
 * `onError` se fornecido). `start()`/`stop()` controlam o intervalo; `tick()` é
 * exposto p/ teste.
 */
export interface KeystoreReloadOptions {
  head: () => Promise<string | null>;
  reload: () => Promise<void>;
  intervalMs: number;
  onError?: (err: unknown) => void;
}

export class KeystoreReloadPoller {
  #last: string | null | undefined;
  #timer: ReturnType<typeof setInterval> | undefined;
  constructor(private opts: KeystoreReloadOptions) {}

  async tick(): Promise<void> {
    try {
      const head = await this.opts.head();
      if (this.#last === undefined) {
        this.#last = head;
        return;
      } // baseline, sem reload
      if (head !== this.#last) {
        this.#last = head;
        await this.opts.reload();
      }
    } catch (err) {
      this.opts.onError?.(err);
    }
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      void this.tick();
    }, this.opts.intervalMs);
    if (typeof (this.#timer as any).unref === 'function') (this.#timer as any).unref();
  }

  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }
}

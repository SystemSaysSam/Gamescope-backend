import { ChatMessage } from '../types';

export interface QueueJob<T = any> {
  id: string;
  type: string;
  payload: T;
  receivedAt: number;
  retries: number;
}

export class QueueService {
  private static instance: QueueService;
  private queue: QueueJob[] = [];
  private processing: boolean = false;
  private maxQueueDepth: number = 2000;
  private processedIds = new Set<string>();
  private messageProcessor: ((msg: ChatMessage) => Promise<void>) | null = null;
  private rateLimitDelayMs: number = 20; // 50 items/sec max worker output during bursts

  private constructor() {
    // Evict old idempotency keys every 5 minutes
    setInterval(() => {
      if (this.processedIds.size > 10000) {
        this.processedIds.clear();
      }
    }, 300000);
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  public registerMessageProcessor(processor: (msg: ChatMessage) => Promise<void>) {
    this.messageProcessor = processor;
  }

  /**
   * Enqueue a chat message job with idempotency
   */
  public async enqueueChatMessage(msg: ChatMessage): Promise<boolean> {
    if (this.processedIds.has(msg.id)) {
      console.warn(`[Queue] Deduplicated already processed message ID: ${msg.id}`);
      return false;
    }

    // Bounded queue backpressure
    if (this.queue.length >= this.maxQueueDepth) {
      console.warn('[Queue] Queue capacity exceeded! Rejecting burst message under load.');
      throw new Error('System is currently under high traffic load. Please retry in a few seconds.');
    }

    const job: QueueJob<ChatMessage> = {
      id: msg.id,
      type: 'chat_message',
      payload: msg,
      receivedAt: Date.now(),
      retries: 0
    };

    // If queue is empty and not processing, process immediately with minimal latency
    if (this.queue.length === 0 && !this.processing && this.messageProcessor) {
      this.processedIds.add(msg.id);
      try {
        await this.messageProcessor(msg);
        return true;
      } catch (err) {
        console.error('[Queue] Error processing immediate message:', err);
      }
    }

    this.queue.push(job);
    this.startWorker();
    return true;
  }

  private startWorker() {
    if (this.processing) return;
    this.processing = true;

    const processNext = async () => {
      if (this.queue.length === 0) {
        this.processing = false;
        return;
      }

      const job = this.queue.shift();
      if (!job) {
        this.processing = false;
        return;
      }

      if (!this.processedIds.has(job.id)) {
        this.processedIds.add(job.id);
        try {
          if (job.type === 'chat_message' && this.messageProcessor) {
            await this.messageProcessor(job.payload);
          }
        } catch (err) {
          console.error(`[Queue] Job ${job.id} failed:`, err);
        }
      }

      setTimeout(processNext, this.rateLimitDelayMs);
    };

    setTimeout(processNext, 0);
  }

  public setRateLimitDelayMs(ms: number) {
    this.rateLimitDelayMs = Math.max(1, Math.min(100, ms));
  }

  public getQueueStats(): { depth: number; isProcessing: boolean } {
    return {
      depth: this.queue.length,
      isProcessing: this.processing
    };
  }
}

export const queueService = QueueService.getInstance();

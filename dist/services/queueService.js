"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueService = exports.QueueService = void 0;
class QueueService {
    static instance;
    queue = [];
    processing = false;
    maxQueueDepth = 2000;
    processedIds = new Set();
    messageProcessor = null;
    rateLimitDelayMs = 20; // 50 items/sec max worker output during bursts
    constructor() {
        // Evict old idempotency keys every 5 minutes
        setInterval(() => {
            if (this.processedIds.size > 10000) {
                this.processedIds.clear();
            }
        }, 300000);
    }
    static getInstance() {
        if (!QueueService.instance) {
            QueueService.instance = new QueueService();
        }
        return QueueService.instance;
    }
    registerMessageProcessor(processor) {
        this.messageProcessor = processor;
    }
    /**
     * Enqueue a chat message job with idempotency
     */
    async enqueueChatMessage(msg) {
        if (this.processedIds.has(msg.id)) {
            console.warn(`[Queue] Deduplicated already processed message ID: ${msg.id}`);
            return false;
        }
        // Bounded queue backpressure
        if (this.queue.length >= this.maxQueueDepth) {
            console.warn('[Queue] Queue capacity exceeded! Rejecting burst message under load.');
            throw new Error('System is currently under high traffic load. Please retry in a few seconds.');
        }
        const job = {
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
            }
            catch (err) {
                console.error('[Queue] Error processing immediate message:', err);
            }
        }
        this.queue.push(job);
        this.startWorker();
        return true;
    }
    startWorker() {
        if (this.processing)
            return;
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
                }
                catch (err) {
                    console.error(`[Queue] Job ${job.id} failed:`, err);
                }
            }
            setTimeout(processNext, this.rateLimitDelayMs);
        };
        setTimeout(processNext, 0);
    }
    setRateLimitDelayMs(ms) {
        this.rateLimitDelayMs = Math.max(1, Math.min(100, ms));
    }
    getQueueStats() {
        return {
            depth: this.queue.length,
            isProcessing: this.processing
        };
    }
}
exports.QueueService = QueueService;
exports.queueService = QueueService.getInstance();

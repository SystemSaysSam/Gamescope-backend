import { db } from './db';
import { auditService } from './auditService';
import { LivePoll, PollOption, YouTubeLivePoll } from '../types';
import { adaptiveAudienceController } from './adaptiveAudienceController';
import { youtubeChatService } from './youtubeChatService';

export class PollService {
  private static instance: PollService;
  private activePoll: LivePoll | null = null;

  private constructor() {}

  public static getInstance(): PollService {
    if (!PollService.instance) {
      PollService.instance = new PollService();
    }
    return PollService.instance;
  }

  public async init(): Promise<void> {
    const saved = await db.getDoc<LivePoll>('site_config', 'active_poll');
    if (saved) {
      this.activePoll = saved;
    } else {
      // Default initial poll
      this.activePoll = {
        id: 'poll-gtavi-premiere',
        question: 'WHICH MISSION STRATEGY SHOULD PROTAGONISTS LEAD WITH?',
        options: [
          { id: 'opt-1', text: 'Lucia Continental Vault Breach', votes: 1420 },
          { id: 'opt-2', text: 'Jason High-Speed Interstate Pursuit', votes: 1180 },
          { id: 'opt-3', text: 'Joint Everglades Extraction Airboat', votes: 640 }
        ],
        totalVotes: 3240,
        status: 'active',
        createdAt: Date.now()
      };
      await db.setDoc('site_config', 'active_poll', this.activePoll);
      await db.setDoc('polls', this.activePoll.id, this.activePoll);
    }
  }

  public getActivePoll(): LivePoll | null {
    return this.activePoll;
  }

  /**
   * Determine effective poll based on priority (Requirement 1):
   * Priority 1: GameScope Admin Poll is active -> display that poll
   * Priority 2: If no GameScope admin poll is active, and YouTube poll fallback is enabled -> display active YouTube livestream poll
   * Priority 3: Neither available -> null
   */
  public getEffectivePoll(): {
    effectivePoll: LivePoll | YouTubeLivePoll | null;
    source: 'gamescope' | 'youtube' | 'none';
  } {
    // 1. GameScope Admin-created poll active
    if (this.activePoll && this.activePoll.status === 'active') {
      return { effectivePoll: this.activePoll, source: 'gamescope' };
    }

    // 2. Fallback to YouTube Live Poll if fallback enabled
    if (adaptiveAudienceController.isPollFallbackEnabled()) {
      const ytPoll = youtubeChatService.getActivePoll();
      if (ytPoll) {
        return { effectivePoll: ytPoll, source: 'youtube' };
      }
    }

    return { effectivePoll: null, source: 'none' };
  }

  public async getPollHistory(): Promise<LivePoll[]> {
    return db.getCollection<LivePoll>('polls', undefined, (a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Vote on a poll (Supports single vote per user, and toggling unvote)
   */
  public async submitVote(pollId: string, optionId: string | null, userId: string): Promise<LivePoll> {
    if (!this.activePoll || this.activePoll.id !== pollId) {
      throw new Error('This poll is not currently active for voting.');
    }
    if (this.activePoll.status !== 'active') {
      throw new Error('This poll has been closed.');
    }

    const voteDocId = `${pollId}_${userId}`;
    const existingVote = await db.getDoc<{ optionId: string }>('poll_votes', voteDocId);
    const oldOptionId = existingVote?.optionId || null;

    // If voting for the same option, it toggles off (unvote)
    const nextSelected = (optionId === null || optionId === oldOptionId) ? null : optionId;

    if (nextSelected) {
      const validOpt = this.activePoll.options.some(o => o.id === nextSelected);
      if (!validOpt) {
        throw new Error('Selected option does not exist in this poll.');
      }
    }

    // Update vote record
    if (nextSelected) {
      await db.setDoc('poll_votes', voteDocId, { pollId, userId, optionId: nextSelected, votedAt: Date.now() });
    } else if (oldOptionId) {
      await db.deleteDoc('poll_votes', voteDocId);
    }

    // Recompute vote tallies
    const nextOptions = this.activePoll.options.map(opt => {
      let votes = opt.votes;
      if (oldOptionId === opt.id) votes = Math.max(0, votes - 1);
      if (nextSelected === opt.id) votes = votes + 1;
      return { ...opt, votes };
    });

    const totalVotes = nextOptions.reduce((acc, o) => acc + o.votes, 0);

    this.activePoll = {
      ...this.activePoll,
      options: nextOptions,
      totalVotes
    };

    await db.setDoc('site_config', 'active_poll', this.activePoll);
    await db.setDoc('polls', this.activePoll.id, this.activePoll);

    return this.activePoll;
  }

  /**
   * Admin: Create a new live poll
   */
  public async createPoll(params: {
    question: string;
    options: string[];
    durationMinutes?: number;
    adminInfo: { id: string; email: string };
  }): Promise<LivePoll> {
    const question = params.question.trim();
    if (!question) throw new Error('Poll question cannot be empty.');

    const cleanOptions = params.options.map(o => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) throw new Error('A poll must have at least 2 valid options.');
    if (cleanOptions.length > 5) throw new Error('A poll cannot have more than 5 options.');

    const pollOptions: PollOption[] = cleanOptions.map((text, idx) => ({
      id: `opt-${idx + 1}`,
      text,
      votes: 0
    }));

    const deadlineIso = params.durationMinutes && params.durationMinutes > 0
      ? new Date(Date.now() + params.durationMinutes * 60000).toISOString()
      : undefined;

    const newPoll: LivePoll = {
      id: `poll-${Date.now()}`,
      question,
      options: pollOptions,
      totalVotes: 0,
      status: 'active',
      createdAt: Date.now(),
      deadlineIso
    };

    this.activePoll = newPoll;
    await db.setDoc('site_config', 'active_poll', newPoll);
    await db.setDoc('polls', newPoll.id, newPoll);

    await auditService.logAction({
      adminId: params.adminInfo.id,
      adminEmail: params.adminInfo.email,
      action: 'CREATE_POLL',
      resourceId: newPoll.id,
      newValue: newPoll
    });

    return newPoll;
  }

  /**
   * Admin: Close current poll
   */
  public async closePoll(pollId: string, adminInfo: { id: string; email: string }): Promise<LivePoll> {
    if (!this.activePoll || this.activePoll.id !== pollId) {
      throw new Error('Active poll not found.');
    }

    this.activePoll = {
      ...this.activePoll,
      status: 'closed',
      closedAt: Date.now()
    };

    await db.setDoc('site_config', 'active_poll', this.activePoll);
    await db.setDoc('polls', this.activePoll.id, this.activePoll);

    await auditService.logAction({
      adminId: adminInfo.id,
      adminEmail: adminInfo.email,
      action: 'CLOSE_POLL',
      resourceId: pollId,
      newValue: { status: 'closed' }
    });

    return this.activePoll;
  }

  /**
   * Admin: Remove/delete the live poll completely from the active site
   */
  public async removePoll(params: {
    pollId?: string;
    deleteFromHistory?: boolean;
    adminInfo: { id: string; email: string };
  }): Promise<void> {
    const previous = this.activePoll;
    const targetId = params.pollId || previous?.id;

    this.activePoll = null;
    await db.deleteDoc('site_config', 'active_poll');

    if (params.deleteFromHistory && targetId) {
      await db.deleteDoc('polls', targetId);
    }

    await auditService.logAction({
      adminId: params.adminInfo.id,
      adminEmail: params.adminInfo.email,
      action: 'REMOVE_POLL',
      resourceId: targetId,
      previousValue: previous,
      newValue: null
    });
  }
}

export const pollService = PollService.getInstance();

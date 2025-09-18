import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PrayerCard, PrayerComment } from './prayer.models';

@Injectable({ providedIn: 'root' })
export class PrayerDataService {
  private STORAGE_KEY = 'ps.cards.v1';

  private _cards$ = new BehaviorSubject<PrayerCard[]>([]);
  cards$ = this._cards$.asObservable();

  private nextId = 1;

  constructor() {
    // Load from localStorage (simple persistence until Supabase)
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed: any[] = JSON.parse(raw);
        this._cards$.next(parsed as PrayerCard[]);
        const maxId = parsed.reduce((m, c) => Math.max(m, Number(c.id || 0)), 0);
        this.nextId = (isFinite(maxId) ? maxId : 0) + 1;
      }
    } catch {}

    // Save on every change
    this.cards$.subscribe(cards => {
      try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cards)); } catch {}
    });
  }

  // ---------- helpers ----------
  private mutate(updater: (cards: PrayerCard[]) => PrayerCard[]) {
    this._cards$.next(updater([...(this._cards$.value || [])]));
  }

  // ---------- CRUD used by UI ----------
  addCard(input: { title: string; detail?: string; category?: string }) {
    const card: any = {
      id: this.nextId++,
      title: (input.title || '').trim(),
      detail: (input.detail || '').trim(),
      category: input.category || 'General',
      createdAt: new Date().toISOString(),
      answered: false,
      answerText: '',
      favorite: false,
      comments: [] as PrayerComment[],
    };
    this.mutate(cards => [...cards, card]);
  }

  updateCard(id: number, patch: Partial<PrayerCard & { favorite?: boolean; answerText?: string }>) {
    this.mutate(cards => cards.map(c => (+c.id === +id ? ({ ...c, ...patch }) as any : c)));
  }

  deleteCard(id: number) {
    this.mutate(cards => cards.filter(c => +c.id !== +id));
  }

  addComment(cardId: number, author: string, text: string) {
    this.mutate(cards => cards.map(c => {
      if (+c.id !== +cardId) return c;
      const comments = [...(c.comments || [])];
      comments.push({
        // @ts-ignore allow numeric id
        commentID: Date.now(),
        author,
        text: (text || '').trim(),
        createdAt: new Date().toISOString(),
      } as any);
      return { ...c, comments } as PrayerCard;
    }));
  }

  // ---- methods your components call (build was failing on these) ----
  updateTitle(id: number, title: string) {
    this.updateCard(id, { title: (title || '').trim() } as any);
  }

  deleteComment(cardId: number, commentID: number) {
    this.mutate(cards => cards.map(c => {
      if (+c.id !== +cardId) return c;
      const comments = (c.comments || []).filter(cm => (cm as any).commentID !== commentID);
      return { ...c, comments } as any;
    }));
  }

  toggleFavorite(id: number) {
    this.mutate(cards => cards.map(c => (+c.id === +id ? { ...c, favorite: !((c as any).favorite ?? false) } as any : c)));
  }

  markAnswered(id: number, answerText: string) {
    this.updateCard(id, { answered: true, answerText } as any);
  }

  // Testing helper
  clearAll() {
    this._cards$.next([]);
    try { localStorage.removeItem(this.STORAGE_KEY); } catch {}
    this.nextId = 1;
  }
}

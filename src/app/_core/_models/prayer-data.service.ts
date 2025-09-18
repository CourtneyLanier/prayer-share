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
    // Load from localStorage
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        const parsed: PrayerCard[] = JSON.parse(raw);
        this._cards$.next(parsed);
        // keep IDs monotonic
        const maxId = parsed.reduce((m, c) => Math.max(m, Number(c.id || 0)), 0);
        this.nextId = (isFinite(maxId) ? maxId : 0) + 1;
      }
    } catch {}

    // Persist on every change
    this.cards$.subscribe(cards => {
      try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(cards)); } catch {}
    });
  }

  // ---- CRUD ----
  addCard(input: { title: string; detail?: string; category?: string }) {
    const card: PrayerCard = {
      id: this.nextId++,
      title: input.title.trim(),
      detail: (input.detail || '').trim(),
      category: input.category || 'General',
      createdAt: new Date().toISOString(),
      answered: false,
      comments: [] as PrayerComment[],
    } as any;

    const cards = [...this._cards$.value, card];
    this._cards$.next(cards);
  }

  addComment(cardId: number, author: string, text: string) {
    const cards = this._cards$.value.map(c =>
      Number(c.id) === Number(cardId)
        ? { ...c, comments: [...(c.comments || []), {
            commentID: Date.now(),
            author,
            text: text.trim(),
            createdAt: new Date().toISOString(),
          }] }
        : c
    );
    this._cards$.next(cards);
  }

  updateCard(cardId: number, patch: Partial<PrayerCard>) {
    const cards = this._cards$.value.map(c =>
      Number(c.id) === Number(cardId) ? { ...c, ...patch } : c
    );
    this._cards$.next(cards);
  }

  deleteCard(cardId: number) {
    const cards = this._cards$.value.filter(c => Number(c.id) !== Number(cardId));
    this._cards$.next(cards);
  }

  // Optional helper while testing
  clearAll() {
    this._cards$.next([]);
    try { localStorage.removeItem(this.STORAGE_KEY); } catch {}
    this.nextId = 1;
  }
}

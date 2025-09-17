import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PrayerCard } from './prayer.models';

let idSeq = 1;
let commentSeq = 1;

@Injectable({ providedIn: 'root' })
export class PrayerDataService {
  private readonly _cards$ = new BehaviorSubject<PrayerCard[]>([]);
  cards$ = this._cards$.asObservable();

  addCard(input: { title: string; detail: string; category: string }) {
    const cards = this._cards$.getValue();
    const newCard: PrayerCard = {
      id: idSeq++,
      title: input.title.trim(),
      detail: input.detail.trim(),
      category: input.category || 'General',
      createdAt: new Date().toISOString(),
      comments: [],
      favorite: false,
    };
    this._cards$.next([newCard, ...cards]);
  }

  deleteCard(id: number) {
    const next = this._cards$.getValue().filter(c => c.id !== id);
    this._cards$.next(next);
  }

  updateTitle(id: number, title: string) {
    const cards = this._cards$.getValue().map(c => c.id === id ? { ...c, title } : c);
    this._cards$.next(cards);
  }

  addComment(cardID: number, author: string, text: string) {
    const cards = this._cards$.getValue().map(c => {
      if (c.id !== cardID) return c;
      const newComment = { commentID: commentSeq++, author, text, createdAt: new Date().toISOString() };
      return { ...c, comments: [...c.comments, newComment] };
    });
    this._cards$.next(cards);
  }

  deleteComment(cardID: number, commentID: number) {
    const cards = this._cards$.getValue().map(c => {
      if (c.id !== cardID) return c;
      return { ...c, comments: c.comments.filter(cm => cm.commentID !== commentID) };
    });
    this._cards$.next(cards);
  }

  toggleFavorite(id: number) {
    const cards = this._cards$.getValue().map(c => c.id === id ? { ...c, favorite: !c.favorite } : c);
    this._cards$.next(cards);
  }

  markAnswered(id: number, answerText?: string) {
    const cards = this._cards$.getValue().map(c => c.id === id ? { ...c, answered: true, answerText } : c);
    this._cards$.next(cards);
  }
}

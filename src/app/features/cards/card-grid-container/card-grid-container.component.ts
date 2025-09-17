import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CardGridComponent } from '../card-grid/card-grid.component';
import { PrayerDataService } from '../../../_core/_models/prayer-data.service';
import { PrayerCard } from '../../../_core/_models/prayer.models';
import { Subscription } from 'rxjs';

interface Verse { ref: string; text: string; }

@Component({
  selector: 'app-card-grid-container',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, CardGridComponent],
  templateUrl: './card-grid-container.component.html',
  styleUrls: ['./card-grid-container.component.css']
})
export class CardGridContainerComponent {
  cards: PrayerCard[] = [];
  filtered: PrayerCard[] = [];
  private sub?: Subscription;

  addOpen = false;
  title = '';
  detail = '';
  category = 'General';

  tab: 'prayer' | 'praise' | 'favorites' | 'shared' = 'prayer';
  search = '';

  verse: Verse = { ref: '', text: '' };

  prayerCount = 0;
  praiseCount = 0;
  get nextPrayerTitle(): string { const next = this.cards.find(c => !c.answered); return next ? next.title : '—'; }

  constructor(private data: PrayerDataService) {}
  ngOnInit() { this.sub = this.data.cards$.subscribe(v => { this.cards = v; this.applyFilters(); }); this.pickVerseOfDay(); }
  ngOnDestroy() { this.sub?.unsubscribe(); }

  openAdd() { this.addOpen = true; this.title = ''; this.detail = ''; this.category = 'General'; }
  addCard() { if (!this.title.trim()) return; this.data.addCard({ title: this.title, detail: this.detail, category: this.category }); this.addOpen = false; }

  deleteCard(id: number) { this.data.deleteCard(id); }
  changeTitle(e: {id:number, title:string}) { this.data.updateTitle(e.id, e.title); }
  addComment(e: {id:number, text:string}) { this.data.addComment(e.id, 'You', e.text); }
  deleteComment(e: {cardID:number, commentID:number}) { this.data.deleteComment(e.cardID, e.commentID); }
  toggleFavorite(id: number) { this.data.toggleFavorite(id); }
  markAnswered(id: number) { const answer = window.prompt('Add an answer (optional):') || ''; this.data.markAnswered(id, answer); this.tab = 'praise'; this.applyFilters(); }

  setTab(tab: 'prayer'|'praise'|'favorites'|'shared') { this.tab = tab; this.applyFilters(); }
  onSearch(v: string) { this.search = v; this.applyFilters(); }

  private applyFilters() {
    let list = this.cards.slice();
    if (this.tab === 'prayer') list = list.filter((c: PrayerCard) => !c.answered);
    else if (this.tab === 'praise') list = list.filter((c: PrayerCard) => !!c.answered);
    else if (this.tab === 'favorites') list = list.filter((c: PrayerCard) => !!c.favorite);
    const q = this.search.toLowerCase().trim();
    if (q) list = list.filter((c: PrayerCard) => c.title.toLowerCase().includes(q) || c.detail.toLowerCase().includes(q));
    list.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    this.filtered = list;
    this.prayerCount = this.cards.filter((c: PrayerCard) => !c.answered).length;
    this.praiseCount = this.cards.filter((c: PrayerCard) => !!c.answered).length;
  }

  private pickVerseOfDay() {
    const verses: Verse[] = [
      {ref:'1 Thessalonians 5:17', text:'Pray without ceasing.'},
      {ref:'Philippians 4:6', text:'Be careful for nothing; but in every thing by prayer and supplication with thanksgiving let your requests be made known unto God.'},
      {ref:'Matthew 7:7', text:'Ask, and it shall be given you; seek, and ye shall find; knock, and it shall be opened unto you.'},
      {ref:'Jeremiah 33:3', text:'Call unto me, and I will answer thee, and shew thee great and mighty things, which thou knowest not.'},
      {ref:'Mark 11:24', text:'What things soever ye desire, when ye pray, believe that ye receive them, and ye shall have them.'},
      {ref:'James 5:16', text:'The effectual fervent prayer of a righteous man availeth much.'}
    ];
    const i = Math.floor((Date.now() / 86400000)) % verses.length;
    this.verse = verses[i];
  }
}

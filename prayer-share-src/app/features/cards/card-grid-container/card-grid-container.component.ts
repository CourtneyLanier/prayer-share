import { Component, computed, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardGridComponent } from '../card-grid/card-grid.component';
import { PrayerDataService } from '../../../_core/_models/prayer-data.service';
import { PrayerCard } from '../../../_core/_models/prayer.models';
import { AsyncPipe } from '@angular/common';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-card-grid-container',
  standalone: true,
  imports: [CommonModule, FormsModule, CardGridComponent, AsyncPipe],
  templateUrl: './card-grid-container.component.html',
  styleUrls: ['./card-grid-container.component.css']
})
export class CardGridContainerComponent {
  cards: PrayerCard[] = [];
  private sub?: Subscription;

  // Overlay state
  addOpen = false;
  title = '';
  detail = '';
  category = 'General';

  constructor(private data: PrayerDataService) {}

  ngOnInit() {
    this.sub = this.data.cards$.subscribe(v => this.cards = v);
  }
  ngOnDestroy() { this.sub?.unsubscribe(); }

  openAdd() {
    this.addOpen = true;
    this.title = ''; this.detail = ''; this.category = 'General';
  }
  addCard() {
    if (!this.title.trim()) return;
    this.data.addCard({ title: this.title, detail: this.detail, category: this.category });
    this.addOpen = false;
  }

  deleteCard(id: number) { this.data.deleteCard(id); }
  changeTitle(e: {id:number, title:string}) { this.data.updateTitle(e.id, e.title); }
  addComment(e: {id:number, text:string}) { this.data.addComment(e.id, 'You', e.text); }
  deleteComment(e: {cardID:number, commentID:number}) { this.data.deleteComment(e.cardID, e.commentID); }
}

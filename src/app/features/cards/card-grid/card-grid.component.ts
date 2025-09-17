import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PrayerCard } from '../../../_core/_models/prayer.models';
import { PrayerCardComponent } from '../prayer-card/prayer-card.component';

@Component({
  selector: 'app-card-grid',
  standalone: true,
  imports: [CommonModule, PrayerCardComponent],
  templateUrl: './card-grid.component.html',
  styleUrls: ['./card-grid.component.css']
})
export class CardGridComponent {
  @Input() cards: PrayerCard[] = [];
  @Output() deleteId = new EventEmitter<number>();
  @Output() titleChange = new EventEmitter<{id:number,title:string}>();
  @Output() commentAdd = new EventEmitter<{id:number,text:string}>();
  @Output() commentDelete = new EventEmitter<{cardID:number,commentID:number}>();
  @Output() favoriteToggle = new EventEmitter<number>();
  @Output() markAnswered = new EventEmitter<number>();

  trackByCard(index: number, item: PrayerCard) { return item.id; }
}

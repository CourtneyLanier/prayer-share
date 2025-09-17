import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PrayerCard, PrayerComment } from '../../../_core/_models/prayer.models';

@Component({
  selector: 'app-prayer-card',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './prayer-card.component.html',
  styleUrls: ['./prayer-card.component.css']
})
export class PrayerCardComponent {
  @Input() card!: PrayerCard;
  @Output() deleteId = new EventEmitter<number>();
  @Output() titleChange = new EventEmitter<{id:number, title:string}>();
  @Output() commentAdd = new EventEmitter<{id:number, text:string}>();
  @Output() commentDelete = new EventEmitter<{cardID:number, commentID:number}>();

  editing = false;
  newComment = '';

  saveTitle() {
    this.titleChange.emit({ id: this.card.id, title: this.card.title });
    this.editing = false;
  }
  addComment() {
    const text = this.newComment.trim();
    if (!text) return;
    this.commentAdd.emit({ id: this.card.id, text });
    this.newComment = '';
  }
}

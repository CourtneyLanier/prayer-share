import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { PrayerDataService } from '../../../_core/_models/prayer-data.service';
import { PrayerCard } from '../../../_core/_models/prayer.models';

type Step = 'upload' | 'ocr' | 'review' | 'done';

interface LineRow {
  text: string;
  kind: 'card' | 'comment';
  category?: string;
  cardID?: number;
}

@Component({
  selector: 'app-import-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './import-wizard.component.html',
})
export class ImportWizardComponent implements OnDestroy {
  // flow
  step: Step = 'upload';
  images: { file: File; url: string }[] = [];

  // OCR / review
  ocrText = '';
  lines: LineRow[] = [];
  cards: PrayerCard[] = [];
  importing = false;

  // UI
  error = '';
  status = '';
  progress = 0;

  // Cloud OCR
  cloudEndpoint = '/.netlify/functions/ocr';
  cloudBusy = false;

  constructor(private data: PrayerDataService) {}

  ngOnInit() {
    this.data.cards$.subscribe(c => (this.cards = c || []));
  }

  ngOnDestroy() {
    try { this.images.forEach(im => URL.revokeObjectURL(im.url)); } catch {}
  }

  // ------- Step 1: upload -------
  onFiles(ev: Event) {
    const files = Array.from((ev.target as HTMLInputElement).files || []);
    this.images.forEach(im => URL.revokeObjectURL(im.url));
    this.images = files.map(f => ({ file: f, url: URL.createObjectURL(f) }));
    if (this.images.length) this.step = 'ocr';
  }

  // ------- helpers -------
  trackLine(i: number, row: LineRow) {
    return row?.text ?? i;
  }

  cardTitleById(id?: number): string {
    if (id == null) return '—';
    const found = this.cards.find(x => Number(x.id) === Number(id));
    return found ? found.title : '—';
  }

  private normalizeName(s: string) {
    return (s || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private parseLine(line: string): { name?: string; body?: string; titleOnly?: string } {
    const m = line.match(/^\s*([^—\-:]+?)\s*[—\-:]\s*(.+)\s*$/);
    if (m) return { name: m[1].trim(), body: m[2].trim() };
    return { titleOnly: line.trim() };
  }

  /** comment onto existing card if name matches; else new card */
  private smartMapLines(lines: string[]): LineRow[] {
    const byNormTitle = new Map<string, PrayerCard>();
    for (const c of (this.cards || [])) byNormTitle.set(this.normalizeName(c.title), c);

    const out: LineRow[] = [];
    for (const line of lines) {
      const { name, body, titleOnly } = this.parseLine(line);

      if (name) {
        const existing = byNormTitle.get(this.normalizeName(name));
        if (existing && body) {
          out.push({ text: body, kind: 'comment', cardID: Number(existing.id) });
        } else {
          const combined = body ? `${name} — ${body}` : name;
          out.push({ text: combined, kind: 'card', category: 'General' });
        }
      } else if (titleOnly) {
        out.push({ text: titleOnly, kind: 'card', category: 'General' });
      }
    }
    return out;
  }

  splitFromText() {
    const rawLines = (this.ocrText || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    this.lines = this.smartMapLines(rawLines);
    this.step = 'review';
  }

  toggleRowKind(row: any) {
    if (row.kind === 'comment') {
      // comment → card
      const title = this.cardTitleById(row.cardID);
      row.kind = 'card';
      row.category = row.category || 'General';
      row.text = title && row.text ? `${title} — ${row.text}` : (title || row.text || '');
      row.cardID = undefined;
    } else {
      // card → comment (if "Name — body" and card exists)
      const m = row.text?.match(/^\s*([^—\-:]+?)\s*[—\-:]\s*(.+)\s*$/);
      if (!m) return;
      const name = m[1].trim(), body = m[2].trim();
      const match = this.cards.find(c => this.normalizeName(c.title) === this.normalizeName(name));
      if (match) {
        row.kind = 'comment';
        row.cardID = Number(match.id);
        row.text = body;
        delete row.category;
      }
    }
  }

  // ------- Cloud OCR only -------
  async runCloudOCR() {
    if (!this.cloudEndpoint.startsWith('/')) this.cloudEndpoint = '/.netlify/functions/ocr';
    if (!this.images.length) { this.error = 'Please upload an image first.'; return; }

    this.cloudBusy = true;
    this.error = '';
    this.status = 'Sending image to cloud OCR...';
    this.progress = 0;

    try {
      const fd = new FormData();
      fd.append('image', this.images[0].file, this.images[0].file.name);

      const resp = await fetch(this.cloudEndpoint, { method: 'POST', body: fd });
      let data: any = null;
      try { data = await resp.json(); } catch {}

      if (!resp.ok) throw new Error(data?.error || (`${resp.status} ${resp.statusText}`));

      const text = (data?.text || (Array.isArray(data?.lines) ? data.lines.join('\n') : '')).trim();
      this.ocrText = text;
      this.splitFromText();
      this.status = 'Cloud OCR done';
    } catch (e: any) {
      this.error = String(e?.message || e);
    } finally {
      this.cloudBusy = false;
    }
  }

  // ------- Import to wall -------
  importNow() {
    this.importing = true; this.error = '';
    try {
      for (const row of this.lines) {
        if (!row.text?.trim()) continue;

        if (row.kind === 'card') {
          const m = row.text.match(/^\s*([^—\-:]+?)\s*[—\-:]\s*(.+)\s*$/);
          const title = m ? m[1].trim() : row.text.trim();
          const detail = m ? m[2].trim() : '';
          this.data.addCard({ title, detail, category: row.category || 'General' });
        } else if (row.kind === 'comment' && row.cardID) {
          this.data.addComment(row.cardID, 'You', row.text.trim());
        }
      }
      this.step = 'done';
    } catch (e: any) {
      this.error = String(e?.message || e);
    } finally {
      this.importing = false;
    }
  }
}

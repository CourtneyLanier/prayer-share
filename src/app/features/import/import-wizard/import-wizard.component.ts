import { Component, OnDestroy, NgZone } from '@angular/core';
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
  step: Step = 'upload';
  images: { file: File; url: string }[] = [];

  ocrText = '';
  lines: LineRow[] = [];
  cards: PrayerCard[] = [];
  importing = false;

  error = '';
  status = '';
  progress = 0;

  cloudEndpoint = '/.netlify/functions/ocr';
  cloudBusy = false;

  constructor(private data: PrayerDataService, private zone: NgZone) {
    console.log('[ImportWizard] ctor');

    // show any hidden runtime errors IN the page (no more blank screen)
    window.addEventListener('error', (e) => {
      const msg = `Runtime error: ${e.message || e}`;
      console.error('[GlobalError]', e);
      this.zone.run(() => { this.error = msg; });
    });
    window.addEventListener('unhandledrejection', (e: any) => {
      const msg = `Unhandled promise: ${e?.reason?.message || e?.reason || e}`;
      console.error('[GlobalRejection]', e);
      this.zone.run(() => { this.error = msg; });
    });

    this.data.cards$.subscribe(c => (this.cards = c || []));
  }

  ngOnDestroy() {
    try { this.images.forEach(im => URL.revokeObjectURL(im.url)); } catch {}
  }

  /** Centralized step change so we can log & stay in zone */
  go(to: Step) {
    this.zone.run(() => {
      console.log('[ImportWizard] step ->', to, 'images:', this.images.length);
      this.step = to;
    });
  }

  // -------- upload ----------
  onFiles(ev: Event | File[] | null | undefined) {
    try {
      let files: File[] = [];

      if (Array.isArray(ev)) {
        files = ev;
      } else {
        const input = ev?.target as HTMLInputElement | null;
        files = Array.from(input?.files ?? []);
      }

      // Revoke existing previews
      try { this.images.forEach(im => URL.revokeObjectURL(im.url)); } catch {}

      this.images = files.map(f => ({ file: f, url: URL.createObjectURL(f) }));

      this.status = this.images.length
        ? `Loaded ${this.images.length} image(s).`
        : 'No image selected.';
      this.error = '';
      console.log('[ImportWizard] files picked:', this.images.map(i => i.file?.name));
    } catch (e: any) {
      this.error = String(e?.message || e);
      console.error('[ImportWizard] onFiles error', e);
    }
  }

  // -------- helpers ----------
  trackLine(i: number, row: LineRow) { return row?.text ?? i; }

  cardTitleById(id?: number): string {
    if (id == null) return '—';
    const found = this.cards.find(x => Number(x.id) === Number(id));
    return found ? found.title : '—';
  }

  private normalizeName(s: string) {
    return (s || '').toLowerCase()
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
    try {
      const rawLines = (this.ocrText || '')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(Boolean);
      this.lines = this.smartMapLines(rawLines);
      this.go('review');
    } catch (e: any) {
      this.error = String(e?.message || e);
      console.error('[ImportWizard] splitFromText error', e);
    }
  }

  toggleRowKind(row: any) {
    if (row.kind === 'comment') {
      const title = this.cardTitleById(row.cardID);
      row.kind = 'card';
      row.category = row.category || 'General';
      row.text = title && row.text ? `${title} — ${row.text}` : (title || row.text || '');
      row.cardID = undefined;
    } else {
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

  // -------- Cloud OCR ----------
  async runCloudOCR() {
    if (!this.images.length || !this.images[0]?.file) {
      this.error = 'Please upload or take a photo first.';
      return;
    }
    if (!this.cloudEndpoint.startsWith('/')) this.cloudEndpoint = '/.netlify/functions/ocr';

    this.cloudBusy = true;
    this.error = '';
    this.status = 'Sending image to cloud OCR...';
    this.progress = 0;
    console.log('[ImportWizard] runCloudOCR ->', this.cloudEndpoint);

    try {
      const fd = new FormData();
      fd.append('image', this.images[0].file, this.images[0].file.name);

      const resp = await fetch(this.cloudEndpoint, { method: 'POST', body: fd });
      let data: any = null;
      try { data = await resp.json(); } catch {}

      if (!resp.ok) {
        const msg = data?.error || (`${resp.status} ${resp.statusText}`);
        throw new Error(msg);
      }

      const text = (data?.text || (Array.isArray(data?.lines) ? data.lines.join('\n') : '') || '').trim();
      console.log('[ImportWizard] OCR text len:', text.length);
      this.ocrText = text;
      this.splitFromText();
      this.status = 'Cloud OCR done';
    } catch (e: any) {
      this.error = String(e?.message || e);
      console.error('[ImportWizard] runCloudOCR error', e);
    } finally {
      this.cloudBusy = false;
    }
  }

  // -------- Import to wall ----------
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
      this.go('done');
    } catch (e: any) {
      this.error = String(e?.message || e);
      console.error('[ImportWizard] importNow error', e);
    } finally {
      this.importing = false;
    }
  }
}

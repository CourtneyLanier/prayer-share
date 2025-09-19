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
  styleUrls: ['./import-wizard.component.css'],
})
export class ImportWizardComponent implements OnDestroy {
  // --- flow state ---
  step: Step = 'upload';
  images: { file: File; url: string }[] = [];

  // --- OCR / review state ---
  ocrText = '';
  lines: LineRow[] = [];
  cards: PrayerCard[] = [];
  importing = false;

  // --- UI state ---
  error = '';
  status = '';
  progress = 0;

  // --- local OCR options ---
  useBestModel = true;
  enhanceImage = true;
  /** PSM 6 = block of text, PSM 7 = single line */
  psm: '6' | '7' = '6';

  // --- cloud OCR (Netlify function) ---
  cloudEndpoint =
    (location.hostname.endsWith('netlify.app') || location.hostname.endsWith('ceebsync.com'))
      ? '/.netlify/functions/ocr'
      : '/.netlify/functions/ocr'; // safe default
  cloudBusy = false;

  constructor(private data: PrayerDataService) {}

  ngOnInit() {
    this.data.cards$.subscribe((c) => (this.cards = c));
  }

  ngOnDestroy() {
    // prevent object URL leaks
    try { this.images.forEach(im => URL.revokeObjectURL(im.url)); } catch {}
  }

  // ----------------- Step 1: upload -----------------
  onFiles(ev: Event) {
    const files = Array.from((ev.target as HTMLInputElement).files || []);
    // Revoke old previews
    this.images.forEach(im => URL.revokeObjectURL(im.url));
    this.images = files.map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    if (this.images.length) this.step = 'ocr';
  }

  // ----------------- Helpers -----------------
  trackLine(index: number, row: LineRow) {
    return row?.text ?? index;
  }

  cardTitleById(id?: number): string {
    if (id == null) return '—';
    const found = this.cards.find((x) => x.id === id);
    return found ? found.title : '—';
  }

  splitFromText() {
    const rawLines = (this.ocrText || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    this.lines = this.smartMapLines(rawLines);
    this.step = 'review';
  }
	private normalizeName(s: string) {
	  return (s || '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')     // strip accents
		.replace(/[^a-z0-9]+/g, ' ')          // keep letters/numbers
		.trim();
	}

	private parseLine(line: string): { name?: string; body?: string; titleOnly?: string } {
	  // Match: Name — body | Name - body | Name: body
	  const m = line.match(/^\s*([^—\-:]+?)\s*[—\-:]\s*(.+)\s*$/);
	  if (m) {
		const name = m[1].trim();
		const body = m[2].trim();
		return { name, body };
	  }
	  // Otherwise treat whole line as a card title
	  return { titleOnly: line.trim() };
	}

	private smartMapLines(lines: string[]): LineRow[] {
	  // Build quick lookup of existing cards by normalized title
	  const byNormTitle = new Map<string, PrayerCard>();
	  for (const c of (this.cards || [])) {
		byNormTitle.set(this.normalizeName(c.title), c);
	  }

	  const out: LineRow[] = [];
	  for (const line of lines) {
		const { name, body, titleOnly } = this.parseLine(line);

		if (name) {
		  const norm = this.normalizeName(name);
		  const existing = byNormTitle.get(norm);
		  if (existing && body) {
			// Existing card → make a comment; drop the name
			out.push({ text: body, kind: 'comment', cardID: Number(existing.id) });
		  } else {
			// No existing card → create a new card.
			// Put the "body" into the card detail later (importNow handles it).
			const title = name;
			const combined = body ? `${name} — ${body}` : name;
			out.push({ text: combined, kind: 'card', category: 'General' });
		  }
		} else if (titleOnly) {
		  out.push({ text: titleOnly, kind: 'card', category: 'General' });
		}
	  }
	  return out;
	}
	  
  // ----------------- Cloud OCR (Netlify function) -----------------
async runCloudOCR() {
  // Auto-correct common typo (missing leading slash)
  if (!this.cloudEndpoint.startsWith('/')) {
    this.cloudEndpoint = '/.netlify/functions/ocr';
  }
  if (!this.images.length) { this.error = 'Please upload an image first.'; return; }

  this.cloudBusy = true;
  this.error = '';
  this.status = 'Sending image to cloud OCR...';
  this.progress = 0;

  try {
    const file = this.images[0].file;
    const fd = new FormData();
    fd.append('image', file, file.name);

    const resp = await fetch(this.cloudEndpoint, { method: 'POST', body: fd });

    // Try to read JSON either way so we can show the server-side message
    let data: any = null;
    try { data = await resp.json(); } catch {}

    if (!resp.ok) {
      throw new Error(data?.error || (`${resp.status} ${resp.statusText}`));
    }

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

  // ----------------- Local OCR (Tesseract) -----------------
  private async preprocessFile(file: File): Promise<HTMLCanvasElement | File> {
    if (!this.enhanceImage) return file;

    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = (e) => rej(e);
      img.src = url;
    });

    const scale = 1.5;
    const w = Math.floor(img.width * scale);
    const h = Math.floor(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, w, h);

    // grayscale + simple adaptive threshold
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const contrast = 1.25;

    const integ = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
      let rowsum = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        let v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        v = (v - 128) * contrast + 128;
        if (v < 0) v = 0;
        if (v > 255) v = 255;
        rowsum += v;
        const idx = y * w + x;
        integ[idx] = rowsum + (y > 0 ? integ[idx - w] : 0);
      }
    }

    const halfWin = Math.floor(Math.max(15, Math.floor(Math.min(w, h) * 0.02)) / 2);
    function meanAt(x: number, y: number, half: number) {
      const x1 = Math.max(0, x - half),
        y1 = Math.max(0, y - half);
      const x2 = Math.min(w - 1, x + half),
        y2 = Math.min(h - 1, y + half);
      const A = integ[y1 * w + x1];
      const B = integ[y1 * w + x2];
      const C = integ[y2 * w + x1];
      const D = integ[y2 * w + x2];
      const area = (x2 - x1 + 1) * (y2 - y1 + 1);
      return (D - B - C + A) / area;
    }

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const mean = meanAt(x, y, halfWin);
        const isInk = lum < mean - 10;
        const val = isInk ? 0 : 255;
        data[i] = data[i + 1] = data[i + 2] = val;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    URL.revokeObjectURL(url);
    return canvas;
  }

  async runLocalOCR() {
    if (!this.images.length) {
      this.error = 'Please upload an image first.';
      return;
    }
    this.error = '';
    this.status = 'Loading OCR engine...';
    this.progress = 0;

    let worker: any;
    const out: string[] = [];

    try {
      const { createWorker } = await import('tesseract.js');

      worker = await createWorker('eng', undefined, {
        logger: (m: any) => {
          if (m?.status && typeof m.progress === 'number') {
            this.progress = Math.max(this.progress, Math.round(m.progress * 100));
          }
        },
        langPath: this.useBestModel
          ? 'https://tessdata.projectnaptha.com/4.0.0_best'
          : 'https://tessdata.projectnaptha.com/4.0.0',
      });

      for (let i = 0; i < this.images.length; i++) {
        const img = this.images[i];
        this.status = `Reading image ${i + 1} of ${this.images.length}...`;
        const src = await this.preprocessFile(img.file);
        await worker.setParameters({
          tessedit_pageseg_mode: (this.psm === '7' ? 7 : 6) as any,
          preserve_interword_spaces: '1',
        });
        const { data } = await worker.recognize(src as any);
        out.push((data?.text || '').trim());
      }
    } catch (e: any) {
      this.error = String(e?.message || e);
    } finally {
      // Update UI first so terminate can't block the step transition
      this.ocrText = (out.join('\n') || '').trim();
      this.lines = (this.ocrText || '')
        .split(/\r?\n/)
        .map((s) => s.replace(/[•·•·]+/g, '').trim())
        .filter(Boolean)
        .map((s) => ({ text: s, kind: 'card', category: 'General' }));
      this.progress = 100;
      this.status = this.ocrText ? 'OCR done' : this.status || 'No text recognized';
      this.step = 'review';

      try {
        worker && worker.terminate && worker.terminate(); // fire & forget
      } catch {}
    }
  }

  // ----------------- Import -----------------
  importNow() {
    this.importing = true;
    this.error = '';
    try {
      for (const row of this.lines) {
        if (!row.text?.trim()) continue;
        if (row.kind === 'card') {
          this.data.addCard({
            title: row.text.trim(),
            detail: '',
            category: row.category || 'General',
          });
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

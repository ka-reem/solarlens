import L from 'leaflet';
import {
  AVATARS,
  CLASSIC_CITY_SEEDS,
  CLASSIC_NEWER_POINTS,
  GAME_INTRO,
  MAPILLARY_ACCESS_TOKEN,
  MIN_TIME_DRIFT_GAP,
  ROLES,
  TOTAL_ROUNDS,
} from './constants';
import type {
  ClassicStep,
  MapillaryImage,
  MapillaryResponse,
  PhotoSlot,
  RoundScore,
  TimeDriftPair,
} from './types';
import {
  el,
  formatMiles,
  haversineKm,
  imageYear,
  scoreFromDistance,
  scoreFromGap,
  shuffle,
  thumbUrl,
} from './utils';

const IMAGE_FIELDS =
  'id,geometry,thumb_1024_url,thumb_2048_url,thumb_512_url,captured_at,is_pano';

interface ImageCluster {
  lat: number;
  lng: number;
  items: MapillaryImage[];
}

export class SolarlensApp {
  private accessToken = MAPILLARY_ACCESS_TOKEN;
  private currentRound = 0;
  private totalScore = 0;
  private currentPair: TimeDriftPair | null = null;
  private classicStep: ClassicStep = 1;
  private newerCorrect = false;
  private gapDiff = 0;
  private guessedGap = 0;
  private guessMap: L.Map | null = null;
  private resultMap: L.Map | null = null;
  private guessMarker: L.Marker | null = null;
  private pendingGuessLat: number | null = null;
  private pendingGuessLng: number | null = null;
  private roundScores: RoundScore[] = [];
  private step1Done = false;
  private step2Done = false;

  init(): void {
    el<HTMLDivElement>('mode-copy').textContent = GAME_INTRO;
    el<HTMLSpanElement>('gap-display').textContent = el<HTMLInputElement>('gap-slider').value;
    el<HTMLInputElement>('gap-slider').addEventListener('input', (e) => {
      el<HTMLSpanElement>('gap-display').textContent = (e.target as HTMLInputElement).value;
    });
    el<HTMLButtonElement>('photo-pick-a').addEventListener('click', () => this.onPhotoPick('A'));
    el<HTMLButtonElement>('photo-pick-b').addEventListener('click', () => this.onPhotoPick('B'));
    el<HTMLButtonElement>('start-btn').addEventListener('click', () => void this.startGame());
    el<HTMLButtonElement>('btn-guess').addEventListener('click', () => void this.onActionButton());
    el<HTMLButtonElement>('btn-next').addEventListener('click', () => void this.nextRound());
    el<HTMLButtonElement>('play-again').addEventListener('click', () => this.backToTitle());
    el<HTMLButtonElement>('quit-btn').addEventListener('click', () => {
      el<HTMLDivElement>('quit-modal').classList.add('visible');
      this.updateModalState();
    });
    el<HTMLButtonElement>('quit-cancel').addEventListener('click', () => {
      el<HTMLDivElement>('quit-modal').classList.remove('visible');
      this.updateModalState();
    });
    el<HTMLButtonElement>('quit-confirm').addEventListener('click', () => {
      el<HTMLDivElement>('quit-modal').classList.remove('visible');
      this.updateModalState();
      this.backToTitle();
    });
  }

  private newerSlot(): PhotoSlot {
    return this.currentPair!.newerIsA ? 'A' : 'B';
  }

  private olderSlot(): PhotoSlot {
    return this.newerSlot() === 'A' ? 'B' : 'A';
  }

  private imageForSlot(slot: PhotoSlot) {
    return slot === 'A' ? this.currentPair!.imageA : this.currentPair!.imageB;
  }

  private applyPhotoRoleLabels(): void {
    if (!this.currentPair || !this.step1Done) return;

    const newer = this.newerSlot();

    (['A', 'B'] as PhotoSlot[]).forEach((slot) => {
      const key = slot.toLowerCase();
      const btn = el<HTMLButtonElement>(`photo-pick-${key}`);
      const badge = el<HTMLSpanElement>(`badge-${key}`);
      const isNewer = slot === newer;

      btn.classList.remove('is-newer', 'is-older', 'revealed-newer', 'revealed-older');
      badge.classList.remove('newer', 'older');

      if (isNewer) {
        btn.classList.add('is-newer', 'revealed-newer');
        badge.classList.add('newer');
        badge.textContent = this.step2Done
          ? `Newer · ${this.imageForSlot(slot).year}`
          : 'Newer';
      } else {
        btn.classList.add('is-older', 'revealed-older');
        badge.classList.add('older');
        badge.textContent = this.step2Done
          ? `Older · ${this.imageForSlot(slot).year}`
          : 'Older';
      }
    });

    this.updatePhotoReminder();
  }

  private updatePhotoReminder(): void {
    const reminder = el<HTMLDivElement>('photo-role-reminder');
    if (!this.step1Done || !this.currentPair) {
      reminder.hidden = true;
      return;
    }

    const newer = this.newerSlot();
    const older = this.olderSlot();
    const showYears = this.step2Done;
    const newerYear = this.imageForSlot(newer).year;
    const olderYear = this.imageForSlot(older).year;

    reminder.hidden = false;

    if (this.classicStep === 2) {
      reminder.className = 'photo-role-reminder step-2';
      reminder.innerHTML =
        `<span class="reminder-chip older">${showYears ? `Older · ${olderYear}` : 'Older'}</span>` +
        `<span class="reminder-arrow">→</span>` +
        `<span class="reminder-chip newer">${showYears ? `Newer · ${newerYear}` : 'Newer'}</span>` +
        `<span class="reminder-note">Labels stay on the photos above</span>`;
    } else if (this.classicStep === 3) {
      reminder.className = 'photo-role-reminder step-3';
      const newerLabel = showYears ? `Newer · ${newerYear}` : 'Newer';
      reminder.innerHTML =
        `<span class="reminder-pin" aria-hidden="true"></span>` +
        `<span>Pin the <strong>newer</strong> photo on the map — look for the green <strong>${newerLabel}</strong> badge</span>`;
    } else {
      reminder.hidden = true;
    }
  }

  private updateModalState(): void {
    const anyOpen =
      el<HTMLDivElement>('result-overlay').classList.contains('visible') ||
      el<HTMLDivElement>('quit-modal').classList.contains('visible');
    document.body.classList.toggle('modal-open', anyOpen);
  }

  private showScreen(id: string): void {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    el<HTMLElement>(id).classList.add('active');
  }

  private updateRoundUI(): void {
    el<HTMLDivElement>('round-label').textContent = `Round ${this.currentRound + 1} / ${TOTAL_ROUNDS}`;
    el<HTMLDivElement>('total-score').textContent = this.totalScore.toLocaleString();
    const wrap = el<HTMLDivElement>('round-pips');
    wrap.innerHTML = '';
    for (let i = 0; i < TOTAL_ROUNDS; i++) {
      const pip = document.createElement('div');
      pip.className = 'pip' + (i < this.currentRound ? ' done' : i === this.currentRound ? ' current' : '');
      wrap.appendChild(pip);
    }
  }

  private setActionButton(label: string, enabled: boolean): void {
    const btn = el<HTMLButtonElement>('btn-guess');
    btn.textContent = label;
    btn.disabled = !enabled;
  }

  private resetRoundState(): void {
    this.classicStep = 1;
    this.step1Done = false;
    this.step2Done = false;
    this.newerCorrect = false;
    this.gapDiff = 0;
    this.guessedGap = 0;
    this.clearPhotoPickState();
    el<HTMLDivElement>('step1-feedback').hidden = true;
    el<HTMLDivElement>('step2-feedback').hidden = true;
    el<HTMLDivElement>('photo-role-reminder').hidden = true;
    el<HTMLInputElement>('gap-slider').value = '5';
    el<HTMLSpanElement>('gap-display').textContent = '5';
  }

  private clearPhotoPickState(): void {
    el<HTMLButtonElement>('photo-pick-a').classList.remove(
      'picked',
      'correct',
      'wrong',
      'revealed-newer',
      'revealed-older',
      'is-newer',
      'is-older',
    );
    el<HTMLButtonElement>('photo-pick-b').classList.remove(
      'picked',
      'correct',
      'wrong',
      'revealed-newer',
      'revealed-older',
      'is-newer',
      'is-older',
    );
    el<HTMLSpanElement>('badge-a').classList.remove('newer', 'older');
    el<HTMLSpanElement>('badge-b').classList.remove('newer', 'older');
    el<HTMLSpanElement>('badge-a').textContent = '';
    el<HTMLSpanElement>('badge-b').textContent = '';
    el<HTMLButtonElement>('photo-pick-a').disabled = false;
    el<HTMLButtonElement>('photo-pick-b').disabled = false;
  }

  private setClassicStep(step: ClassicStep): void {
    this.classicStep = step;
    document.querySelectorAll('.step-item').forEach((node) => {
      const n = node as HTMLElement;
      const s = parseInt(n.dataset.step!, 10);
      n.classList.toggle('active', s === step);
      n.classList.toggle('done', s < step);
    });
    el<HTMLDivElement>('classic-step-1').hidden = step !== 1;
    el<HTMLDivElement>('classic-step-2').hidden = step !== 2;
    el<HTMLDivElement>('classic-step-3').hidden = step !== 3;

    if (step === 1) this.setActionButton('Tap a photo above', false);
    else if (step === 2 && !this.step2Done) this.setActionButton('Check my guess', true);
    else if (step === 2 && this.step2Done) this.setActionButton('Continue to map', true);
    else if (step === 3) {
      this.applyPhotoRoleLabels();
      this.setActionButton('Lock in newer photo location', this.pendingGuessLat !== null);
      setTimeout(() => this.initGuessMap(), 80);
    } else if (this.step1Done) {
      this.applyPhotoRoleLabels();
    }
  }

  private async mapillaryGet(url: string): Promise<MapillaryResponse | null> {
    const res = await fetch(url, { headers: { Authorization: `OAuth ${this.accessToken}` } });
    if (!res.ok) return null;
    return (await res.json()) as MapillaryResponse;
  }

  private usableImages(rows: MapillaryImage[]): MapillaryImage[] {
    return rows.filter(
      (img) => img.geometry?.coordinates && img.captured_at && thumbUrl(img) && !img.is_pano,
    );
  }

  private clusterImages(rows: MapillaryImage[], maxDistM = 15): ImageCluster[] {
    const clusters: ImageCluster[] = [];
    for (const row of rows) {
      const [lng, lat] = row.geometry!.coordinates;
      let placed = false;
      for (const cluster of clusters) {
        if (haversineKm(lat, lng, cluster.lat, cluster.lng) * 1000 <= maxDistM) {
          cluster.items.push(row);
          placed = true;
          break;
        }
      }
      if (!placed) clusters.push({ lat, lng, items: [row] });
    }
    return clusters;
  }

  private bestPairFromClusters(clusters: ImageCluster[]): {
    old: MapillaryImage;
    new: MapillaryImage;
    gap: number;
  } | null {
    let best: { old: MapillaryImage; new: MapillaryImage; gap: number } | null = null;
    for (const cluster of clusters) {
      const sorted = [...cluster.items].sort(
        (a, b) => new Date(a.captured_at!).getTime() - new Date(b.captured_at!).getTime(),
      );
      const oldest = sorted[0];
      const newest = sorted[sorted.length - 1];
      const gap = imageYear(newest.captured_at!) - imageYear(oldest.captured_at!);
      if (gap < MIN_TIME_DRIFT_GAP) continue;
      if (!best || gap > best.gap) best = { old: oldest, new: newest, gap };
    }
    return best;
  }

  private async fetchImagesBbox(lng: number, lat: number): Promise<MapillaryImage[]> {
    const d = 0.003;
    const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
    const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(this.accessToken)}&fields=${IMAGE_FIELDS}&bbox=${bbox}&limit=200`;
    const json = await this.mapillaryGet(url);
    return this.usableImages(json?.data ?? []);
  }

  private async fetchImagesRadius(lat: number, lng: number): Promise<MapillaryImage[]> {
    const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(this.accessToken)}&fields=${IMAGE_FIELDS}&lat=${lat}&lng=${lng}&radius=50&limit=100`;
    const json = await this.mapillaryGet(url);
    return this.usableImages(json?.data ?? []);
  }

  private buildPair(
    pair: { old: MapillaryImage; new: MapillaryImage; gap: number },
    region: string,
  ): TimeDriftPair {
    const [newerLng, newerLat] = pair.new.geometry!.coordinates;
    const older = { thumbUrl: thumbUrl(pair.old)!, year: imageYear(pair.old.captured_at!) };
    const newer = { thumbUrl: thumbUrl(pair.new)!, year: imageYear(pair.new.captured_at!) };
    const swap = Math.random() > 0.5;
    return {
      imageA: swap ? newer : older,
      imageB: swap ? older : newer,
      newerIsA: swap,
      actualGap: pair.gap,
      newerLat,
      newerLng,
      region,
    };
  }

  private async fetchPair(lat: number, lng: number, region: string): Promise<TimeDriftPair | null> {
    for (const source of [
      () => this.fetchImagesBbox(lng, lat),
      () => this.fetchImagesRadius(lat, lng),
    ]) {
      try {
        const rows = await source();
        const pair = this.bestPairFromClusters(this.clusterImages(rows));
        if (pair) return this.buildPair(pair, region);
      } catch (e) {
        console.warn(e);
      }
    }
    return null;
  }

  private async loadRoundImage(): Promise<void> {
    const imgA = el<HTMLImageElement>('street-image-a');
    const imgB = el<HTMLImageElement>('street-image-b');
    const dualWrap = el<HTMLDivElement>('dual-image-wrap');
    const loading = el<HTMLDivElement>('image-loading');

    imgA.style.display = 'none';
    imgB.style.display = 'none';
    dualWrap.style.display = 'none';
    loading.style.display = 'grid';
    loading.innerHTML =
      '<div><div class="spinner"></div><div>Loading a place from the commons…</div></div>';
    this.currentPair = null;
    this.resetRoundState();
    this.setClassicStep(1);

    for (const [lat, lng, region] of shuffle(CLASSIC_CITY_SEEDS)) {
      try {
        const pair = await this.fetchPair(lat, lng, region);
        if (pair) {
          this.currentPair = pair;
          break;
        }
      } catch (e) {
        console.warn(e);
      }
    }

    if (!this.currentPair) {
      loading.innerHTML = '<div>Could not find a photo pair. Check your token or refresh.</div>';
      return;
    }

    let loaded = 0;
    const onReady = () => {
      loaded += 1;
      if (loaded < 2) return;
      loading.style.display = 'none';
      dualWrap.style.display = 'grid';
      imgA.style.display = 'block';
      imgB.style.display = 'block';
    };
    imgA.onload = onReady;
    imgB.onload = onReady;
    imgA.onerror = () => {
      loading.innerHTML = '<div>Image failed to load.</div>';
    };
    imgB.onerror = imgA.onerror;
    imgA.src = this.currentPair.imageA.thumbUrl;
    imgB.src = this.currentPair.imageB.thumbUrl;
  }

  private initGuessMap(): void {
    if (this.guessMap) {
      this.guessMap.remove();
      this.guessMap = null;
    }
    this.pendingGuessLat = null;
    this.pendingGuessLng = null;
    this.guessMarker = null;
    el<HTMLDivElement>('map-instruction').textContent =
      'Drop your pin where the newer photo (green badge) was taken.';

    this.guessMap = L.map('guess-map', {
      center: [20, 0],
      zoom: 1.6,
      zoomControl: true,
      attributionControl: false,
      worldCopyJump: true,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(this.guessMap);

    const icon = L.divIcon({
      className: '',
      html: '<div style="width:18px;height:18px;border-radius:50%;background:#7ec85a;border:2px solid #132111;box-shadow:0 0 0 4px rgba(126,200,90,.2)"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    this.guessMap.on('click', (e) => {
      this.pendingGuessLat = e.latlng.lat;
      this.pendingGuessLng = e.latlng.lng;
      if (this.guessMarker) this.guessMap!.removeLayer(this.guessMarker);
      this.guessMarker = L.marker([this.pendingGuessLat, this.pendingGuessLng], { icon }).addTo(
        this.guessMap!,
      );
      el<HTMLDivElement>('map-instruction').textContent =
        `Pinned at ${this.pendingGuessLat.toFixed(3)}°, ${this.pendingGuessLng.toFixed(3)}°`;
      if (this.classicStep === 3) {
        this.setActionButton('Lock in newer photo location', true);
      }
    });

    setTimeout(() => this.guessMap?.invalidateSize(), 50);
  }

  private onPhotoPick(slot: PhotoSlot): void {
    if (this.classicStep !== 1 || this.step1Done || !this.currentPair) return;

    const correct = slot === this.newerSlot();
    this.newerCorrect = correct;
    this.step1Done = true;

    const pickEl = el<HTMLButtonElement>(`photo-pick-${slot.toLowerCase()}`);
    const newerEl = el<HTMLButtonElement>(`photo-pick-${this.newerSlot().toLowerCase()}`);

    pickEl.classList.add('picked', correct ? 'correct' : 'wrong');
    newerEl.classList.add('revealed-newer');
    el<HTMLButtonElement>('photo-pick-a').disabled = true;
    el<HTMLButtonElement>('photo-pick-b').disabled = true;
    this.applyPhotoRoleLabels();

    const fb = el<HTMLDivElement>('step1-feedback');
    fb.hidden = false;
    fb.className = 'step-feedback ' + (correct ? 'success' : 'fail');
    fb.innerHTML = correct
      ? `<strong>Correct!</strong> Photo ${slot} is the newer one. Labels are on the photos — keep them in mind.`
      : `<strong>Not quite.</strong> Photo ${this.newerSlot()} is newer, Photo ${this.olderSlot()} is older. Check the badges above.`;

    this.setActionButton('Continue', true);
  }

  private checkGapGuess(): void {
    if (!this.currentPair) return;
    this.guessedGap = parseInt(el<HTMLInputElement>('gap-slider').value, 10);
    this.gapDiff = Math.abs(this.guessedGap - this.currentPair.actualGap);
    this.step2Done = true;

    const fb = el<HTMLDivElement>('step2-feedback');
    fb.hidden = false;
    fb.className = 'step-feedback ' + (this.gapDiff === 0 ? 'success' : this.gapDiff <= 2 ? 'neutral' : 'fail');

    const years = [this.currentPair.imageA.year, this.currentPair.imageB.year];
    const older = Math.min(...years);
    const newer = Math.max(...years);

    if (this.gapDiff === 0) {
      fb.innerHTML = `<strong>Spot on!</strong> ${this.currentPair.actualGap} years apart (${older} → ${newer}).`;
    } else if (this.gapDiff <= 2) {
      fb.innerHTML = `<strong>Close.</strong> You said ${this.guessedGap} yr — actual gap is ${this.currentPair.actualGap} yr (${this.gapDiff} yr off, ${older} → ${newer}).`;
    } else {
      fb.innerHTML = `<strong>Off by ${this.gapDiff} years.</strong> You said ${this.guessedGap} yr — actual gap is ${this.currentPair.actualGap} yr (${older} → ${newer}).`;
    }

    el<HTMLInputElement>('gap-slider').disabled = true;
    this.applyPhotoRoleLabels();
    this.setActionButton('Continue to map', true);
  }

  private async onActionButton(): Promise<void> {
    if (this.classicStep === 1 && this.step1Done) {
      this.setClassicStep(2);
      return;
    }
    if (this.classicStep === 2 && !this.step2Done) {
      this.checkGapGuess();
      return;
    }
    if (this.classicStep === 2 && this.step2Done) {
      this.setClassicStep(3);
      return;
    }
    if (this.classicStep === 3) {
      await this.submitRound();
    }
  }

  private destroyResultMap(): void {
    if (this.resultMap) {
      this.resultMap.remove();
      this.resultMap = null;
    }
  }

  private buildResultMap(lat: number, lng: number): void {
    if (this.pendingGuessLat === null || this.pendingGuessLng === null) return;

    this.destroyResultMap();
    const wrap = el<HTMLDivElement>('result-map-wrap');
    wrap.style.display = '';
    wrap.innerHTML = '<div id="result-map" style="width:100%;height:240px;"></div>';

    this.resultMap = L.map('result-map', {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(this.resultMap);

    const actualIcon = L.divIcon({
      className: '',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#7ec85a;border:2px solid white;box-shadow:0 0 0 3px rgba(126,200,90,.3)"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    const guessIcon = L.divIcon({
      className: '',
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#d9b053;border:2px solid white;box-shadow:0 0 0 3px rgba(217,176,83,.3)"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    L.marker([lat, lng], { icon: actualIcon }).addTo(this.resultMap);
    L.marker([this.pendingGuessLat, this.pendingGuessLng], { icon: guessIcon }).addTo(this.resultMap);
    L.polyline(
      [
        [lat, lng],
        [this.pendingGuessLat, this.pendingGuessLng],
      ],
      { color: '#7ec85a', weight: 2, dashArray: '6 4', opacity: 0.7 },
    ).addTo(this.resultMap);

    const bounds = L.latLngBounds([
      [lat, lng],
      [this.pendingGuessLat, this.pendingGuessLng],
    ]);
    this.resultMap.fitBounds(bounds.pad(0.35));
    setTimeout(() => this.resultMap?.invalidateSize(), 100);
  }

  private showResult(roundScore: number, tier: 'excellent' | 'close' | 'far'): void {
    if (!this.currentPair) return;

    const icon = el<HTMLDivElement>('result-avatar-wrap');
    const badge = el<HTMLDivElement>('result-score-badge');

    icon.innerHTML = AVATARS[tier];
    badge.style.color =
      tier === 'excellent' ? 'var(--primary)' : tier === 'close' ? 'var(--amber)' : '#efb39a';
    badge.textContent = `+${roundScore.toLocaleString()}`;
    el<HTMLDivElement>('result-title').textContent = 'Round complete — time and place read.';

    const newerScore = this.newerCorrect ? CLASSIC_NEWER_POINTS : 0;
    const gapScore = scoreFromGap(this.gapDiff);
    const distKm = haversineKm(
      this.pendingGuessLat!,
      this.pendingGuessLng!,
      this.currentPair.newerLat,
      this.currentPair.newerLng,
    );
    const locScore = scoreFromDistance(distKm);
    const years = [this.currentPair.imageA.year, this.currentPair.imageB.year];

    el<HTMLDivElement>('result-breakdown').hidden = false;
    el<HTMLDivElement>('result-breakdown').innerHTML = `
      <div class="breakdown-row ${this.newerCorrect ? 'ok' : 'miss'}"><span>Newer photo</span><strong>${this.newerCorrect ? 'Correct' : 'Wrong'} (+${newerScore})</strong></div>
      <div class="breakdown-row ${this.gapDiff === 0 ? 'ok' : this.gapDiff <= 2 ? 'mid' : 'miss'}"><span>Year gap</span><strong>${this.gapDiff} yr off (+${gapScore})</strong></div>
      <div class="breakdown-row ${distKm < 50 ? 'ok' : distKm < 500 ? 'mid' : 'miss'}"><span>Location</span><strong>${formatMiles(distKm)} away (+${locScore})</strong></div>
    `;

    el<HTMLDivElement>('result-map-wrap').style.display = '';
    el<HTMLDivElement>('stat-distance-wrap').style.display = '';
    el<HTMLElement>('stat-distance').textContent = formatMiles(distKm);
    el<HTMLElement>('stat-mid-label').textContent = 'Year gap';
    el<HTMLElement>('stat-mid').textContent = `${this.currentPair.actualGap} yrs`;
    el<HTMLDivElement>('stat-mid-detail').textContent = `${Math.min(...years)} → ${Math.max(...years)}`;
    el<HTMLElement>('stat-pts').textContent = roundScore.toLocaleString();

    el<HTMLButtonElement>('btn-next').textContent =
      this.currentRound >= TOTAL_ROUNDS - 1 ? 'See results' : 'Next round';

    el<HTMLDivElement>('result-overlay').classList.add('visible');
    this.updateModalState();
    setTimeout(
      () => this.buildResultMap(this.currentPair!.newerLat, this.currentPair!.newerLng),
      60,
    );
  }

  private closeResultOverlay(): void {
    el<HTMLDivElement>('result-overlay').classList.remove('visible');
    this.updateModalState();
    this.destroyResultMap();
  }

  private showEndScreen(): void {
    this.closeResultOverlay();
    el<HTMLDivElement>('end-score').textContent = this.totalScore.toLocaleString();
    const role = ROLES.find((r) => this.totalScore >= r.min) ?? ROLES[ROLES.length - 1];
    el<HTMLDivElement>('end-role-name').textContent = role.name;
    el<HTMLParagraphElement>('end-role-desc').textContent = role.desc;
    const wrap = el<HTMLDivElement>('end-rounds-summary');
    wrap.innerHTML = '';
    this.roundScores.forEach((round) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const level = round.score >= 700 ? 'high' : round.score >= 350 ? 'mid' : 'low';
      const detail = `${round.newerCorrect ? 'Newer ✓' : 'Newer ✗'} · Gap off ${round.gapDiff} · ${formatMiles(round.distKm)} away`;
      row.innerHTML = `<div><div>Round ${round.round}</div><div style="font-size:12px;color:var(--muted);margin-top:4px;">${detail}</div></div><span class="chip ${level}">+${round.score}</span>`;
      wrap.appendChild(row);
    });
    this.showScreen('screen-end');
  }

  private async nextRound(): Promise<void> {
    this.closeResultOverlay();
    el<HTMLInputElement>('gap-slider').disabled = false;
    this.currentRound += 1;
    if (this.currentRound >= TOTAL_ROUNDS) {
      this.showEndScreen();
      return;
    }
    this.updateRoundUI();
    await this.loadRoundImage();
  }

  private async submitRound(): Promise<void> {
    if (!this.currentPair || this.pendingGuessLat === null || this.pendingGuessLng === null) return;

    const newerScore = this.newerCorrect ? CLASSIC_NEWER_POINTS : 0;
    const gapScore = scoreFromGap(this.gapDiff);
    const distKm = haversineKm(
      this.pendingGuessLat,
      this.pendingGuessLng,
      this.currentPair.newerLat,
      this.currentPair.newerLng,
    );
    const locScore = scoreFromDistance(distKm);
    const roundScore = newerScore + gapScore + locScore;

    this.totalScore += roundScore;
    this.roundScores.push({
      round: this.currentRound + 1,
      score: roundScore,
      distKm,
      gapDiff: this.gapDiff,
      guessedGap: this.guessedGap,
      actualGap: this.currentPair.actualGap,
      newerCorrect: this.newerCorrect,
    });
    el<HTMLDivElement>('total-score').textContent = this.totalScore.toLocaleString();

    const tier = roundScore >= 1200 ? 'excellent' : roundScore >= 600 ? 'close' : 'far';
    this.showResult(roundScore, tier);
  }

  private async startGame(): Promise<void> {
    this.currentRound = 0;
    this.totalScore = 0;
    this.currentPair = null;
    this.roundScores = [];
    this.showScreen('screen-game');
    this.updateRoundUI();
    await this.loadRoundImage();
  }

  private backToTitle(): void {
    this.closeResultOverlay();
    if (this.guessMap) {
      this.guessMap.remove();
      this.guessMap = null;
    }
    el<HTMLInputElement>('gap-slider').disabled = false;
    this.showScreen('screen-title');
  }
}

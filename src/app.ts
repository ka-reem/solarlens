import L from 'leaflet';
import {
  AVATARS,
  CLASSIC_CITY_SEEDS,
  CLASSIC_NEWER_POINTS,
  GAME_MODES,
  MAPILLARY_ACCESS_TOKEN,
  MIN_TIME_DRIFT_GAP,
  ROLES,
  SEED_LOCATIONS,
  TOTAL_ROUNDS,
} from './constants';
import type {
  ClassicStep,
  GameModeKey,
  MapillaryImage,
  MapillaryResponse,
  PhotoSlot,
  RoundScore,
  StreetImage,
  TimeDriftPair,
} from './types';
import {
  el,
  formatMiles,
  haversineKm,
  imageYear,
  scoreFromDistance,
  scoreFromGap,
  scoreFromYear,
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

export class WorldGuesserApp {
  private accessToken = MAPILLARY_ACCESS_TOKEN;
  private currentMode: GameModeKey = 'classic';
  private currentRound = 0;
  private totalScore = 0;
  private currentImage: StreetImage | null = null;
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
    this.renderModeCards();
    this.applyModeUI();
    el<HTMLSpanElement>('year-display').textContent = el<HTMLInputElement>('year-slider').value;
    el<HTMLSpanElement>('gap-display').textContent = el<HTMLInputElement>('gap-slider').value;
    el<HTMLInputElement>('year-slider').addEventListener('input', (e) => {
      el<HTMLSpanElement>('year-display').textContent = (e.target as HTMLInputElement).value;
    });
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

  private isClassic(): boolean {
    return this.currentMode === 'classic';
  }

  private newerSlot(): PhotoSlot {
    return this.currentPair!.newerIsA ? 'A' : 'B';
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

  private renderModeCards(): void {
    const wrap = el<HTMLDivElement>('mode-grid');
    wrap.innerHTML = '';
    (Object.entries(GAME_MODES) as [GameModeKey, (typeof GAME_MODES)[GameModeKey]][]).forEach(
      ([key, mode]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mode-card' + (key === this.currentMode ? ' active' : '');
        btn.dataset.mode = key;
        btn.innerHTML = `<span class="mode-num">${mode.num}</span><strong>${mode.label}</strong><span>${mode.short}</span>`;
        btn.addEventListener('click', () => {
          this.currentMode = key;
          this.applyModeUI();
        });
        wrap.appendChild(btn);
      },
    );
  }

  private applyModeUI(): void {
    const mode = GAME_MODES[this.currentMode];
    this.renderModeCards();
    el<HTMLDivElement>('mode-copy').textContent = mode.intro;
    el<HTMLDivElement>('mode-badge').textContent = mode.label;
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

  private resetClassicRoundState(): void {
    this.classicStep = 1;
    this.step1Done = false;
    this.step2Done = false;
    this.newerCorrect = false;
    this.gapDiff = 0;
    this.guessedGap = 0;
    this.clearPhotoPickState();
    el<HTMLDivElement>('step1-feedback').hidden = true;
    el<HTMLDivElement>('step2-feedback').hidden = true;
    el<HTMLInputElement>('gap-slider').value = '5';
    el<HTMLSpanElement>('gap-display').textContent = '5';
  }

  private clearPhotoPickState(): void {
    el<HTMLButtonElement>('photo-pick-a').classList.remove('picked', 'correct', 'wrong', 'revealed-newer');
    el<HTMLButtonElement>('photo-pick-b').classList.remove('picked', 'correct', 'wrong', 'revealed-newer');
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
    else if (step === 3) this.setActionButton('Lock in location', this.pendingGuessLat !== null);

    if (step === 3) {
      setTimeout(() => {
        this.initGuessMap('guess-map');
      }, 80);
    }
  }

  private showClassicLayout(): void {
    el<HTMLDivElement>('classic-flow').style.display = '';
    el<HTMLDivElement>('geo-flow').style.display = 'none';
    el<HTMLDivElement>('single-image-wrap').style.display = 'none';
    el<HTMLDivElement>('dual-image-wrap').style.display = 'none';
  }

  private showGeoLayout(): void {
    el<HTMLDivElement>('classic-flow').style.display = 'none';
    el<HTMLDivElement>('geo-flow').style.display = '';
    el<HTMLDivElement>('dual-image-wrap').style.display = 'none';
    el<HTMLDivElement>('single-image-wrap').style.display = 'none';
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

  private async fetchGeoImage(lat: number, lng: number): Promise<Omit<StreetImage, 'region'> | null> {
    const spread = 0.15 + Math.random() * 0.25;
    const aLat = lat + (Math.random() - 0.5) * spread;
    const aLng = lng + (Math.random() - 0.5) * spread;
    const url = `https://graph.mapillary.com/images?access_token=${encodeURIComponent(this.accessToken)}&fields=${IMAGE_FIELDS}&lat=${aLat}&lng=${aLng}&radius=50&limit=12`;
    const json = await this.mapillaryGet(url);
    if (!json) return null;
    const rows = (json.data ?? []).filter((img) => img.geometry?.coordinates && thumbUrl(img));
    if (!rows.length) return null;
    const pool = rows.filter((r) => !r.is_pano).length ? rows.filter((r) => !r.is_pano) : rows;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    const [realLng, realLat] = pick.geometry!.coordinates;
    return {
      lat: realLat,
      lng: realLng,
      year: pick.captured_at ? imageYear(pick.captured_at) : null,
      thumbUrl: thumbUrl(pick)!,
      isPano: Boolean(pick.is_pano),
    };
  }

  private async loadRoundImage(): Promise<void> {
    const singleImg = el<HTMLImageElement>('street-image');
    const imgA = el<HTMLImageElement>('street-image-a');
    const imgB = el<HTMLImageElement>('street-image-b');
    const singleWrap = el<HTMLDivElement>('single-image-wrap');
    const dualWrap = el<HTMLDivElement>('dual-image-wrap');
    const loading = el<HTMLDivElement>('image-loading');
    const bar = el<HTMLDivElement>('image-hint-bar');

    singleImg.style.display = 'none';
    imgA.style.display = 'none';
    imgB.style.display = 'none';
    singleWrap.style.display = 'none';
    dualWrap.style.display = 'none';
    bar.style.display = 'none';
    loading.style.display = 'grid';
    loading.innerHTML =
      '<div><div class="spinner"></div><div>Loading a place from the commons…</div></div>';
    this.currentImage = null;
    this.currentPair = null;

    if (this.isClassic()) {
      this.showClassicLayout();
      this.resetClassicRoundState();
      this.setClassicStep(1);
    } else {
      this.showGeoLayout();
      this.setActionButton('Lock in guess', false);
    }

    const seeds = shuffle(this.isClassic() ? CLASSIC_CITY_SEEDS : SEED_LOCATIONS);

    for (const [lat, lng, region] of seeds) {
      try {
        if (this.isClassic()) {
          const pair = await this.fetchPair(lat, lng, region);
          if (pair) {
            this.currentPair = pair;
            break;
          }
        } else {
          const found = await this.fetchGeoImage(lat, lng);
          if (found) {
            this.currentImage = { ...found, region };
            break;
          }
        }
      } catch (e) {
        console.warn(e);
      }
    }

    if (this.isClassic()) {
      if (!this.currentPair) {
        loading.innerHTML = '<div>Could not find a photo pair. Check your token or refresh.</div>';
        return;
      }
      el<HTMLDivElement>('hint-pano').style.display = 'none';
      bar.style.display = 'none';

      let loaded = 0;
      const onReady = () => {
        loaded += 1;
        if (loaded < 2) return;
        loading.style.display = 'none';
        dualWrap.style.display = 'grid';
        imgA.style.display = 'block';
        imgB.style.display = 'block';
        bar.style.display = 'none';
      };
      imgA.onload = onReady;
      imgB.onload = onReady;
      imgA.onerror = () => {
        loading.innerHTML = '<div>Image failed to load.</div>';
      };
      imgB.onerror = imgA.onerror;
      imgA.src = this.currentPair.imageA.thumbUrl;
      imgB.src = this.currentPair.imageB.thumbUrl;
      return;
    }

    if (!this.currentImage) {
      loading.innerHTML = '<div>Could not load an image. Check your token or refresh.</div>';
      return;
    }

    el<HTMLDivElement>('hint-pano').style.display = this.currentImage.isPano ? 'inline-flex' : 'none';
    bar.style.display = this.currentImage.isPano ? 'flex' : 'none';

    singleImg.onload = () => {
      loading.style.display = 'none';
      singleWrap.style.display = 'block';
      singleImg.style.display = 'block';
      bar.style.display = this.currentImage.isPano ? 'flex' : 'none';
      this.setActionButton('Lock in guess', this.pendingGuessLat !== null);
    };
    singleImg.onerror = () => {
      loading.innerHTML = '<div>Image failed to load.</div>';
    };
    singleImg.src = this.currentImage.thumbUrl;
  }

  private initGuessMap(containerId: 'guess-map' | 'geo-map'): void {
    if (this.guessMap) {
      this.guessMap.remove();
      this.guessMap = null;
    }
    this.pendingGuessLat = null;
    this.pendingGuessLng = null;
    this.guessMarker = null;

    const instructionId = containerId === 'guess-map' ? 'map-instruction' : 'geo-map-instruction';
    el<HTMLDivElement>(instructionId).textContent = 'Click the map to place your pin.';

    this.guessMap = L.map(containerId, {
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
      el<HTMLDivElement>(instructionId).textContent =
        `Pinned at ${this.pendingGuessLat.toFixed(3)}°, ${this.pendingGuessLng.toFixed(3)}°`;
      if (this.isClassic() && this.classicStep === 3) {
        this.setActionButton('Lock in location', true);
      } else if (!this.isClassic()) {
        this.setActionButton('Lock in guess', true);
      }
    });

    setTimeout(() => this.guessMap?.invalidateSize(), 50);
  }

  private onPhotoPick(slot: PhotoSlot): void {
    if (!this.isClassic() || this.classicStep !== 1 || this.step1Done || !this.currentPair) return;

    const correct = slot === this.newerSlot();
    this.newerCorrect = correct;
    this.step1Done = true;

    const pickEl = el<HTMLButtonElement>(`photo-pick-${slot.toLowerCase()}`);
    const newerEl = el<HTMLButtonElement>(
      `photo-pick-${this.newerSlot().toLowerCase()}`,
    );

    pickEl.classList.add('picked', correct ? 'correct' : 'wrong');
    newerEl.classList.add('revealed-newer');
    el<HTMLSpanElement>(`badge-${this.newerSlot().toLowerCase()}`).textContent = 'Newer';
    el<HTMLButtonElement>('photo-pick-a').disabled = true;
    el<HTMLButtonElement>('photo-pick-b').disabled = true;

    const fb = el<HTMLDivElement>('step1-feedback');
    fb.hidden = false;
    fb.className = 'step-feedback ' + (correct ? 'success' : 'fail');
    fb.innerHTML = correct
      ? `<strong>Correct!</strong> Photo ${slot} is the newer capture.`
      : `<strong>Not quite.</strong> Photo ${this.newerSlot()} is newer — Photo ${slot} is further back.`;

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
      fb.innerHTML = `<strong>Close.</strong> You said ${this.guessedGap} yr — actual gap is ${this.currentPair.actualGap} yr (${this.gapDiff} yr off).`;
    } else {
      fb.innerHTML = `<strong>Off by ${this.gapDiff} years.</strong> You said ${this.guessedGap} yr — actual gap is ${this.currentPair.actualGap} yr (${older} → ${newer}).`;
    }

    el<HTMLInputElement>('gap-slider').disabled = true;
    this.setActionButton('Continue to map', true);
  }

  private async onActionButton(): Promise<void> {
    if (this.isClassic()) {
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
        await this.submitClassicRound();
      }
      return;
    }
    await this.submitGeoRound();
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

  private showResult(
    roundScore: number,
    title: string,
    tier: 'excellent' | 'close' | 'far',
    opts: {
      showMap: boolean;
      mapLat?: number;
      mapLng?: number;
      breakdown?: string;
      midLabel: string;
      midValue: string;
      midDetail?: string;
      distValue?: string;
    },
  ): void {
    const icon = el<HTMLDivElement>('result-avatar-wrap');
    const badge = el<HTMLDivElement>('result-score-badge');

    icon.innerHTML = AVATARS[tier];
    badge.style.color =
      tier === 'excellent' ? 'var(--primary)' : tier === 'close' ? 'var(--amber)' : '#efb39a';
    badge.textContent = `+${roundScore.toLocaleString()}`;
    el<HTMLDivElement>('result-title').textContent = title;

    const breakdown = el<HTMLDivElement>('result-breakdown');
    if (opts.breakdown) {
      breakdown.hidden = false;
      breakdown.innerHTML = opts.breakdown;
    } else {
      breakdown.hidden = true;
    }

    el<HTMLDivElement>('result-map-wrap').style.display = opts.showMap ? '' : 'none';
    el<HTMLDivElement>('stat-distance-wrap').style.display = opts.distValue ? '' : 'none';
    if (opts.distValue) el<HTMLElement>('stat-distance').textContent = opts.distValue;

    el<HTMLElement>('stat-mid-label').textContent = opts.midLabel;
    el<HTMLElement>('stat-mid').textContent = opts.midValue;
    el<HTMLDivElement>('stat-mid-detail').textContent = opts.midDetail ?? '';
    el<HTMLElement>('stat-pts').textContent = roundScore.toLocaleString();

    el<HTMLButtonElement>('btn-next').textContent =
      this.currentRound >= TOTAL_ROUNDS - 1 ? 'See results' : 'Next round';

    el<HTMLDivElement>('result-overlay').classList.add('visible');
    this.updateModalState();

    if (opts.showMap && opts.mapLat != null && opts.mapLng != null) {
      const lat = opts.mapLat;
      const lng = opts.mapLng;
      setTimeout(() => this.buildResultMap(lat, lng), 60);
    } else {
      this.destroyResultMap();
    }
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
      const detail = this.isClassic()
        ? `${round.newerCorrect ? 'Newer ✓' : 'Newer ✗'} · Gap off ${round.gapDiff} · ${formatMiles(round.distKm ?? 0)} away`
        : `${formatMiles(round.distKm ?? 0)} away · Year off by ${round.yearDiff}`;
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
    if (!this.isClassic()) this.initGuessMap('geo-map');
    await this.loadRoundImage();
  }

  private async submitClassicRound(): Promise<void> {
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

    const years = [this.currentPair.imageA.year, this.currentPair.imageB.year];
    const tier =
      roundScore >= 1200 ? 'excellent' : roundScore >= 600 ? 'close' : ('far' as const);

    this.showResult(roundScore, 'Round complete — time and place read.', tier, {
      showMap: true,
      mapLat: this.currentPair.newerLat,
      mapLng: this.currentPair.newerLng,
      breakdown: `
        <div class="breakdown-row ${this.newerCorrect ? 'ok' : 'miss'}"><span>Newer photo</span><strong>${this.newerCorrect ? 'Correct' : 'Wrong'} (+${newerScore})</strong></div>
        <div class="breakdown-row ${this.gapDiff === 0 ? 'ok' : this.gapDiff <= 2 ? 'mid' : 'miss'}"><span>Year gap</span><strong>${this.gapDiff} yr off (+${gapScore})</strong></div>
        <div class="breakdown-row ${distKm < 50 ? 'ok' : distKm < 500 ? 'mid' : 'miss'}"><span>Location</span><strong>${formatMiles(distKm)} away (+${locScore})</strong></div>
      `,
      distValue: formatMiles(distKm),
      midLabel: 'Year gap',
      midValue: `${this.currentPair.actualGap} yrs`,
      midDetail: `${Math.min(...years)} → ${Math.max(...years)}`,
    });
  }

  private async submitGeoRound(): Promise<void> {
    if (this.pendingGuessLat === null || this.pendingGuessLng === null || !this.currentImage) return;

    const guessedYear = parseInt(el<HTMLInputElement>('year-slider').value, 10);
    const distKm = haversineKm(
      this.pendingGuessLat,
      this.pendingGuessLng,
      this.currentImage.lat,
      this.currentImage.lng,
    );
    const distScore = scoreFromDistance(distKm);
    const yearDiff = this.currentImage.year ? Math.abs(guessedYear - this.currentImage.year) : 10;
    const yearScore = this.currentImage.year ? scoreFromYear(yearDiff) : 0;
    const roundScore = distScore + yearScore;

    this.totalScore += roundScore;
    this.roundScores.push({
      round: this.currentRound + 1,
      score: roundScore,
      distKm,
      yearDiff,
      guessedYear,
    });
    el<HTMLDivElement>('total-score').textContent = this.totalScore.toLocaleString();

    const tier = roundScore >= 700 ? 'excellent' : roundScore >= 350 ? 'close' : 'far';
    this.showResult(roundScore, 'Solid read on the street.', tier, {
      showMap: true,
      mapLat: this.currentImage.lat,
      mapLng: this.currentImage.lng,
      distValue: formatMiles(distKm),
      midLabel: 'Year',
      midValue: this.currentImage.year
        ? `${yearDiff} yr${yearDiff === 1 ? '' : 's'} off`
        : 'N/A',
      midDetail: this.currentImage.year
        ? `You: ${guessedYear}  ·  Actual: ${this.currentImage.year}`
        : '',
    });
  }

  private async startGame(): Promise<void> {
    this.applyModeUI();
    this.currentRound = 0;
    this.totalScore = 0;
    this.currentImage = null;
    this.currentPair = null;
    this.roundScores = [];
    this.showScreen('screen-game');
    this.updateRoundUI();
    if (!this.isClassic()) this.initGuessMap('geo-map');
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
    this.applyModeUI();
  }
}

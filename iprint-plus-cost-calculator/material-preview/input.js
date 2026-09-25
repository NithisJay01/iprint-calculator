/**
 * input.js — one small system that turns mouse / touch / phone-tilt into a normalised tilt.
 *
 *   tx, ty ∈ [−1, 1]   target tilt (tx: left↔right yaw, ty: pitch, + = top toward viewer)
 *   hx, hy ∈ [−1, 1]   pointer position over the stage (drives light nudge and zoom pan)
 *   zoom   ∈ [1, 3.2]
 *
 * Sources (all optional — the card always works with a plain finger drag):
 *   mouse  hover  → gentle absolute tilt; press-and-drag → relative, full-range tilt
 *   touch  drag   → relative tilt; two fingers → pinch zoom
 *   flick         a quick sideways swipe (finger or mouse) → onFlip(±1): turn the card over. A slow drag only tilts.
 *   sensor DeviceOrientation, calibrated to however the phone is held, clamped, low-passed
 *
 * iOS rule: DeviceOrientationEvent.requestPermission() must be called from a user gesture and
 * over HTTPS. enableSensors() is therefore only ever invoked from a button click.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const ZOOM_MAX = 3.2;
const SENSOR_RANGE_DEG = 22; // phone tilt that maps to a full ±1 card tilt (keeps motion gentle)

// A flick = released while still moving fast sideways, after a clearly horizontal stroke.
export const FLICK = Object.freeze({
  minSpeed: 0.55, // px/ms over the last `windowMs` before release
  minDistance: 48, // px from the press
  horizontal: 1.4, // |dx| must beat |dy| by this factor
  windowMs: 90,
});

/**
 * Was this stroke a flick? `samples` are { t, x, y } from press to release (oldest first).
 * @returns {-1 | 0 | 1} direction of the flick (+1 = to the right), 0 = an ordinary drag
 */
export function flickDirection(samples, f = FLICK) {
  if (samples.length < 2) return 0;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  if (Math.abs(dx) < f.minDistance || Math.abs(dx) < f.horizontal * Math.abs(dy)) return 0;
  let i = samples.length - 1;
  while (i > 0 && last.t - samples[i - 1].t <= f.windowMs) i--;
  const from = samples[i === samples.length - 1 ? i - 1 : i];
  const dt = last.t - from.t;
  if (dt <= 0) return 0;
  const vx = (last.x - from.x) / dt;
  return Math.abs(vx) >= f.minSpeed && Math.sign(vx) === Math.sign(dx) ? Math.sign(dx) : 0;
}

export class TiltInput {
  constructor(element, { onChange = () => {}, onFlip = null } = {}) {
    this.el = element;
    this.onChange = onChange;
    this.onFlip = onFlip;

    this.drag = { x: 0, y: 0 }; // accumulated drag tilt
    this.hover = { x: 0, y: 0 }; // mouse-hover tilt
    this.sensor = { x: 0, y: 0, active: false };
    this.pointer = { x: 0, y: 0 }; // normalised position over the stage
    this.zoom = 1;
    this.zoomTarget = 1;
    this.interacted = false;

    this._pointers = new Map();
    this._dragBase = null;
    this._pinchBase = null;
    this._stroke = null; // { samples: [{ t, x, y }], pinched } of the current one-finger stroke, for flick detection
    this._sensorBase = null;
    this._sensorRaw = null;
    this._onOrientation = (e) => this._handleOrientation(e);

    const opts = { passive: false };
    element.addEventListener('pointerdown', (e) => this._down(e), opts);
    element.addEventListener('pointermove', (e) => this._move(e), opts);
    element.addEventListener('pointerup', (e) => this._up(e));
    element.addEventListener('pointercancel', (e) => this._up(e));
    element.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this._pointers.size) this.hover.x = this.hover.y = 0;
      this.onChange();
    });
    element.addEventListener('wheel', (e) => this._wheel(e), opts);
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Combined target tilt, clamped so the card can never rotate out of view. */
  get target() {
    return {
      x: clamp(this.drag.x + this.hover.x + this.sensor.x, -1, 1),
      y: clamp(this.drag.y + this.hover.y + this.sensor.y, -1, 1),
    };
  }

  setZoom(z) {
    this.zoomTarget = clamp(z, 1, ZOOM_MAX);
    this.interacted = true;
    this.onChange();
  }

  recenter() {
    this.drag.x = this.drag.y = 0;
    this._sensorBase = null; // next sensor reading becomes the new neutral pose
  }

  /* ---------------------------------------------------------------- pointer */

  _norm(e) {
    const r = this.el.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1, w: r.width, h: r.height };
  }

  _down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest?.('button, a, input, select')) return; // on-stage controls: capturing would retarget their click to the stage
    this.el.setPointerCapture?.(e.pointerId);
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.interacted = true;
    if (this._pointers.size === 1) {
      this._dragBase = { px: e.clientX, py: e.clientY, x: this.drag.x + (e.pointerType === 'mouse' ? this.hover.x : 0), y: this.drag.y + (e.pointerType === 'mouse' ? this.hover.y : 0) };
      if (e.pointerType === 'mouse') this.hover.x = this.hover.y = 0; // hand over to the drag from where the card is now
      this.drag.x = this._dragBase.x;
      this.drag.y = this._dragBase.y;
      this.el.classList.add('is-dragging');
      this._stroke = { samples: [{ t: e.timeStamp, x: e.clientX, y: e.clientY }], pinched: false };
    } else if (this._pointers.size === 2) {
      this._pinchBase = { dist: this._pinchDistance(), zoom: this.zoomTarget };
      if (this._stroke) this._stroke.pinched = true; // a pinch that ends in a swipe is not a flick
    }
    this.onChange();
  }

  _move(e) {
    const n = this._norm(e);
    this.pointer.x = clamp(n.x, -1, 1);
    this.pointer.y = clamp(n.y, -1, 1);

    if (!this._pointers.has(e.pointerId)) {
      // mouse hovering without a button: nudge the light and tilt gently
      if (e.pointerType === 'mouse') {
        this.hover.x = this.pointer.x * 0.55;
        this.hover.y = this.pointer.y * 0.55;
        this.interacted = true;
      }
      this.onChange();
      return;
    }
    e.preventDefault();
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this._pointers.size >= 2 && this._pinchBase) {
      this.zoomTarget = clamp(this._pinchBase.zoom * (this._pinchDistance() / this._pinchBase.dist), 1, ZOOM_MAX);
    } else if (this._dragBase) {
      if (this._stroke) {
        const s = this._stroke.samples;
        s.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
        if (s.length > 64) s.splice(1, s.length - 64); // keep the press point + the recent path
      }
      const range = clamp(n.w * 0.32, 90, 230); // px of finger travel for a full tilt
      this.drag.x = clamp(this._dragBase.x + (e.clientX - this._dragBase.px) / range, -1, 1);
      this.drag.y = clamp(this._dragBase.y + (e.clientY - this._dragBase.py) / range, -1, 1);
    }
    this.onChange();
  }

  _up(e) {
    this._pointers.delete(e.pointerId);
    this.el.releasePointerCapture?.(e.pointerId);
    if (this._pointers.size < 2) this._pinchBase = null;
    if (this._pointers.size === 0) {
      this._dragBase = null;
      this.el.classList.remove('is-dragging');
      const stroke = this._stroke;
      this._stroke = null;
      // No flick while zoomed in: there a sideways drag pans the close-up. pointercancel (e.g. the browser took the
      // gesture over) never flips either.
      if (stroke && !stroke.pinched && e.type === 'pointerup' && this.onFlip && this.zoomTarget < 1.05) {
        stroke.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
        const dir = flickDirection(stroke.samples);
        if (dir) {
          this.drag.x = 0; // the swipe also tilted the card: let it land flat on its other side
          this.onFlip(dir);
        }
      }
    } else if (this._pointers.size === 1) {
      // one finger lifted after a pinch: continue dragging from the remaining finger
      const [[, p]] = this._pointers;
      this._dragBase = { px: p.x, py: p.y, x: this.drag.x, y: this.drag.y };
    }
    this.onChange();
  }

  _pinchDistance() {
    const [a, b] = [...this._pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  _wheel(e) {
    e.preventDefault();
    this.setZoom(this.zoomTarget * Math.exp(-e.deltaY * 0.0016));
  }

  /* ----------------------------------------------------------------- sensor */

  /**
   * Must be called directly from a click / touchend handler.
   * @returns {Promise<{ok: boolean, reason?: 'insecure'|'unsupported'|'denied'|'error'|'no-data'}>}
   */
  async enableSensors() {
    if (this.sensor.active) return { ok: true };
    if (typeof window.DeviceOrientationEvent === 'undefined') return { ok: false, reason: 'unsupported' };
    if (!window.isSecureContext) return { ok: false, reason: 'insecure' };

    // iOS 13+ / Safari: permission prompt. Called synchronously first thing in the gesture.
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const result = await DeviceOrientationEvent.requestPermission();
        if (result !== 'granted') return { ok: false, reason: 'denied' };
      } catch {
        return { ok: false, reason: 'error' };
      }
    }

    this._sensorBase = null;
    this._sensorRaw = null;
    window.addEventListener('deviceorientation', this._onOrientation);

    // Desktop browsers fire one event with null angles; a blocked sensor fires nothing.
    const got = await new Promise((resolve) => {
      const t0 = performance.now();
      const poll = () => {
        if (this._sensorRaw) resolve(true);
        else if (performance.now() - t0 > 1600) resolve(false);
        else setTimeout(poll, 80);
      };
      poll();
    });
    if (!got) {
      window.removeEventListener('deviceorientation', this._onOrientation);
      return { ok: false, reason: 'no-data' };
    }
    this.sensor.active = true;
    return { ok: true };
  }

  disableSensors() {
    window.removeEventListener('deviceorientation', this._onOrientation);
    this.sensor = { x: 0, y: 0, active: false };
    this._sensorBase = null;
    this._sensorRaw = null;
    this.onChange();
  }

  _handleOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    // Express tilt in the screen's frame, whatever the device orientation.
    const angle = screen.orientation?.angle ?? window.orientation ?? 0;
    let x = e.gamma; // left ↔ right
    let y = e.beta; // front ↔ back
    if (angle === 90) [x, y] = [e.beta, -e.gamma];
    else if (angle === 180 || angle === -180) [x, y] = [-e.gamma, -e.beta];
    else if (angle === 270 || angle === -90) [x, y] = [-e.beta, e.gamma];

    // low-pass filter: sensors jitter, and this keeps the card calm
    const prev = this._sensorRaw ?? { x, y };
    this._sensorRaw = { x: prev.x + (x - prev.x) * 0.22, y: prev.y + (y - prev.y) * 0.22 };
    if (!this._sensorBase) this._sensorBase = { ...this._sensorRaw }; // neutral = how the phone is held now

    this.sensor.x = clamp((this._sensorRaw.x - this._sensorBase.x) / SENSOR_RANGE_DEG, -1, 1);
    this.sensor.y = clamp((this._sensorRaw.y - this._sensorBase.y) / SENSOR_RANGE_DEG, -1, 1);
    this.interacted = true;
    this.onChange();
  }
}

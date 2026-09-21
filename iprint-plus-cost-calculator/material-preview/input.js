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
 *   sensor DeviceOrientation, calibrated to however the phone is held, clamped, low-passed
 *
 * iOS rule: DeviceOrientationEvent.requestPermission() must be called from a user gesture and
 * over HTTPS. enableSensors() is therefore only ever invoked from a button click.
 */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export const ZOOM_MAX = 3.2;
const SENSOR_RANGE_DEG = 22; // phone tilt that maps to a full ±1 card tilt (keeps motion gentle)

export class TiltInput {
  constructor(element, { onChange = () => {} } = {}) {
    this.el = element;
    this.onChange = onChange;

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
    element.addEventListener('dblclick', () => this.setZoom(this.zoomTarget > 1.05 ? 1 : 2.4));
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
    } else if (this._pointers.size === 2) {
      this._pinchBase = { dist: this._pinchDistance(), zoom: this.zoomTarget };
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

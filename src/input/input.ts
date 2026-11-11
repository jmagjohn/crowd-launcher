/**
 * Pointer events only, so mouse, pen and touch share one path. Aim is absolute (the launcher sits under the
 * finger) and is applied the same frame: the renderer draws the launcher at `aimX` directly, the sim reads it on
 * its next tick. Holding anywhere on the play area fires.
 */
export class InputController {
  aimX = 0;
  private pointerFiring = false;
  private keyFiring = false;
  private keyLeft = false;
  private keyRight = false;
  private championQueued = false;
  private activePointer = -1;
  enabled = true;
  /** Optional listener for non-game keys (perf overlay toggle, pause). */
  onKey: ((key: string) => void) | null = null;

  constructor(
    private readonly surface: HTMLElement,
    private readonly toLaneX: (clientX: number) => number,
  ) {
    surface.addEventListener('pointerdown', this.onDown);
    surface.addEventListener('pointermove', this.onMove);
    surface.addEventListener('pointerup', this.onUp);
    surface.addEventListener('pointercancel', this.onUp);
    surface.addEventListener('lostpointercapture', this.onUp);
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
  }

  get firing(): boolean {
    return this.enabled && (this.pointerFiring || this.keyFiring);
  }

  requestChampion(): void {
    this.championQueued = true;
  }

  consumeChampion(): boolean {
    const q = this.championQueued;
    this.championQueued = false;
    return q;
  }

  /** Keyboard aim integrates with frame time. */
  update(dt: number): void {
    const dir = (this.keyRight ? 1 : 0) - (this.keyLeft ? 1 : 0);
    if (dir !== 0) this.aimX = Math.max(-6, Math.min(6, this.aimX + dir * 14 * dt));
  }

  releaseAll = (): void => {
    this.pointerFiring = false;
    this.keyFiring = false;
    this.keyLeft = this.keyRight = false;
    this.activePointer = -1;
  };

  private onDown = (e: PointerEvent): void => {
    if (!this.enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (this.activePointer !== -1 && e.pointerId !== this.activePointer) return;
    this.activePointer = e.pointerId;
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      // Not an active pointer (synthetic event, or already released): aiming still works without capture.
    }
    this.aimX = this.toLaneX(e.clientX);
    this.pointerFiring = true;
    e.preventDefault();
  };

  private onMove = (e: PointerEvent): void => {
    // Mouse aims on hover too; touch only aims while a finger is down.
    if (e.pointerId === this.activePointer || (e.pointerType === 'mouse' && this.activePointer === -1)) {
      this.aimX = this.toLaneX(e.clientX);
    }
  };

  private onUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.activePointer) return;
    this.activePointer = -1;
    this.pointerFiring = false;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.keyLeft = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.keyRight = true;
        break;
      case 'Space':
        this.keyFiring = true;
        e.preventDefault();
        break;
      case 'KeyB':
      case 'KeyE':
      case 'ShiftLeft':
        this.championQueued = true;
        break;
      default:
        this.onKey?.(e.code);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.keyLeft = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.keyRight = false;
        break;
      case 'Space':
        this.keyFiring = false;
        break;
    }
  };
}

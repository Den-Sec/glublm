/**
 * Fish finite state machine - manages behavior states and transitions.
 */

export const STATES = {
  IDLE:            'idle_swim',
  TALKING:         'talk',
  HAPPY:           'happy',
  SAD:             'sad',
  SLEEPING:        'sleep',
  EATING:          'eat',
  BUMPING:         'bump_glass',
  FORGETTING:      'forget',
  EXCITED:         'excited',
  WIGGLING:        'wiggle',
  BLOWING_BUBBLES: 'bubble_blow',
  TURNING:         'turn_around',
};

const PRIORITY = {
  [STATES.IDLE]:            0,
  [STATES.SLEEPING]:        0,
  [STATES.BUMPING]:         1,
  [STATES.BLOWING_BUBBLES]: 1,
  [STATES.TURNING]:         1,
  [STATES.EATING]:          1,
  [STATES.FORGETTING]:      2,
  [STATES.TALKING]:         2,
  [STATES.HAPPY]:           2,
  [STATES.SAD]:             2,
  [STATES.WIGGLING]:        3,
  [STATES.EXCITED]:         3,
};

export class FishStateMachine {
  /**
   * @param {import('./sprites.js').SpriteEngine} spriteEngine
   * @param {import('./movement.js').FishMovement} movement
   */
  constructor(spriteEngine, movement) {
    this._sprites = spriteEngine;
    this._movement = movement;
    this._state = STATES.IDLE;
    this._priority = 0;
    this._timer = 0;
    this._duration = Infinity;
    this._onComplete = null;
    this._listeners = [];
  }

  get currentState() { return this._state; }

  /**
   * Transition to a new state.
   * @param {string} newState - one of STATES values
   * @param {object} opts
   * @param {number} [opts.duration=2] - seconds before returning to IDLE
   * @param {number} [opts.priority] - override priority (default from PRIORITY map)
   * @param {() => void} [opts.onComplete] - called when state ends
   * @returns {boolean} true if transition was accepted
   */
  transition(newState, { duration = 2, priority, onComplete } = {}) {
    const newPrio = priority ?? PRIORITY[newState] ?? 1;

    // Can't interrupt higher or equal priority (except IDLE/SLEEP)
    if (this._state !== STATES.IDLE && this._state !== STATES.SLEEPING) {
      if (newPrio <= this._priority) return false;
    }

    this._state = newState;
    this._priority = newPrio;
    this._timer = 0;
    this._duration = duration;
    this._onComplete = onComplete || null;

    // Update sprite
    this._sprites.play(newState);

    // Movement effects
    switch (newState) {
      case STATES.SLEEPING:
        this._movement.freeze();
        break;
      case STATES.TALKING:
        this._movement.slowDown();
        break;
      case STATES.BUMPING:
        this._movement.pause(duration);
        break;
      case STATES.EXCITED:
        this._movement.unfreeze();
        break;
      default:
        this._movement.unfreeze();
        break;
    }

    // Notify listeners
    for (const fn of this._listeners) fn(newState);
    return true;
  }

  /** Return to idle state. */
  toIdle() {
    const prev = this._state;
    const cb = this._onComplete;
    this._state = STATES.IDLE;
    this._priority = 0;
    this._timer = 0;
    this._duration = Infinity;
    this._onComplete = null;
    this._sprites.play(STATES.IDLE);
    this._movement.unfreeze();
    if (cb) cb(prev);
  }

  update(dt) {
    if (this._state === STATES.IDLE || this._state === STATES.SLEEPING) return;

    this._timer += dt;

    // Check if animation finished (for non-looping anims)
    if (this._sprites.isFinished) {
      this.toIdle();
      return;
    }

    // Check duration
    if (this._timer >= this._duration) {
      this.toIdle();
    }
  }

  /** Register a state change listener. */
  onStateChange(fn) { this._listeners.push(fn); }
}

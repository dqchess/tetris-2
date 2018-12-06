import Progress from './progress'
import Tetrion from './tetrion'
import { copy } from 'fkit'
import { play } from './sound'

const SPAWN_DELAY = 100
const LOCK_DELAY = 1000

/**
 * The game is a state machine which controls a tetrion. The state is advanced
 * by repeatedly calling the `tick` function.
 */
export default class Game {
  constructor (muted = false) {
    this.time = 0
    this.state = 'spawning'
    this.paused = false
    this.muted = muted
    this.tetrion = new Tetrion()
    this.spawnTimer = 0
    this.lockTimer = 0
    this.gravityTimer = 0
    this.progress = new Progress()
    this.reward = null
  }

  get level () {
    return this.progress.level
  }

  get lines () {
    return this.progress.lines
  }

  get score () {
    return this.progress.score
  }

  /**
   * Returns true if the game is idle, false otherwise.
   */
  get isIdle () {
    return this.state === 'idle'
  }

  /**
   * Returns true if the game is spawning, false otherwise.
   */
  get isSpawning () {
    return this.state === 'spawning'
  }

  /**
   * Returns true if the game is locking, false otherwise.
   */
  get isLocking () {
    return this.state === 'locking'
  }

  /**
   * Returns true if the game is finished, false otherwise.
   */
  get over () {
    return this.state === 'finished'
  }

  /**
   * Returns the gravity delay in milliseconds.
   */
  get gravityDelay () {
    return Math.round((-333.54 * Math.log(this.level)) + 999.98)
  }

  /**
   * Increments the game state and applies the given command.
   *
   * @param delta The time delta.
   * @param command The user command.
   * @returns A new game.
   */
  tick (delta, command) {
    if (this.paused) {
      return this
    }

    const time = this.time + delta
    let state = this.state
    let tetrion = this.tetrion
    let spawnTimer = this.spawnTimer
    let lockTimer = this.lockTimer
    let gravityTimer = this.gravityTimer
    let progress = this.progress
    let reward = this.reward

    if (this.isSpawning && time - this.spawnTimer >= SPAWN_DELAY) {
      const result = this.tetrion.spawn()
      tetrion = result.tetrion

      if (tetrion === this.tetrion) {
        this.playSound('gameOver')
        state = 'finished'
      } else {
        state = 'idle'
        gravityTimer = time
      }
    } else if (this.isIdle && time - this.gravityTimer >= this.gravityDelay) {
      // Apply gravity.
      const result = this.tetrion.moveDown()
      tetrion = result.tetrion
      reward = result.reward

      this.playSound('moveDown')

      state = 'idle'
      gravityTimer = time

      // Moving down failed, start locking.
      if (tetrion === this.tetrion) {
        state = 'locking'
        lockTimer = time
      }
    } else if (this.isLocking && time - this.lockTimer >= LOCK_DELAY) {
      const result = this.tetrion.lock(this.level)
      tetrion = result.tetrion
      reward = result.reward

      const oldProgress = progress
      progress = progress.add(reward)
      this.playSound('lock', reward.lines > 0, progress.level > oldProgress.level)

      state = 'spawning'
      spawnTimer = time
    } else if ((this.isIdle || this.isLocking) && command) {
      // Dispatch the command.
      const result = this.tetrion[command](this.level)
      const oldTetrion = tetrion
      tetrion = result.tetrion
      reward = result.reward
      const oldProgress = progress
      progress = progress.add(reward)

      if (tetrion !== oldTetrion) {
        this.playSound(command, reward.lines > 0, progress.level > oldProgress.level)
      }

      if (!tetrion.fallingPiece) {
        // Start spawning if there is no falling piece.
        state = 'spawning'
        spawnTimer = time
      } else if (this.isLocking && tetrion.canMoveDown) {
        // Abort locking if the falling piece can move down under gravity.
        state = 'idle'
        gravityTimer = time
      }
    }

    return copy(this, { time, state, tetrion, spawnTimer, lockTimer, gravityTimer, progress, reward })
  }

  /**
   * Pauses/unpauses the game.
   */
  pause () {
    return copy(this, { paused: !this.paused })
  }

  /**
   * Mutes/unmutes the game audio.
   *
   * @returns A new game.
   */
  mute () {
    return copy(this, { muted: !this.muted })
  }

  playSound (command, clearLine = false, levelUp = false) {
    if (this.muted) {
      // Do nothing.
    } else if (levelUp) {
      return play('level-up')
    } else if (clearLine) {
      return play('clear-line')
    } else {
      switch (command) {
        case 'moveLeft':
        case 'moveRight':
        case 'moveDown':
        case 'softDrop':
          return play('move')
        case 'rotateLeft':
        case 'rotateRight':
          return play('rotate')
        case 'firmDrop':
        case 'hardDrop':
          return play('drop')
        case 'lock':
          return play('lock')
        case 'hold':
          return play('hold')
        case 'gameOver':
          return play('game-over')
      }
    }
  }

  toString () {
    return `Game (state: ${this.state}, lines: ${this.lines}, level: ${this.level}, score: ${this.score}, reward: ${this.reward})`
  }
}

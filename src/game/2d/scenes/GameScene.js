import Phaser from 'phaser';
import { EventBus } from '@/game/EventBus';

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    EventBus.emit('current-scene-ready', this);
  }
}

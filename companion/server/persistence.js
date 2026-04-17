// companion/server/persistence.js
import fs from 'node:fs';
import { PetState } from './pet-state.js';

export class Persistence {
  constructor(filePath) {
    this._path = filePath;
  }

  save(petState) {
    const json = petState.serialize();
    const tmp = this._path + '.tmp';
    try {
      fs.writeFileSync(tmp, json, 'utf-8');
      fs.renameSync(tmp, this._path);
    } catch (err) {
      console.error('[glub] Fatal: persistence save failed:', err);
      process.exit(1);
    }
  }

  load() {
    try {
      if (!fs.existsSync(this._path)) return null;
      const raw = fs.readFileSync(this._path, 'utf-8');
      return PetState.deserialize(raw);
    } catch {
      return null;
    }
  }
}

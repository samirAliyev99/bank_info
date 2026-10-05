import fs from 'node:fs';
import path from 'node:path';

// A JSON file database: the whole state lives in memory and is written atomically
// after each change. Good enough for a pilot; move to PostgreSQL before real money.
export class Store {
  constructor(file) {
    this.file = file;
    this.db = { users: {}, rooms: {}, sessions: {} };
    if (file && fs.existsSync(file)) this.db = JSON.parse(fs.readFileSync(file, 'utf8'));
    this.pending = null;
  }

  save() {
    if (!this.file || this.pending) return;
    this.pending = setTimeout(() => {
      this.pending = null;
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(this.db));
      fs.renameSync(`${this.file}.tmp`, this.file);
    }, 50);
  }
}

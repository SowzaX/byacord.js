class Collection extends Map {
  ensure(key, defaultValueGenerator) {
    if (this.has(key)) return this.get(key);
    const defaultValue = defaultValueGenerator(key, this);
    this.set(key, defaultValue);
    return defaultValue;
  }

  hasAll(...keys) {
    return keys.every((key) => super.has(key));
  }

  hasAny(...keys) {
    return keys.some((key) => super.has(key));
  }

  first(amount) {
    if (amount === undefined) return this.values().next().value;
    if (amount < 0) return this.last(amount * -1);
    amount = Math.min(this.size, amount);
    return [...this.values()].slice(0, amount);
  }

  firstKey(amount) {
    if (amount === undefined) return this.keys().next().value;
    if (amount < 0) return this.lastKey(amount * -1);
    amount = Math.min(this.size, amount);
    return [...this.keys()].slice(0, amount);
  }

  last(amount) {
    const arr = [...this.values()];
    if (amount === undefined) return arr[arr.length - 1];
    if (amount < 0) return this.first(amount * -1);
    if (!amount) return [];
    return arr.slice(-amount);
  }

  lastKey(amount) {
    const arr = [...this.keys()];
    if (amount === undefined) return arr[arr.length - 1];
    if (amount < 0) return this.firstKey(amount * -1);
    if (!amount) return [];
    return arr.slice(-amount);
  }

  at(index) {
    return [...this.values()].at(Math.trunc(index));
  }

  random(amount) {
    const arr = [...this.values()];
    if (amount === undefined) return arr[Math.floor(Math.random() * arr.length)];
    if (!arr.length || !amount) return [];
    return Array.from({ length: Math.min(amount, arr.length) }, () => arr.splice(Math.floor(Math.random() * arr.length), 1)[0]);
  }

  find(fn, thisArg) {
    if (thisArg !== undefined) fn = fn.bind(thisArg);
    for (const [key, val] of this) {
      if (fn(val, key, this)) return val;
    }
    return undefined;
  }

  findKey(fn, thisArg) {
    if (thisArg !== undefined) fn = fn.bind(thisArg);
    for (const [key, val] of this) {
      if (fn(val, key, this)) return key;
    }
    return undefined;
  }

  filter(fn, thisArg) {
    if (thisArg !== undefined) fn = fn.bind(thisArg);
    const results = new Collection();
    for (const [key, val] of this) {
      if (fn(val, key, this)) results.set(key, val);
    }
    return results;
  }

  partition(fn, thisArg) {
    if (thisArg !== undefined) fn = fn.bind(thisArg);
    const results = [new Collection(), new Collection()];
    for (const [key, val] of this) {
      if (fn(val, key, this)) results[0].set(key, val);
      if (!fn(val, key, this)) results[1].set(key, val);
    }
    return results;
  }

  map(fn, thisArg) {
    if (thisArg !== undefined) fn = fn.bind(thisArg);
    const result = [];
    for (const [key, val] of this) result.push(fn(val, key, this));
    return result;
  }

  flatMap(fn, thisArg) {
    return this.map(fn, thisArg).flat();
  }

  mapValues(fn, thisArg) {
    if (thisArg !== undefined) fn = fn.bind(thisArg);
    const coll = new Collection();
    for (const [key, val] of this) coll.set(key, fn(val, key, this));
    return coll;
  }

  some(fn, thisArg) {
    if (thisArg !== undefined) fn = fn.bind(thisArg);
    for (const [key, val] of this) {
      if (fn(val, key, this)) return true;
    }
    return false;
  }

  every(fn, thisArg) {
    if (thisArg !== undefined) fn = fn.bind(thisArg);
    for (const [key, val] of this) {
      if (!fn(val, key, this)) return false;
    }
    return true;
  }

  reduce(fn, initialValue) {
    let accumulator = initialValue;
    let first = initialValue === undefined;
    for (const [key, val] of this) {
      if (first) {
        accumulator = val;
        first = false;
        continue;
      }
      accumulator = fn(accumulator, val, key, this);
    }
    if (first) throw new TypeError("Reduce of empty collection with no initial value");
    return accumulator;
  }

  each(fn, thisArg) {
    this.forEach(fn, thisArg);
    return this;
  }

  tap(fn, thisArg) {
    if (thisArg !== undefined) fn = fn.bind(thisArg);
    fn(this);
    return this;
  }

  sweep(fn, thisArg) {
    if (thisArg !== undefined) fn = fn.bind(thisArg);
    const previousSize = this.size;
    for (const [key, val] of this) {
      if (fn(val, key, this)) this.delete(key);
    }
    return previousSize - this.size;
  }

  clone() {
    return new Collection(this);
  }

  concat(...collections) {
    const merged = this.clone();
    for (const coll of collections) {
      for (const [key, val] of coll) merged.set(key, val);
    }
    return merged;
  }

  equals(collection) {
    if (!collection) return false;
    if (this === collection) return true;
    if (this.size !== collection.size) return false;
    for (const [key, value] of this) {
      if (!collection.has(key) || value !== collection.get(key)) return false;
    }
    return true;
  }

  sort(compareFunction = (x, y) => Number(x > y) || Number(x === y) - 1) {
    const entries = [...this.entries()];
    entries.sort((a, b) => compareFunction(a[1], b[1], a[0], b[0]));
    super.clear();
    for (const [key, value] of entries) super.set(key, value);
    return this;
  }

  toSorted(compareFunction) {
    return new Collection(this).sort(compareFunction);
  }

  toJSON() {
    return [...this.values()];
  }
}

Collection.prototype.sorted = Collection.prototype.toSorted;

module.exports = Collection;

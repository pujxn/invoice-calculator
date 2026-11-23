// Saves that have been sent but not yet answered. A person who corrects an amount and goes straight
// to History would otherwise see the old figure (the list is asked for while the correction is
// still on its way), so the History screens wait for these before they ask.
let current = Promise.resolve();

export function track(promise) {
  current = Promise.all([current, promise.catch(() => {})]).then(() => {});
  return promise;
}

export const whenSaved = () => current;

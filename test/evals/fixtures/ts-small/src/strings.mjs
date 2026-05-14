// String helpers.
export function reverse(s) {
  return [...s].reverse().join('');
}

export function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

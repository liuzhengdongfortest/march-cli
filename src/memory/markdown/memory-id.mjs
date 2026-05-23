export function isMemoryIdLike(value) {
  return /^mem_[a-z0-9_-]+$/i.test(String(value ?? ""));
}

export function isSingleEditAway(left, right) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  if (left.length === right.length) return hasSingleSubstitution(left, right);
  return hasSingleInsertionOrDeletion(left, right);
}

function hasSingleSubstitution(left, right) {
  let mismatches = 0;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) mismatches += 1;
    if (mismatches > 1) return false;
  }
  return mismatches === 1;
}

function hasSingleInsertionOrDeletion(left, right) {
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  let edits = 0;
  for (let i = 0, j = 0; i < shorter.length && j < longer.length; ) {
    if (shorter[i] === longer[j]) {
      i += 1;
      j += 1;
    } else {
      edits += 1;
      j += 1;
      if (edits > 1) return false;
    }
  }
  return true;
}

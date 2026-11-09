function placeRowAt(rows, id, finalIndex) {
  const currentIndex = rows.findIndex(row => row.id === id);
  if (currentIndex < 0 || !Number.isInteger(finalIndex) || finalIndex < 0 || finalIndex >= rows.length || currentIndex === finalIndex) {
    return rows;
  }
  const next = rows.slice();
  const [row] = next.splice(currentIndex, 1);
  next.splice(finalIndex, 0, row);
  return next;
}

function getInsertionIndex(rectangles, clientY) {
  const index = rectangles.findIndex(rect => clientY < rect.top + rect.height / 2);
  return index < 0 ? rectangles.length : index;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { placeRowAt, getInsertionIndex };
}

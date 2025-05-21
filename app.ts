import { sort } from "./bigdata/sort"

const arrays = [
  [1, 4, 7],
  [2, 5, 8],
  [3, 6, 9],
];

const result = sort(arrays, { order: 'asc' });

const result1 = sort(arrays, { order: 'desc' });

console.log(result, result1)
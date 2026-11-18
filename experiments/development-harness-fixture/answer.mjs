// Intentionally incorrect harmless fixture. Never imported by the product.
const values = JSON.parse(process.argv[2]);
console.log(JSON.stringify(values.map(([a, b]) => a - b)));

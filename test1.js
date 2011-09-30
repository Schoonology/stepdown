var step = require('./lib/step');

step(function() {
  console.log('one');
  setTimeout(this, 0);
}, function(err) {
  console.log('two');
  throw new Error('fail');
}, function(err) {
  console.log('end', err.stack);
});

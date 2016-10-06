#!/usr/bin/node
var _ = require('lodash');
var async = require('async-chainable');
var asyncFlush = require('async-chainable-flush');
var colors = require('colors');
var fs = require('fs');
var hanson = require('hanson');
var program = require('commander');
var reflib = require('reflib');
var util = require('util');

program
	.version(require('./package.json').version)
	.usage('[file...]')
	.option('-c, --count', 'Dont output refs, just output the count (sets `-o count`)')
	.option('-j, --json', 'Output valid JSON (sets `-o json`)')
	.option('-x, --xml', 'Output EndNote XML file (sets `-o endnotexml`)')
	.option('-o, --output [mode]', 'Output file format (js, json, endnotexml, count)')
	.option('-q, --query [expression...]', 'Query by HanSON expression (loose JSON parsing)', function(item, value) { value.push(item); return value; }, [])
	.option('-p, --progress', 'Show read progress')
	.option('-v, --verbose', 'Be verbose (also prints a running total if -c is specified)')
	.option('--no-color', 'Force disable color')
	.parse(process.argv);


// Argument parsing {{{
if (program.count && program.json && program.xml) {
	console.log('Only one output mode can be used');
	process.exit(1);
} else if (program.count) {
	program.output = 'count';
} else if (program.json) {
	program.output = 'json';
} else if (program.xml) {
	program.output = 'endnotexml';
} else if (!program.output) {
	program.output = 'js';
} else if (program.output && !_.includes(['count', 'js', 'json', 'endnotexml', 'xml'], program.output)) {
	console.log('Invalid output mode');
	process.exit(1);
}

try {
	program.query = program.query.map(function(q) {
		var json = hanson.parse(q);
		if (program.verbose) console.log('Filtering with query', util.inspect(json, {depth: null, color: true}));
		return _.matches(json);
	});
} catch (e) {
	console.log('Cannot parse query expression: ' + e.toString());
	process.exit(1);
}
// }}}


async()
	.use(asyncFlush)
	.set('refs', [])
	.set('refsCount', 0)
	.forEach(program.args, function(next, file) {
		fs.exists(file, function(exists) {
			if (!exists) return next('File not found: ' + file);
			next();
		});
	})
	.forEach(program.args, function(next, file) {
		var self = this;
		if (program.verbose) console.log(colors.grey('Processing file', file));
		var thisCount = 0;
		reflib.parseFile(file)
			.on('error', function(err) {
				return next(err);
			})
			.on('ref', function(ref) {
				thisCount++;
				if (program.count) {
					if (program.verbose && ((self.refsCount % 100) == 0)) console.log('Found', colors.cyan(self.refsCount), 'references...');
					self.refsCount++;
				} else if (program.query.length) { // Apply querying
					if (program.verbose && ((thisCount % 100) == 0)) console.log('Processed', colors.cyan(thisCount), 'references...');
					if (program.query.every(function(q) {
						return q(ref);
					})) self.refs.push(ref);
				} else {
					self.refs.push(ref);
				}
			})
			.on('progress', function(current, max) {
				if (program.progress) console.log('Read', colors.cyan(current), '/', colors.cyan(max));
			})
			.on('end', function() {
				if (program.verbose) console.log(colors.grey('Finished parsing', file, 'with', thisCount,'references'));
				next();
			});
	})
	// Output {{{
	.then(function(next) {
		switch(program.output) {
			case 'count':
				console.log('Found', colors.cyan(this.refsCount), 'references');
				break;
			case 'json':
				console.log(JSON.stringify(this.refs, null, '\t'));
				break;
			case 'endnotexml':
			case 'xml':
				// Create a fake stream that redirects writes to STDOUT {{{
				var outStream = new require('stream').Writable();
				outStream._write = function(chunk, enc, next) {
					process.stdout.write(chunk, enc, next);
				};
				// }}}

				reflib.output({
					stream: outStream,
					format: 'endnotexml',
					content: this.refs,
				})
					.on('end', next);

				break;
			case 'js':
			default:
				console.log(util.inspect(this.refs, {depth: null, colors: colors.enabled}));
		}
	})
	// }}}
	// End {{{
	.flush()
	.end(function(err) {
		if (err) {
			console.log(colors.red('ERROR'), err);
			process.exit(1);
		}
		process.exit(0);
	});
	// }}}

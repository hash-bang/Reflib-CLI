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
	.option('-c, --count', 'Dont output refs, just output the count')
	.option('-j, --json', 'Output valid JSON')
	.option('-q, --query [expression...]', 'Query by HanSON expression (loose JSON parsing)', function(item, value) { value.push(item); return value; }, [])
	.option('-v, --verbose', 'Be verbose (also prints a running total if -c is specified)')
	.option('--no-color', 'Force disable color')
	.parse(process.argv);


// Argument parsing {{{
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
			.on('end', function() {
				if (program.verbose) console.log(colors.grey('Finished parsing', file, 'with', thisCount,'references'));
				next();
			});
	})
	.then(function(next) {
		if (program.count) {
			console.log('Found', colors.cyan(this.refsCount), 'references');
		} else if (program.json) {
			console.log(JSON.stringify(this.refs, null, '\t'));
		} else {
			console.log(util.inspect(this.refs, {depth: null, colors: colors.enabled}));
		}
		next();
	})
	.flush()
	.end(function(err) {
		if (err) {
			console.log(colors.red('ERROR'), err);
			process.exit(1);
		}
		process.exit(0);
	});

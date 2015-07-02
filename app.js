#!/usr/bin/node
var async = require('async-chainable');
var colors = require('colors');
var fs = require('fs');
var program = require('commander');
var reflib = require('reflib');
var util = require('util');

program
	.version(require('./package.json').version)
	.usage('[file...]')
	.option('-c, --count', 'Dont output refs, just output the count')
	.option('-v, --verbose', 'Be verbose')
	.option('--no-color', 'Force disable color')
	.parse(process.argv);

async()
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
					self.refsCount++;
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
		} else {
			console.log(util.inspect(this.refs, {depth: null, colors: colors.enabled}));
		}
		next();
	})
	.end(function(err) {
		if (err) {
			console.log(colors.red('ERROR'), err);
			process.exit(1);
		}
		process.exit(0);
	});

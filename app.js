#!/usr/bin/node
var _ = require('lodash');
var async = require('async-chainable');
var asyncFlush = require('async-chainable-flush');
var colors = require('colors');
var filesize = require('filesize');
var fs = require('fs');
var hanson = require('hanson');
var progress = require('yapb');
var program = require('commander');
var reflib = require('reflib');
var sraDedupe = require('sra-dedupe');
var stream = require('stream');
var util = require('util');

program
	.version(require('./package.json').version)
	.usage('[file...]')
	.option('-c, --count', 'Dont output refs, just output the count (sets `-o count`)')
	.option('-j, --json', 'Output valid JSON (sets `-o json`)')
	.option('-x, --xml', 'Output EndNote XML file (sets `-o endnotexml`)')
	.option('-o, --output [mode]', 'Output file format (js, json, endnotexml, null, count)')
	.option('-f, --output-file [path]', 'Output data into a file instead of STDOUT (sets -o to a mode matching the filetype if possible)')
	.option('-q, --query [expression...]', 'Query by HanSON expression (loose JSON parsing)', function(item, value) { value.push(item); return value; }, [])
	.option('-v, --verbose', 'Be verbose (also prints a running total if -c is specified)')
	.option('--dedupe [action]', 'Deduplicate the library via the sra-dedupe NPM module. Actions are \'remove\' (default), \'count\' or \'mark\' (to set the caption to "DUPE")')
	.option('--no-color', 'Force disable color')
	.option('--no-progress', 'Disable progress bars')
	.parse(process.argv);


// Argument parsing {{{
// count,json,xml,output {{{
if (program.count && program.json && program.xml) {
	console.log('Only one output mode can be used');
	process.exit(1);
} else if (program.count) {
	program.output = 'count';
} else if (program.json) {
	program.output = 'json';
} else if (program.xml) {
	program.output = 'endnotexml';
} else if (program.output && !_.includes(['count', 'null', 'js', 'json', 'endnotexml', 'xml'], program.output)) {
	console.log('Invalid output mode');
	process.exit(1);
} else if (program.outputFile && !program.output) {
	if (program.verbose) console.log(colors.grey('Determining output format from file path "' + program.outputFile + '"'));
	program.output = reflib.identify(program.outputFile);
	if (!program.output) {
		console.log('Unknown file output file. Specify using `-o <format>`');
		process.exit(1);
	} else {
		if (program.verbose) console.log(colors.grey('Using output format "' + program.output + '"'));
	}
} else if (!program.output) {
	program.output = 'js';
}
// }}}

// dedupe {{{
if (program.dedupe && !_.includes(['count', 'remove', 'mark'], program.dedupe)) {
	if (program.dedupe === true) { // Nothing specified, assume 'remove'
		program.dedupe = 'remove';
	} else {
		console.log('Invalid dedupe operation');
		process.exit(1);
	}
} else if (program.dedupe == 'count') { // if `--dedupe count` imply `-c` also
	program.output = 'count';
}
// }}}

// query {{{
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
// }}}

async()
	.use(asyncFlush)
	.set('refs', [])
	.set('refsCount', 0)
	// Check all arguments / files exist {{{
	.forEach(program.args, function(next, file) {
		fs.exists(file, function(exists) {
			if (!exists) return next('File not found: ' + file);
			next();
		});
	})
	// }}}
	// Read in all libraries {{{
	.forEach(program.args, function(next, file) {
		var task = this;
		if (program.verbose) console.log(colors.grey('Processing file', file));
		var progressBar = progress(
			'Read' +
			' {{#cyan}}{{#filesize}}{{current}}{{/filesize}}{{/cyan}}' +
			' /' +
			' {{#cyan}}{{#filesize}}{{max}}{{/filesize}}{{/cyan}}' +
			' [{{bar}}]' +
			' {{percent}}%' +
			' - found' +
			' {{#cyan}}{{found}}{{/cyan}}' +
			' refs' +
			' (ETA: {{eta}})'
		, {
			found: 0,
			current: 0,
			max: 100,
			filesize: function() {
				return function(text, render) {
					return filesize(render(text));
				};
			},
		});

		reflib.parseFile(file)
			.on('error', function(err) {
				return next(err);
			})
			.on('ref', function(ref) {
				task.refsCount++;
				if (program.progress) progressBar.set({found: task.refsCount});
				if (program.query.length) { // Apply querying
					if (program.query.every(function(q) {
						return q(ref);
					})) task.refs.push(ref);
				} else {
					task.refs.push(ref);
				}
			})
			.on('progress', function(current, max) {
				if (program.progress) progressBar.update({current: current, max: max});
			})
			.on('end', function() {
				progressBar.remove();
				if (program.verbose) console.log(colors.grey('Finished parsing', file, 'with', task.refsCount,'references'));
				next();
			});
	})
	// }}}
	// Perform operations {{{
	.then('dupeCount', function(next) {
		if (!program.dedupe) return next();
		var task = this;
		var dupeCount = 0;
		if (program.verbose) console.log(colors.grey('Performing dedupe'));
		var dedupe = sraDedupe();
		var progressBar = progress(
			'Processed' +
			' {{#cyan}}{{current}}{{/cyan}}' +
			' /' +
			' {{#cyan}}{{max}}{{/cyan}}' +
			' [{{bar}}]' +
			' {{percent}}%' +
			' - found' +
			' {{#cyan}}{{found}}{{/cyan}}' +
			' dupes' +
			' (ETA: {{eta}})',
		{
			found: 0,
			current: 0,
			max: this.refs.length,
		});

		dedupe.compareAll(this.refs)
			.on('dupe', function(ref1, ref2, res) {
				// if (program.verbose) console.log(colors.grey('Dupe', ref1.recNumber, ref2.recNumber, res.reason));

				dupeCount++;
				if (program.progress) progressBar.update({found: dupeCount});

				if (program.dedupe == 'remove') {
					ref2.DELETE = true;
				} else if (program.dedupe == 'mark') {
					ref2.caption = 'DUPE OF ' + ref1.recNumber;
				}
			})
			.on('progress', function(current, max) {
				if (program.progress) progressBar.update({current: current, max: max});
			})
			.on('error', next)
			.on('end', function() {
				if (program.progress) progressBar.remove();
				if (program.dedupe == 'remove') task.refs = task.refs.filter(function(ref) { // Remove all refs marked as deleted
					return (! ref.DELETE);
				});
				next(null, dupeCount);
			});
	})
	// }}}
	// Output {{{
	.then(function(next) {
		var outStream;
		if (program.outputFile) {
			outStream = fs.createWriteStream(program.outputFile);
		} else {
			// Create a fake stream that redirects writes to STDOUT
			outStream = stream.Writable();
			outStream._write = function(chunk, enc, next) {
				process.stdout.write(chunk, enc, next);
			};
		}

		switch(program.output) {
			case 'count':
				console.log('Found', colors.cyan(this.refsCount), 'references');
				if (program.dedupe == 'count') console.log('... of which', colors.cyan(this.dupeCount), 'are duplicates');
				break;
			case 'json':
				outStream.on('end', next);
				outStream.end(JSON.stringify(this.refs, null, '\t'));
				break;
			case 'endnotexml':
			case 'xml':
				reflib.output({
					stream: outStream,
					format: 'endnotexml',
					content: this.refs,
				})
					.on('end', next);

				break;
			case 'js':
			default:
				outStream.on('end', next);
				outStream.end(util.inspect(this.refs, {depth: null, colors: colors.enabled}));
				break;
			case 'null':
				outStream.on('end', next);
				outStream.end();
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

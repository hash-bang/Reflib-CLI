#!/usr/bin/node
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import fs from 'node:fs';
import {inspect} from 'node:util';
import {program} from 'commander';
import reflib from '@iebh/reflib';

program
	.usage('[file...]')
	.option('-c, --count', 'Dont output refs, just output the count (sets `-o count`)')
	.option('-j, --json', 'Output valid JSON (sets `-o json`)')
	.option('-x, --xml', 'Output EndNote XML file (sets `-o endnotexml`)')
	.option('-o, --output [mode]', 'Output file format (any reflib format + inspect, json, count)', 'json')
	.option('-f, --output-file [path]', 'Output data into a file instead of STDOUT (sets -o to a mode matching the filetype if possible)')
	.option('-v, --verbose', 'Be verbose (also prints a running total if -c is specified)')
	.option('--no-color', 'Force disable color')
	.parse(process.argv);

let args = {
	...program.opts(), // Read in regular commander options
	files: program.args, // Add remaining args (files in this case) as its own property
};

Promise.resolve()
	// Sanity checks + Argument parsing {{{
	.then(()=> {
		if (args.count && args.json && args.xml)
			throw new Error('Only one output mode can be used');

		// Aliased flags
		if (args.count) {
			args.output = 'count';
		} else if (args.json) {
			args.output = 'json';
		} else if (args.xml) {
			args.output = 'endnotexml';
		}

		// Check format is valid
		if (
			args.output
			&& !['json', 'inspect', 'count'].includes(args.output)
			&& !reflib.formats[args.output]
		)
			throw new Error(`Invalid output mode "${args.output}"`);

		if (args.outputFile && !args.output) {
			if (args.verbose) console.log(chalk.grey('Determining output format from file path "' + args.outputFile + '"'));
			args.output = reflib.identifyFormat(args.outputFile);

			if (!args.output) {
				throw new Error('Unknown file output file. Specify using `-o <format>`');
			} else {
				if (args.verbose) console.log(chalk.grey('Using output format "' + args.output + '"'));
			}
		}
	})
	// }}}
	// Check all given files exist and have correct I/O access {{{
	.then(()=> Promise.all([
		// Check all args.files are readable
		...args.files.map(file =>
			fs.promises.access(file, fs.constants.R_OK)
				.catch(()=> { throw new Error(`File "${file}" is not readable`) })
		),

		// Check output file is writable (if any)
		...(args.outputFile
			? fs.promises.access(args.outputFile, fs.constants.W_OK)
				.catch(()=> { throw new Error(`File "${args.outputFile}" is not writable`) })
			: []
		),
	]))
	// }}}
	// Read in all libraries {{{
	.then(()=> {
		let readProgress = new cliProgress.MultiBar({
			clearOnComplete: true,
			hideCursor: true,
		}, cliProgress.Presets.shades_grey);

		return Promise.all(args.files.map(file => {
			let fileReadProgress = readProgress.create(100, 0); // FIXME: Assumes 100%
			return reflib.readFile(file)
				.finally(()=> fileReadProgress.stop())
		}))
			.finally(()=> readProgress.stop())
	})
	// }}}
	// Perform operations {{{
	.then(([...refs]) => {
		refs = refs.flat();
		switch (args.output) {
			case 'inspect':
				console.log(inspect(refs, {depth: null, colors: chalk.enabled}));
				break;
			case 'json':
				console.log(JSON.stringify(refs, null, '\t'));
				break;
			case 'count':
				console.log('Found', chalk.cyan(refs.length), 'references');
				break;
			default:
				// Assume write file output
				var writeProgress = new cliProgress.SingleBar({}, cliProgress.Presets.shades_grey);
				reflib.writeFile(args.outputFile, refs)
					.then(()=> writeProgress.stop())
		}
	})
	// }}}
	// End catch {{{
	.then(()=> process.exit(0))
	.catch(function(err) {
		console.log(chalk.red('ERROR'), err);
		process.exit(1);
	});
	// }}}

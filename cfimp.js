#!/usr/bin/env node

/* -----------
| CONTENTFUL EI - Contentful easy importer. Easy-to-use entry importer for the Contentful headless CMS.
|	@docs/links:
|		- https://mitya.uk/projects/contentful-ei
|		- https://github.com/mitya33/contentful-ei
|		- https://npmjs.com/package/contentful-ei
|	@author: Andrew Croxall (@mitya33)
----------- */

(async () => {

	//prep
	const childProcess = require('child_process');
	const fs = require('fs');
	const jsonFileName = `contentful-import-${Math.floor(Math.random() * 100000)}.json`;
	const cnslCols = {
		blue: '\x1b[36m%s\x1b[0m',
		red: '\x1b[31m%s\x1b[0m'
	};

	//handle CLI args
	const validArgs = [
		'model',
		'mergevals',
		'dfltvals',
		'delim',
		'fields',
		'locale',
		'enc',
		'space',
		'preview',
		'offset',
		'skip',
		'limit',
		'nocast',
		'tagall',
		'input',
		'comsepdelim',
		'mtoken'
	];
	const args = {};
	process.argv.slice(2).forEach(arg => {
		const spl = arg.replace(/^-/, '').split(':');
		if (!validArgs.includes(spl[0])) return console.info(cnslCols.blue, `Unrecognised arg, @${spl[0]}`);
		args[spl[0]] = spl[1] || true;
	});
	const errArg = ['model', 'space', 'locale'].find(arg => !args[arg]);
	if (errArg) return console.error(cnslCols.red, `@${errArg} must be specified`);
	if (args.offset && !validateIntArgs('offset')) return;
	if (args.limit && !validateIntArgs('limit')) return;
	if (args.mergevals && !validateFieldValListArgs('mergevals')) return;
	if (args.dfltvals && !validateFieldValListArgs('dfltvals')) return;
	if (args.fields && !newRegExp(`\w+(${comSepDelim}\w+)*`).test(args.fields))
		return console.error(cnslCols.red, `@fields, if passed, must be in the format fieldId1${comSepDelim}fieldId2 etc`);
	const comSepDelim = args.comsepdelim || ',';
	const mergeVals = !args.mergevals ? null : args.mergevals.split(comSepDelim);
	const dfltvals = !args.dfltvals ? null : args.dfltvals.split(comSepDelim);
	const fieldOverrides = !args.fields ? null : args.fields.split(comSepDelim);
	const delim = args.delim == 'tab' || !args.delim ? '\t' : (args.delim == 'com' ? ',' : (args.delim == 'pipe' ? '|' : args.delim));
	const csvFileName = args.input || 'import.csv';
	const env = args.env || 'master';
	const encoding = args.enc || 'utf8';
	try {
		await new Promise((res, rej) => {
			fs.access(csvFileName, err => !err ? res() : rej());
		});
	} catch(e) { return console.error(cnslCols.red, `File "${csvFileName}" does not exist or it could not be read`); }

	//notices
	if (!args.input) console.info(cnslCols.blue, '@import not specified; assuming "import.csv"');
	if (!args.delim) console.info(cnslCols.blue, '@delim not specified; assuming tab');
	if (!args.fields) console.info(cnslCols.blue, '@fields not specified; inferring field IDs from row in data file');
	if (!args.env) console.info(cnslCols.blue, '@env not specified; assuming "master"');
	if (!args.enc) console.info(cnslCols.blue, '@enc not passed; assuming utf8');

	//import command structure
	const importCmd = `contentful space import --environment-id ${env} --space-id ${args.space} --content-file ${jsonFileName} ${args.mtoken || ''}`;

	//content file structure
	const data = {
		entries: []
	};
	const entryTmplt = {
		metadata: {
			tags: []
		},
		sys: {
			contentType: {
				sys: {
					type: 'Link',
					linkType: 'ContentType',
					id: args.model
				}
			}
		},
		fields: {}
	};
	const refTmplt = {
		sys: {
			type: 'Link',
			linkType: null,
			id: null
		}
	};
	const tagTmplt = {
		sys: {
			type: 'Link',
			linkType: 'Tag',
			id: null
		}
	}

	//get data to import
	let cntnt;
	try {
		cntnt = await new Promise((res, rej) => {
			fs.readFile(csvFileName, encoding, (err, cntnt) => !err ? res(cntnt) : rej(err));
		});
	} catch(e) { return console.error(cnslCols.red, e); }

	//convert to JSON - shoehorn in merge values and default values (where explicit value omitted)
	const rows = cntnt.split(/\r\n/);
	const fields = fieldOverrides || rows.shift().split(delim);
	rows.forEach((row, i) => {
		i++;
		if (args.offset && i < parseInt(args.offset)) return;
		if (args.limit && i > parseInt(args.limit) + parseInt(args.offset || 0)) return;
		if (args.skip && args.skip.split(comSepDelim).find(skipRule => row.indexOf(skipRule))) return;
		let cells = fields.length > 1 ? row.split(delim) : row;
		if (fields.length > 1 && cells.length < 2) return console.error(cnslCols.red, `Quit at row ${i} - delimiter (${delim}) not found. Did you mean to set a different delimiter (@delim)?`);
		let newObj = {...JSON.parse(JSON.stringify(entryTmplt))};
		fields.forEach((field, i) => {
			if (!['_tags', '_id'].includes(field)) {
				let fieldIdAndLocaleSpl = field.split(/\[(?=[\w-]+\]$)/);
				field = fieldIdAndLocaleSpl[0];
				let locale = (fieldIdAndLocaleSpl[1] || args.locale).replace(/\]$/, ''),
					dfltVal = !dfltvals ? null : dfltvals.filter(pair => pair.split('=')[0] == field);
				if (dfltVal) dfltVal = !dfltVal.length ? null : dfltVal[0].split('=')[1];
				let val = cells[i] || dfltVal;
				newObj.fields[field] = {...(newObj.fields[field] || {}), [locale]: handleFieldVal(val)};
			} else if (field == '_tags')
				cells[i].split(comSepDelim).forEach(tag => addTag(tag, newObj));
			else
				newObj.sys.id = cells[i];
		});
		mergeVals && mergeVals.forEach(pair => {
			let spl = pair.split('=');
			newObj.fields[spl[0]] = {[args.locale]: handleFieldVal(spl[1])};
		});
		args.tagall && args.tagall.split('/').forEach(tag => addTag(tag, newObj));
		data.entries.push(newObj);
	});

	//show or write JSON file
	if (args.preview) return console.log(JSON.stringify(data, null, '	'));
	try {
		await new Promise((res, rej) => {
			fs.writeFile(jsonFileName, JSON.stringify(data), encoding, err => !err ? res() : rej(err));
		});
	} catch(e) { return console.error(cnslCols.red, e); }

	//run import - delete JSON file after
	try {
		childProcess.execSync(importCmd, {stdio: 'inherit'});
	} catch(e) {
		return console.error(cnslCols.red, e);
	}
	fs.unlink(jsonFileName, err => {});

	//util - validate incoming com-sep field=val args
	function validateFieldValListArgs(arg) {
		if (!new RegExp(`^(\w+=\w)(${comSepDelim}\w+=\w)*`).test(args[arg]))
			return console.error(cnslCols.red, `${arg} must be in format field=val${comSepDelim}field2=val2 etc`);
		return 1;
	}

	//util - validate int args
	function validateIntArgs(arg) {
		if (!parseInt(args[arg]) || parseInt(args[arg]) < 0) console.error(cnslCols.red, `@${arg}, if passed, must be an integer (0+)`);
		return 1;
	}

	//util - do some sort of casting or transformation on value - defers to related utils below
	function handleFieldVal(val) {
		return handleLatLng(handleValType(handleRef(val)));
	}

	//util - handle val type - cast 'true' and 'false' to actual booleans, and numbers to actual numbers, unless @nocast passed
	function handleValType(val) {
		if (args.nocast) return val;
		if (val == 'true') val = true;
		if (val == 'false') val = false;
		if (parseFloat(val)) val = parseFloat(val);
		return val;
	}

	//util - if field value is reference to other content type or asset, convert to object
	function handleRef(val) {
		if (typeof val != 'string') return val;
		let isRef = val.match(/^ref(a)?-(.+)/);
		if (!isRef) return val;
		let obj = {...refTmplt};
		obj.sys.id = isRef[2];
		obj.sys.linkType = !isRef[1] ? 'Entry' : 'Asset'
		return obj;
	}

	//util - handle lat/lng value - separate out parts as object
	function handleLatLng(val) {
		if (!/^\d+\.\d+ *, *\d+\.\d+$/.test(val)) return val;
		let spl = val.split(/ *, */);
		return {lat: spl[0], lon: spl[1]};
	}

	//util - add tag
	function addTag(tag, entryObj) {
		let tagObj = JSON.parse(JSON.stringify(tagTmplt));
		tagObj.sys.id = tag;
		entryObj.metadata.tags.push(tagObj);			
	}

})();
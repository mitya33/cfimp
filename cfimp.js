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

	//handle incoming args & set some config
	const validArgs = [
		'model',
		'mergevals',
		'dfltvals',
		'delim',
		'fields',
		'locale',
		'enc',
		'env',
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
	const comSepDelim = args.comsepdelim || ',';
	if (errArg) return console.error(cnslCols.red, `$${errArg} must be passed`);
	if (args.offset && !validateIntArgs('offset')) return;
	if (args.limit && !validateIntArgs('limit')) return;
	if (args.mergevals && !validateFieldValListArgs('mergevals')) return;
	if (args.dfltvals && !validateFieldValListArgs('dfltvals')) return;
	if (args.fields && !new RegExp(`\\w+(${comSepDelim}\\w+)*`).test(args.fields))
		return console.error(cnslCols.red, `$fields, if passed, must be in the format fieldId1${comSepDelim}fieldId2 etc`);
	const mergeVals = !args.mergevals ? null : args.mergevals.split(comSepDelim);
	const dfltVals = !args.dfltvals ? null : args.dfltvals.split(comSepDelim);
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
	if (!args.input) console.info(cnslCols.blue, '$import not passed; assuming "import.csv"');
	if (!args.delim) console.info(cnslCols.blue, '$delim not passed; assuming tab');
	if (!args.fields) console.info(cnslCols.blue, '$fields not passed; inferring field IDs from row in data file');
	if (!args.env) console.info(cnslCols.blue, '$env not passed; assuming "master"');
	if (!args.enc) console.info(cnslCols.blue, '$enc not passed; assuming utf8');

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
	cntnt = cntnt.replace(/\s+$/, '');

	//establish row(s) and field(s) and iterate...
	const rows = cntnt.split(/\r\n/);
	const fields = fieldOverrides || rows.shift().split(delim);
	rows.forEach((row, i) => {
		i++;

		//...skip if is contrary to limit/offset or skip rules
		if (args.offset && i < parseInt(args.offset)) return;
		if (args.limit && i > parseInt(args.limit) + parseInt(args.offset || 0)) return;
		if (args.skip && args.skip.split(comSepDelim).find(skipRule => row.indexOf(skipRule))) return;

		//...establish cell(s)
		let cells = fields.length > 1 ? row.split(delim) : row;
		if (fields.length > 1 && cells.length < 2) return console.error(cnslCols.red, `Quit at row ${i} - delimiter (${delim}) not found. Did you mean to set a different delimiter ($delim)?`);

		//...clone entry template
		let newObj = {...JSON.parse(JSON.stringify(entryTmplt))};

		//...iterate over fields...
		fields.forEach((field, i) => {

			//...normal data column
			if (!['_tags', '_id'].includes(field)) {
				let fieldIdAndLocaleSpl = splitFieldIdAndLocale(field);
				field = fieldIdAndLocaleSpl[0];
				let locale = (fieldIdAndLocaleSpl[1] || args.locale),
					dfltVal = !dfltVals ? null : dfltVals.filter(pair => pair.split('=')[0] == field);
				if (dfltVal) dfltVal = !dfltVal.length ? null : dfltVal[0].split('=')[1];
				let val = cells[i] || dfltVal;
				newObj.fields[field] = {...(newObj.fields[field] || {}), [locale]: handleFieldVal(val)};

			//special _id (existing item) or _tags columns
			} else if (field == '_tags')
				cells[i].split(comSepDelim).forEach(tag => addTag(tag, newObj));
			else
				newObj.sys.id = cells[i];
		});

		//...any merge data or tag-alls?
		mergeVals && mergeVals.forEach(pair => {
			let fieldValSpl = pair.split('='),
				fieldIdLocaleSpl = splitFieldIdAndLocale(fieldValSpl[0]);
			newObj.fields[fieldIdLocaleSpl[0]] = {...(newObj.fields[fieldIdLocaleSpl[0]] || {}), [!fieldIdLocaleSpl[1] ? args.locale : fieldIdLocaleSpl[1]]: handleFieldVal(fieldValSpl[1])};
		});
		args.tagall && args.tagall.split(comSepDelim).forEach(tag => addTag(tag, newObj));

		//...log prepared entry
		data.entries.push(newObj);
		
	});

	//preview only?
	if (args.preview)
		return console.log('Proposing to import/update the following data:\n', JSON.stringify(data.entries.map(entry => {
			ret = {
				_tags: entry.metadata.tags.map(obj => obj.sys.id)
			};
			if (entry.sys.id) ret._id = entry.sys.id;
			Object.entries(entry.fields).forEach(([field, localeVals]) => {
				Object.entries(localeVals).forEach(([locale, val]) => {
					ret[`${field}[${locale}]`] = typeof val != 'object' ? val : `${val.sys.linkType != 'Asset' ? 'R' : 'Asset r'}ef ${val.sys.id}`;
				});
			})
			return ret;
		}), null, '   '));

	//write JSON file
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
		let ptnPart = '[\\w-\\[\\]]+';
		if (!new RegExp(`^(${ptnPart}=[^${comSepDelim}]+)(${comSepDelim}${ptnPart}=[^${comSepDelim}]+)*`).test(args[arg]))
			return console.error(cnslCols.red, `${arg} must be in format field=val${comSepDelim}field2=val2 etc`);
		return 1;
	}

	//util - validate int args
	function validateIntArgs(arg) {
		if (!parseInt(args[arg]) || parseInt(args[arg]) < 0) console.error(cnslCols.red, `$${arg}, if passed, must be an integer (0+)`);
		return 1;
	}

	//util - do some sort of casting or transformation on value - defers to related utils below
	function handleFieldVal(val) {
		return handleLatLng(handleValType(handleRef(val)));
	}

	//util - handle val type - cast 'true' and 'false' to actual booleans, and numbers to actual numbers, unless $nocast passed
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
		if (entryObj.metadata.tags.find(obj => obj.sys.id == tag)) return;
		let tagObj = JSON.parse(JSON.stringify(tagTmplt));
		tagObj.sys.id = tag;
		entryObj.metadata.tags.push(tagObj);			
	}

	//util - split field ID from locale in strings like foo[en-GB]
	function splitFieldIdAndLocale(str) {
		return str.split(/\[(?=[\w-]+\]$)/).map(part => part.replace(/\]$/, ''));
	}

})();
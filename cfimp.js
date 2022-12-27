#!/usr/bin/env node

/* -----------
| CONTENTFUL EI - Contentful easy importer. Easy-to-use entry importer for the Contentful headless CMS.
|	@docs/links:
|		- https://mitya.uk/projects/cfimp
|		- https://github.com/mitya33/cfimp
|		- https://npmjs.com/package/cfimp
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

	//valid incoming args
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
		'previewfile',
		'publish',
		'skipfields',
		'offset',
		'skiprows',
		'limit',
		'nocast',
		'tagall',
		'input',
		'listdelim',
		'mtoken'
	];

	//parse vars - ~ weirdness is because, seemingly, in some contexts (e.g. running via `npx`) node interprets ":" as an
	//arg delimiter and at other times (e.g. running via `node <script>`) it doesn't
	const args = {};
	process.argv.slice(2).join('~').replace(/:~/g, ':').split('~').forEach(arg => {
		const spl = arg.replace(/^-/, '').split(':');
		if (!validArgs.includes(spl[0])) return console.info(cnslCols.blue, `Unrecognised arg, @${spl[0]}`);
		args[spl[0]] = spl[1] || true;
	});
	const errArg = ['model', 'space', 'locale'].find(arg => !args[arg]);
	const listDelim = args.listdelim || ',';

	//arg validation
	if (errArg) return console.error(cnslCols.red, `$${errArg} must be passed`);
	if (args.offset && !validateIntArgs('offset')) return;
	if (args.limit && !validateIntArgs('limit')) return;
	if (args.mergevals && !validateFieldValListArgs('mergevals')) return;
	if (args.dfltvals && !validateFieldValListArgs('dfltvals')) return;
	if (args.skipfields && !validateFieldValListArgs('skipfields', 1)) return;
	if (args.fields && !validateFieldValListArgs('fields', 1)) return;
	const mergeVals = !args.mergevals ? null : args.mergevals.split(listDelim);
	const dfltVals = !args.dfltvals ? null : args.dfltvals.split(listDelim);
	const skipFields = !args.skipfields ? null : args.skipfields.split(listDelim);
	const fieldOverrides = !args.fields ? null : args.fields.split(listDelim);
	const delim = args.delim == 'tab' || !args.delim ? '\t' : (args.delim == 'com' ? ',' : (args.delim == 'pipe' ? '|' : args.delim));
	const csvFileName = args.input || 'import.csv';
	const env = args.env || 'master';
	const encoding = args.enc || 'utf8';

	//as with ~ weirdness (above), so too ",", when used as a list delim. This means list params end up as space-separated.
	//Fix is to quote these args i.e. -fields:"foo,"bar" not -fields:foo,bar
	for (let listVal of ['mergeVals', 'dfltVals', 'skipFields', 'fields'])
		if (args[listVal] && args[listVal].split(' ').length > 2)
			return console.error(cnslCols.red, `List vals must be quoted e.g. -fields:"foo,bar"`);

	//get input data
	try {
		await new Promise((res, rej) => {
			fs.access(csvFileName, err => !err ? res() : rej());
		});
	} catch(e) { return console.error(cnslCols.red, `File "${csvFileName}" does not exist or it could not be read`); }

	//notices
	if (!args.input) console.info(cnslCols.blue, 'Notice: $input not passed; assuming "import.csv"');
	if (!args.delim) console.info(cnslCols.blue, 'Notice: $delim not passed; assuming tab');
	if (!args.fields) console.info(cnslCols.blue, 'Notice: $fields not passed; inferring field IDs from first row in data file');
	if (!args.env) console.info(cnslCols.blue, 'Notice: $env not passed; assuming "master"');
	if (!args.enc) console.info(cnslCols.blue, 'Notice: $enc not passed; assuming utf8');

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
		if (args.limit && i > parseInt(args.limit - (!args.offset ? 0 : 1)) + parseInt(args.offset || 0)) return;
		if (args.skiprows) {
			let negate = args.skiprows[0] == '!',
				terms = args.skiprows.replace(/^!/, '').split(listDelim),
				inRow = terms.find(skipRule => row.includes(skipRule));
		 	if ((!negate && inRow) || (negate && !inRow)) return;
		 }

		//...establish cell(s)
		let cells = fields.length > 1 ? row.split(delim) : row;
		if (fields.length > 1 && cells.length < 2)
			return console.error(cnslCols.red, `Quit while validating row ${i} - delimiter (${delim}) not found. No write operation was performed. Did you mean to set a different delimiter ($delim)?`);

		//...clone entry template
		let newObj = {...JSON.parse(JSON.stringify(entryTmplt))};

		//...publish?
		if (args.publish) Object.assign(newObj.sys, {publishedVersion: 1, id: genId()});

		//...iterate over fields...
		fields.forEach((field, i) => {

			//...skip field?
			if (skipFields && skipFields.includes(field)) return;

			//...normal data column
			if (!['_tags', '_id'].includes(field)) {
				let fieldIdAndLocaleSpl = splitFieldIdAndLocale(field);
				field = fieldIdAndLocaleSpl[0];
				let locale = (fieldIdAndLocaleSpl[1] || args.locale),
					dfltVal = !dfltVals ? null : dfltVals.filter(pair => pair.split('=')[0] == field);
				if (dfltVal) dfltVal = !dfltVal.length ? null : dfltVal[0].split('=')[1];
				let val = cells[i] || dfltVal;
				newObj.fields[field] = {...(newObj.fields[field] || {}), [locale]: handleFieldVal(val?.trim ? val.trim() : val)};

			//special _id (existing item) or _tags columns
			} else if (field == '_tags')
				cells[i].split(listDelim).forEach(tag => addTag(tag, newObj));
			else
				newObj.sys.id = cells[i];
		});

		//...any merge data or tag-alls?
		mergeVals && mergeVals.forEach(pair => {
			let fieldValSpl = pair.split('='),
				fieldIdLocaleSpl = splitFieldIdAndLocale(fieldValSpl[0]);
			newObj.fields[fieldIdLocaleSpl[0]] = {...(newObj.fields[fieldIdLocaleSpl[0]] || {}), [!fieldIdLocaleSpl[1] ? args.locale : fieldIdLocaleSpl[1]]: handleFieldVal(fieldValSpl[1].trim())};
		});
		args.tagall && args.tagall.split(listDelim).forEach(tag => addTag(tag, newObj));

		//...log prepared entry
		data.entries.push(newObj);
		
	});

	//preview only?
	if (args.preview)
		return console.log(
			`Proposing to import/update${!args.publish ? '' : ' *and publish*'} the following data:\n`,
			JSON.stringify(data.entries.map(entry => {
				ret = {
					_tags: entry.metadata.tags.map(obj => obj.sys.id)
				};
				if (entry.sys.id) ret._id = entry.sys.id;
				Object.entries(entry.fields).forEach(([field, localeVals]) => {
					Object.entries(localeVals).forEach(([locale, val]) => {
						ret[`${field}[${locale}]`] = !val?.sys ? val : `${val.sys.linkType != 'Asset' ? 'R' : 'Asset r'}ef ${val.sys.id}`;
					});
				})
				return ret;
			}), null, '   ')
		);

	//write JSON file
	try {
		await new Promise((res, rej) => {
			fs.writeFile(jsonFileName, JSON.stringify(data), encoding, err => !err ? res() : rej(err));
		});
	} catch(e) { return console.error(cnslCols.red, e); }
	if (args.previewfile)
		return console.info(cnslCols.blue, 'Notice: quit early just to build Contentful import file for preview purposes; file is '+jsonFileName);

	//run import - delete JSON file after
	try {
		childProcess.execSync(importCmd, {stdio: 'inherit'});
	} catch(e) {
		fs.unlink(jsonFileName, err => {});
		return console.error(cnslCols.red, e);
	}
	fs.unlink(jsonFileName, err => {});

	//util - validate incoming com-sep field=val args
	function validateFieldValListArgs(arg, noVals) {
		let ptnPart = '[\\w-\\[\\]]+';
		if (!new RegExp(`^(${ptnPart}${!noVals ? `=[^${listDelim}]+` : ''})(${listDelim}${ptnPart}${!noVals ? `=[^${listDelim}]+` : ''})*`).test(args[arg]))
			return console.error(cnslCols.red, `${arg} must be in format field${!noVals ? '=val' : ''}${listDelim}field2${!noVals ? '=val2' : ''} etc`);
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

	//util - handle val type cast string representations of non-string primitives
	function handleValType(val) {
		if (args.nocast) return val;
		if (val == 'true') val = true;
		if (val == 'false') val = false;
		if (val == 'null') val = null;
		if (parseFloat(val) && /^\d+(\.\d+)?$/.test(val)) val = parseFloat(val);
		return val;
	}

	//util - if field value is reference to other content type or asset, convert to object
	function handleRef(val) {
		if (typeof val != 'string') return val;
		let isRef = val.match(/^ref(a)?-(.+)/);
		if (!isRef) return val;
		let obj = JSON.parse(JSON.stringify(refTmplt));
		obj.sys.id = isRef[2];
		obj.sys.linkType = !isRef[1] ? 'Entry' : 'Asset'
		return obj;
	}

	//util - handle lat/lng value - separate out parts as object
	function handleLatLng(val) {
		if (!/^-?\d+\.\d+ *, *-?\d+\.\d+$/.test(val)) return val;
		let spl = val.split(/ *, */);
		return {lat: parseFloat(spl[0]), lon: parseFloat(spl[1])};
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

	//util - generate Contentful ID - prefixed with 'cfimp' to avoid clashes with Contentful-generated IDs
	function genId() {
		let ret = '',
			chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_0123456789';
		while (ret.length < 22) ret += chars[Math.floor(Math.random() * chars.length)];
		return 'cfimp.'+ret;
	}

})();

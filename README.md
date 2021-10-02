# cfimp

cfimp is a simple but powerful CLI tool for importing/updating CSV data in the Contentful headless CMS.

In the process of importing/updating, entries can optionally be linked to (existing) assets, tags or references (foreign items).

cfimp cannot be used to create new assets, tags, models or anything other than entries.

cfimp is best used via `npx` and doesn't need to be installed onto your machine.

## Why

Contentful doesn't make it super easy to import data. There's no GUI; instead the the `contentful-cli` tool has an import command, but it's [sparsely documented](https://www.contentful.com/developers/docs/tutorials/cli/import-and-export), and you first have to munge your data into JSON. There's no easy way to import spreadsheet-derived data. Further, Contentful doesn't make explicit what the structure of the JSON should be. 

## Examples

```
#Import comma-separated data from input.csv to space "12345" / content type (model) "authors" / locale "en-GB"
cfimp --space:12345 -model:authors -locale:en-GB 

#Also specify some tags (for all rows)
cfimp --space:12345 -model:authors -locale:en-GB -tags:foo,bar

#Specify a fallback (default) value "bar" for the "foo" field
cfimp --space:12345 -model:authors -locale:en-GB -dfltvals:foo=bar

#Preview the generated JSON of the first entry - no actual import takes place
cfimp --space:12345 -model:authors -locale:en-GB -preview
```

## Prerequisites

1) Install [`contentful-cli`](https://www.npmjs.com/package/contentful-cli) globally.

```
npm install -g contentful-cli
```

2) Authenticate with Contentful (optional).

```
contentful login
```

Authenticating this way will save the credentials in your environment so you don't have to authenticate manually each time you use cfimp. If you'd rather do that instead, though, see the `mtoken` argument.

## Usage

cfimp should be used via `npx`, i.e.

```
npx cfimp <args>
```

Arguments are specified in the format `-arg:val` or, where the argument doesn't accept a value (denoted `*` below), simply `-arg`. Where `val` contains spaces, use `-arg:"one two"`.

Valid arguments are as follows.

- `input` - path to the input file (optional; default: "input.csv")
- `model` - the ID of the Contentful model (content type) to write to (required)
- `space` - the ID of the Contentful space to write to (required)
- `mergevals` - a com-sep list of `field=value` pairs - to merge into all rows (optional) Read more: **Merge/default values**
- `dfltvals` - a com-list of `field=value` defaults to be used where any rows have empty cells. Read more: **Merge/default values**
- `delim` - the delimiter separating columns (for multi-column files) - one of "tab", "com" (comma) or any other string (optional; default: "tab")
- `fields` - the fields to import into. If omitted, cfimp will assume the first row of the input data denotes the fields (optional)
- `locale` - the locale, as defined in Contentful, e.g. "[en-GB]" (required). See: **Writing to multiple locales**
- `enc` - the file encoding for your data (you shouldn't need to change this) - one of "utf8", "ascii" or "base64" (optional; default: "utf8")
- `preview*`	- if passed, outputs the generated JSON and no import is run. Combine with `limit` to avoid filling your terminal with pages of JSON (optional)
- `offset` - a 1-index offset (row) to begin reading data from in your input file (optional)
- `limit` - a limit as to the number of rows to process (optional)
- `skip` - a string which, if found in a row (any column) will cause that row to be skipped (optional)
- `nocast` - ordinarily, numbers, true and false will be cast to their integer/boolean equivalents when data is passed to Contentful. Pass true to prevent this (i.e. if you literally want to pass "true" not `true`) (optional)
- `tagall` - a com-sep list of (existing) tags to tag all entries with. You can also specify row-specific tags. Read more: **Tagging items**
- `comsepdelim` - the delimiter to look for in **all** arguments that accept a com-sep list (optional; default: ",")
- `mtoken` - a management token to authenticate with Contentful. You can omit this if you've already authenticated via `contentful login` (optional)

## Reference and asset links

It's possible to link to **existing** assets or references (i.e. foreign items in other content types) via the `ref-` (reference) and `refa-` (asset) prefixes.

In both cases, you'll need to know the ID of the item you're linking to.

Let's say you have a field on your content type called "authorBioPhoto" and, in preparing your data, you've ascertained the various asset IDs you want to link each author to. Your data would look something like:

```
forename	surname	authorBioPhoto
Philippa	Gregory	refa-12345
Desdemona	Johnson	refa-67890
```

If for some reason all our authors have the same face and photo, we can even specify this at runtime with a merge value (see `mergevals`):

```
cfimp --space:12345 -model:authors -locale:en-GB -mergevals:authoBioPhoto=refa-12345
```

## Merged anddefault values

It's possible to specify default fallback values for your data, which will take effect if the cell is empty for that field.

It's also possible to merge extra data with all rows.

Let's say you have a field in your data, "popular", with some rows having "yes" as a value. For all others, with no value, you want to insert "no".

```
cfimp --space:12345 -model:authors -locale:en-GB -dfltvals:popular=no
```

Or let's say you want to add an extra field to all rows. Perhaps you meant (but forgot) to add an "age" column to your spreadsheet data before exporting it, and it so happens that, surprisingly, all the authors in your data are 51. We can add this via:

```
cfimp --space:12345 -model:authors -locale:en-GB -mergevals:age=51
```

## Updating existing items

cfimp can be used to update existing items in Contentful rather than import (create) new ones. To do this, include an `_id` column in your data. This will be inferred as the internal Contentful ID of the item, and will update it.

```
forename	surname	_id
Philippa	Gregory	12345
```

## Multiple locales

All data in Contentful is stored against locales, created by you in Contentful. This allows you to have multiple versions of each piece of data, for different locales. By default, cfimp will import/update data using the locale specified in the `locale` arg.

However you can import/update multiple locales at once. To do so, specify the field as many times as you have locales, with each appended with a locale suffix.

So if your data was:

```
London	Londres
Berlin	Berlina
```

You can spefify locales either in the data itself, if the first row of data represents your field IDs:

```
city	city[es-SP]
London	Londres
Berlin	Berlina
```

...or via the `fields` argument, if you're specifying field IDs at runtime.

```
cfimp --space:12345 -model:cities -locale:en-GB -fields:city,city[es-SP]
```

Notice that, in either case, we didn't specify a locale for the first `city`; it will read from the default `locale` passed ("en-GB").

## Tagging items

It's possible to tag items to (existing) tags when importing or updating items. There are two ways to do this.

You can specify item-specific tags in your data, via the `_tags` field.

```
forename	surname	_tags
Philippa	Gregory	foo,bar
```

You can also tag *all* items at runtime via the `tagall` argument.

cfimp --space:12345 -model:authors -tagall:foo,bar

(Note that in Contentful, tagging is done with the name of the tag itself - they don't have separate IDs.)

# Delimiter overrides

Delimiters are factors in two areas of cfimp:

- the delimiter used to separate the values in your input file
- the delimiter used to separate any (normally) comma-separated pairings in arguments or `_tag` field values

Both of these can be overriden - the former via the `delim` arg and the latter via the `comsepdelim` arg. Note that `comsepdelim` will apply to **all** occasions where cfimp is attempting to decipher something that it normally expects to be in com-sep format - so for example `_tags` fields, the `mergevals` argument, and so on.

# Like this?

If I've helped you, consider being amazing and [buying me a coffee](https://ko-fi.com/mitya) - thank you!
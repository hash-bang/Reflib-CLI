Reflib-CLI
==========
Command line interface for [Reflib](https://github.com/hash-bang/Reflib-Node).


Features
--------
**Count the references in a library (and check they are valid)**

```
reflib LibraryIn.xml -c
```


**Convert between formats**

```
reflib LibraryIn.xml -o json >LibraryOut.json
```


**Deduplicate libraries**

```
reflib LibraryIn.xml -x --dedupe >LibraryOut.xml
```


**Query using JSON expressions**

```
reflib LibraryIn.xml -q '{year: "2008"}'
```


Usage
-----


  Usage: app [file...]

  Options:

    -h, --help                   output usage information
    -V, --version                output the version number
    -c, --count                  Dont output refs, just output the count (sets `-o count`)
    -j, --json                   Output valid JSON (sets `-o json`)
    -x, --xml                    Output EndNote XML file (sets `-o endnotexml`)
    -o, --output [mode]          Output file format (js, json, endnotexml, count)
    -q, --query [expression...]  Query by HanSON expression (loose JSON parsing)
    -v, --verbose                Be verbose (also prints a running total if -c is specified)
    --dedupe [action]            Deduplicate the library via the sra-dedupe NPM module. Actions are 'remove' (default), 'count' or 'mark' (to set the caption to "DUPE")
    --no-color                   Force disable color
    --no-progress                Disable progress bars


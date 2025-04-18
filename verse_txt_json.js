'use strict';

// Verse Converter
//
// Use Accordance, select all the desired verses and Citation Copy and paste into a text (txt) file.
//  For the Citation format, make sure that "Split contiguous verse" is CHECKED.
//      "Markers" should all be blank except for ( and ) for Citation Reference.
//

import fs, { readFileSync, writeFileSync } from 'fs';
import { filterCards } from 'cardutil';
import bcv_parser from 'bible-passage-reference-parser/js/en_bcv_parser.js';
const bcv = new bcv_parser.bcv_parser;
import osisToEn from 'bible-reference-formatter'; 
import yargs from 'yargs/yargs';

const argv = yargs(process.argv.slice(2))
    .usage('Usage: $0 <command> --input <card database json> [options]')
    .command( 'to_json', 'Write a JSON file of cards with verses from an input TXT file indicated.', {
        verses: {
            demandOption: true
        },
        json: {
            alias: 'j',
            demandOption: true
        }
    })
    .option( 'normalize-refs', {
        description: 'Specifies a format for all written biblical references.',
        alias: 'r',
        type: 'string'
    })
    .strict()
    .demandCommand()
    .help('h')
    .alias('h', 'help')
    .epilog('copyright 2022')
    .argv;

function normalizedRef( ref ) {
    if( argv.normalizeRefs ) {
        return osisToEn( argv.normalizeRefs, bcv.parse( ref ).osis());
    }
    else return ref;
}

function shortRef( ref ) {
    return osisToEn( 'niv-short', bcv.parse( ref ).osis() );
}

function longRef( ref ) {
    return osisToEn( 'niv-long', bcv.parse( ref.replace( /&ndash;/g, '–' )).osis())
}


function verseTextToHtml( text ) {
    return text
        .replace( /–/g, '&ndash;' )
        .replace( /—/g, '&mdash;' )
        .replace( '“ ‘', '‘' )
        .replace( /’/g, '&apos;' )
        .replace( /‘/g, '&lsquo;' )        
        .replace( /’/g, '&rsquo;' )        
        .replace( /’/g, '&rsquo;' )
        .replace( /“/g, '&ldquo;' )
        .replace( /”/g, '&rdquo;' )
        .replace( /\.\.\./g, '&#8230;' )
        .replace( /\n\n/g, '\n' )
    ;
}

function verseHtmlToText( html ) {
    return html
        .replace( /&ndash;/g, '–' )
        .replace( /&mdash;/g, '—' )
        // .replace( '“ ‘', '‘' )
        .replace( /&apos;/g, '’' )
        .replace( /&lsquo;/g, '‘' )        
        .replace( /&rsquo;/g, '’' )        
        .replace( /&rsquo;/g, '’' )
        .replace( /&ldquo;/g, '“' )
        .replace( /&rdquo;/g, '”' )
        .replace( /&#8230;/g, '...')
    ;
}

function convertVerseTexts( inputVerseTextFile, outputJsonFile ) {

    const verseFileText = readFileSync( inputVerseTextFile ).toString();

    const verses = {};
    verseFileText.split('\n').forEach( line => {
        const [verse, ref, translation] = line.split( / \((.+) (.+)\)$/ );

        const short = shortRef( ref );

        verses[short] = { 
            text: verseTextToHtml(verse), 
            ref: verseTextToHtml( normalizedRef( ref )), 
            translation: translation 
        };
    });

    writeFileSync( outputJsonFile, JSON.stringify( verses, null, 4 ) );
}

if( argv._.includes( 'to_json' )) {
    convertVerseTexts( argv.verses, argv.json );
}

console.log('Done.');

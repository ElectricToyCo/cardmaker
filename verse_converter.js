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
    .option( 'cards', {
        description: 'The path of the input card database to be read.',
        alias: 'c',
        type: 'string',
        demandOption: true
    })
    .option( 'include', { 
        description: 'Specifies an attribute and value in the form <attribute>=<match>. A card will be included only if it has this attribute with this value (or matches another "--include" specification (and is not otherwise excluded).',
        alias: 'i',
        type: 'string'
    } )
    .option( 'exclude', { 
        description: 'Specifies an attribute and value in the form <attribute>=<match>. A card will be excluded if it has this attribute with this value, even if it would otherwise be included.',
        alias: 'x',
        type: 'string'
    } )
    .command( 'export', 'Write verses to the given text file.', {
        file: {
            alias: 'f',
            demandOption: true
        },
        refsonly: {
            type: 'boolean'
        }
    })
    .command( 'import', 'Write a JSON file of cards with verses from an input file indicated.', {
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

function longRef( ref ) {
    return osisToEn( 'niv-long', bcv.parse( ref.replace( /&ndash;/g, '–' )).osis())
}

function importVerseTexts( cards, inputVerseTextFile, outputJsonFile ) {

    const verseFileText = readFileSync( inputVerseTextFile ).toString();

    const verses = {};
    verseFileText.split('\n').forEach( line => {
        const [verse, ref, translation] = line.split( / \((.+) (.+)\)$/ );

        verses[ ref ] = { verse: verse, translation: translation };
    });

    cards.forEach( card => {
        if( card.ref ) {
            const ref = longRef( card.ref );

            const bibleVerse = verses[ ref ];
            if( !bibleVerse ) {
                console.warn( `A card references ${ref}, but we can't find this Bible verse in '${inputVerseTextFile}'.` );
                return card;
            }

            card.verse = verseTextToHtml( bibleVerse.verse );
            card.ref = verseTextToHtml( normalizedRef( ref ));
            card.translation = bibleVerse.translation;
        }
    });

    writeFileSync( outputJsonFile, JSON.stringify( cards, null, 4 ) );
}

function exportVerseTexts( cards, verseTextFile ) {
    const verseLines = cards.map( card => {
        if( card.verse ) {
            const ref = longRef( card.ref );

            if( argv.refsonly ) {
                return ref;
            }
            else {
                return `${verseHtmlToText(card.verse)} (${ref} ${card.translation ? (card.translation) : 'TRANSLATION-NOT-SPECIFIED' })`;
            }
        }
        else return undefined;
    })
    .filter( Boolean );

    writeFileSync( verseTextFile, verseLines.join( argv.refsonly ? '; ' : '\n') );
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

fs.readFile( argv.cards, "utf8", (err, data) => {
    if( err ) throw err;

    const cards = filterCards( JSON.parse( data ), argv.include, argv.exclude );

    if( argv._.includes( 'export' )) {
        exportVerseTexts( cards, argv.file )
    }
    if( argv._.includes( 'import' )) {
        importVerseTexts( cards, argv.verses, argv.json );
    }

    console.log('Done.');
});
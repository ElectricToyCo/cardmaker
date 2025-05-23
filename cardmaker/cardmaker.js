'use strict';

import { shuffleArray, arrayFromValue, filterCards, sortCards, clampCardCount, generateCardHtml, templateProperty, loadCardTemplates } from 'cardutil';
import { readFileSync, readFile, writeFile } from 'fs';
import { basename } from 'path';
import { exit } from 'process';

import yargs from 'yargs/yargs';

const PROGRAM_START_TIME = new Date();    

const argv = yargs(process.argv.slice(2))
    .usage('Usage: $0 <card database path> [options]')
    .option( 'output', {
                        description: 'The path of the output HTML to be generated.',
                        alias: 'o',
                        type: 'string'
                    })
    .option( 'css', {
        description: 'Indicates one or more Cascading Style Sheets paths to <link> to in the output html.',
        type: 'array'
    } )
    .option( 'scripts', {
        description: 'Indicates one or more Javascript file paths to include in the output html.',
        type: 'array'
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
    .option( 'sort', {
        description: 'Sorts cards in the database by the specified attribute. Prepend "^" to attribute to reverse this sort. Can specify multiple --sort directives in order to sort with priority. Specify a series of attribute values separated by commas (and no white space) to indicate a desired sort order (other than alphabetical, the default).',
        alias: 's',
        type: 'string'
    } )
    .option( 'fronts', {
        description: 'Emit card fronts (the default). Use --no-fronts to suppress card fronts.',
        alias: 'f',
        default: true,
        type: 'boolean'
    } )
    .option( 'backs', {
        description: 'Emit card backs (the default). Use --no-backs to suppress card backs.',
        alias: 'b',
        default: true,
        type: 'boolean'
    } )
    .option( 'shuffle', {
        description: 'Shuffle cards prior to sorting.',
        alias: 'u',
        default: false,
        type: 'boolean'
    } )
    .option( 'max-count', {
        description: 'Specifies the maximum number of duplicate copies to be printed for any card, clamping its "count" property.',
        type: 'number'
    } )
    .option( 'min-count', {
        description: 'Specifies the minimum number of duplicate copies to be printed for each card.',
        type: 'number'
    } )
    .option( 'stat', {
        description: 'Print the count of how many cards include the specified attribute with the specified regex value (or any value, if the regex value is left unspecified). Format: "<attribute>[=<regex>]"',
        type: 'string'
    })
    .strict()
    .demandCommand()
    .help('h')
    .alias('h', 'help')
    .epilog('copyright 2022')
    .argv;

function pathFromArgs( argParamName, def = undefined ) {
    const path = argv[argParamName] ?? def;
    if( path === undefined ) return undefined;

    // {DATE} and {RUN} substitution.
    return path
        .replace( '{DATE}', new Date().toISOString().replace( /:/g, '-') )
        .replace( '{RUN}', PROGRAM_START_TIME.toISOString().replace( /:/g, '-' ))
}

const cardDatabasePath = argv._[0];
const scriptPaths = argv.scripts ?? [];
const emitCardFronts = argv.fronts ?? true;
const emitCardBacks = argv.backs ?? true;
const doShuffle = argv.shuffle ?? false;

const sortProperties = argv.sort ?? [];

const outputPath = pathFromArgs( 'output', ( basename( cardDatabasePath, '.db.json' ) + ".html" ));

let countedCards = 0;
let countedCardBacks = 0;
let countedPages = 0;

function stripJSONComments( data ) {
    return data.replace( /\/\/(.*)/g,'');
}

function parseJSONWithComments( data ) {
    return JSON.parse( stripJSONComments( data ));
}

function generateCardSetHtml(cardSet) {
    const cardTemplates = loadCardTemplates(cardSet['templates']);

    const setAttributes = cardSet['set-attribs'];       // TODO null case

    const setName = setAttributes.name ?? '';

    const publicationDate = setAttributes['publication-date'] ?? new Date().toISOString();

    let cards = cardSet['cards'];
    if(!cards) {
        console.error(`Card database '${cardDatabasePath}' lacked the required attribute 'cards'. Aborting.`);
        exit(3);
    }

    const appendFileList = arrayFromValue(cardSet['append']);

    for(const fileName of appendFileList) {
        const appendFileData = readFileSync(fileName, 'utf8');
        const appendCards = parseJSONWithComments(appendFileData);
        cards = cards.concat(appendCards);
    }

    cards = filterCards(cards, argv.include, argv.exclude);

    // TODO: Haiku-specific.
    cards.forEach(card => {
        if(['verb', 'stativeverb', 'theme-verb'].includes(card.template) && !card.hasOwnProperty('alternative-form')) {
            card['alternative-form'] = '(s)';
        }
    });

    //
    // Link up cards with their backs.
    //

    function findMatchingCard(sourceCard, variant) {
        const amendedSourceCard = { ...sourceCard };
        Object.assign(amendedSourceCard, variant);
        delete amendedSourceCard.back;

        return cards.find(card => {
            for(const prop in amendedSourceCard) {
                if(amendedSourceCard[prop] !== card[prop]) {
                    if(!card[prop]) {
                        console.log(`We may match source card '${sourceCard.word}' with a potential back '${card.word}' (${card.template}) even though the source card wants a property of card.${prop} == ${amendedSourceCard[prop]} but the candidate has a nullish value for that propery.`);
                    }
                    else {
                        return false;
                    }
                }
            }
            return true;
        });
    }

    const claimedBackCards = [];

    for(const card of cards) {
        
        // Skip cards that have already been claimed as the backs of other cards.
        if(claimedBackCards.includes(card)) {
            continue;
        }
            
        if(card.back) {
            // Find the most similar card that shares attributes with the card indicated by the "back" attribute.
            const backCard = findMatchingCard(card, card.back);
            if(backCard) {
                card.claimedBackCard = backCard;
                backCard.back = card;
                claimedBackCards.push(backCard);
            }
            else {
                console.log(`Card with template '${card.template}' has a back attribute that does not match any card. ${JSON.stringify(card)}`);
            }
        }
    }

    //
    // Shuffle cards. Must happen AFTER back-linking.
    //
    if( doShuffle ) {
        console.log( 'Shuffling...' );
        shuffleArray( cards );
    }

    //
    // Sort cards. Must happen AFTER back-linking and shuffling.
    //
    console.log( 'Sorting...' );
    sortCards( cards, sortProperties );
    
    // Calculate and print statistics

    const counts = arrayFromValue( argv.stat );
    const counters = counts.map( () => { return { entries: 0, copies: 0 };} );

    for( const card of cards ) {
        for( const i in counts ) {
            const [propertyName, regexString] = counts[ i ].split( '=' );
            const matchRegex = new RegExp( regexString );
            if( card[ propertyName ] !== undefined && String(card[ propertyName ]).match( matchRegex )) {
                counters[ i ].entries += 1;
                counters[ i ].copies  += clampCardCount( card.count, argv.minCount, argv.maxCount );
            }
        }
    }

    for( const i in counts ) {
        console.log( `Cards with property '${counts[i]}': ${counters[i].entries} (${counters[i].copies} copies)` );
    }

    //
    // Generate card HTML
    //

    const selfBacking = setAttributes['self-backed'];

    const cardHtmls = [];
    const cardBackHtmls = [];

    for(const card of cards) {
        
        // Skip cards that have already been claimed as the backs of other cards.
        //
        if(claimedBackCards.includes(card)) {
            continue;
        }

        const cardHtml = generateCardHtml( cardTemplates, card );

        if(cardHtml) {
            
            // By default the card back is generated from a templated specified by the card template's "back-template" property.
            // The card itself may, however, have a "back" attribute that indicates a specific card to be shown
            // for its own back.

            let backCard = card;
            let backTemplateName = templateProperty(cardTemplates, card.template, 'back-template');

            if(card.claimedBackCard)
            {
                backCard = card.claimedBackCard;
                backTemplateName = undefined;
            }
            else if(selfBacking) {
                backCard = card;
                backTemplateName = undefined;
            }

            const cardBackHtml = generateCardHtml( cardTemplates, backCard, backTemplateName );

            const count = clampCardCount( card.count, argv.minCount, argv.maxCount );

            for( let i = 0; i < count; ++i ) {
                cardHtmls.push( cardHtml );
                cardBackHtmls.push( cardBackHtml );
            }
        }
        else {
            console.log( `Card with template '${card.template}': card template not found or unusable.` );
        }
    };

    countedCards += emitCardFronts ? cardHtmls.length : 0;
    countedCardBacks += emitCardBacks ? cardBackHtmls.length : 0;

    // Pagination

    const pageColumns = setAttributes[ 'page-columns' ];
    const pageRows = setAttributes[ 'page-rows' ];
    const pageCardCount = pageColumns * pageRows;

    const pages = [];
    const pagesBack = [];
    while( cardHtmls.length > 0 ) {
        const frontRows = [];
        const backRows  = [];

        for( let j = 0; cardHtmls.length > 0 && j < (pageRows ?? 100000); ++j ) {
            frontRows.push( `<div class="page-row">${cardHtmls.splice( 0, pageColumns ?? cardHtmls.length ).join( '\n' )}\n</div> <!-- end row -->`);
            backRows.push( `<div class="page-row">${cardBackHtmls.splice( 0, pageColumns ?? cardBackHtmls.length ).reverse().join( '\n')}\n</div> <!-- end row -->` );
        }

        pages.push( frontRows.join( '\n' ) );
        pagesBack.push( backRows.join( '\n' ) );
    }

    let cardSetHtml = `<div class="card-set">\n`;

    for( let i = 0; i < pages.length; ++i ) {
        const displayPageNumber = i + 1;

        function footerText( pageNumberingText ) {
            return `<div class="footer"><span class="set-name">${setName}</span> | <span class="pub-date">${publicationDate}</span> | <span class="page-number"><span class="page">${pageNumberingText}</span><span class="out-of">/${pages.length}</span></span></div>`;
        }

        if( emitCardFronts ) {
            cardSetHtml += `<div class="card-page card-fronts"><div class="interior">\n`;
            cardSetHtml += pages[ i ];
            cardSetHtml += '</div>'
            cardSetHtml += footerText( `${displayPageNumber}F` );
            cardSetHtml += '</div> <!-- end card-page -->\n';
        }

        if( emitCardBacks ) {
            cardSetHtml += `<div class="card-page card-backs"><div class="interior">\n`;
            cardSetHtml += pagesBack[ i ];
            cardSetHtml += footerText( `${displayPageNumber}B` );
            cardSetHtml += "</div></div> <!-- end card-page -->\n";
        }
    }

    cardSetHtml += '</div> <!-- end card-set -->'

    countedPages += pages.length;

    return pages.length > 0 ? cardSetHtml : '';
}

readFile( cardDatabasePath, 'utf-8', (err, cardDatabaseJson) => {
    try {
        if (err) {
            throw( `Could not read card database path '${cardDatabasePath}'. ${err}. Aborting.` );
        }

        const database = parseJSONWithComments( cardDatabaseJson );
        const cardSets = Array.isArray( database ) ? database : database.sets;
        const dbAttributes = database[ 'db-attribs' ] ?? {};

        if( !cardSets ) {
            throw `Could not find a card 'sets' array within card database ${cardDatabasePath}.`;
        }

        const cardSetsHtml = cardSets.map( cardSet => generateCardSetHtml( cardSet ));

        const styleSheetPaths = (argv.css ?? []).concat( dbAttributes.css ?? [] );

        // Conclude HTML production

        let allHtml = "<!DOCTYPE html>\n<html>\n\t<head>\n";
        allHtml += `<title>${cardDatabasePath} Cards</title>\n`;
        styleSheetPaths.forEach( styleSheetPath => allHtml += `<link rel="stylesheet" type="text/css" href="${styleSheetPath}" />\n` );
        allHtml += "\t</head>\n\t<body>\n";
        allHtml += cardSetsHtml.join( '\n' );
        scriptPaths.forEach( scriptPath => allHtml += `<script src="${scriptPath}"></script>\n` );
        allHtml += "\t</body>\n</html>\n";

        writeFile( outputPath, allHtml, (err) => {
            if (err) throw err;
            console.log( `${countedCards} cards (with ${countedCardBacks} backs) over ${countedPages} pages written to ${outputPath}.` );
        });
    }
    catch( err ) {
        console.error( `Fatal error: ${err}` );
        exit( 1 );
    }
});

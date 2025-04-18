// Card Utilities

import { readFileSync } from 'fs';

export function paragraphizeText(text) {
    if (text.includes('\n')) {
        text = text.replace(/(.*)\n/g, '$1</p><p>');
    }
    return "<div class='card-text'><p>" + text + "</p></div>";
}
export function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}
export function arrayFromValue(value) {
    if (value === undefined) {
        return [];
    }
    else if (Array.isArray(value)) {
        return value;
    }
    else {
        return [value];
    }
}

// See https://stackoverflow.com/a/37319954/358475
export function filterInPlace(a, condition) {
    let i = 0, j = 0;
  
    while (i < a.length) {
      const val = a[i];
      if (condition(val, i, a)) a[j++] = val;
      i++;
    }
  
    a.length = j;
    return a;
}

export function clampCardCount(count, min, max) {
    count = count ?? 1;
    return Math.max(min ?? 1, Math.min(count, max ?? 1e9));
}
export function collectArrayToString(property) {
    if (Array.isArray(property)) {
        return property.join('\n');
    }
    else
        return property;
}
export function filterCards(cards, includes, excludes) {
    // Filter cards.
    //
    // Inclusions and/or exclusions may be specified.
    // If none are specified, all cards are included.
    // If exclusions are specified but not inclusions, all cards are assumed included unless
    // explicitly excluded.
    // If inclusions are specified but not exclusions, all cards are assumed excluded unless
    // explicitly included.
    // If includes and exclusions are both specified, all cards are assumed to be excluded unless
    // explicitly included and not explicitly excluded.
    const filterInclusions = arrayFromValue(includes);
    const filterExclusions = arrayFromValue(excludes);

    if (filterInclusions.length > 0 || filterExclusions.length > 0) {
        cards = cards.filter(card => {
            let includeCard = filterInclusions.length === 0;

            for (const inclusion of filterInclusions) {
                const [propName, match] = inclusion.split('=');
                if (match === String(card[propName])) {
                    includeCard = true;
                    break;
                }
            }

            if (includeCard) {
                for (const exclusion of filterExclusions) {
                    const [propName, match] = exclusion.split('=');
                    if (match === String(card[propName])) {
                        includeCard = false;
                        break;
                    }
                }
            }

            return includeCard;
        });
    }

    return cards;
}

function parseSortProperties( properties ) {
    return properties.map( property => {
        const [propertyName, propertyValues] = property.split( '=' );
        return {
            propertyName: propertyName,
            propertyValues: propertyValues ? propertyValues.split( ',' ) : undefined
        };
    });
}

export function sortCards( cards, sortProperties ) {
    sortProperties = parseSortProperties( sortProperties );

    cards.sort( (a, b) => {

        for( const property of sortProperties ) {
            const sortDirectionReversed = property.propertyName === '^';
            const propertyName = sortDirectionReversed ? property.propertyName.slice( 1 ) : property.propertyName;

            let aProp = sortDirectionReversed ? b[ propertyName ] : a[ propertyName ];
            let bProp = sortDirectionReversed ? a[ propertyName ] : b[ propertyName ];

            if( property.propertyValues ) {
                const aPropIndex = property.propertyValues.indexOf( aProp );
                const bPropIndex = property.propertyValues.indexOf( bProp );

                if( aPropIndex !== undefined && bPropIndex !== undefined ) {
                    aProp = aPropIndex;
                    bProp = bPropIndex;
                }
            }                

            if( aProp > bProp ) return 1;
            if( aProp < bProp ) return -1;
        }
        return 0;
    } );
}

function baseTemplateText() {
    return `<div class="card {{classes}}" [[style?style="{{style}}"]]style?><div class="interior">{{content}}</div></div>`;
}

export function templateProperty( templates, templateName, propertyName, nameChain = [] ) {
    if( !templateName ) {
        return undefined;
    }

    const template = templates[ templateName ];
    if( !template ) {
        return undefined;
    }

    if( template[ propertyName ] !== undefined ) {
        return collectArrayToString( template[ propertyName ] );
    }
    else {
        let superTemplateName = template.super;
        if( nameChain.includes( superTemplateName )) {
            console.error( `Infinite recursion in card template '${templateName}': it identifies itself as an ancestor (super). Ignoring super.` );
            superTemplateName = undefined;
        }

        return templateProperty( templates, superTemplateName, propertyName, nameChain.concat( templateName ) );
    }
}

function undecorateTemplateMarkup( html ) {
    if( !html ) return html;

    // Remove any lingering conditionality [[tags? ... ]]tags?.
    html = html.replace( /\[\[([A-Za-z\-_]+)\?(.|\n)*?\]\]\1\?/g, '' );

    // Remove any lingering unmatched {{tags}}.
    return html.replace( /{{.*?}}/g, '' );
}

function populateHtmlFromObject( html, object ) {
    if( !html ) {
        return undefined;
    }
    if( object ) {
        for( let property in object ) {
            let propertyText = collectArrayToString( object[ property ] );
            if( property[0] === "$" ) {
                propertyText = paragraphizeText( propertyText )
                property = property.substring( 1 );
            }
            html = html.replaceAll( `{{${property}}}`, propertyText );

            // Remove any conditionality tag markers. This property exists and these conditionalities are irrelevant.
            //
            html = html
                .replaceAll( `[[${property}?`, '' )
                .replaceAll( `]]${property}?`, '' );
        }
    }
    return html;
}

function templateText( templates, name, nameChain = [] ) {
    if( !name ) {
        return undefined;
    }

    const template = templates[ name ];
    if( !template ) {
        return undefined;
    }

    let superTemplateName = template.super;
    if( nameChain.includes( superTemplateName )) {
        console.error( `Infinite recursion in card template '${name}': it identifies itself as an ancestor (super). Ignoring super.` );
        superTemplateName = undefined;
    }

    const html = templateText( templates, superTemplateName, nameChain.concat( name )) ?? baseTemplateText();

    return populateHtmlFromObject( html, template );
}

function generateCardHtmlFromTemplateHtml( templateHtml, card ) {
    return undecorateTemplateMarkup( populateHtmlFromObject( templateHtml, card ));
}

export function generateCardHtml( templates, card, templateName = undefined ) {
    templateName = templateName ?? card.template;

    return generateCardHtmlFromTemplateHtml( templateText( templates, templateName ), card );
}

export function loadCardTemplates( cardTemplatesValue ) {
    if( !cardTemplatesValue ) {
        throw( `Card database lacked the required 'templates' attribute.` );
    }
    else if( typeof cardTemplatesValue === 'string' ) {
        const cardTemplateJson = readFileSync( cardTemplatesValue );    
        return JSON.parse( cardTemplateJson );
    }
    else if( cardTemplatesValue instanceof Object ) {
        return cardTemplatesValue;
    }
    else {
        throw( `Card database had a 'templates' attribute with an unsupported type of '${typeof cardTemplatesValue}'. Aborting.` );
    }
}
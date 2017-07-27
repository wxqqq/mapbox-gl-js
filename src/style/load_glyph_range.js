// @flow

const {normalizeGlyphsURL} = require('../util/mapbox');
const {ResourceType, getArrayBuffer} = require('../util/ajax');
const parseGlyphPBF = require('./parse_glyph_pbf');

import type {StyleGlyph} from './style_glyph';
import type {RequestTransformFunction} from '../ui/map';

module.exports = function (fontstack: string,
                           range: number,
                           urlTemplate: string,
                           requestTransform: RequestTransformFunction,
                           callback: Callback<{[number]: StyleGlyph | null}>) {
    const begin = range * 256;
    const end = begin + 255;

    const request = requestTransform(
        normalizeGlyphsURL(urlTemplate)
            .replace('{fontstack}', fontstack)
            .replace('{range}', `${begin}-${end}`),
        ResourceType.Glyphs);

    getArrayBuffer(request, (err, response) => {
        if (err) {
            callback(err);
        } else if (response) {
            const glyphs = {};

            for (const glyph of parseGlyphPBF(response.data)) {
                glyphs[glyph.id] = glyph;
            }

            callback(null, glyphs);
        }
    });
};
